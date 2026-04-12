import { NextResponse } from "next/server";
import { normalizeSubscriptionTier, type SubscriptionTier } from "@/lib/subscriptionPlans";
import {
  buildSubscriptionAccess,
  getAuthenticatedUserWithTier,
  setSubscriptionTier,
} from "@/lib/subscriptionServer";

export async function POST(req: Request) {
  try {
    const allowManualActivation =
      process.env.ALLOW_MANUAL_SUBSCRIPTION_ACTIVATION === "true";
    if (!allowManualActivation) {
      return NextResponse.json(
        {
          error:
            "Manual activation is disabled. Complete payment checkout to activate subscription.",
        },
        { status: 403 }
      );
    }

    const authUser = await getAuthenticatedUserWithTier(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await req.json()) as { tier?: unknown };
    const tier = normalizeSubscriptionTier(payload.tier);

    if (tier === "free") {
      return NextResponse.json({ error: "Choose Pro or Premium tier." }, { status: 400 });
    }

    const update = await setSubscriptionTier({
      userId: authUser.userId,
      tier: tier as SubscriptionTier,
    });

    if (!update.ok) {
      return NextResponse.json({ error: update.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: update.message,
      subscription: buildSubscriptionAccess(tier as SubscriptionTier),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not activate subscription.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
