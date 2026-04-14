import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing and Subscription Workspace",
  description: "Private billing, credits, and subscription management workspace for authenticated users.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}