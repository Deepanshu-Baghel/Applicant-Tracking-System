from datetime import datetime
from database.mongo import shortlist_collection

def save_shortlist(job_description, ranked_results):
    document = {
        "job_description": job_description,
        "results": ranked_results,
        "created_at": datetime.utcnow()
    }

    shortlist_collection.insert_one(document)
