import { NextResponse } from "next/server";
import { consumeCreditsServer, getAuthenticatedUserId } from "@/lib/creditsServer";

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await req.json()) as {
      amount?: number;
      feature?: string;
      metadata?: Record<string, unknown>;
    };

    const amount = typeof payload.amount === "number" ? payload.amount : 0;
    const feature = typeof payload.feature === "string" && payload.feature.trim()
      ? payload.feature.trim()
      : "premium_feature";

    const result = await consumeCreditsServer({
      userId,
      amount,
      feature,
      metadata: payload.metadata,
    });

    return NextResponse.json({
      success: result.ok,
      wallet: result.wallet,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to consume credits";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
