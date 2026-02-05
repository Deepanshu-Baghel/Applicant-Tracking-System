from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017/")
db = client["ai_ats"]

shortlist_collection = db["shortlisted_results"]
org_collection = db["organizations"]


