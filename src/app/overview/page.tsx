import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Crown, Rocket, ShieldCheck, Target, TrendingUp, Users } from "lucide-react";
import NavBar from "@/components/NavBar";
import { CREDIT_PLANS, FEATURE_CREDIT_COST } from "@/lib/creditPlans";
import { SUBSCRIPTION_PLANS } from "@/lib/subscriptionPlans";

export const metadata: Metadata = {
  title: "Resume Analysis Features and Pricing",
  description:
    "Compare ATS analysis features, recruiter tools, and Pro vs Premium pricing before choosing your plan.",
  alternates: {
    canonical: "/overview",
  },
  keywords: [
    "resume platform overview",
    "resume analysis pricing",
    "ATS tool comparison",
    "pro premium resume plans",
    "recruiter suite features",
  ],
  openGraph: {
    title: "Resume Analysis Features and Pricing",
    description:
      "Explore ATS analysis, recruiter tools, and Pro/Premium plan differences on WebResume.tech.",
    url: "/overview",
    type: "website",
  },
};

const proFeatures = [
  {
    title: "Company-Specific ATS Simulator",
    description:
      "Greenhouse, Lever, and Workday compatibility scores with exact fixes so resume parsing improves fast.",
  },
  {
    title: "Recruiter 7-Second Eye Path",
    description:
      "Fold-by-fold recruiter attention map showing what gets scanned first and how to improve each fold.",
  },
  {
    title: "Smart Rewrite Suggestions",
    description:
      "Line-level rewrites improve clarity, impact, and ATS keyword alignment without changing intent.",
  },
  {
    title: "Job-Tailored Resume Variants",
    description:
      "Three focused resume angles so candidates can apply with role-specific positioning.",
  },
  {
    title: "Hidden Red-Flag Detector",
    description:
      "Find subtle recruiter concerns that usually reduce shortlist confidence.",
  },
];

const premiumFeatures = [
  {
    title: "Interview Conversion Predictor",
    description:
      "AI probability band, key drivers, key risks, and next actions to increase interview-call chances.",
  },
  {
    title: "Offer Negotiation Copilot",
    description:
      "Salary ask range, rebuttal scripts, and closing lines to negotiate offers with confidence.",
  },
  {
    title: "Application Pack Generator",
    description:
      "Ready-to-use recruiter email, LinkedIn DM, 30-second pitch, and cover-letter drafts.",
  },
  {
    title: "Career Narrative Graph",
    description:
      "Readiness scoring across IC, Manager, and Specialist tracks with a primary trajectory recommendation.",
  },
  {
    title: "Job Reachability + Skill ROI Planner",
    description:
      "Get Apply now/Upskill first/Stretch verdict plus top skills that maximize shortlist and salary uplift.",
  },
  {
    title: "Priority Model",
    description:
      "Premium analyses are routed through priority model handling for faster advanced output.",
  },
];

const premiumBenefits = [
  "Unlimited analyses in Pro and Premium tiers.",
  "Free tier stays credit-based for advanced unlocks.",
  "Clear split between credit purchases and subscription upgrades.",
  "Premium adds interview + offer + application execution layer.",
];

const featureAccessMap = [
  {
    label: "Free + Credits",
    value: "Core analysis + per-run Pro unlock",
    note: "Best for occasional users and experimentation.",
  },
  {
    label: "Pro Subscription",
    value: "Unlimited Pro intelligence modules",
    note: "ATS simulator, eye-path, variants, and red-flag diagnostics.",
  },
  {
    label: "Premium Subscription",
    value: "Everything in Pro + decision layer",
    note: "Interview predictor, offer copilot, application pack, reachability, skill ROI.",
  },
];

export default function OverviewPage() {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      <NavBar />

      <section className="pt-28 pb-12 border-b border-border bg-card/40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-semibold text-primary-600 mb-5">
            <Crown className="w-3.5 h-3.5" /> Platform Overview
          </div>

          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4">WebResume.tech Product Overview</h1>
          <p className="text-muted text-base md:text-lg max-w-3xl leading-relaxed">
            WebResume.tech combines candidate-side intelligence and recruiter-side workflows in one system: ATS simulation,
            rewrite intelligence, interview conversion strategy, and monetization-ready plan architecture.
          </p>
        </div>
      </section>

      <section className="py-12 border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-heading font-bold mb-6">Core Product Surfaces</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="glass-card p-5">
              <Target className="w-5 h-5 text-primary-500 mb-3" />
              <h3 className="font-semibold mb-2">Candidate Resume Lab</h3>
              <p className="text-sm text-muted">ATS simulation, recruiter eye-path, variants, and rewrite intelligence in one report.</p>
            </div>
            <div className="glass-card p-5">
              <TrendingUp className="w-5 h-5 text-primary-500 mb-3" />
              <h3 className="font-semibold mb-2">Career Decision Layer</h3>
              <p className="text-sm text-muted">Interview predictor, offer negotiation copilot, reachability verdict, and skill ROI planner.</p>
            </div>
            <div className="glass-card p-5">
              <Users className="w-5 h-5 text-primary-500 mb-3" />
              <h3 className="font-semibold mb-2">Recruiter Suite</h3>
              <p className="text-sm text-muted">Batch ranking, ATS matrix, red-flag diagnostics, and outreach-ready shortlist exports.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-b border-border bg-card/30">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-heading font-bold mb-4">Pro Features</h2>
            <div className="space-y-3">
              {proFeatures.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-border bg-background p-4">
                  <p className="font-semibold text-foreground flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary-500" /> {feature.title}
                  </p>
                  <p className="text-sm text-muted mt-2">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-heading font-bold mb-4">Premium Features</h2>
            <div className="space-y-3">
              {premiumFeatures.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-border bg-background p-4">
                  <p className="font-semibold text-foreground flex items-center gap-2">
                    <Crown className="w-4 h-4 text-primary-500" /> {feature.title}
                  </p>
                  <p className="text-sm text-muted mt-2">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-primary-500/30 bg-primary-500/10 p-4 mt-5 text-sm text-foreground">
              Free-tier Pro run cost: <span className="font-semibold">{FEATURE_CREDIT_COST.resumePremiumAnalysis} credit</span>
              <br />
              HR premium batch cost: <span className="font-semibold">{FEATURE_CREDIT_COST.hrPremiumBatch} credits</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-heading font-bold mb-6">Plan Model</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="glass-card p-5 border-border">
              <p className="text-xs uppercase tracking-wider text-muted font-semibold">Free</p>
              <p className="text-lg font-heading font-bold mt-1">Credit-Based</p>
              <p className="text-sm text-muted mt-2">
                Buy credits and unlock Pro-level modules per run when needed.
              </p>
            </div>

            {SUBSCRIPTION_PLANS.map((plan) => (
              <div key={plan.tier} className="glass-card p-5 border-primary-500/20">
                <p className="text-xs uppercase tracking-wider text-primary-600 font-semibold">{plan.name}</p>
                <p className="text-lg font-heading font-bold mt-1">INR {plan.priceInrMonthly}/month</p>
                <p className="text-sm text-muted mt-2">{plan.tagline}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {premiumBenefits.map((benefit) => (
              <div key={benefit} className="rounded-xl border border-border bg-background p-4 text-sm text-foreground flex gap-2">
                <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 border-b border-border bg-card/30">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-heading font-bold mb-6">Feature Access Map</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {featureAccessMap.map((item) => (
              <div key={item.label} className="glass-card p-5 border-primary-500/15">
                <p className="text-xs uppercase tracking-wider text-primary-600 font-semibold mb-2">{item.label}</p>
                <p className="text-lg font-heading font-bold text-foreground mb-2">{item.value}</p>
                <p className="text-sm text-muted">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-heading font-bold mb-6">Credit Plans (25 Credits = INR 100)</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {CREDIT_PLANS.map((plan) => (
              <div key={plan.id} className="glass-card p-6 border-primary-500/15">
                <p className="text-xs uppercase tracking-wider text-primary-600 font-semibold mb-2">{plan.name}</p>
                <p className="text-3xl font-heading font-bold text-foreground">{plan.credits} Credits</p>
                <p className="text-lg font-semibold text-primary-600 mt-2">
                  <Coins className="w-4 h-4 inline mr-1" /> INR {plan.priceInr}
                </p>
                <p className="text-sm text-muted mt-3">{plan.tagline}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/billing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors"
            >
              Open Billing
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border hover:bg-card text-foreground font-medium transition-colors"
            >
              Start Analysis
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
