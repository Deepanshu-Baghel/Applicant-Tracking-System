import { Bar } from "react-chartjs-2";

const ScoreChart = ({ results }) => {
  if (!results || results.length === 0) return null;

  const data = {
    labels: results.map((r) => r.name),
    datasets: [
      {
        label: "Similarity Score",
        data: results.map((r) => r.score),
      },
    ],
  };

  return <Bar data={data} />;
};

export default ScoreChart;
