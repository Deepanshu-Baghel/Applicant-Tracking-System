from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token
from database.mongo import org_collection
from datetime import datetime
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

auth_bp = Blueprint("auth", __name__)


# ✅ Dummy users (for academic project)
USERS = {
    "hr@company.com": {
        "password": "hr123",
        "role": "hr"
    },
    "admin@company.com": {
        "password": "admin123",
        "role": "admin"
    }
}

@auth_bp.route("/register", methods=["POST"])
def register_org():
    data = request.json
    company = data["company"].lower()
    admin_email = data["admin_email"].lower()
    hr_email = data["hr_email"].lower()

    if org_collection.find_one({"company": company}):
        return jsonify({"error": "Organization already exists"}), 400

    org_collection.insert_one({
        "company": company,
        "admin_email": admin_email,
        "admin_password": None,
        "hr_email": hr_email,
        "hr_password": None
    })

    return jsonify({
        "message": "Organization registered",
        "next_step": "Admin and HR must set their passwords"
    })



@auth_bp.route("/set-password", methods=["POST"])
def set_password():
    data = request.json
    email = data["email"]
    password = data["password"]

    org = org_collection.find_one({
        "$or": [
            {"admin_email": email},
            {"hr_email": email}
        ]
    })

    if not org:
        return jsonify({"error": "Invalid email"}), 404

    if email == org["admin_email"]:
        org_collection.update_one(
            {"_id": org["_id"]},
            {"$set": {"admin_password": generate_password_hash(password)}}
        )
    else:
        org_collection.update_one(
            {"_id": org["_id"]},
            {"$set": {"hr_password": generate_password_hash(password)}}
        )

    return jsonify({"message": "Password set successfully"})

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data["email"]
    password = data["password"]

    org = org_collection.find_one({
        "$or": [
            {"admin_email": email},
            {"hr_email": email}
        ]
    })

    if not org:
        return jsonify({"error": "Invalid credentials"}), 401

    if email == org["admin_email"]:
        if not org["admin_password"]:
            return jsonify({"error": "Password not set"}), 403
        if not check_password_hash(org["admin_password"], password):
            return jsonify({"error": "Invalid credentials"}), 401
        role = "admin"
    else:
        if not org["hr_password"]:
            return jsonify({"error": "Password not set"}), 403
        if not check_password_hash(org["hr_password"], password):
            return jsonify({"error": "Invalid credentials"}), 401
        role = "hr"

    token = create_access_token(
        identity={"email": email, "role": role, "company": org["company"]}
    )

    return jsonify({"token": token, "role": role})