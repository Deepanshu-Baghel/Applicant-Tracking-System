import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import {
  buildSubscriptionAccess,
  getAuthenticatedUserWithTier,
  markSubscriptionOrderAsPaid,
  setSubscriptionTier,
} from "@/lib/subscriptionServer";

function getRazorpaySecret(): string | null {
  return process.env.RAZORPAY_KEY_SECRET ?? null;
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUserWithTier(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await req.json()) as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    const orderId = typeof payload.razorpay_order_id === "string" ? payload.razorpay_order_id : "";
    const paymentId = typeof payload.razorpay_payment_id === "string" ? payload.razorpay_payment_id : "";
    const signature = typeof payload.razorpay_signature === "string" ? payload.razorpay_signature : "";

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ error: "Missing payment verification data." }, { status: 400 });
    }

    const secret = getRazorpaySecret();
    if (!secret) {
      return NextResponse.json({ error: "Razorpay secret is not configured." }, { status: 503 });
    }

    const expected = createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (expected !== signature) {
      return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
    }

    const paidOrder = await markSubscriptionOrderAsPaid({
      userId: authUser.userId,
      provider: "razorpay",
      providerOrderId: orderId,
      providerPaymentId: paymentId,
    });

    if (!paidOrder) {
      return NextResponse.json({ error: "Order already processed or not found." }, { status: 409 });
    }

    const update = await setSubscriptionTier({
      userId: authUser.userId,
      tier: paidOrder.tier,
    });

    if (!update.ok) {
      return NextResponse.json({ error: update.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Payment verified. ${update.message}`,
      subscription: buildSubscriptionAccess(paidOrder.tier),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not verify subscription payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
