import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const SetPassword = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSetPassword = async () => {
    if (!email || !password) {
      setError("All fields are required");
      return;
    }

    try {
      await axios.post("http://localhost:5000/set-password", {
        email,
        password,
      });

      setMessage("Password set successfully. Redirecting to login...");
      setError("");

      setTimeout(() => navigate("/login"), 2000);
    } catch {
      setError("Invalid email or password already set");
    }
  };

  return (
    <div className="container">
      <h2>Set Your Password</h2>
      <p>Use your official organization email</p>

      <input
        type="email"
        placeholder="Official Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Set your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={handleSetPassword}>Set Password</button>

      {message && <p className="status-message success">{message}</p>}
      {error && <p className="status-message error">{error}</p>}
    </div>
  );
};

export default SetPassword;
