import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Report Archive Workspace",
  description: "Private report archive workspace for authenticated users.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}