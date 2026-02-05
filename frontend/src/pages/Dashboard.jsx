import React, { useState } from "react";
import ResumeUpload from "../components/ResumeUpload";
import JobDescription from "../components/JobDescription";
import ShortlistTable from "../components/ShortlistTable";
import { shortlistCandidates } from "../services/api";

const Dashboard = () => {
  const [files, setFiles] = useState([]);
  const [jobDesc, setJobDesc] = useState("");
  const [results, setResults] = useState([]);

  const handleShortlist = async () => {
    if (!files.length || !jobDesc.trim()) {
      alert("Please upload resumes and enter job description");
      return;
    }

    const res = await shortlistCandidates(files, jobDesc);
    setResults(res.data);
  };

  return (
    <div className="container">
      <h1>HR Dashboard</h1>

      <ResumeUpload setFiles={setFiles} />
      <JobDescription jobDesc={jobDesc} setJobDesc={setJobDesc} />

      <button onClick={handleShortlist}>
        Shortlist Candidates
      </button>

      {results.length === 0 && <p>No results yet</p>}

      <ShortlistTable results={results} />
    </div>
  );
};

export default Dashboard;
