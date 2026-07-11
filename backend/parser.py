import re
from pypdf import PdfReader

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extracts all text page-by-page from a PDF file."""
    try:
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        # OCR Fallback for scanned PDFs
        if not text.strip():
            print("Detected potential scanned PDF (no text extracted). Attempting OCR fallback...")
            try:
                import pdf2image
                import pytesseract
                # Convert PDF to images
                images = pdf2image.convert_from_path(pdf_path)
                ocr_text = ""
                for img in images:
                    page_text = pytesseract.image_to_string(img)
                    if page_text:
                        ocr_text += page_text + "\n"
                if ocr_text.strip():
                    print("OCR text extraction successful.")
                    return ocr_text
            except ImportError:
                print("OCR Fallback warning: 'pdf2image' or 'pytesseract' not installed. Return default simulation text if needed.")
            except Exception as ocr_err:
                print(f"OCR Fallback execution failed: {ocr_err}")
                
        return text
    except Exception as e:
        print(f"Error parsing PDF {pdf_path}: {e}")
        return ""

def chunk_text(text: str, chunk_size: int = 1500, overlap: int = 200) -> list[dict]:
    """
    Chunks text into logical segments by searching for paragraph breaks or standard headings.
    Returns a list of dicts: {'section_title': str, 'content': str}
    """
    # Attempt to split by obvious sections/headings (e.g., numbered headers or caps headers)
    # We will split text by double newline to find paragraphs first
    paragraphs = text.split("\n\n")
    chunks = []
    
    current_title = "General"
    current_chunk_text = ""
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
            
        # Check if the paragraph looks like a section heading:
        # e.g., "1. Introduction", "SECTION II: OBLIGATIONS", "CHAPTER 3 - REPORTING"
        heading_match = re.match(r'^((?:[A-Z0-9\.\-\s]+(?:\.|\:)\s+)?[A-Z][a-zA-Z\s]{4,40})$', para[:100])
        # Or simple numbered list starts
        number_heading_match = re.match(r'^(\d+\.\s+[A-Za-z][a-zA-Z\s]{3,50})', para)
        
        if heading_match or number_heading_match:
            # If we already have accumulated text, save it as a chunk before starting a new section
            if current_chunk_text:
                chunks.append({
                    "section_title": current_title,
                    "content": current_chunk_text.strip()
                })
                current_chunk_text = ""
            current_title = para.split("\n")[0][:80] # Use first line as header
        
        # Add to current chunk
        current_chunk_text += para + "\n\n"
        
        # If current chunk exceeds chunk_size, split it
        if len(current_chunk_text) >= chunk_size:
            chunks.append({
                "section_title": current_title,
                "content": current_chunk_text.strip()
            })
            # Start next chunk with a little overlap if possible
            words = current_chunk_text.split()
            overlap_words = words[-max(1, int(overlap/6)):] if len(words) > 10 else []
            current_chunk_text = " ".join(overlap_words) + "\n\n"
            
    if current_chunk_text.strip():
        chunks.append({
            "section_title": current_title,
            "content": current_chunk_text.strip()
        })
        
    return chunks
