from pdfminer.high_level import extract_text
from docx import Document

def parse_resume(path):
    if path.endswith(".pdf"):
        return extract_text(path)
    elif path.endswith(".docx"):
        doc = Document(path)
        return " ".join(p.text for p in doc.paragraphs)
    return ""
