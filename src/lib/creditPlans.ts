export type CreditPlanId = "starter" | "growth" | "scale";

export type CreditPlan = {
  id: CreditPlanId;
  name: string;
  credits: number;
  priceInr: number;
  tagline: string;
};

export const FREE_STARTER_CREDITS = 5;

export const FEATURE_CREDIT_COST = {
  resumePremiumAnalysis: 1,
  hrPremiumBatch: 2,
} as const;

export const CREDIT_PLANS: CreditPlan[] = [
  {
    id: "starter",
    name: "Starter Pack",
    credits: 25,
    priceInr: 100,
    tagline: "Perfect for individual job seekers",
  },
  {
    id: "growth",
    name: "Growth Pack",
    credits: 80,
    priceInr: 320,
    tagline: "Best value for active hiring cycles",
  },
  {
    id: "scale",
    name: "Scale Pack",
    credits: 250,
    priceInr: 1000,
    tagline: "Designed for recruiting teams and agencies",
  },
];

export function getCreditPlan(planId: string): CreditPlan | null {
  return CREDIT_PLANS.find((plan) => plan.id === planId) ?? null;
}
