import { Bar } from "react-chartjs-2";

const SkillsChart = ({ results }) => {
  if (!results || results.length === 0) return null;

  const skillCount = {};

  results.forEach((r) =>
    r.skills.forEach((s) => {
      skillCount[s] = (skillCount[s] || 0) + 1;
    })
  );

  const data = {
    labels: Object.keys(skillCount),
    datasets: [
      {
        label: "Skill Frequency",
        data: Object.values(skillCount),
      },
    ],
  };

  return <Bar data={data} />;
};

export default SkillsChart;
