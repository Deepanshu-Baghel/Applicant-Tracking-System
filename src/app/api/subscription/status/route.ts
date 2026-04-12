import { NextResponse } from "next/server";
import { SUBSCRIPTION_PLANS } from "@/lib/subscriptionPlans";
import { buildSubscriptionAccess, getAuthenticatedUserWithTier } from "@/lib/subscriptionServer";

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUserWithTier(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      subscription: buildSubscriptionAccess(authUser.tier),
      plans: SUBSCRIPTION_PLANS,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not fetch subscription status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
