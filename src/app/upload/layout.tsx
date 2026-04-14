import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resume Upload Workspace",
  description: "Private resume upload workspace for authenticated users.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}