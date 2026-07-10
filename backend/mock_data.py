import json
from backend.db import get_db_connection, create_company, add_document, add_document_chunk, add_circular, add_obligation, create_task, add_audit_log

MOCK_SOP_AMC = """Apex Asset Management SOP
Document Version: 2.1
Last Updated: 2026-01-10
Department: Compliance and Board Operations

Section 1: Board Administration
The board of directors of Apex Mutual Fund shall meet semi-annually to review general corporate administration, asset allocations, and financial performance.

Section 2: Stewardship Code Policies
Stewardship policies and guidelines are maintained internally by the Legal department. These policies are updated once every three years to reflect general market practices. There is currently no requirement for website disclosures of voting/stewardship activities.

Section 3: Client Grievance Reporting
Customer complaints and grievances received via email or offline channels are consolidated by the Customer Service department. A grievance redressal report is compiled and submitted to SEBI annually within 90 days from the close of the financial year.

Section 4: Key Personnel
Mr. Rajesh Sharma is appointed as the Compliance Officer for Apex Mutual Fund. He is responsible for managing relations with SEBI and coordinating annual audits.
"""

MOCK_SOP_BROKER = """Zenith Brokerage Securities SOP
Document Version: 4.0
Last Updated: 2025-11-15
Department: Clearing and Settlements

Section 5: Client Collateral Management
Zenith Brokerage records client deposits, bank transfers, and security margins in the ledger database. Client funds and securities collateral are reconciled, and details are uploaded to the clearing corporation once every week (every Friday before 5:00 PM).

Section 6: Display of Contact Information
Zenith Brokerage branches shall display name boards, standard broker licenses, and physical compliance registers in the lobby. Contact numbers of the local manager shall be displayed near the reception.

Section 7: Risk Management System
IT department runs batch jobs at midnight to process client transactions, settle margin deficits, and flag accounts with leverage ratios exceeding 5:1.
"""

MOCK_CIRCULAR_AMC = """Securities and Exchange Board of India (SEBI)
Circular No: SEBI/HO/IMD/2026/01
Date: July 01, 2026

To: All Asset Management Companies (AMCs) / Mutual Funds

Subject: Mandatory Board Committee Guidelines and Stewardship Disclosure Standards

1. Risk Management Committee (RMC):
To protect investor interest and ensure robust oversight, all Asset Management Companies (AMCs) must constitute a Risk Management Committee (RMC). The RMC is mandated to meet at least once in a quarter to evaluate risk parameters, portfolio exposure, and liquidity positions. The minutes of the RMC meeting must be presented to the Board of Directors.

2. Stewardship Code Annual Publication:
AMCs must publish their annual Stewardship Code disclosure and details of voting activities on their official websites. This disclosure must be published on the website annually within 60 days of the end of the financial year. A copy of the publication receipt must be submitted to SEBI via email.

3. Effective Date:
These regulations shall come into force with immediate effect. Regulated entities must update their internal policies (SOPs) and submit a compliance status report to SEBI within 30 days of this circular.
"""

MOCK_CIRCULAR_BROKER = """Securities and Exchange Board of India (SEBI)
Circular No: SEBI/HO/MIRSD/2026/02
Date: July 05, 2026

To: All Registered Stockbrokers / Clearing Members

Subject: Standardization of Daily Client Collateral Reporting and Uploads

1. Daily Collateral Upload:
To ensure clearing corporation transparency, all stockbrokers must perform daily reporting and uploading of client collateral details. The uploads must be sent to the clearing corporation systems every day before 11:59 PM (IST). Weekly reporting is no longer permitted.

2. Penal Consequences:
Failure to report collateral details before the daily deadline will result in a penalty of INR 1,00,000 per day of non-compliance and potential suspension of clearing terminal access.

3. Effective Date:
This circular will be effective from July 15, 2026. Stockbrokers must update their systems and SOPs and complete compliance testing.
"""

def seed_database():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if we already have data
    row = cursor.execute("SELECT count(*) as count FROM companies").fetchone()
    if row['count'] > 0:
        conn.close()
        print("Database already seeded. Skipping.")
        return
        
    conn.close()
    print("Seeding database with mock companies, SOPs, and circulars...")
    
    # 1. Create Companies
    amc_id = create_company("Apex Mutual Fund", "amc", ["Compliance", "Operations", "Finance"], branch_count=2)
    broker_id = create_company("Zenith Brokerage Securities", "stockbroker", ["Compliance", "Operations", "IT"], branch_count=5)
    
    # 2. Add SOP Documents and chunks for AMC
    doc_amc_id = add_document(amc_id, "Apex_Mutual_Fund_SOP_v2.1.txt", "sop", MOCK_SOP_AMC)
    # Chunk SOP AMC
    chunks_amc = [
        ("Section 1: Board Administration", "The board of directors of Apex Mutual Fund shall meet semi-annually to review general corporate administration, asset allocations, and financial performance."),
        ("Section 2: Stewardship Code Policies", "Stewardship policies and guidelines are maintained internally by the Legal department. These policies are updated once every three years to reflect general market practices. There is currently no requirement for website disclosures of voting/stewardship activities."),
        ("Section 3: Client Grievance Reporting", "Customer complaints and grievances received via email or offline channels are consolidated by the Customer Service department. A grievance redressal report is compiled and submitted to SEBI annually within 90 days from the close of the financial year."),
        ("Section 4: Key Personnel", "Mr. Rajesh Sharma is appointed as the Compliance Officer for Apex Mutual Fund. He is responsible for managing relations with SEBI and coordinating annual audits.")
    ]
    # In a real environment, we'd embed these. Since embedding takes an API key, we will store them.
    # The actual get_embedding helper handles generating or mocking embeddings.
    from backend.agent import get_embedding
    for title, content in chunks_amc:
        emb = get_embedding(content)
        add_document_chunk(doc_amc_id, title, content, emb)
        
    # 3. Add SOP Documents and chunks for Broker
    doc_broker_id = add_document(broker_id, "Zenith_Brokerage_SOP_v4.0.txt", "sop", MOCK_SOP_BROKER)
    chunks_broker = [
        ("Section 5: Client Collateral Management", "Zenith Brokerage records client deposits, bank transfers, and security margins in the ledger database. Client funds and securities collateral are reconciled, and details are uploaded to the clearing corporation once every week (every Friday before 5:00 PM)."),
        ("Section 6: Display of Contact Information", "Zenith Brokerage branches shall display name boards, standard broker licenses, and physical compliance registers in the lobby. Contact numbers of the local manager shall be displayed near the reception."),
        ("Section 7: Risk Management System", "IT department runs batch jobs at midnight to process client transactions, settle margin deficits, and flag accounts with leverage ratios exceeding 5:1.")
    ]
    for title, content in chunks_broker:
        emb = get_embedding(content)
        add_document_chunk(doc_broker_id, title, content, emb)

    # 4. Add Circulars & Obligations (AMC)
    circ_amc_id = add_circular("SEBI/HO/IMD/2026/01", "Mandatory Board Committee Guidelines and Stewardship Disclosure Standards", "2026-07-01", MOCK_CIRCULAR_AMC)
    ob_amc_1 = add_obligation(
        circ_amc_id,
        "Constitute a Risk Management Committee (RMC) that must meet at least once in a quarter to evaluate risk parameters, portfolio exposure, and liquidity positions.",
        "Section 1",
        "amc",
        "quarterly",
        30,
        "Minutes of the RMC meeting and signed board resolution"
    )
    ob_amc_2 = add_obligation(
        circ_amc_id,
        "Publish Stewardship Code disclosure and voting details on the official website annually within 60 days of the end of the financial year.",
        "Section 2",
        "amc",
        "yearly",
        60,
        "Official website link and PDF screenshot of Stewardship Code page"
    )
    
    # 5. Add Circulars & Obligations (Broker)
    circ_broker_id = add_circular("SEBI/HO/MIRSD/2026/02", "Standardization of Daily Client Collateral Reporting and Uploads", "2026-07-05", MOCK_CIRCULAR_BROKER)
    ob_broker_1 = add_obligation(
        circ_broker_id,
        "Perform daily reporting and uploading of client collateral details to the clearing corporation every day before 11:59 PM (IST).",
        "Section 1",
        "stockbroker",
        "daily",
        10,
        "Clearing house API upload receipt and daily margin report PDF"
    )
    
    # 6. Add Audit logs
    add_audit_log(amc_id, "upload_sop", "SOP document Apex_Mutual_Fund_SOP_v2.1.txt uploaded and parsed.", "Compliance Officer")
    add_audit_log(broker_id, "upload_sop", "SOP document Zenith_Brokerage_SOP_v4.0.txt uploaded and parsed.", "Compliance Officer")
    
    print("Database seeding completed.")
