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

  await admin.from("vector_documents").upsert(
    {
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
    },
    {
      onConflict: "namespace,user_id,document_key,chunk_index",
      ignoreDuplicates: false,
    }
  );
}

export async function searchVectorDocuments(params: {
  namespace: string;
  userId: string;
  queryEmbedding: number[];
  topK: number;
  minSimilarity?: number;
  scanLimit?: number;
  excludeDocumentKey?: string;
}): Promise<VectorMemoryMatch[]> {
  const admin = getAdminClient();
  if (!admin) {
    return [];
  }

  const scanLimit = Math.max(20, Math.min(500, params.scanLimit ?? 220));
  const minSimilarity = params.minSimilarity ?? 0.35;

  const { data, error } = await admin
    .from("vector_documents")
    .select("document_key,chunk_index,content,embedding,metadata,created_at")
    .eq("namespace", params.namespace)
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(scanLimit);

  if (error || !Array.isArray(data)) {
    return [];
  }

  const matches = (data as VectorRow[])
    .map((row) => {
      if (params.excludeDocumentKey && row.document_key === params.excludeDocumentKey) {
        return null;
      }

      const embedding = normalizeEmbedding(row.embedding);
      if (!embedding) {
        return null;
      }

      const similarity = cosineSimilarity(params.queryEmbedding, embedding);
      if (!Number.isFinite(similarity) || similarity < minSimilarity) {
        return null;
      }

      return {
        documentKey: row.document_key,
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity,
        metadata: toMetadata(row.metadata),
        createdAt: row.created_at,
      };
    })
    .filter((item): item is VectorMemoryMatch => Boolean(item))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, Math.min(10, params.topK)));

  return matches;
}
