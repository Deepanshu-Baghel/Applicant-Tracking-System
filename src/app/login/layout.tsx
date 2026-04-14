import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login and Account Access",
  description:
    "Secure login and account access for WebResume.tech users to run AI resume analysis and manage reports.",
  alternates: {
    canonical: "/login",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}