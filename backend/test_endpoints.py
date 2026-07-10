import requests
import io

API_BASE = "http://localhost:8000"

def test_circular_upload():
    print("Testing SEBI Circular Upload...")
    url = f"{API_BASE}/api/circulars/upload"
    
    # Create a mock text file
    file_content = """
    Securities and Exchange Board of India
    Circular No: SEBI/HO/IMD/2026/99
    Date: July 08, 2026
    Subject: Test Mutual Fund reporting frequency guidelines
    All Mutual Funds / AMCs must submit risk reports to SEBI quarterly within 15 days.
    """
    
    files = {
        'file': ('test_circular.txt', io.BytesIO(file_content.encode('utf-8')), 'text/plain')
    }
    data = {
        'circular_number': 'SEBI/HO/IMD/2026/99',
        'title': 'Test Reporting Guidelines',
        'date': '2026-07-08'
    }
    
    try:
        response = requests.post(url, data=data, files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Error during upload: {e}")

def test_sop_upload():
    print("\nTesting SOP Upload...")
    # Get active company id first
    res = requests.get(f"{API_BASE}/api/companies")
    companies = res.json()
    if not companies:
        print("No companies found to test SOP upload.")
        return
        
    company_id = companies[0]['id']
    print(f"Uploading SOP for Company ID: {company_id} ({companies[0]['name']})")
    
    url = f"{API_BASE}/api/companies/{company_id}/sops/upload"
    file_content = """
    Zenith AMC SOP
    Our Board meets annually.
    We submit reporting to SEBI every year.
    """
    files = {
        'file': ('test_sop.txt', io.BytesIO(file_content.encode('utf-8')), 'text/plain')
    }
    
    try:
        response = requests.post(url, files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Error during upload: {e}")

if __name__ == "__main__":
    test_circular_upload()
    test_sop_upload()
