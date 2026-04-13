import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type VectorMemoryMatch = {
  documentKey: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type VectorRow = {
  document_key: string;
  chunk_index: number;
  content: string;
  embedding: unknown;
  metadata: unknown;
  created_at: string;
};

type HybridRpcRow = {
  document_key: string;
  chunk_index: number;
  content: string;
  similarity: number;
  metadata: unknown;
  created_at: string;
};

const DEFAULT_VECTOR_DIMENSION = 1536;

function getVectorDimension(): number {
  const configured = Number(process.env.RAG_VECTOR_DIMENSION);
  if (!Number.isFinite(configured) || configured < 64 || configured > 3072) {
    return DEFAULT_VECTOR_DIMENSION;
  }

  return Math.round(configured);
}

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

function normalizeEmbedding(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const values = raw.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) {
    return null;
  }

  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return null;
  }

  return values.map((value) => value / magnitude);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += a[index] * b[index];
  }

  return Math.max(-1, Math.min(1, sum));
}

function toMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMissingHybridSearchFunction(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("hybrid_search_vector_documents") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the function")
  );
}

function isMissingVectorColumn(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("embedding_vector") && normalized.includes("does not exist");
}

function padOrTrimEmbedding(values: number[], targetDimension = getVectorDimension()): number[] {
  const filtered = values
    .filter((value) => Number.isFinite(value))
    .map((value) => Number(value));

  if (!filtered.length) {
    return new Array<number>(targetDimension).fill(0);
  }

  if (filtered.length === targetDimension) {
    return filtered;
  }

  if (filtered.length > targetDimension) {
    return filtered.slice(0, targetDimension);
  }

  return [...filtered, ...new Array<number>(targetDimension - filtered.length).fill(0)];
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function tokenizeForLexicalOverlap(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? []).slice(0, 24);
}

function lexicalOverlapScore(content: string, queryText?: string): number {
  if (!queryText || !queryText.trim()) {
    return 0;
  }

  const contentLower = content.toLowerCase();
  const tokens = tokenizeForLexicalOverlap(queryText);
  if (!tokens.length) {
    return 0;
  }

  const matched = tokens.filter((token) => contentLower.includes(token)).length;
  return matched / tokens.length;
}

export async function upsertVectorDocument(params: {
  namespace: string;
  userId: string;
  documentKey: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  embeddingProvider: string | null;
  embeddingModel: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminClient();
  if (!admin) {
    return;
  }

  const normalizedVector = padOrTrimEmbedding(params.embedding);
  const vectorLiteral = toVectorLiteral(normalizedVector);

  const basePayload = {
    namespace: params.namespace,
    user_id: params.userId,
    document_key: params.documentKey,
    chunk_index: params.chunkIndex,
    content: params.content,
    embedding: params.embedding,
    embedding_provider: params.embeddingProvider,
    embedding_model: params.embeddingModel,
    metadata: params.metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  const withVectorResult = await admin
    .from("vector_documents")
    .upsert(
      {
        ...basePayload,
        embedding_vector: vectorLiteral,
      },
      {
        onConflict: "namespace,user_id,document_key,chunk_index",
        ignoreDuplicates: false,
      }
    );

  if (!withVectorResult.error) {
    return;
  }

  if (!isMissingVectorColumn(withVectorResult.error.message)) {
    throw new Error(`Vector upsert failed: ${withVectorResult.error.message}`);
  }

  const fallbackResult = await admin.from("vector_documents").upsert(basePayload, {
    onConflict: "namespace,user_id,document_key,chunk_index",
    ignoreDuplicates: false,
  });

  if (fallbackResult.error) {
    throw new Error(`Vector upsert fallback failed: ${fallbackResult.error.message}`);
  }
}

export async function searchVectorDocuments(params: {
  namespace: string;
  userId: string;
  queryEmbedding: number[];
  topK: number;
  minSimilarity?: number;
  scanLimit?: number;
  excludeDocumentKey?: string;
  queryText?: string;
  blendAlpha?: number;
}): Promise<VectorMemoryMatch[]> {
  const admin = getAdminClient();
  if (!admin) {
    return [];
  }

  const scanLimit = Math.max(20, Math.min(500, params.scanLimit ?? 220));
  const minSimilarity = params.minSimilarity ?? 0.35;
  const topK = Math.max(1, Math.min(10, params.topK));
  const blendAlpha = Math.max(0, Math.min(1, params.blendAlpha ?? 0.78));

  const queryVector = normalizeEmbedding(params.queryEmbedding);
  if (!queryVector) {
    return [];
  }

  const normalizedVector = padOrTrimEmbedding(queryVector);
  const queryVectorLiteral = toVectorLiteral(normalizedVector);

  const hybrid = await admin.rpc("hybrid_search_vector_documents", {
    p_namespace: params.namespace,
    p_user_id: params.userId,
    p_query_embedding: queryVectorLiteral,
    p_match_count: topK,
    p_min_similarity: minSimilarity,
    p_query_text: params.queryText ?? null,
    p_exclude_document_key: params.excludeDocumentKey ?? null,
    p_blend_alpha: blendAlpha,
  });

  if (!hybrid.error && Array.isArray(hybrid.data)) {
    return (hybrid.data as HybridRpcRow[])
      .map((row) => ({
        documentKey: row.document_key,
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity: Number.isFinite(row.similarity) ? row.similarity : 0,
        metadata: toMetadata(row.metadata),
        createdAt: row.created_at,
      }))
      .filter((entry) => Number.isFinite(entry.similarity) && entry.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  if (hybrid.error && !isMissingHybridSearchFunction(hybrid.error.message)) {
    throw new Error(`Hybrid vector search failed: ${hybrid.error.message}`);
  }

  const fallback = await admin
    .from("vector_documents")
    .select("document_key,chunk_index,content,embedding,metadata,created_at")
    .eq("namespace", params.namespace)
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(scanLimit);

  if (fallback.error || !Array.isArray(fallback.data)) {
    return [];
  }

  const matches = (fallback.data as VectorRow[])
    .map((row): VectorMemoryMatch | null => {
      if (params.excludeDocumentKey && row.document_key === params.excludeDocumentKey) {
        return null;
      }

      const embedding = normalizeEmbedding(row.embedding);
      if (!embedding) {
        return null;
      }

      const similarity = cosineSimilarity(queryVector, embedding);
      if (!Number.isFinite(similarity) || similarity < minSimilarity) {
        return null;
      }

      const lexical = lexicalOverlapScore(row.content, params.queryText);
      const hybridScore = similarity * blendAlpha + lexical * (1 - blendAlpha);

      return {
        documentKey: row.document_key,
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity,
        metadata: {
          ...toMetadata(row.metadata),
          lexical_overlap_score: lexical,
          hybrid_score: hybridScore,
          retrieval_mode: "fallback-bruteforce",
        },
        createdAt: row.created_at,
      };
    })
    .filter((item): item is VectorMemoryMatch => item !== null)
    .sort((a, b) => {
      const aHybrid = typeof a.metadata.hybrid_score === "number" ? a.metadata.hybrid_score : a.similarity;
      const bHybrid = typeof b.metadata.hybrid_score === "number" ? b.metadata.hybrid_score : b.similarity;
      return bHybrid - aHybrid;
    })
    .slice(0, topK);

  return matches;
}
