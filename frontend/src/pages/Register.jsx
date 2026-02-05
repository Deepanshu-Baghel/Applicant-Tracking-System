import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const Register = () => {
  const navigate = useNavigate();

  const [company, setCompany] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [hrEmail, setHrEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async () => {
    if (!company || !adminEmail || !hrEmail) {
      setError("All fields are required");
      return;
    }

    try {
      // ✅ Call backend registration API
      await axios.post("http://localhost:5000/register", {
        company,
        admin_email: adminEmail,
        hr_email: hrEmail,
      });

      setError("");
      setSuccess(true);

      // ✅ REDIRECT TO SET PASSWORD (THIS IS THE LINE YOU ASKED ABOUT)
      setTimeout(() => navigate("/set-password"), 1500);

    } catch (err) {
      setError("Organization already exists or invalid data");
    }
  };

  return (
    <div className="container">
      <h2>Organization Registration</h2>
      <p>Register your organization to enable ATS access</p>

      <input
        placeholder="Company name (e.g. acme)"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />

      <input
        type="email"
        placeholder="Admin official email"
        value={adminEmail}
        onChange={(e) => setAdminEmail(e.target.value)}
      />

      <input
        type="email"
        placeholder="HR official email"
        value={hrEmail}
        onChange={(e) => setHrEmail(e.target.value)}
      />

      <button onClick={handleRegister}>
        Register Organization
      </button>

      {success && (
        <p style={{ color: "green", marginTop: 10 }}>
          Registration successful. Redirecting to set password…
        </p>
      )}

      {error && (
        <p style={{ color: "red", marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
};

export default Register;
