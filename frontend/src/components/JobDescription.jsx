import React from "react";

const JobDescription = ({ jobDesc, setJobDesc }) => {
  return (
    <div className="card">
      <h3>Job Description</h3>
      <textarea
        rows="6"
        placeholder="Enter job description here..."
        value={jobDesc}
        onChange={(e) => setJobDesc(e.target.value)}
      />
    </div>
  );
};

export default JobDescription;
