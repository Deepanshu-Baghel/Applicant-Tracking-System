import React from "react";

const ShortlistTable = ({ results }) => {
  if (!results.length) return null;

  return (
    <div className="card">
      <h3>Shortlisted Candidates</h3>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Score</th>
            <th>Matched Skills</th>
          </tr>
        </thead>

        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              <td>{r.name}</td>
              <td>{r.score}</td>
              <td>
                {r.skills.length ? (
                  r.skills.map((s, idx) => (
                    <span key={idx} className="badge">
                      {s}
                    </span>
                  ))
                ) : (
                  <span>-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ShortlistTable;
