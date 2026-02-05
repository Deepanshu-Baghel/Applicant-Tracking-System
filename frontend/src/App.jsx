import { Routes, Route, Navigate } from "react-router-dom";

import Register from "./pages/Register";
import SetPassword from "./pages/SetPassword";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  return (
    <Routes>
      {/* Start with organization registration */}
      <Route path="/" element={<Navigate to="/register" />} />

      <Route path="/register" element={<Register />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
}

export default App;
