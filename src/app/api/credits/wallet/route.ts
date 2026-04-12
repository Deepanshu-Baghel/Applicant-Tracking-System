import { NextResponse } from "next/server";
import { CREDIT_PLANS } from "@/lib/creditPlans";
import { ensureCreditWallet, getAuthenticatedUserId } from "@/lib/creditsServer";

export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallet = await ensureCreditWallet(userId);
    if (!wallet) {
      return NextResponse.json(
        {
          error: "Credit wallet is not configured on server.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      wallet,
      plans: CREDIT_PLANS,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch wallet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
