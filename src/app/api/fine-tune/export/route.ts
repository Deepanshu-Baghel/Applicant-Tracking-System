import { NextResponse } from "next/server";
import { getAuthenticatedUserWithTier } from "@/lib/subscriptionServer";
import { fineTuneSamplesToJsonl, getFineTuneSamplesForUser } from "@/lib/fineTuneServer";

export async function GET(req: Request) {
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const user = await getAuthenticatedUserWithTier(req);
  if (authConfigured && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "User context unavailable" }, { status: 400 });
  }

  const url = new URL(req.url);
  const namespace = url.searchParams.get("namespace") ?? undefined;
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const limit = Number(url.searchParams.get("limit") ?? "250");

  const samples = await getFineTuneSamplesForUser({
    userId: user.userId,
    namespace,
    limit: Number.isFinite(limit) ? limit : 250,
  });

  if (format === "jsonl") {
    const body = fineTuneSamplesToJsonl(samples);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/jsonl; charset=utf-8",
        "Content-Disposition": 'attachment; filename="embedding_finetune_samples.jsonl"',
      },
    });
  }

  return NextResponse.json(
    {
      count: samples.length,
      namespace: namespace ?? null,
      samples,
    },
    { status: 200 }
  );
}
