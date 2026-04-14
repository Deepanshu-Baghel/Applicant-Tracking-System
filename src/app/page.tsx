import type { Metadata } from "next";
import HomePage from "@/components/HomePage";

const businessEmail = process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? "support@webresume.tech";
const businessPhone = process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? "+91-00000-00000";
const businessAddress = process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? "Remote, India";

export const metadata: Metadata = {
  title: "AI Resume Analyzer for ATS Score and Offer-Ready Strategy",
  description:
    "Boost ATS score, fix resume keyword gaps, and build an offer-ready job search plan with AI recruiter insights, resume rewrite guidance, and interview conversion strategy tailored to your target role.",
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
      "Boost ATS score, improve resume keywords, and build an offer-ready strategy with recruiter-focused insights, interview readiness guidance, and role-specific optimization.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Resume Analyzer for ATS Score and Offer-Ready Strategy",
    description:
      "Boost ATS score, optimize resume keywords, and build an offer-ready strategy for interviews, shortlisting, and salary discussions.",
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
    "https://www.linkedin.com/company/webresume-tech",
    "https://www.youtube.com/@webresumetech",
  ],
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "WebResume.tech",
  url: "https://www.webresume.tech",
  email: businessEmail,
  telephone: businessPhone,
  address: businessAddress,
  sameAs: websiteJsonLd.sameAs,
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: businessEmail,
      telephone: businessPhone,
      availableLanguage: ["English", "Hindi"],
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <HomePage />
    </>
  );
}
