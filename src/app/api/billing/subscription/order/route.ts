import { NextResponse } from "next/server";
import { SUBSCRIPTION_PLANS, normalizeSubscriptionTier } from "@/lib/subscriptionPlans";
import {
  createPendingSubscriptionOrder,
  getAuthenticatedUserWithTier,
} from "@/lib/subscriptionServer";

function getRazorpayCredentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  return { keyId, keySecret };
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUserWithTier(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creds = getRazorpayCredentials();
    if (!creds) {
      return NextResponse.json(
        { error: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
        { status: 503 }
      );
    }

    const payload = (await req.json()) as { tier?: unknown };
    const tier = normalizeSubscriptionTier(payload.tier);
    if (tier === "free") {
      return NextResponse.json({ error: "Choose Pro or Premium tier." }, { status: 400 });
    }

    const plan = SUBSCRIPTION_PLANS.find((item) => item.tier === tier);
    if (!plan) {
      return NextResponse.json({ error: "Invalid subscription plan." }, { status: 400 });
    }

    const orderPayload = {
      amount: plan.priceInrMonthly * 100,
      currency: "INR",
      receipt: `resumeiq-sub-${authUser.userId.slice(0, 8)}-${Date.now()}`,
      notes: {
        subscription_tier: tier,
      },
    };

    const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = (await razorpayResponse.json()) as {
      id?: string;
      amount?: number;
      currency?: string;
      error?: { description?: string };
    };

    if (!razorpayResponse.ok || !orderData.id) {
      const description = orderData.error?.description ?? "Could not create Razorpay subscription order.";
      return NextResponse.json({ error: description }, { status: 502 });
    }

    await createPendingSubscriptionOrder({
      userId: authUser.userId,
      tier,
      provider: "razorpay",
      providerOrderId: orderData.id,
      amountInr: plan.priceInrMonthly,
    });

    return NextResponse.json({
      keyId: creds.keyId,
      orderId: orderData.id,
      amount: orderData.amount ?? plan.priceInrMonthly * 100,
      currency: orderData.currency ?? "INR",
      plan: {
        tier: plan.tier,
        name: plan.name,
        priceInrMonthly: plan.priceInrMonthly,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not create subscription order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
