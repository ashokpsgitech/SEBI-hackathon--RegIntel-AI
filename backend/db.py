import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "compliance.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Companies
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        departments TEXT NOT NULL,
        branch_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Documents (SOPs, etc.)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        filename TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        content_text TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    """)
    
    # Document Chunks
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS document_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        section_title TEXT,
        content TEXT NOT NULL,
        embedding TEXT,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    """)
    
    # SEBI Circulars
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS circulars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        circular_number TEXT UNIQUE,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        pdf_url TEXT,
        content_text TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Obligations extracted from Circulars
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS obligations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        circular_id INTEGER,
        obligation_text TEXT NOT NULL,
        section_reference TEXT,
        entity_type TEXT NOT NULL,
        frequency TEXT NOT NULL,
        deadline_days INTEGER,
        evidence_required TEXT,
        FOREIGN KEY(circular_id) REFERENCES circulars(id) ON DELETE CASCADE
    );
    """)
    
    # Tasks created from compliance gaps
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        obligation_id INTEGER,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        department_owner TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        deadline_date TEXT NOT NULL,
        evidence_filename TEXT,
        evidence_file_path TEXT,
        evidence_upload_time TEXT,
        validation_status TEXT,
        validation_feedback TEXT,
        FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY(obligation_id) REFERENCES obligations(id) ON DELETE CASCADE
    );
    """)
    
    # Audit Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        action_type TEXT NOT NULL,
        description TEXT NOT NULL,
        user TEXT NOT NULL,
        FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    """)
    
    conn.commit()
    conn.close()

# Database helper functions

def create_company(name, entity_type, departments, branch_count=1):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO companies (name, entity_type, departments, branch_count) VALUES (?, ?, ?, ?)",
        (name, entity_type, json.dumps(departments), branch_count)
    )
    company_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return company_id

def get_company(company_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
    conn.close()
    if row:
        data = dict(row)
        data['departments'] = json.loads(data['departments'])
        return data
    return None

def get_companies():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM companies").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['departments'] = json.loads(d['departments'])
        result.append(d)
    return result

def add_document(company_id, filename, doc_type, content_text):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO documents (company_id, filename, doc_type, content_text) VALUES (?, ?, ?, ?)",
        (company_id, filename, doc_type, content_text)
    )
    doc_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return doc_id

def add_document_chunk(document_id, section_title, content, embedding_list=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    emb_str = json.dumps(embedding_list) if embedding_list else None
    cursor.execute(
        "INSERT INTO document_chunks (document_id, section_title, content, embedding) VALUES (?, ?, ?, ?)",
        (document_id, section_title, content, emb_str)
    )
    chunk_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return chunk_id

def get_document_chunks_by_company(company_id):
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT dc.* FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.company_id = ?
    """, (company_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_documents_by_company(company_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM documents WHERE company_id = ?", (company_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_circular(circular_number, title, date, content_text, pdf_url=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO circulars (circular_number, title, date, pdf_url, content_text) VALUES (?, ?, ?, ?, ?)",
            (circular_number, title, date, pdf_url, content_text)
        )
        circ_id = cursor.lastrowid
        conn.commit()
    except sqlite3.IntegrityError:
        # Already exists, fetch and update
        row = conn.execute("SELECT id FROM circulars WHERE circular_number = ?", (circular_number,)).fetchone()
        circ_id = row['id']
        cursor.execute(
            "UPDATE circulars SET title = ?, date = ?, pdf_url = ?, content_text = ? WHERE id = ?",
            (title, date, pdf_url, content_text, circ_id)
        )
        conn.commit()
    finally:
        conn.close()
    return circ_id

def get_circulars():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM circulars ORDER BY date DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_circular(circular_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM circulars WHERE id = ?", (circular_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def add_obligation(circular_id, obligation_text, section_reference, entity_type, frequency, deadline_days, evidence_required):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO obligations (circular_id, obligation_text, section_reference, entity_type, frequency, deadline_days, evidence_required)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (circular_id, obligation_text, section_reference, entity_type, frequency, deadline_days, evidence_required)
    )
    ob_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return ob_id

def get_obligations_by_circular(circular_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM obligations WHERE circular_id = ?", (circular_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def create_task(company_id, obligation_id, title, description, department_owner, deadline_date):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO tasks (company_id, obligation_id, title, description, department_owner, deadline_date, status)
           VALUES (?, ?, ?, ?, ?, ?, 'Pending')""",
        (company_id, obligation_id, title, description, department_owner, deadline_date)
    )
    task_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return task_id

def get_tasks_by_company(company_id):
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT t.*, o.obligation_text, o.evidence_required, c.circular_number, c.title as circular_title 
        FROM tasks t
        LEFT JOIN obligations o ON t.obligation_id = o.id
        LEFT JOIN circulars c ON o.circular_id = c.id
        WHERE t.company_id = ?
    """, (company_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_task_evidence(task_id, filename, file_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().isoformat()
    cursor.execute(
        """UPDATE tasks 
           SET evidence_filename = ?, evidence_file_path = ?, evidence_upload_time = ?, validation_status = 'Pending'
           WHERE id = ?""",
        (filename, file_path, now_str, task_id)
    )
    conn.commit()
    conn.close()

def update_task_validation(task_id, status, feedback):
    conn = get_db_connection()
    cursor = conn.cursor()
    task_status = 'Completed' if status == 'Approved' else 'Pending'
    cursor.execute(
        """UPDATE tasks 
           SET validation_status = ?, validation_feedback = ?, status = ?
           WHERE id = ?""",
        (status, feedback, task_status, task_id)
    )
    conn.commit()
    conn.close()

def add_audit_log(company_id, action_type, description, user="System Agent"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO audit_logs (company_id, action_type, description, user) VALUES (?, ?, ?, ?)",
        (company_id, action_type, description, user)
    )
    conn.commit()
    conn.close()

def get_audit_logs(company_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM audit_logs WHERE company_id = ? ORDER BY timestamp DESC", (company_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Initialize on import
init_db()
