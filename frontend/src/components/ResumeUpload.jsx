import React from "react";

const ResumeUpload = ({ setFiles }) => {
  const handleUpload = (e) => {
    setFiles(Array.from(e.target.files));
  };

  return (
    <div className="card">
      <h3>Upload Resumes</h3>
      <input
        type="file"
        multiple
        accept=".pdf,.doc,.docx"
        onChange={handleUpload}
      />
    </div>
  );
};

export default ResumeUpload;
