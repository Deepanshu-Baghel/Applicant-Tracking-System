SKILLS = [
    "python", "java", "react", "flask", "mongodb",
    "sql", "machine learning", "nlp", "docker"
]

def extract_skills(text):
    text = text.lower()
    return [skill for skill in SKILLS if skill in text]
