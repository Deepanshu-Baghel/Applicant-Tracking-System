import type { Metadata } from "next";
import HomePage from "@/components/HomePage";

export const metadata: Metadata = {
  title: "AI Resume Analyzer, ATS Score Checker, and Recruiter Screening Suite",
  description:
    "WebResume.tech helps job seekers optimize resumes with AI ATS scoring, recruiter-focused insights, role-specific rewrites, interview conversion prediction, and salary negotiation guidance.",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "AI resume analyzer",
    "ATS score checker",
    "resume optimization",
    "resume keyword optimization",
    "resume ATS checker",
    "recruiter screening tools",
    "interview conversion predictor",
  ],
  openGraph: {
    title: "AI Resume Analyzer, ATS Score Checker, and Recruiter Screening Suite",
    description:
      "Run ATS checks, improve resume keywords, and generate interview and offer strategy with WebResume.tech.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Resume Analyzer, ATS Score Checker, and Recruiter Screening Suite",
    description:
      "Run ATS checks, optimize resume keywords, and improve recruiter shortlisting outcomes.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "WebResume.tech",
  url: "https://www.webresume.tech",
  description:
    "AI resume analyzer with ATS scoring, recruiter signal analysis, interview conversion prediction, and negotiation guidance.",
  sameAs: ["https://www.facebook.com/webresume.tech", "https://x.com/webresumetech"],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <HomePage />
    </>
  );
}
