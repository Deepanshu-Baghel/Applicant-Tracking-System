import { NextResponse } from "next/server";
import { getCreditPlan } from "@/lib/creditPlans";
import { createPendingOrder, getAuthenticatedUserId } from "@/lib/creditsServer";

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
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creds = getRazorpayCredentials();
    if (!creds) {
      return NextResponse.json(
        { error: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
        { status: 503 }
      );
    }

    const payload = (await req.json()) as { planId?: string };
    const plan = payload.planId ? getCreditPlan(payload.planId) : null;
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan selected." }, { status: 400 });
    }

    const orderPayload = {
      amount: plan.priceInr * 100,
      currency: "INR",
      receipt: `resumeiq-${userId.slice(0, 8)}-${Date.now()}`,
      notes: {
        plan_id: plan.id,
        credits: String(plan.credits),
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
      const description = orderData.error?.description ?? "Could not create Razorpay order.";
      return NextResponse.json({ error: description }, { status: 502 });
    }

    await createPendingOrder({
      userId,
      planId: plan.id,
      provider: "razorpay",
      providerOrderId: orderData.id,
      amountInr: plan.priceInr,
      credits: plan.credits,
    });

    return NextResponse.json({
      keyId: creds.keyId,
      orderId: orderData.id,
      amount: orderData.amount ?? plan.priceInr * 100,
      currency: orderData.currency ?? "INR",
      plan: {
        id: plan.id,
        name: plan.name,
        credits: plan.credits,
        priceInr: plan.priceInr,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not create payment order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
