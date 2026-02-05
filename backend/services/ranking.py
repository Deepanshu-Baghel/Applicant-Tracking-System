from models.embedding_model import generate_embedding
from models.similarity import compute_similarity
from services.skills import extract_skills

def rank_resumes(resumes, job_description):
    job_emb = generate_embedding(job_description)
    ranked = []

    for resume in resumes:
        resume_emb = generate_embedding(resume["text"])
        score = compute_similarity(resume_emb, job_emb)

        matched_skills = extract_skills(resume["text"])

        ranked.append({
            "name": resume["name"],
            "score": round(float(score), 3),
            "skills": matched_skills
        })

    return sorted(ranked, key=lambda x: x["score"], reverse=True)
