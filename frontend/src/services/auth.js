import axios from "axios";

export const loginUser = (data) =>
  axios.post("http://localhost:5000/login", data);
