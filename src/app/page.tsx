import type { Metadata } from "next";
import HomePage from "@/components/HomePage";

export const metadata: Metadata = {
  title: "AI Resume Analyzer for ATS Score and Offer-Ready Strategy",
  description:
    "Boost ATS score, fix resume keywords, and build an offer-ready job search strategy with AI recruiter insights.",
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
    title: "AI Resume Analyzer for ATS Score and Offer-Ready Strategy",
    description:
      "Boost ATS score, improve resume keywords, and build an offer-ready strategy with recruiter-focused insights.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Resume Analyzer for ATS Score and Offer-Ready Strategy",
    description:
      "Boost ATS score, optimize resume keywords, and build an offer-ready strategy for interviews.",
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
  sameAs: [
    "https://www.facebook.com/webresume.tech",
    "https://x.com/webresumetech",
    "https://www.instagram.com/webresume.tech",
  ],
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
