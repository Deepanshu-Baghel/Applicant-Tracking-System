import { type SubscriptionTier } from "@/lib/subscriptionPlans";

export type SubscriptionAccess = {
  tier: SubscriptionTier;
  proUnlocked: boolean;
  premiumUnlocked: boolean;
  priorityModel: boolean;
};

function authHeaders(accessToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchSubscriptionStatus(accessToken: string): Promise<SubscriptionAccess | null> {
  const response = await fetch("/api/subscription/status", {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    subscription?: SubscriptionAccess;
  };

  return payload.subscription ?? null;
}

export async function activateSubscriptionTier(params: {
  accessToken: string;
  tier: Exclude<SubscriptionTier, "free">;
}): Promise<{ ok: boolean; message: string; subscription?: SubscriptionAccess }> {
  const response = await fetch("/api/subscription/activate", {
    method: "POST",
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({ tier: params.tier }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    error?: string;
    subscription?: SubscriptionAccess;
  };

  if (!response.ok) {
    return {
      ok: false,
      message: payload.error ?? "Unable to activate subscription.",
    };
  }

  return {
    ok: Boolean(payload.success),
    message: payload.message ?? "Subscription updated.",
    subscription: payload.subscription,
  };
}

export async function createSubscriptionOrder(params: {
  accessToken: string;
  tier: Exclude<SubscriptionTier, "free">;
}): Promise<{
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  plan: {
    tier: Exclude<SubscriptionTier, "free">;
    name: string;
    priceInrMonthly: number;
  };
}> {
  const response = await fetch("/api/billing/subscription/order", {
    method: "POST",
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({ tier: params.tier }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    keyId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    error?: string;
    plan?: {
      tier?: Exclude<SubscriptionTier, "free">;
      name?: string;
      priceInrMonthly?: number;
    };
  };

  if (
    !response.ok ||
    !payload.keyId ||
    !payload.orderId ||
    !payload.plan?.tier ||
    !payload.plan.name ||
    typeof payload.plan.priceInrMonthly !== "number"
  ) {
    throw new Error(payload.error ?? "Unable to initialize subscription payment.");
  }

  return {
    keyId: payload.keyId,
    orderId: payload.orderId,
    amount: typeof payload.amount === "number" ? payload.amount : payload.plan.priceInrMonthly * 100,
    currency: payload.currency ?? "INR",
    plan: {
      tier: payload.plan.tier,
      name: payload.plan.name,
      priceInrMonthly: payload.plan.priceInrMonthly,
    },
  };
}

export async function verifySubscriptionPayment(params: {
  accessToken: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ ok: boolean; message: string; subscription?: SubscriptionAccess }> {
  const response = await fetch("/api/billing/subscription/verify", {
    method: "POST",
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({
      razorpay_order_id: params.razorpay_order_id,
      razorpay_payment_id: params.razorpay_payment_id,
      razorpay_signature: params.razorpay_signature,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    error?: string;
    subscription?: SubscriptionAccess;
  };

  if (!response.ok) {
    return {
      ok: false,
      message: payload.error ?? "Subscription payment verification failed.",
    };
  }

  return {
    ok: Boolean(payload.success),
    message: payload.message ?? "Subscription activated.",
    subscription: payload.subscription,
  };
}
