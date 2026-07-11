import os
import json
import shutil
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

from backend import db, parser, agent, mock_data

app = FastAPI(title="RegIntel AI Compliance OS Backend")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Startup event to seed database
@app.on_event("startup")
def startup_event():
    mock_data.seed_database()

# Pydantic schemas
class CompanyCreate(BaseModel):
    name: str
    entity_type: str
    departments: List[str]
    branch_count: Optional[int] = 1

class SOPApproveRequest(BaseModel):
    task_id: int
    user_name: str

# Endpoints

@app.get("/api/companies")
def get_companies():
    return db.get_companies()

@app.post("/api/companies")
def create_company(company: CompanyCreate):
    co_id = db.create_company(company.name, company.entity_type, company.departments, company.branch_count)
    db.add_audit_log(co_id, "onboarding", f"Company {company.name} onboarded.", "Compliance Officer")
    return {"id": co_id, "message": "Company created successfully"}

@app.get("/api/companies/{company_id}")
def get_company(company_id: int):
    co = db.get_company(company_id)
    if not co:
        raise HTTPException(status_code=404, detail="Company not found")
    return co

@app.get("/api/companies/{company_id}/sops")
def get_sops(company_id: int):
    return db.get_documents_by_company(company_id)

@app.post("/api/companies/{company_id}/sops/upload")
async def upload_sop(company_id: int, file: UploadFile = File(...)):
    company = db.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    file_path = os.path.join(UPLOAD_DIR, f"{company_id}_sop_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Parse based on file type
    if file.filename.endswith(".pdf"):
        text = parser.extract_text_from_pdf(file_path)
    else:
        # Default to reading as text
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
            
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from document.")
        
    doc_id = db.add_document(company_id, file.filename, "sop", text)
    
    # Chunk and embed
    chunks = parser.chunk_text(text)
    for c in chunks:
        emb = agent.get_embedding(c['content'])
        db.add_document_chunk(doc_id, c['section_title'], c['content'], emb)
        
    db.add_audit_log(company_id, "upload_sop", f"Uploaded and indexed SOP: {file.filename}", "Compliance Officer")
    
    return {"id": doc_id, "chunks_count": len(chunks), "message": "SOP uploaded and indexed successfully"}

@app.get("/api/circulars")
def get_circulars():
    return db.get_circulars()

@app.get("/api/circulars/{circular_id}")
def get_circular(circular_id: int):
    circ = db.get_circular(circular_id)
    if not circ:
        raise HTTPException(status_code=404, detail="Circular not found")
    
    obligations = db.get_obligations_by_circular(circular_id)
    return {
        "circular": circ,
        "obligations": obligations
    }

@app.post("/api/circulars/upload")
async def upload_circular(
    circular_number: str = Form(...),
    title: str = Form(...),
    date: str = Form(...),
    file: UploadFile = File(...)
):
    file_path = os.path.join(UPLOAD_DIR, f"circular_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    if file.filename.endswith(".pdf"):
        text = parser.extract_text_from_pdf(file_path)
    else:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
            
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from circular.")
        
    circular_id = db.add_circular(circular_number, title, date, text, f"/api/files/circular_{file.filename}")
    
    # Extract obligations via Agent
    obligations = agent.extract_obligations(text)
    for ob in obligations:
        db.add_obligation(
            circular_id,
            ob.get("obligation_text"),
            ob.get("section_reference"),
            ob.get("entity_type"),
            ob.get("frequency"),
            ob.get("deadline_days"),
            ob.get("evidence_required")
        )
        
    return {
        "id": circular_id,
        "obligations_extracted": len(obligations),
        "message": "Circular uploaded and parsed successfully"
    }

@app.post("/api/companies/{company_id}/process-circular/{circular_id}")
def process_circular_for_company(company_id: int, circular_id: int):
    company = db.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    circular = db.get_circular(circular_id)
    if not circular:
        raise HTTPException(status_code=404, detail="Circular not found")
        
    trace = []
    def log_trace(agent_name, msg):
        trace.append({
            "timestamp": datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "agent": agent_name,
            "message": msg
        })
        
    log_trace("MonitoringAgent", f"Initiated compliance analysis for circular {circular['circular_number']}: '{circular['title']}'.")
    
    obligations = db.get_obligations_by_circular(circular_id)
    log_trace("ObligationExtractorAgent", f"Scanned circular text database. Loaded {len(obligations)} obligation records.")
    
    # 1. Filter applicable obligations
    applicable = agent.filter_applicable_obligations(obligations, company['entity_type'])
    log_trace("ApplicabilityAgent", f"Classified entity applicability for {company['entity_type'].upper()}. Filtered out {len(obligations) - len(applicable)} irrelevant clause(s). {len(applicable)} applicable obligation(s) remaining.")
    
    if not applicable:
        db.add_audit_log(company_id, "parse_circular", f"Circular {circular['circular_number']} analyzed: Not applicable to entity type.", "System Agent")
        log_trace("ApplicabilityAgent", f"Execution terminated: No obligations apply to {company['entity_type'].upper()}.")
        return {"status": "skipped", "message": f"No obligations applicable to {company['entity_type']}", "trace": trace}
        
    # 2. Retrieve SOP chunks
    sop_chunks = db.get_document_chunks_by_company(company_id)
    log_trace("SopDiffAgent", f"Loaded {len(sop_chunks)} vector-indexed SOP clauses for semantic analysis.")
    
    tasks_created = 0
    # For each applicable obligation, run Diff Agent
    for idx, ob in enumerate(applicable):
        log_trace("SopDiffAgent", f"Processing Obligation {idx+1}/{len(applicable)}: '{ob['obligation_text'][:60]}...'")
        
        # Smart Caching Check (Innovation 1)
        cached_task = None
        existing_tasks = db.get_tasks_by_company(company_id)
        ob_emb = agent.get_embedding(ob['obligation_text'])
        
        # If we have existing tasks, check similarity
        best_sim = 0.0
        for ext in existing_tasks:
            if ext.get('obligation_text'):
                ext_emb = agent.get_embedding(ext['obligation_text'])
                sim = agent.cosine_similarity(ob_emb, ext_emb)
                if sim > best_sim:
                    best_sim = sim
                if sim > 0.93:
                    cached_task = ext
                    break
                    
        if cached_task:
            log_trace("SmartCachingAgent", f"Cache HIT! Found highly similar obligation (Sim: {best_sim:.2f}) from task #{cached_task['id']} (Circular {cached_task['circular_number']}). Reusing audit history and redlining updates.")
            
            circ_date_val = datetime.strptime(circular['date'], "%Y-%m-%d")
            deadline_days = ob.get('deadline_days') or 30
            deadline_date_val = circ_date_val + timedelta(days=int(deadline_days))
            deadline_date_str = deadline_date_val.strftime("%Y-%m-%d")
            
            task_id = db.create_task(
                company_id,
                ob['id'],
                f"Address SEBI Gap: {ob['section_reference'] or 'Circular Section'} (Cached Ref)",
                f"{ob['obligation_text']}\n\n**Note: Evaluation cached from previous circular.**\n\n{cached_task['description']}",
                cached_task['department_owner'],
                deadline_date_str
            )
            
            if cached_task.get('validation_feedback'):
                db.update_task_validation(task_id, cached_task['validation_status'], cached_task['validation_feedback'])
                
            tasks_created += 1
            db.add_audit_log(company_id, "task_created", f"Created compliance task for {circular['circular_number']} (from cache): {ob['section_reference']}", "System Agent")
            continue
            
        # Find relevant chunks using cosine similarity
        relevant_chunks = []
        if sop_chunks:
            chunk_sims = []
            for chunk in sop_chunks:
                chunk_emb = json.loads(chunk['embedding']) if chunk.get('embedding') else None
                if chunk_emb:
                    sim = agent.cosine_similarity(ob_emb, chunk_emb)
                    chunk_sims.append((sim, chunk))
            
            chunk_sims.sort(key=lambda x: x[0], reverse=True)
            if chunk_sims:
                relevant_chunks = [item[1] for item in chunk_sims[:3]]
                log_trace("SopDiffAgent", f"Calculated vector similarity. Retrieved top {len(relevant_chunks)} matching SOP chunks. Top score: {chunk_sims[0][0]:.2f}.")
            else:
                log_trace("SopDiffAgent", f"No vector matching SOP chunks found for comparison.")
        else:
            log_trace("SopDiffAgent", "No company SOP chunks loaded in compliance storage.")
        
        gap_analysis = agent.analyze_compliance_gap(ob, relevant_chunks)
        log_trace("SopDiffAgent", f"Gap Analysis finished. Has gap: {gap_analysis.get('has_gap', True)}. Severity: {gap_analysis.get('severity', 'Medium')}.")
        
        # If there is a gap/missing section, we create a compliance task and draft the SOP revision
        if gap_analysis.get('has_gap', True):
            # Calculate deadline date
            circ_date_val = datetime.strptime(circular['date'], "%Y-%m-%d")
            deadline_days = ob.get('deadline_days') or 30
            deadline_date_val = circ_date_val + timedelta(days=int(deadline_days))
            deadline_date_str = deadline_date_val.strftime("%Y-%m-%d")
            
            task_title = f"Address SEBI Gap: {ob['section_reference'] or 'Circular Section'}"
            task_desc = f"{ob['obligation_text']}\n\n**Gap Detail:** {gap_analysis.get('gap_description')}"
            dept = gap_analysis.get('affected_department', 'Compliance')
            
            log_trace("TaskPlannerAgent", f"Gap detected! Creating compliance task: '{task_title}' assigned to {dept} department. Deadline: {deadline_date_str}.")
            
            task_id = db.create_task(
                company_id,
                ob['id'],
                task_title,
                task_desc,
                dept,
                deadline_date_str
            )
            
            current_sop_clause = gap_analysis.get('current_sop_clauses', 'None found')
            log_trace("SopDraftingAgent", f"Proposing legal redline revision of SOP section based on regulatory changes...")
            draft_details = agent.draft_sop_redline(ob, gap_analysis, current_sop_clause)
            
            full_task_meta = {
                "gap_analysis": gap_analysis,
                "draft": draft_details
            }
            db.update_task_validation(task_id, "Pending_SOP_Review", json.dumps(full_task_meta))
            tasks_created += 1
            
            db.add_audit_log(company_id, "task_created", f"Created compliance task for {circular['circular_number']}: {task_title}", "System Agent")
        else:
            log_trace("SopDiffAgent", f"SOP already compliant with Obligation {ob['section_reference']}. No action required.")
            
    # Risk calculation trace
    tasks = db.get_tasks_by_company(company_id)
    log_trace("RiskPredictionAgent", "Recalculating compliance risk rating after tasks modification...")
    risk = agent.predict_compliance_risk(tasks)
    log_trace("RiskPredictionAgent", f"Risk update completed. New organization risk: {risk['risk_level']} (Score: {risk['risk_score']}%).")
    
    db.add_audit_log(company_id, "parse_circular", f"Processed circular {circular['circular_number']}. Created {tasks_created} task(s).", "System Agent")
    log_trace("MonitoringAgent", f"Compliance workflow completed. Total tasks generated: {tasks_created}.")
    
    return {"status": "processed", "tasks_created": tasks_created, "trace": trace}

@app.get("/api/companies/{company_id}/tasks")
def get_tasks(company_id: int):
    tasks = db.get_tasks_by_company(company_id)
    # Check if overdue
    today_str = datetime.now().strftime("%Y-%m-%d")
    for t in tasks:
        if t['status'] == 'Pending' and t['deadline_date'] < today_str:
            t['status'] = 'Overdue'
            
        # Parse the structured gap metadata if it exists
        t['meta'] = None
        if t.get('validation_status') == 'Pending_SOP_Review' and t.get('validation_feedback'):
            try:
                t['meta'] = json.loads(t['validation_feedback'])
            except:
                pass
    return tasks

@app.post("/api/tasks/{task_id}/evidence")
async def upload_evidence(task_id: int, file: UploadFile = File(...)):
    # Find task
    conn = db.get_db_connection()
    task_row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    if not task_row:
        raise HTTPException(status_code=404, detail="Task not found")
    task = dict(task_row)
    
    file_path = os.path.join(UPLOAD_DIR, f"evidence_{task_id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    db.update_task_evidence(task_id, file.filename, file_path)
    
    # Read text of the evidence for verification (e.g. text/pdf content)
    evidence_text = ""
    if file.filename.endswith(".pdf"):
        evidence_text = parser.extract_text_from_pdf(file_path)
    else:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            evidence_text = f.read()
            
    # Get associated obligation info
    conn = db.get_db_connection()
    ob_row = conn.execute("SELECT * FROM obligations WHERE id = ?", (task['obligation_id'],)).fetchone()
    conn.close()
    
    ob_text = ob_row['obligation_text'] if ob_row else "Verify compliance"
    ev_req = ob_row['evidence_required'] if ob_row else "Compliance report"
    
    # Run Evidence Validator Agent
    validation = agent.validate_evidence(ob_text, ev_req, file.filename, evidence_text)
    
    db.update_task_validation(task_id, validation['status'], validation['feedback'])
    db.add_audit_log(task['company_id'], "evidence_validated", f"Evidence for task '{task['title']}' validated. Status: {validation['status']}.", "Evidence Agent")
    
    return {
        "status": validation['status'],
        "feedback": validation['feedback']
    }

@app.post("/api/tasks/{task_id}/approve-sop")
def approve_sop(task_id: int, request: SOPApproveRequest):
    conn = db.get_db_connection()
    task_row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    if not task_row:
        raise HTTPException(status_code=404, detail="Task not found")
    task = dict(task_row)
    
    # Mark SOP as approved in audit log
    try:
        meta = json.loads(task['validation_feedback'])
        proposed_text = meta['draft']['proposed_text']
        reason = meta['draft']['reason']
    except:
        proposed_text = "SOP revision text"
        reason = "Regulation updates"
        
    db.add_audit_log(
        task['company_id'], 
        "sop_redline_approved", 
        f"Approved SOP Clause update for task '{task['title']}': '{proposed_text[:100]}...' Reason: {reason}",
        request.user_name
    )
    
    # Move the validation status past "Pending_SOP_Review" to "SOP_Approved"
    db.update_task_validation(task_id, "SOP_Approved", f"SOP draft approved by {request.user_name} on {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    return {"message": "SOP update approved successfully"}

@app.get("/api/companies/{company_id}/risk")
def get_risk(company_id: int):
    # Fetch tasks
    tasks = db.get_tasks_by_company(company_id)
    # Mark overdue
    today_str = datetime.now().strftime("%Y-%m-%d")
    for t in tasks:
        if t['status'] == 'Pending' and t['deadline_date'] < today_str:
            t['status'] = 'Overdue'
            
    risk_report = agent.predict_compliance_risk(tasks)
    return risk_report

@app.get("/api/companies/{company_id}/audit-logs")
def get_audit_logs(company_id: int):
    return db.get_audit_logs(company_id)

@app.get("/api/companies/{company_id}/audit-report")
def generate_audit_report(company_id: int):
    company = db.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    tasks = db.get_tasks_by_company(company_id)
    today_str = datetime.now().strftime("%Y-%m-%d")
    for t in tasks:
        if t['status'] == 'Pending' and t['deadline_date'] < today_str:
            t['status'] = 'Overdue'
            
    risk_report = agent.predict_compliance_risk(tasks)
    logs = db.get_audit_logs(company_id)
    
    # Calculate score
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t['status'] == 'Completed'])
    score = 100
    if total_tasks > 0:
        score = int((completed_tasks / total_tasks) * 100)
        
    return {
        "company": company,
        "compliance_score": score,
        "risk_level": risk_report["risk_level"],
        "risk_score": risk_report["risk_score"],
        "risk_factors": risk_report["risk_factors"],
        "recommendations": risk_report["recommendations"],
        "tasks": tasks,
        "audit_logs": logs,
        "report_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

# Seed DB trigger (manual endpoint for safety)
@app.post("/api/seed")
def trigger_seed():
    mock_data.seed_database()
    return {"message": "Database seed completed"}

# --- New Modules Endpoints ---

@app.post("/api/monitoring/sync")
def sync_sebi_circulars():
    """Triggers the SEBI Scraper Agent to index new circulars."""
    try:
        new_circs = agent.scrape_sebi_circulars()
        added_count = 0
        for c in new_circs:
            conn = db.get_db_connection()
            exist = conn.execute("SELECT id FROM circulars WHERE circular_number = ?", (c['circular_number'],)).fetchone()
            conn.close()
            
            if not exist:
                circ_id = db.add_circular(
                    c['circular_number'],
                    c['title'],
                    c['date'],
                    c['content_text'],
                    c['pdf_url']
                )
                
                # Extract obligations via Agent
                obligations = agent.extract_obligations(c['content_text'])
                for ob in obligations:
                    db.add_obligation(
                        circ_id,
                        ob.get("obligation_text"),
                        ob.get("section_reference"),
                        ob.get("entity_type"),
                        ob.get("frequency"),
                        ob.get("deadline_days"),
                        ob.get("evidence_required")
                    )
                added_count += 1
        return {"status": "success", "synced": len(new_circs), "new_added": added_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync circulars from SEBI: {str(e)}")

class CircularDiffRequest(BaseModel):
    old_circular_id: int
    new_circular_id: int

@app.post("/api/circulars/diff")
def diff_circulars(request: CircularDiffRequest):
    """Compares two circulars using the Circular Diff Agent."""
    old_circ = db.get_circular(request.old_circular_id)
    new_circ = db.get_circular(request.new_circular_id)
    if not old_circ or not new_circ:
        raise HTTPException(status_code=404, detail="Circular not found")
        
    diff_report = agent.diff_circulars_llm(old_circ['content_text'], new_circ['content_text'])
    return {
        "old_circular": old_circ,
        "new_circular": new_circ,
        "diff": diff_report
    }

@app.get("/api/companies/{company_id}/graph")
def get_company_compliance_graph(company_id: int):
    """Generates graph nodes and edges linking policies, obligations, and tasks."""
    company = db.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return db.get_compliance_graph(company_id)

@app.get("/api/companies/{company_id}/documents-intelligence")
def get_documents_intelligence(company_id: int):
    """Returns the company's uploaded documents (SOPs), chunks, and all circulars with obligations."""
    docs = db.get_documents_by_company(company_id)
    chunks = db.get_document_chunks_by_company(company_id)
    
    conn = db.get_db_connection()
    circular_rows = conn.execute("SELECT * FROM circulars ORDER BY date DESC").fetchall()
    obligation_rows = conn.execute("SELECT o.*, c.circular_number FROM obligations o JOIN circulars c ON o.circular_id = c.id").fetchall()
    conn.close()
    
    circulars = [dict(c) for c in circular_rows]
    obligations = [dict(o) for o in obligation_rows]
    
    return {
        "documents": docs,
        "document_chunks": chunks,
        "circulars": circulars,
        "obligations": obligations
    }
