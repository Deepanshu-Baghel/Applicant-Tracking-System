from flask import Blueprint, request, jsonify
from services.ranking import rank_resumes
from services.shortlist_store import save_shortlist
from services.resume_parser import parse_resume
from database.mongo import shortlist_collection
import os

resume_bp = Blueprint("resume", __name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@resume_bp.route("/shortlist", methods=["POST"])
def shortlist():
    files = request.files.getlist("resumes")
    job_desc = request.form["job_description"]

    resumes = []

    for file in files:
        path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(path)

        text = parse_resume(path)
        resumes.append({
            "name": file.filename,
            "text": text
        })

    ranked = rank_resumes(resumes, job_desc)

    # ✅ Save to MongoDB
    save_shortlist(job_desc, ranked)

    return jsonify(ranked)

@resume_bp.route("/shortlists", methods=["GET"])
def get_all_shortlists():
    data = list(shortlist_collection.find({}, {"_id": 0}))
    return jsonify(data)
