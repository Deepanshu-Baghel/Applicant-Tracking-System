import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FREE_STARTER_CREDITS } from "@/lib/creditPlans";

export type ServerCreditWallet = {
  balance: number;
  totalPurchasedCredits: number;
  totalConsumedCredits: number;
  updatedAt: string;
};

type ConsumeResult = {
  ok: boolean;
  wallet: ServerCreditWallet;
  message: string;
};

type AddResult = {
  ok: boolean;
  wallet: ServerCreditWallet;
  message: string;
};

function isMissingRpcFunctionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the function") ||
    normalized.includes("schema cache") ||
    normalized.includes("function public.consume_credits") ||
    normalized.includes("function public.add_credits")
  );
}

function toWallet(row: Record<string, unknown>): ServerCreditWallet {
  return {
    balance: typeof row.balance === "number" ? Math.max(0, Math.round(row.balance)) : 0,
    totalPurchasedCredits:
      typeof row.total_purchased_credits === "number"
        ? Math.max(0, Math.round(row.total_purchased_credits))
        : 0,
    totalConsumedCredits:
      typeof row.total_consumed_credits === "number"
        ? Math.max(0, Math.round(row.total_consumed_credits))
        : 0,
    updatedAt:
      typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at
        : new Date().toISOString(),
  };
}

function getSupabaseAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return null;
  }

  return createClient(url, anon);
}

function getSupabaseAdminClient(): SupabaseClient | null {
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

export async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  const anonClient = getSupabaseAnonClient();
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

  return user.id;
}

export async function ensureCreditWallet(userId: string): Promise<ServerCreditWallet | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("credit_wallets")
    .select("balance,total_purchased_credits,total_consumed_credits,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Wallet fetch failed: ${error.message}`);
  }

  if (data) {
    return toWallet(data as Record<string, unknown>);
  }

  const { data: inserted, error: insertError } = await admin
    .from("credit_wallets")
    .insert({
      user_id: userId,
      balance: FREE_STARTER_CREDITS,
      total_purchased_credits: FREE_STARTER_CREDITS,
      total_consumed_credits: 0,
    })
    .select("balance,total_purchased_credits,total_consumed_credits,updated_at")
    .single();

  if (insertError) {
    throw new Error(`Wallet init failed: ${insertError.message}`);
  }

  return toWallet(inserted as Record<string, unknown>);
}

export async function consumeCreditsServer(params: {
  userId: string;
  amount: number;
  feature: string;
  metadata?: Record<string, unknown>;
}): Promise<ConsumeResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      wallet: {
        balance: 0,
        totalPurchasedCredits: 0,
        totalConsumedCredits: 0,
        updatedAt: new Date().toISOString(),
      },
      message: "Credit infra is not configured.",
    };
  }

  const amount = Math.max(0, Math.round(params.amount));
  const walletBefore = await ensureCreditWallet(params.userId);

  if (amount <= 0) {
    return {
      ok: true,
      wallet: walletBefore ?? {
        balance: 0,
        totalPurchasedCredits: 0,
        totalConsumedCredits: 0,
        updatedAt: new Date().toISOString(),
      },
      message: "No credits consumed.",
    };
  }

  const { data, error } = await admin.rpc("consume_credits", {
    p_user_id: params.userId,
    p_amount: amount,
    p_feature: params.feature,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    if (isMissingRpcFunctionError(error.message)) {
      return {
        ok: false,
        wallet: walletBefore ?? {
          balance: 0,
          totalPurchasedCredits: 0,
          totalConsumedCredits: 0,
          updatedAt: new Date().toISOString(),
        },
        message:
          "Premium credit functions are not deployed yet. Run the Supabase credit migration, then retry.",
      };
    }

    throw new Error(`Consume credits failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const wallet = await ensureCreditWallet(params.userId);

  if (!row) {
    return {
      ok: false,
      wallet: wallet ?? {
        balance: 0,
        totalPurchasedCredits: 0,
        totalConsumedCredits: 0,
        updatedAt: new Date().toISOString(),
      },
      message: "Credit consume response is empty.",
    };
  }

  return {
    ok: Boolean((row as { success?: boolean }).success),
    wallet: wallet ?? {
      balance: 0,
      totalPurchasedCredits: 0,
      totalConsumedCredits: 0,
      updatedAt: new Date().toISOString(),
    },
    message:
      typeof (row as { message?: unknown }).message === "string"
        ? ((row as { message: string }).message)
        : "Credit operation completed.",
  };
}

export async function addCreditsServer(params: {
  userId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<AddResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      wallet: {
        balance: 0,
        totalPurchasedCredits: 0,
        totalConsumedCredits: 0,
        updatedAt: new Date().toISOString(),
      },
      message: "Credit infra is not configured.",
    };
  }

  const amount = Math.max(0, Math.round(params.amount));
  const walletBefore = await ensureCreditWallet(params.userId);

  if (amount <= 0) {
    return {
      ok: true,
      wallet: walletBefore ?? {
        balance: 0,
        totalPurchasedCredits: 0,
        totalConsumedCredits: 0,
        updatedAt: new Date().toISOString(),
      },
      message: "No credits added.",
    };
  }

  const { data, error } = await admin.rpc("add_credits", {
    p_user_id: params.userId,
    p_amount: amount,
    p_reason: params.reason,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    if (isMissingRpcFunctionError(error.message)) {
      return {
        ok: false,
        wallet: walletBefore ?? {
          balance: 0,
          totalPurchasedCredits: 0,
          totalConsumedCredits: 0,
          updatedAt: new Date().toISOString(),
        },
        message:
          "Credit add function is not deployed yet. Run the Supabase credit migration, then retry payment verify.",
      };
    }

    throw new Error(`Add credits failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const wallet = await ensureCreditWallet(params.userId);

  return {
    ok: Boolean((row as { success?: boolean }).success),
    wallet: wallet ?? {
      balance: 0,
      totalPurchasedCredits: 0,
      totalConsumedCredits: 0,
      updatedAt: new Date().toISOString(),
    },
    message:
      typeof (row as { message?: unknown }).message === "string"
        ? ((row as { message: string }).message)
        : "Credits added.",
  };
}

export async function createPendingOrder(params: {
  userId: string;
  planId: string;
  provider: "razorpay";
  providerOrderId: string;
  amountInr: number;
  credits: number;
}): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return;
  }

  const { error } = await admin.from("credit_orders").insert({
    user_id: params.userId,
    plan_id: params.planId,
    provider: params.provider,
    provider_order_id: params.providerOrderId,
    amount_inr: params.amountInr,
    credits: params.credits,
    status: "pending",
  });

  if (error) {
    throw new Error(`Create order failed: ${error.message}`);
  }
}

export async function markOrderAsPaid(params: {
  userId: string;
  provider: "razorpay";
  providerOrderId: string;
  providerPaymentId: string;
}): Promise<{ credits: number; planId: string } | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const { data: order, error: fetchError } = await admin
    .from("credit_orders")
    .select("id,credits,plan_id,status")
    .eq("user_id", params.userId)
    .eq("provider", params.provider)
    .eq("provider_order_id", params.providerOrderId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Fetch order failed: ${fetchError.message}`);
  }

  if (!order || order.status !== "pending") {
    return null;
  }

  const { error: updateError } = await admin
    .from("credit_orders")
    .update({
      status: "paid",
      provider_payment_id: params.providerPaymentId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (updateError) {
    throw new Error(`Update order failed: ${updateError.message}`);
  }

  return {
    credits: order.credits,
    planId: order.plan_id,
  };
}
