from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

def compute_similarity(resume_emb, job_emb):
    return cosine_similarity(
        np.array(resume_emb).reshape(1, -1),
        np.array(job_emb).reshape(1, -1)
    )[0][0]
