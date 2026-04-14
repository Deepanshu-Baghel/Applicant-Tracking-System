import React, { useEffect, useState } from "react";
import { getShortlists } from "../services/api";
import ScoreChart from "../components/ScoreChart";
import SkillsChart from "../components/SkillsChart";

const AdminDashboard = () => {
  const [selectedRun, setSelectedRun] = useState(null);

  useEffect(() => {
    getShortlists().then((res) => {
      if (res.data.length) {
        setSelectedRun(res.data[res.data.length - 1]);
      }
    });
  }, []);

  if (!selectedRun) return <p>Loading...</p>;

  return (
    <div className="container">
      <h1>Admin Dashboard – Analytics</h1>

      <h3>Job Description</h3>
      <p>{selectedRun.job_description}</p>

      <ScoreChart results={selectedRun.results} />
      <SkillsChart results={selectedRun.results} />
    </div>
  );
};

export default AdminDashboard;
