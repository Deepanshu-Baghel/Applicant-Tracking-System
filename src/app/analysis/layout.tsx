import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analysis Report Workspace",
  description: "Private AI resume analysis report workspace for authenticated users.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return children;
}