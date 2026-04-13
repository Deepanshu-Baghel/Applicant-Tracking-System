import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type FineTuneEvidence = {
  snippet: string;
  similarity_score: number;
  why_it_matters: string;
  source: "resume" | "job_description";
};

export type FineTuneSample = {
  id: number;
  userId: string;
  namespace: string;
  jobDescription: string;
  resumeText: string;
  semanticMatchScore: number | null;
  embeddingProvider: string | null;
  missingIntents: string[];
  topEvidence: FineTuneEvidence[];
  metadata: Record<string, unknown>;
  createdAt: string;
};

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    return null;
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function shouldCaptureFineTuneSamples(): boolean {
  return process.env.FINETUNE_DATA_CAPTURE !== "false";
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeEvidence(value: unknown, limit = 6): FineTuneEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const snippet = typeof row.snippet === "string" ? row.snippet.trim() : "";
      const why = typeof row.why_it_matters === "string" ? row.why_it_matters.trim() : "";
      const similarity =
        typeof row.similarity_score === "number" && Number.isFinite(row.similarity_score)
          ? Math.max(0, Math.min(100, Math.round(row.similarity_score)))
          : null;
      const source = row.source === "resume" || row.source === "job_description" ? row.source : null;

      if (!snippet || !why || similarity === null || !source) {
        return null;
      }

      return {
        snippet,
        similarity_score: similarity,
        why_it_matters: why,
        source,
      };
    })
    .filter((entry): entry is FineTuneEvidence => Boolean(entry))
    .slice(0, limit);
}

function toMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clipText(value: string, limit: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }

  return text.slice(0, limit);
}

export async function recordFineTuneSample(params: {
  userId: string;
  namespace: string;
  jobDescription: string;
  resumeText: string;
  semanticMatchScore?: number | null;
  embeddingProvider?: string | null;
  missingIntents?: string[];
  topEvidence?: Array<{
    snippet: string;
    similarity_score: number;
    why_it_matters: string;
    source: "resume" | "job_description";
  }>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!shouldCaptureFineTuneSamples()) {
    return;
  }

  const admin = getAdminClient();
  if (!admin) {
    return;
  }

  const semanticMatchScore =
    typeof params.semanticMatchScore === "number" && Number.isFinite(params.semanticMatchScore)
      ? Math.max(0, Math.min(100, Math.round(params.semanticMatchScore)))
      : null;

  const { error } = await admin.from("embedding_finetune_samples").insert({
    user_id: params.userId,
    namespace: params.namespace,
    job_description: clipText(params.jobDescription, 4500),
    resume_text: clipText(params.resumeText, 7000),
    semantic_match_score: semanticMatchScore,
    embedding_provider: params.embeddingProvider ?? null,
    missing_intents: params.missingIntents ?? [],
    top_evidence: params.topEvidence ?? [],
    metadata: params.metadata ?? {},
  });

  if (error) {
    // Non-blocking capture path by design.
    return;
  }
}

export async function getFineTuneSamplesForUser(params: {
  userId: string;
  namespace?: string;
  limit?: number;
}): Promise<FineTuneSample[]> {
  const admin = getAdminClient();
  if (!admin) {
    return [];
  }

  const limit = Math.max(1, Math.min(1000, params.limit ?? 200));

  let query = admin
    .from("embedding_finetune_samples")
    .select(
      "id,user_id,namespace,job_description,resume_text,semantic_match_score,embedding_provider,missing_intents,top_evidence,metadata,created_at"
    )
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.namespace) {
    query = query.eq("namespace", params.namespace);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.map((row) => {
    const source = row as Record<string, unknown>;

    return {
      id: typeof source.id === "number" ? source.id : 0,
      userId: typeof source.user_id === "string" ? source.user_id : params.userId,
      namespace: typeof source.namespace === "string" ? source.namespace : "resume_analysis",
      jobDescription: typeof source.job_description === "string" ? source.job_description : "",
      resumeText: typeof source.resume_text === "string" ? source.resume_text : "",
      semanticMatchScore:
        typeof source.semantic_match_score === "number" && Number.isFinite(source.semantic_match_score)
          ? Math.max(0, Math.min(100, Math.round(source.semantic_match_score)))
          : null,
      embeddingProvider:
        typeof source.embedding_provider === "string" && source.embedding_provider.trim()
          ? source.embedding_provider
          : null,
      missingIntents: normalizeStringArray(source.missing_intents, 8),
      topEvidence: normalizeEvidence(source.top_evidence, 6),
      metadata: toMetadata(source.metadata),
      createdAt: typeof source.created_at === "string" ? source.created_at : new Date().toISOString(),
    };
  });
}

export function fineTuneSamplesToJsonl(samples: FineTuneSample[]): string {
  return samples
    .map((sample) => {
      const row = {
        namespace: sample.namespace,
        input: {
          job_description: sample.jobDescription,
          resume_text: sample.resumeText,
          missing_intents: sample.missingIntents,
        },
        target: {
          semantic_match_score: sample.semanticMatchScore,
          top_evidence: sample.topEvidence,
        },
        metadata: {
          embedding_provider: sample.embeddingProvider,
          created_at: sample.createdAt,
          ...sample.metadata,
        },
      };

      return JSON.stringify(row);
    })
    .join("\n");
}
