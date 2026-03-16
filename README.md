# 🚀 AI Resume Shortlisting System (ATS)

An AI-powered Applicant Tracking System that automatically analyzes resumes and ranks candidates based on semantic similarity with job descriptions using **Sentence Transformers (BERT-based model)**.

---

## 📌 Features

* 🔐 **Organization-based Authentication (JWT)**
* 👨‍💼 **Role-Based Access Control (Admin / HR)**
* 📄 **Resume Upload (PDF/DOCX)**
* 🤖 **AI-Based Resume Shortlisting**
* 🧠 **Semantic Matching using BERT Embeddings**
* 🏷️ **Skill Extraction & Highlighting**
* 📊 **Analytics Dashboard (Scores & Skills)**
* 🏢 **Company-wise Data Isolation (Multi-tenant system)**

---

## 🧠 AI/ML Overview

* Uses **Sentence Transformers (`all-MiniLM-L6-v2`)**
* Converts resumes and job descriptions into **dense vector embeddings**
* Computes similarity using **cosine similarity**
* Ranks candidates based on relevance

---

## 🏗️ Tech Stack

### 🔹 Frontend

* React.js (Vite)
* Axios
* Chart.js

### 🔹 Backend

* Python
* Flask
* Flask-JWT-Extended

### 🔹 AI / NLP

* Sentence Transformers
* HuggingFace Transformers
* NumPy, Scikit-learn

### 🔹 Database

* MongoDB

---

## 📂 Project Structure

```
Applicant-Tracking-System/
│
├── backend/
│   ├── app.py
│   ├── routes/
│   │   ├── auth_routes.py
│   │   └── resume_routes.py
│   ├── services/
│   │   ├── ranking.py
│   │   ├── skills.py
│   │   ├── resume_parser.py
│   │   └── shortlist_store.py
│   ├── models/
│   │   ├── embedding_model.py
│   │   └── similarity.py
│   └── database/
│       └── mongo.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
│
└── README.md
```

---

## ⚙️ Installation & Setup

### 🔹 1. Clone Repository

```bash
git clone https://github.com/your-username/ats-project.git
cd ats-project
```

---

### 🔹 2. Backend Setup

```bash
cd backend
python -m venv venv
```

#### Activate virtual environment:

```bash
# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

#### Install dependencies:

```bash
pip install -r requirements.txt
```

#### Run backend:

```bash
python app.py
```

Backend runs on:

```
http://localhost:5000
```

---

### 🔹 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

## 🔐 Authentication Flow

1. Register organization
2. Set password (Admin / HR)
3. Login
4. JWT token stored in browser
5. Protected API access

---

## 🔄 Workflow

1. HR uploads resumes
2. Enters job description
3. Backend extracts text
4. AI model generates embeddings
5. Cosine similarity is calculated
6. Candidates are ranked
7. Results stored in MongoDB
8. Admin views analytics

---

## 📊 Output Example

| Candidate   | Score | Skills            |
| ----------- | ----- | ----------------- |
| Rohit Singh | 84.2% | Java, Kotlin, SQL |
| Candidate B | 76.5% | Python, Flask     |

---

## 🔒 Security Features

* JWT Authentication
* Role-based access (Admin / HR)
* Company-level data isolation
* CORS protection

---

## 🚀 Future Enhancements

* Resume section-wise scoring
* AI-based resume summarization
* Interview scheduling system
* Email notifications
* Advanced NLP models (fine-tuned)

---

## 🎯 Key Highlights

* Real-world HR automation problem
* AI + Full-stack integration
* Scalable and modular architecture
* Industry-relevant technologies

---

## 📜 License

This project is for academic and educational purposes.

---

## 👨‍💻 Author

Rohit Singh
B.Tech CSE | AI & Full Stack Developer

---
