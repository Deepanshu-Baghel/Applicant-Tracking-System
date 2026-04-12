import { createClient, type User } from "@supabase/supabase-js";
import {
  getTierFeatureAccess,
  normalizeSubscriptionTier,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans";

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return null;
  }

  return createClient(url, anon);
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    return null;
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSubscriptionTierFromUser(user: User | null | undefined): SubscriptionTier {
  const tier = user?.user_metadata?.subscription_tier;
  return normalizeSubscriptionTier(tier);
}

export async function getAuthenticatedUserWithTier(req: Request): Promise<{
  userId: string;
  tier: SubscriptionTier;
} | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  const anonClient = getAnonClient();
  if (!anonClient) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return {
    userId: user.id,
    tier: getSubscriptionTierFromUser(user),
  };
}

export async function setSubscriptionTier(params: {
  userId: string;
  tier: SubscriptionTier;
}): Promise<{ ok: boolean; message: string }> {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      message: "Subscription infra is not configured on server.",
    };
  }

  const { data, error } = await adminClient.auth.admin.getUserById(params.userId);
  if (error || !data?.user) {
    return {
      ok: false,
      message: error?.message ?? "Unable to find user for subscription update.",
    };
  }

  const nextMetadata = {
    ...(data.user.user_metadata ?? {}),
    subscription_tier: params.tier,
  };

  const { error: updateError } = await adminClient.auth.admin.updateUserById(params.userId, {
    user_metadata: nextMetadata,
  });

  if (updateError) {
    return {
      ok: false,
      message: updateError.message,
    };
  }

  return {
    ok: true,
    message: `Subscription activated: ${params.tier}`,
  };
}

export function buildSubscriptionAccess(tier: SubscriptionTier) {
  return {
    tier,
    ...getTierFeatureAccess(tier),
  };
}

export async function createPendingSubscriptionOrder(params: {
  userId: string;
  tier: Exclude<SubscriptionTier, "free">;
  provider: "razorpay";
  providerOrderId: string;
  amountInr: number;
}): Promise<void> {
  const adminClient = getAdminClient();
  if (!adminClient) {
    throw new Error("Subscription infra is not configured on server.");
  }

  const { error } = await adminClient.from("subscription_orders").insert({
    user_id: params.userId,
    tier: params.tier,
    provider: params.provider,
    provider_order_id: params.providerOrderId,
    amount_inr: params.amountInr,
    status: "pending",
  });

  if (error) {
    throw new Error(`Create subscription order failed: ${error.message}`);
  }
}

export async function markSubscriptionOrderAsPaid(params: {
  userId: string;
  provider: "razorpay";
  providerOrderId: string;
  providerPaymentId: string;
}): Promise<{ tier: Exclude<SubscriptionTier, "free"> } | null> {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return null;
  }

  const { data: order, error: fetchError } = await adminClient
    .from("subscription_orders")
    .select("id,tier,status")
    .eq("user_id", params.userId)
    .eq("provider", params.provider)
    .eq("provider_order_id", params.providerOrderId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Fetch subscription order failed: ${fetchError.message}`);
  }

  if (!order || order.status !== "pending") {
    return null;
  }

  const tier = normalizeSubscriptionTier(order.tier);
  if (tier === "free") {
    throw new Error("Invalid subscription order tier.");
  }

  const { error: updateError } = await adminClient
    .from("subscription_orders")
    .update({
      status: "paid",
      provider_payment_id: params.providerPaymentId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (updateError) {
    throw new Error(`Update subscription order failed: ${updateError.message}`);
  }

  return {
    tier,
  };
}
