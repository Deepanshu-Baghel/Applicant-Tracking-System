"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Coins, Crown, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import NavBar from "@/components/NavBar";
import CreditPlansCard from "@/components/CreditPlansCard";
import { supabase } from "@/lib/supabase";
import { SUBSCRIPTION_PLANS, type SubscriptionTier } from "@/lib/subscriptionPlans";
import { getCreditWallet, syncCreditWalletFromServer } from "@/utils/creditWallet";
import {
  createSubscriptionOrder,
  fetchSubscriptionStatus,
  verifySubscriptionPayment,
} from "@/utils/subscriptionClient";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  return razorpayScriptPromise;
}

export default function BillingPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [creditOwnerId, setCreditOwnerId] = useState("guest");
  const [creditBalance, setCreditBalance] = useState(() => getCreditWallet("guest").balance);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>("free");
  const [isSubmittingTier, setIsSubmittingTier] = useState<Exclude<SubscriptionTier, "free"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!supabase) {
        setAuthChecked(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setCreditOwnerId(user.id);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        setAccessToken(session.access_token);
        const synced = await syncCreditWalletFromServer(user.id, session.access_token);
        setCreditBalance(synced?.balance ?? getCreditWallet(user.id).balance);
        const subscription = await fetchSubscriptionStatus(session.access_token);
        if (subscription?.tier) {
          setCurrentTier(subscription.tier);
        }
      } else {
        setCreditBalance(getCreditWallet(user.id).balance);
      }

      setAuthChecked(true);
    };

    void init();
  }, [router]);

  const handleUpgrade = async (tier: Exclude<SubscriptionTier, "free">) => {
    if (!accessToken) {
      setNotice("Your session expired. Please log in again.");
      return;
    }

    setIsSubmittingTier(tier);
    setNotice(null);

    try {
      const order = await createSubscriptionOrder({
        accessToken,
        tier,
      });

      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded || !window.Razorpay) {
        throw new Error("Unable to load Razorpay checkout.");
      }

      const RazorpayCheckout = window.Razorpay;

      await new Promise<void>((resolve, reject) => {
        const paymentObject = new RazorpayCheckout({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "ResumeIQ",
          description: `${order.plan.name} Monthly Subscription`,
          order_id: order.orderId,
          theme: { color: "#0f766e" },
          handler: async (paymentResponse: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            const verify = await verifySubscriptionPayment({
              accessToken,
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
            });

            if (!verify.ok) {
              reject(new Error(verify.message));
              return;
            }

            if (verify.subscription?.tier) {
              setCurrentTier(verify.subscription.tier);
            }

            setNotice(verify.message);
            resolve();
          },
          modal: {
            ondismiss: () => reject(new Error("Payment checkout dismissed.")),
          },
          prefill: {},
          notes: {
            subscription_tier: tier,
          },
        });

        paymentObject.open();
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to activate subscription.";
      setNotice(message);
    } finally {
      setIsSubmittingTier(null);
    }
  };

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-muted">Loading billing...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <NavBar />

      <section className="pt-28 pb-10 border-b border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-heading font-bold mb-3">Billing & Plans</h1>
          <p className="text-muted text-sm md:text-base max-w-3xl">
            One place for both payment flows: buy credits for Free-tier module unlocks, or activate Pro/Premium for unlimited access.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1.5 text-xs">
            <Wallet className="w-3.5 h-3.5 text-primary-600" />
            <span className="text-muted">Current tier:</span>
            <span className="font-semibold text-primary-600 capitalize">{currentTier}</span>
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-5xl mx-auto px-6 space-y-6">
          <CreditPlansCard
            ownerId={creditOwnerId}
            title="Secure Wallet Checkout"
            subtitle="25 credits = INR 100. Use credits to unlock advanced modules run-by-run while on Free tier."
            onWalletChange={(wallet) => setCreditBalance(wallet.balance)}
          />

          <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-4 text-sm">
            <p className="font-semibold text-foreground flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary-500" /> Current balance: {creditBalance} credits
            </p>
            <p className="text-muted mt-1">Resume Lab Pro unlock: 1 credit per run. Recruiter Suite Pro unlock: 2 credits per batch.</p>
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-4 text-sm text-foreground flex gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span>
              Credit and subscription payments are verified on backend before activation.
            </span>
          </div>

          <div className="pt-2">
            <h2 className="text-2xl font-heading font-bold mb-4">Unlimited Subscriptions</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const isActive = currentTier === plan.tier;
                const isLoading = isSubmittingTier === plan.tier;

                return (
                  <div
                    key={plan.tier}
                    className={`rounded-2xl border p-6 space-y-4 ${
                      plan.tier === "premium"
                        ? "border-primary-500/40 bg-gradient-to-br from-card to-primary-500/5"
                        : "border-border bg-card/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-primary-600 font-semibold mb-1">{plan.name}</p>
                        <p className="text-3xl font-heading font-bold text-foreground">INR {plan.priceInrMonthly}</p>
                        <p className="text-xs text-muted mt-1">per month</p>
                      </div>
                      <div className="p-2 rounded-lg bg-primary-500/10 text-primary-600">
                        {plan.tier === "premium" ? <Crown className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                      </div>
                    </div>

                    <p className="text-sm text-muted">{plan.tagline}</p>

                    <div className="space-y-2">
                      {plan.features.map((feature) => (
                        <div key={feature} className="text-sm text-foreground flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleUpgrade(plan.tier)}
                      disabled={isActive || isLoading}
                      className="w-full py-2.5 rounded-full bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/40 text-white text-sm font-medium transition-colors"
                    >
                      {isActive ? "Current Tier" : isLoading ? "Opening Payment..." : `Activate ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {notice ? (
            <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 px-4 py-3 text-sm text-foreground">
              {notice}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
