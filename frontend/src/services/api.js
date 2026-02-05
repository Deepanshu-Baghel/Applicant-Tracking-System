import axios from "axios";

const BASE_URL = "http://localhost:5000";

/* HR – run shortlisting */
export const shortlistCandidates = (files, jobDesc) => {
  const formData = new FormData();

  files.forEach((file) => formData.append("resumes", file));
  formData.append("job_description", jobDesc);

  return axios.post(`${BASE_URL}/shortlist`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

/* ADMIN – fetch saved shortlists */
export const getShortlists = () => {
  return axios.get(`${BASE_URL}/shortlists`);
};
