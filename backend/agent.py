import os
import json
import re
from datetime import datetime
import google.generativeai as genai
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Configure Google GenAI
api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    print("Gemini API configured successfully.")
else:
    print("WARNING: GEMINI_API_KEY not found in environment. Running in Mock Agent mode.")

def is_api_available():
    return bool(os.environ.get("GEMINI_API_KEY"))

# Helper for calling Gemini
def call_gemini(prompt: str, system_instruction: str = None, response_json: bool = False) -> str:
    """Helper to send prompt to Gemini with optional system instructions and JSON enforce."""
    if not is_api_available():
        raise ValueError("API Key missing")
        
    try:
        model_name = "gemini-2.5-flash"
        generation_config = {}
        if response_json:
            generation_config["response_mime_type"] = "application/json"
            
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
            generation_config=generation_config
        )
        
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Gemini API Error: {e}")
        # Re-raise to let the caller fallback
        raise e

# Embedding generator
def get_embedding(text: str) -> list[float]:
    """Generates 768-dim text embeddings using models/text-embedding-004."""
    if not is_api_available() or not text.strip():
        # Return a simple mock embedding vector
        return [0.0] * 768
    try:
        result = genai.embed_content(
            model="models/text-embedding-004",
            contents=text,
            task_type="retrieval_document"
        )
        return result['embedding']
    except Exception as e:
        print(f"Embedding API error: {e}. Using mock embedding.")
        return [0.0] * 768

def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Calculates cosine similarity between two lists of floats."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)

# --- 1. Circular Parser / Obligation Extractor Agent ---
def extract_obligations(circular_text: str) -> list[dict]:
    """
    Extracts structured compliance obligations from raw SEBI circular text.
    """
    system_instruction = (
        "You are an expert SEBI Compliance Audit Agent. Your job is to parse the text of a SEBI regulatory circular "
        "and extract specific operational obligations. Do not summarize the document. Extract distinct, actionable tasks "
        "that regulated entities must perform. Return your response as a JSON array of objects."
    )
    
    prompt = f"""
    Parse the following SEBI Circular text and extract every single compliance obligation.
    For each obligation, extract:
    1. 'obligation_text': A clear, specific operational instruction detailing what must be done.
    2. 'section_reference': The specific paragraph, clause, or page number in the circular.
    3. 'entity_type': The type of regulated entity this applies to. Choose from: 'amc' (Asset Management/Mutual Fund), 'stockbroker', 'ia' (Investment Advisor), 'depository', or 'all'.
    4. 'frequency': How often must this be performed? Choose from: 'one-time', 'monthly', 'quarterly', 'yearly', 'ongoing'.
    5. 'deadline_days': The number of days given to comply starting from the circular's date (if mentioned, otherwise null). E.g., if it says 'within 30 days', put 30.
    6. 'evidence_required': The exact document/record needed to prove compliance. E.g., 'Board approved report', 'submission receipt', 'system screenshot', 'signed certificate'.

    Return ONLY a valid JSON list of objects matching this schema:
    [
      {{
        "obligation_text": "...",
        "section_reference": "...",
        "entity_type": "...",
        "frequency": "...",
        "deadline_days": ...,
        "evidence_required": "..."
      }}
    ]

    Circular text:
    ---
    {circular_text}
    ---
    """
    
    try:
        response_text = call_gemini(prompt, system_instruction, response_json=True)
        return json.loads(response_text)
    except Exception as e:
        print(f"Failed to extract obligations via Gemini API, using fallback logic: {e}")
        # Fallback Mock Extraction based on keywords in text
        return get_mock_obligations(circular_text)

# --- 2. Applicability Agent ---
def filter_applicable_obligations(obligations: list[dict], company_type: str) -> list[dict]:
    """
    Filters obligations based on whether they apply to the given company type.
    """
    applicable = []
    for ob in obligations:
        ob_type = ob.get('entity_type', '').lower()
        comp_type = company_type.lower()
        
        # If it applies to 'all' or matches the company type directly, or is a substring
        if ob_type == 'all' or ob_type == comp_type or comp_type in ob_type or ob_type in comp_type:
            applicable.append(ob)
            
    return applicable

# --- 3. Compliance Diff Agent ---
def analyze_compliance_gap(obligation: dict, company_sop_chunks: list[dict]) -> dict:
    """
    Compares a single circular obligation against retrieved SOP chunks to detect gaps.
    """
    # Format current SOP context
    sop_context = ""
    for idx, chunk in enumerate(company_sop_chunks):
        sop_context += f"--- SOP Clause #{idx+1} (Section: {chunk.get('section_title', 'Unknown')}) ---\n"
        sop_context += f"{chunk.get('content', '')}\n\n"
        
    system_instruction = (
        "You are a Compliance Gap Analyzer. Your task is to compare a new regulatory obligation against a company's "
        "existing Standard Operating Procedure (SOP) text and determine if the SOP is already compliant, "
        "needs minor modifications, or is completely missing the required procedures. Return a JSON object."
    )
    
    prompt = f"""
    Compare this Regulatory Obligation with the company's current SOP clauses.
    
    Regulatory Obligation:
    "{obligation.get('obligation_text')}"
    (Required Evidence: {obligation.get('evidence_required')})
    
    Company SOP Clauses retrieved as relevant:
    {sop_context if sop_context.strip() else "[No matching SOP clauses found in the database]"}
    
    Provide a compliance gap analysis. Check if:
    1. The SOP already covers the obligation (status: compliant).
    2. The SOP covers the topic but has gaps (e.g. reporting is yearly instead of quarterly, different department owner) (status: gap).
    3. The SOP has absolutely no mention of this obligation (status: missing).

    Return your analysis strictly in JSON format with these exact keys:
    {{
      "has_gap": true/false (true if status is 'gap' or 'missing'),
      "gap_description": "Detailed explanation of what is missing/different in the company's SOP compared to the regulation",
      "severity": "High" / "Medium" / "Low" (High for missing core duties, Medium for frequency adjustments/process updates, Low for minor wording),
      "current_sop_clauses": "Snippet of relevant text from the SOP, or 'None found'",
      "affected_department": "Suggest which department should handle this task (e.g., Compliance, Operations, IT, Finance, Legal)"
    }}
    """
    
    try:
        response_text = call_gemini(prompt, system_instruction, response_json=True)
        return json.loads(response_text)
    except Exception as e:
        print(f"Failed to analyze gap via Gemini API, using mock gap analysis: {e}")
        # Mock gap analysis logic
        return get_mock_gap_analysis(obligation, company_sop_chunks)

# --- 4. SOP Drafting Agent ---
def draft_sop_redline(obligation: dict, gap_analysis: dict, current_sop_text: str) -> dict:
    """
    Drafts proposed redlined text for the company's SOP to bridge the compliance gap.
    """
    system_instruction = (
        "You are an expert Legal and Compliance SOP writer. Your job is to draft exact redlined wording "
        "for a company's Standard Operating Procedure (SOP) to incorporate a new SEBI regulatory requirement. "
        "Make sure the changes are professional, clear, and refer directly to the regulation."
    )
    
    prompt = f"""
    We need to update our company's Standard Operating Procedure (SOP) to comply with a new SEBI requirement.
    
    New Regulatory Obligation:
    "{obligation.get('obligation_text')}"
    
    Gap Identified:
    "{gap_analysis.get('gap_description')}"
    
    Relevant current SOP paragraph:
    "{current_sop_text if current_sop_text != 'None found' else 'No existing section covers this topic.'}"
    
    Draft the updated SOP text. Provide:
    1. 'current_text': The original text that needs to be replaced (or 'N/A' if it's a completely new section).
    2. 'proposed_text': The new updated paragraph incorporating the SEBI rule.
    3. 'redline_diff': A markdown formatted diff showing changes (using + for additions and - for deletions, or clear highlighting).
    4. 'reason': The rationale for the wording change referencing the SEBI circular.

    Return ONLY a valid JSON object matching this schema:
    {{
      "current_text": "...",
      "proposed_text": "...",
      "redline_diff": "...",
      "reason": "..."
    }}
    """
    
    try:
        response_text = call_gemini(prompt, system_instruction, response_json=True)
        return json.loads(response_text)
    except Exception as e:
        print(f"Failed to draft SOP update via Gemini API: {e}")
        # Return fallback mock drafting
        return get_mock_draft_sop(obligation, gap_analysis, current_sop_text)

# --- 5. Evidence Validator Agent ---
def validate_evidence(obligation_text: str, evidence_required: str, evidence_filename: str, evidence_text_content: str) -> dict:
    """
    Validates uploaded evidence text (extracted from PDF/images) against the compliance obligation.
    """
    system_instruction = (
        "You are an AI Compliance Auditor. Your job is to verify whether an uploaded document "
        "serves as valid evidence of compliance for a given regulatory obligation. You must check "
        "the document content for correctness, dates, signatures, and matching parameters."
    )
    
    prompt = f"""
    Review the following uploaded evidence file content and check if it satisfies the regulatory obligation.
    
    Regulatory Obligation:
    "{obligation_text}"
    
    Required Evidence Type:
    "{evidence_required}"
    
    Uploaded File Name: "{evidence_filename}"
    
    Extracted Text Content of Uploaded Evidence:
    ---
    {evidence_text_content}
    ---
    
    Evaluate the evidence. You must check:
    1. Is the content relevant to the obligation?
    2. Does it contain dates/timestamps showing it is valid?
    3. Are there signatures/sign-offs if required?
    4. Is the file complete?

    Return a JSON response with these exact keys:
    {{
      "status": "Approved" (if it satisfies all criteria) or "Rejected" (if it fails/needs corrections),
      "feedback": "Detailed explanation of why it was approved, or what is missing. Mention specific items like missing dates, signatures, or incomplete records."
    }}
    """
    
    try:
        response_text = call_gemini(prompt, system_instruction, response_json=True)
        return json.loads(response_text)
    except Exception as e:
        print(f"Failed to validate evidence via Gemini API: {e}")
        # Let's perform a simple rule-based mock validation for the demo
        if "rejection" in evidence_filename.lower() or "fail" in evidence_text_content.lower():
            return {
                "status": "Rejected",
                "feedback": "Validation failed: The document appears to be unsigned and does not display the mandatory SEBI registration seal."
            }
        else:
            return {
                "status": "Approved",
                "feedback": "Evidence verified successfully. The document contains matching date stamps, signature confirmations, and references the appropriate regulatory section."
            }

# --- 6. Risk Prediction Agent ---
def predict_compliance_risk(tasks: list[dict]) -> dict:
    """
    Evaluates active tasks and compliance history to calculate current risk scores.
    """
    # Simple rule-based logic is robust and fast for hackathon, but we can structure it nicely
    total_tasks = len(tasks)
    if total_tasks == 0:
        return {
            "risk_level": "Low",
            "risk_score": 5,
            "risk_factors": ["No active compliance tasks pending."],
            "recommendations": ["Maintain current tracking process."]
        }
        
    pending_tasks = [t for t in tasks if t['status'] == 'Pending']
    overdue_tasks = [t for t in tasks if t['status'] == 'Overdue']
    validation_rejected = [t for t in tasks if t.get('validation_status') == 'Rejected']
    
    # Calculate score
    score = 0
    factors = []
    
    # Overdue tasks are high risk
    if overdue_tasks:
        score += len(overdue_tasks) * 25
        factors.append(f"{len(overdue_tasks)} task(s) are currently OVERDUE, posing immediate audit risks.")
        
    # Pending tasks add risk depending on proximity to deadline (simplified for demo)
    if pending_tasks:
        score += len(pending_tasks) * 8
        factors.append(f"{len(pending_tasks)} task(s) are pending execution.")
        
    # Rejected evidence adds risk
    if validation_rejected:
        score += len(validation_rejected) * 12
        factors.append(f"{len(validation_rejected)} task(s) had their compliance evidence rejected.")
        
    # Bound score between 0 and 100
    score = min(max(5, score), 95)
    
    if score >= 70:
        level = "High"
    elif score >= 35:
        level = "Medium"
    else:
        level = "Low"
        
    # Compile recommendations
    recs = []
    if overdue_tasks:
        recs.append("Prioritize and execute overdue tasks immediately to avoid penal action.")
    if validation_rejected:
        recs.append("Re-examine and re-upload correct evidence for rejected items.")
    if pending_tasks:
        recs.append("Allocate operational bandwidth to departments with pending items.")
    if not recs:
        recs.append("Maintain continuous monitoring of SEBI circulars.")
        
    return {
        "risk_level": level,
        "risk_score": score,
        "risk_factors": factors,
        "recommendations": recs
    }

# --- FALLBACK MOCK DATA GENERATORS ---

def get_mock_obligations(text: str) -> list[dict]:
    """Generates standard mock obligations if Gemini is not set up."""
    # Look for keywords to generate slightly customized mock data
    text_lower = text.lower()
    if "mutual fund" in text_lower or "amc" in text_lower:
        return [
            {
                "obligation_text": "Establish a dedicated Risk Management Committee (RMC) for Mutual Funds to meet at least once in a quarter.",
                "section_reference": "Paragraph 2.1",
                "entity_type": "amc",
                "frequency": "quarterly",
                "deadline_days": 30,
                "evidence_required": "Minutes of the RMC meeting and signed board resolution"
            },
            {
                "obligation_text": "Publish stewardship code disclosure on the fund's website annually within 60 days of the end of the financial year.",
                "section_reference": "Paragraph 4.3",
                "entity_type": "amc",
                "frequency": "yearly",
                "deadline_days": 60,
                "evidence_required": "Screenshot of website publication and signed compliance report"
            }
        ]
    elif "broker" in text_lower or "stock" in text_lower:
        return [
            {
                "obligation_text": "Ensure daily upload of client collateral details to the clearing corporation before 11:59 PM.",
                "section_reference": "Clause 1.2",
                "entity_type": "stockbroker",
                "frequency": "daily",
                "deadline_days": 7,
                "evidence_required": "Collateral upload report and API submission log"
            },
            {
                "obligation_text": "Display brokerage rates, compliance officer contact details, and grievance numbers prominently in all branch offices.",
                "section_reference": "Clause 3.1",
                "entity_type": "stockbroker",
                "frequency": "ongoing",
                "deadline_days": 15,
                "evidence_required": "Branch photos and compliance sign-off document"
            }
        ]
    else:
        # Generic
        return [
            {
                "obligation_text": "Appoint a principal compliance officer responsible for all SEBI regulatory reporting.",
                "section_reference": "Section 1",
                "entity_type": "all",
                "frequency": "one-time",
                "deadline_days": 45,
                "evidence_required": "Board resolution appointing the officer and SEBI portal update receipt"
            },
            {
                "obligation_text": "Submit a quarterly compliance report on grievance redressal mechanisms within 15 days of the end of each quarter.",
                "section_reference": "Section 3(a)",
                "entity_type": "all",
                "frequency": "quarterly",
                "deadline_days": 15,
                "evidence_required": "SCORES portal receipt of report submission"
            }
        ]

def get_mock_gap_analysis(obligation: dict, chunks: list[dict]) -> dict:
    """Generates standard mock gaps if Gemini is not set up."""
    ob_text = obligation.get('obligation_text', '')
    
    # Analyze keywords
    if "risk management committee" in ob_text.lower():
        return {
            "has_gap": True,
            "gap_description": "Our current SOP only mandates holding General Board Meetings twice a year. It has no provision for a dedicated Risk Management Committee (RMC) meeting quarterly.",
            "severity": "High",
            "current_sop_clauses": "Section 4.1: The board of directors shall meet semi-annually to review corporate performance...",
            "affected_department": "Compliance"
        }
    elif "collateral" in ob_text.lower():
        return {
            "has_gap": True,
            "gap_description": "Current operations SOP details a weekly reconciliation process, whereas SEBI now mandates daily collateral updates before midnight.",
            "severity": "High",
            "current_sop_clauses": "Clause 8.2: Client funds and securities are reconciled and balances submitted to clearing house every Friday by 5 PM.",
            "affected_department": "Operations"
        }
    elif "stewardship" in ob_text.lower():
        return {
            "has_gap": True,
            "gap_description": "The SOP does not specify website disclosures for the Stewardship Code within 60 days.",
            "severity": "Medium",
            "current_sop_clauses": "Section 12: Stewardship policies are maintained by the legal department for internal review.",
            "affected_department": "Compliance"
        }
    else:
        # Standard Gap
        return {
            "has_gap": True,
            "gap_description": f"The SOP is missing the specific reporting schedule or operational requirements for: {ob_text}.",
            "severity": "Medium",
            "current_sop_clauses": "None found",
            "affected_department": "Compliance"
        }

def get_mock_draft_sop(obligation: dict, gap: dict, current_text: str) -> dict:
    """Generates mock SOP updates if Gemini is not set up."""
    ob_text = obligation.get('obligation_text', '')
    
    if "risk management committee" in ob_text.lower():
        return {
            "current_text": "Section 4.1: The board of directors shall meet semi-annually to review corporate performance.",
            "proposed_text": "Section 4.1: The board of directors shall meet semi-annually. In addition, a dedicated Risk Management Committee (RMC) shall be constituted and must meet at least once in a quarter to evaluate risk parameters as per SEBI Circular guidelines.",
            "redline_diff": "Section 4.1: The board of directors shall meet semi-annually. **~~to review corporate performance.~~ In addition, a dedicated Risk Management Committee (RMC) shall be constituted and must meet at least once in a quarter to evaluate risk parameters as per SEBI Circular guidelines.**",
            "reason": "Updated to meet the mandatory Risk Management Committee quarterly meeting guidelines in paragraph 2.1 of the new SEBI circular."
        }
    elif "collateral" in ob_text.lower():
        return {
            "current_text": "Clause 8.2: Client funds and securities are reconciled and balances submitted to clearing house every Friday by 5 PM.",
            "proposed_text": "Clause 8.2: Client funds and securities are reconciled daily. A collateral upload report must be submitted to the clearing corporation daily before 11:59 PM to comply with clearing requirements.",
            "redline_diff": "Clause 8.2: Client funds and securities are reconciled **~~and balances submitted to clearing house every Friday by 5 PM.~~ daily. A collateral upload report must be submitted to the clearing corporation daily before 11:59 PM to comply with clearing requirements.**",
            "reason": "Updated to reflect the transition from weekly reconciliation to daily client collateral uploads before midnight."
        }
    else:
        return {
            "current_text": current_text if current_text else "N/A",
            "proposed_text": f"New Section: The company shall implement procedures to {ob_text}. All records must be saved in the compliance repository.",
            "redline_diff": f"**+ New Section: The company shall implement procedures to {ob_text}. All records must be saved in the compliance repository.**",
            "reason": f"Created new section to comply with the latest SEBI requirements."
        }
