import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recruiter Suite Workspace",
  description: "Private recruiter suite workspace for batch resume scoring and shortlist generation.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return children;
}