import { CREDIT_PLANS, FREE_STARTER_CREDITS, type CreditPlan, type CreditPlanId } from "@/lib/creditPlans";

export type CreditWallet = {
  balance: number;
  totalPurchasedCredits: number;
  totalConsumedCredits: number;
  updatedAt: string;
};

const CREDIT_WALLET_EVENT = "resumeiq-credit-wallet-updated";
const CREDIT_WALLET_PREFIX = "resumeiq_credit_wallet";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeOwnerId(ownerId: string | null | undefined): string {
  if (!ownerId || !ownerId.trim()) {
    return "guest";
  }

  return ownerId.trim().toLowerCase();
}

function storageKey(ownerId: string | null | undefined): string {
  return `${CREDIT_WALLET_PREFIX}:${normalizeOwnerId(ownerId)}`;
}

function defaultWallet(): CreditWallet {
  return {
    balance: FREE_STARTER_CREDITS,
    totalPurchasedCredits: FREE_STARTER_CREDITS,
    totalConsumedCredits: 0,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeWallet(input: Partial<CreditWallet> | null | undefined): CreditWallet {
  return {
    balance:
      typeof input?.balance === "number" && Number.isFinite(input.balance)
        ? Math.max(0, Math.round(input.balance))
        : FREE_STARTER_CREDITS,
    totalPurchasedCredits:
      typeof input?.totalPurchasedCredits === "number" && Number.isFinite(input.totalPurchasedCredits)
        ? Math.max(0, Math.round(input.totalPurchasedCredits))
        : FREE_STARTER_CREDITS,
    totalConsumedCredits:
      typeof input?.totalConsumedCredits === "number" && Number.isFinite(input.totalConsumedCredits)
        ? Math.max(0, Math.round(input.totalConsumedCredits))
        : 0,
    updatedAt:
      typeof input?.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : new Date().toISOString(),
  };
}

export function setCreditWallet(ownerId: string | null | undefined, wallet: Partial<CreditWallet>): CreditWallet {
  const normalized = sanitizeWallet(wallet);

  if (isBrowser()) {
    window.localStorage.setItem(storageKey(ownerId), JSON.stringify(normalized));
    emitWalletChange(ownerId, normalized);
  }

  return normalized;
}

function emitWalletChange(ownerId: string | null | undefined, wallet: CreditWallet): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(CREDIT_WALLET_EVENT, {
      detail: {
        ownerId: normalizeOwnerId(ownerId),
        wallet,
      },
    })
  );
}

export function getCreditPlans(): CreditPlan[] {
  return CREDIT_PLANS;
}

export function getCreditWallet(ownerId: string | null | undefined): CreditWallet {
  if (!isBrowser()) {
    return defaultWallet();
  }

  const key = storageKey(ownerId);
  const raw = window.localStorage.getItem(key);

  if (!raw) {
    const wallet = defaultWallet();
    window.localStorage.setItem(key, JSON.stringify(wallet));
    return wallet;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CreditWallet>;
    const wallet = sanitizeWallet(parsed);

    window.localStorage.setItem(key, JSON.stringify(wallet));
    return wallet;
  } catch {
    const wallet = defaultWallet();
    window.localStorage.setItem(key, JSON.stringify(wallet));
    return wallet;
  }
}

export function getCreditBalance(ownerId: string | null | undefined): number {
  return getCreditWallet(ownerId).balance;
}

type ServerWalletResponse = {
  wallet?: {
    balance?: number;
    totalPurchasedCredits?: number;
    totalConsumedCredits?: number;
    updatedAt?: string;
    total_purchased_credits?: number;
    total_consumed_credits?: number;
    updated_at?: string;
  };
};

function mapServerWallet(payload: ServerWalletResponse): CreditWallet | null {
  const wallet = payload.wallet;
  if (!wallet) {
    return null;
  }

  return sanitizeWallet({
    balance: wallet.balance,
    totalPurchasedCredits:
      typeof wallet.totalPurchasedCredits === "number"
        ? wallet.totalPurchasedCredits
        : wallet.total_purchased_credits,
    totalConsumedCredits:
      typeof wallet.totalConsumedCredits === "number"
        ? wallet.totalConsumedCredits
        : wallet.total_consumed_credits,
    updatedAt: wallet.updatedAt ?? wallet.updated_at,
  });
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function syncCreditWalletFromServer(
  ownerId: string | null | undefined,
  accessToken: string
): Promise<CreditWallet | null> {
  const response = await fetch("/api/credits/wallet", {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as ServerWalletResponse;
  const mapped = mapServerWallet(payload);
  if (!mapped) {
    return null;
  }

  return setCreditWallet(ownerId, mapped);
}

export async function consumeCreditsOnServer(params: {
  ownerId: string | null | undefined;
  accessToken: string;
  amount: number;
  feature: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; wallet: CreditWallet; message: string }> {
  const response = await fetch("/api/credits/consume", {
    method: "POST",
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({
      amount: params.amount,
      feature: params.feature,
      metadata: params.metadata ?? {},
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    wallet?: ServerWalletResponse["wallet"];
    message?: string;
    error?: string;
  };

  const mapped = mapServerWallet({ wallet: payload.wallet });
  const localFallback = getCreditWallet(params.ownerId);
  const wallet = mapped ? setCreditWallet(params.ownerId, mapped) : localFallback;

  if (!response.ok) {
    return {
      ok: false,
      wallet,
      message: payload.error ?? "Credit consume request failed.",
    };
  }

  return {
    ok: Boolean(payload.success),
    wallet,
    message: payload.message ?? (payload.success ? "Credits consumed." : "Unable to consume credits."),
  };
}

export async function createRazorpayOrder(params: {
  accessToken: string;
  planId: CreditPlanId;
}): Promise<{
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  plan: CreditPlan;
}> {
  const response = await fetch("/api/billing/razorpay/order", {
    method: "POST",
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({ planId: params.planId }),
  });

  const payload = (await response.json()) as {
    keyId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    plan?: CreditPlan;
    error?: string;
  };

  if (!response.ok || !payload.keyId || !payload.orderId || !payload.plan) {
    throw new Error(payload.error ?? "Unable to initialize payment.");
  }

  return {
    keyId: payload.keyId,
    orderId: payload.orderId,
    amount: typeof payload.amount === "number" ? payload.amount : payload.plan.priceInr * 100,
    currency: payload.currency ?? "INR",
    plan: payload.plan,
  };
}

export async function verifyRazorpayPayment(params: {
  ownerId: string | null | undefined;
  accessToken: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ ok: boolean; wallet: CreditWallet; message: string }> {
  const response = await fetch("/api/billing/razorpay/verify", {
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
    wallet?: ServerWalletResponse["wallet"];
    message?: string;
    error?: string;
  };

  const mapped = mapServerWallet({ wallet: payload.wallet });
  const localFallback = getCreditWallet(params.ownerId);
  const wallet = mapped ? setCreditWallet(params.ownerId, mapped) : localFallback;

  if (!response.ok) {
    return {
      ok: false,
      wallet,
      message: payload.error ?? "Payment verification failed.",
    };
  }

  return {
    ok: Boolean(payload.success),
    wallet,
    message: payload.message ?? (payload.success ? "Payment successful." : "Payment verification failed."),
  };
}

export function buyCredits(ownerId: string | null | undefined, planId: CreditPlanId): CreditWallet {
  const plan = CREDIT_PLANS.find((item) => item.id === planId);
  if (!plan) {
    return getCreditWallet(ownerId);
  }

  const current = getCreditWallet(ownerId);
  const next: CreditWallet = {
    balance: current.balance + plan.credits,
    totalPurchasedCredits: current.totalPurchasedCredits + plan.credits,
    totalConsumedCredits: current.totalConsumedCredits,
    updatedAt: new Date().toISOString(),
  };

  return setCreditWallet(ownerId, next);
}

export function consumeCredits(
  ownerId: string | null | undefined,
  amount: number
): { ok: boolean; wallet: CreditWallet } {
  const units = Math.max(0, Math.round(amount));
  const current = getCreditWallet(ownerId);

  if (units <= 0) {
    return { ok: true, wallet: current };
  }

  if (current.balance < units) {
    return { ok: false, wallet: current };
  }

  const next: CreditWallet = {
    balance: current.balance - units,
    totalPurchasedCredits: current.totalPurchasedCredits,
    totalConsumedCredits: current.totalConsumedCredits + units,
    updatedAt: new Date().toISOString(),
  };

  return { ok: true, wallet: setCreditWallet(ownerId, next) };
}

export function subscribeCreditWallet(
  ownerId: string | null | undefined,
  callback: (wallet: CreditWallet) => void
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const normalizedOwner = normalizeOwnerId(ownerId);

  const handler = (event: Event) => {
    const custom = event as CustomEvent<{ ownerId: string; wallet: CreditWallet }>;
    if (!custom.detail || custom.detail.ownerId !== normalizedOwner) {
      return;
    }

    callback(custom.detail.wallet);
  };

  window.addEventListener(CREDIT_WALLET_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(CREDIT_WALLET_EVENT, handler as EventListener);
  };
}
