export type SubscriptionTier = "free" | "pro" | "premium";

export type SubscriptionPlan = {
  tier: Exclude<SubscriptionTier, "free">;
  name: string;
  priceInrMonthly: number;
  tagline: string;
  features: string[];
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: "pro",
    name: "Pro",
    priceInrMonthly: 999,
    tagline: "For active candidates who need unlimited analysis and ATS depth.",
    features: [
      "Unlimited analyses",
      "Company-specific ATS simulator",
      "Recruiter 7-second eye path",
      "Job-tailored resume variants",
      "Hidden Red-Flag Detector",
    ],
  },
  {
    tier: "premium",
    name: "Premium",
    priceInrMonthly: 1999,
    tagline: "For high-intent candidates needing interview and offer intelligence.",
    features: [
      "Everything in Pro",
      "Interview conversion predictor",
      "Offer negotiation copilot",
      "Application pack generator",
      "Career narrative graph (IC/Manager/Specialist)",
      "Job reachability score",
      "Skill ROI planner",
      "Priority model",
    ],
  },
];

export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  if (value === "pro" || value === "premium" || value === "free") {
    return value;
  }

  return "free";
}

export function getTierFeatureAccess(tier: SubscriptionTier): {
  proUnlocked: boolean;
  premiumUnlocked: boolean;
  priorityModel: boolean;
} {
  if (tier === "premium") {
    return {
      proUnlocked: true,
      premiumUnlocked: true,
      priorityModel: true,
    };
  }

  if (tier === "pro") {
    return {
      proUnlocked: true,
      premiumUnlocked: false,
      priorityModel: false,
    };
  }

  return {
    proUnlocked: false,
    premiumUnlocked: false,
    priorityModel: false,
  };
}
