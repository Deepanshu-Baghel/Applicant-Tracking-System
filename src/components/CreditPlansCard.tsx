"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Coins, ShoppingCart } from "lucide-react";
import {
  buyCredits,
  createRazorpayOrder,
  getCreditPlans,
  getCreditWallet,
  subscribeCreditWallet,
  syncCreditWalletFromServer,
  type CreditWallet,
  verifyRazorpayPayment,
} from "@/utils/creditWallet";
import { supabase } from "@/lib/supabase";
import type { CreditPlanId } from "@/lib/creditPlans";

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

type CreditPlansCardProps = {
  ownerId: string;
  title?: string;
  subtitle?: string;
  className?: string;
  onWalletChange?: (wallet: CreditWallet) => void;
};

export default function CreditPlansCard({
  ownerId,
  title = "Credit Wallet",
  subtitle = "Premium insights unlock with credits. Buy a pack when balance is low.",
  className,
  onWalletChange,
}: CreditPlansCardProps) {
  const [wallet, setWallet] = useState<CreditWallet>(() => getCreditWallet(ownerId));
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string>("");

  useEffect(() => {
    const current = getCreditWallet(ownerId);
    setWallet(current);
    onWalletChange?.(current);

    let active = true;
    const bootstrap = async () => {
      if (!supabase) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || !active) {
        return;
      }

      const synced = await syncCreditWalletFromServer(ownerId, session.access_token);
      if (synced && active) {
        setWallet(synced);
        onWalletChange?.(synced);
      }
    };

    void bootstrap();

    const unsubscribe = subscribeCreditWallet(ownerId, (nextWallet) => {
      setWallet(nextWallet);
      onWalletChange?.(nextWallet);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [ownerId, onWalletChange]);

  const handleBuyCredits = async (planId: CreditPlanId) => {
    setCheckoutMessage("");
    setBuyingPlanId(planId);

    try {
      const {
        data: { session },
      } = supabase ? await supabase.auth.getSession() : { data: { session: null } };

      if (!session?.access_token) {
        const nextWallet = buyCredits(ownerId, planId);
        setWallet(nextWallet);
        onWalletChange?.(nextWallet);
        setCheckoutMessage("Demo top-up applied. Login to enable secure payment checkout.");
        return;
      }

      const order = await createRazorpayOrder({
        accessToken: session.access_token,
        planId,
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
          name: "Resume AI",
          description: `${order.plan.name} - ${order.plan.credits} credits`,
          order_id: order.orderId,
          theme: { color: "#0f766e" },
          handler: async (paymentResponse: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            const verify = await verifyRazorpayPayment({
              ownerId,
              accessToken: session.access_token,
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
            });

            if (!verify.ok) {
              reject(new Error(verify.message));
              return;
            }

            setWallet(verify.wallet);
            onWalletChange?.(verify.wallet);
            setCheckoutMessage("Payment successful. Credits added to your wallet.");
            resolve();
          },
          modal: {
            ondismiss: () => {
              reject(new Error("Checkout dismissed."));
            },
          },
        });

        paymentObject.open();
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to complete payment.";
      setCheckoutMessage(message);
    } finally {
      setBuyingPlanId(null);
    }
  };

  return (
    <div className={clsx("rounded-xl border border-border bg-card/60 p-4", className)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-primary-600 font-semibold">{title}</p>
          <p className="text-xs text-muted mt-1">{subtitle}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-600 text-xs font-semibold">
          <Coins className="w-3.5 h-3.5" /> {wallet.balance} credits
        </span>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        {getCreditPlans().map((plan) => (
          <button
            key={plan.id}
            onClick={() => handleBuyCredits(plan.id)}
            className="text-left rounded-lg border border-border bg-background/70 px-3 py-2 hover:border-primary-500/40 hover:bg-primary-500/5 transition-colors"
          >
            <p className="text-xs font-semibold text-foreground">{plan.name}</p>
            <p className="text-[11px] text-muted mt-0.5">{plan.credits} credits</p>
            <p className="text-[11px] text-primary-600 font-semibold mt-1">INR {plan.priceInr}</p>
            <p className="text-[10px] text-muted mt-1">{buyingPlanId === plan.id ? "Processing..." : plan.tagline}</p>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted mt-3 flex items-center gap-1.5">
        <ShoppingCart className="w-3 h-3" /> Secure checkout for logged-in users. Guest mode uses demo top-up.
      </p>
      {checkoutMessage ? <p className="text-[11px] text-muted mt-2">{checkoutMessage}</p> : null}
    </div>
  );
}
