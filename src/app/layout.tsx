import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.webresume.tech";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "WebResume.tech | AI Resume Analyzer for ATS and Recruiter Screening",
    template: "%s | WebResume.tech",
  },
  description:
    "WebResume.tech is an AI resume analyzer that improves ATS compatibility, resume keywords, recruiter readability, and interview conversion outcomes.",
  applicationName: "WebResume.tech",
  keywords: [
    "AI resume analyzer",
    "ATS resume checker",
    "resume keyword optimization",
    "resume screening",
    "interview preparation AI",
    "resume score tool",
  ],
  authors: [{ name: "WebResume.tech" }],
  creator: "WebResume.tech",
  publisher: "WebResume.tech",
  openGraph: {
    siteName: "WebResume.tech",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
        {children}
      </body>
    </html>
  );
}
