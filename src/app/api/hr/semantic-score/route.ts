import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "crypto";
import { getAuthenticatedUserWithTier } from "@/lib/subscriptionServer";
import { searchVectorDocuments, upsertVectorDocument } from "@/lib/vectorMemoryServer";
import { recordFineTuneSample } from "@/lib/fineTuneServer";

type EmbeddingProvider = "huggingface-sentence-transformers" | "gemini";

type EmbeddingResult = {
  vector: number[];
  provider: EmbeddingProvider;
};

type SemanticEvidence = {
  snippet: string;
  similarity_score: number;
  why_it_matters: string;
  source: "resume";
};

const EMBEDDING_MODEL_CANDIDATES = [
  process.env.GEMINI_EMBED_MODEL,
  "text-embedding-004",
  "embedding-001",
].filter((model): model is string => Boolean(model));

const DEFAULT_HUGGINGFACE_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

function getPreferredFineTunedEmbeddingModel(): string | null {
  const model = process.env.HUGGINGFACE_FINETUNED_EMBED_MODEL?.trim();
  const enabled = process.env.CUSTOM_FINETUNE_ENABLED !== "false";

  if (!enabled || !model) {
    return null;
  }

  return model;
}

function getActiveHuggingFaceEmbedModel(): string {
  return (
    getPreferredFineTunedEmbeddingModel() ??
    process.env.HUGGINGFACE_EMBED_MODEL ??
    DEFAULT_HUGGINGFACE_EMBED_MODEL
  );
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "your",
  "will",
  "are",
  "job",
  "role",
  "candidate",
  "experience",
  "skills",
  "must",
  "should",
  "into",
  "about",
  "their",
  "been",
  "our",
  "using",
  "plus",
]);

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clipText(value: string, limit = 180): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 3).trim()}...`;
}

function normalizeEmbedding(values: number[]): number[] | null {
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

  let score = 0;
  for (let i = 0; i < length; i += 1) {
    score += a[i] * b[i];
  }

  return Math.max(-1, Math.min(1, score));
}

function splitIntoChunks(text: string, targetWords = 90, overlapWords = 20, maxChunks = 10): string[] {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0);

  if (!words.length) {
    return [];
  }

  const step = Math.max(1, targetWords - overlapWords);
  const chunks: string[] = [];

  for (let start = 0; start < words.length && chunks.length < maxChunks; start += step) {
    const chunk = words.slice(start, start + targetWords).join(" ").trim();
    if (chunk.length >= 40) {
      chunks.push(chunk);
    }

    if (start + targetWords >= words.length) {
      break;
    }
  }

  return chunks;
}

function extractIntentKeywords(text: string, limit = 8): string[] {
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? [];
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (STOPWORDS.has(token)) {
      continue;
    }

    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] === a[1]) {
        return b[0].length - a[0].length;
      }
      return b[1] - a[1];
    })
    .map(([token]) => token)
    .slice(0, limit);
}

function buildRetrievalQueries(jobDescription: string): string[] {
  const base = jobDescription.replace(/\s+/g, " ").trim();
  if (!base) {
    return [];
  }

  const intentTerms = extractIntentKeywords(base, 12);
  const intentFocused = intentTerms.length
    ? `priority hiring intents: ${intentTerms.slice(0, 8).join(", ")}`
    : "";
  const requirementLines = base
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 24)
    .slice(0, 2)
    .join(" ");

  return [base, intentFocused, requirementLines].filter((entry) => entry.length > 0);
}

function extractNumericVectors(value: unknown, depth = 0): number[][] {
  if (depth > 4 || !Array.isArray(value)) {
    return [];
  }

  if (value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return [value as number[]];
  }

  const vectors: number[][] = [];
  for (const item of value.slice(0, 256)) {
    vectors.push(...extractNumericVectors(item, depth + 1));
  }

  return vectors;
}

function meanPoolVectors(vectors: number[][]): number[] | null {
  if (!vectors.length || !vectors[0].length) {
    return null;
  }

  const dimension = vectors[0].length;
  const aligned = vectors.filter((vector) => vector.length === dimension).slice(0, 256);
  if (!aligned.length) {
    return null;
  }

  const pooled = new Array<number>(dimension).fill(0);
  for (const vector of aligned) {
    for (let index = 0; index < dimension; index += 1) {
      pooled[index] += vector[index];
    }
  }

  return pooled.map((value) => value / aligned.length);
}

function parseHuggingFaceEmbedding(raw: unknown): number[] | null {
  const vectors = extractNumericVectors(raw);
  if (!vectors.length) {
    return null;
  }

  if (vectors.length === 1) {
    return normalizeEmbedding(vectors[0]);
  }

  const pooled = meanPoolVectors(vectors);
  return pooled ? normalizeEmbedding(pooled) : normalizeEmbedding(vectors[0]);
}

async function embedWithHuggingFace(text: string): Promise<number[] | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const modelName = getActiveHuggingFaceEmbedModel();
  const endpoint = `https://api-inference.huggingface.co/pipeline/feature-extraction/${encodeURIComponent(modelName)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text.slice(0, 3000),
        options: { wait_for_model: true },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return parseHuggingFaceEmbedding(payload);
  } catch {
    return null;
  }
}

async function embedWithGemini(genAI: GoogleGenerativeAI | null, text: string): Promise<number[] | null> {
  if (!genAI) {
    return null;
  }

  const payload = text.replace(/\s+/g, " ").trim();
  if (!payload) {
    return null;
  }

  for (const modelName of EMBEDDING_MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.embedContent(payload.slice(0, 8000));
      const values = Array.isArray(response.embedding?.values)
        ? response.embedding.values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
        : [];
      const normalized = normalizeEmbedding(values);
      if (normalized) {
        return normalized;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function embedText(text: string, genAI: GoogleGenerativeAI | null, preferred?: EmbeddingProvider): Promise<EmbeddingResult | null> {
  const providers: EmbeddingProvider[] = preferred
    ? [preferred]
    : ["huggingface-sentence-transformers", "gemini"];

  for (const provider of providers) {
    if (provider === "huggingface-sentence-transformers") {
      const vector = await embedWithHuggingFace(text);
      if (vector) {
        return { vector, provider };
      }
      continue;
    }

    const vector = await embedWithGemini(genAI, text);
    if (vector) {
      return { vector, provider: "gemini" };
    }
  }

  return null;
}

function buildHeuristicResponse(resumeText: string, jobDescription: string) {
  const resumeLower = resumeText.toLowerCase();
  const intents = extractIntentKeywords(jobDescription, 10);
  const matched = intents.filter((intent) => resumeLower.includes(intent));
  const missing = intents.filter((intent) => !resumeLower.includes(intent)).slice(0, 5);
  const score = clampScore(35 + (intents.length ? (matched.length / intents.length) * 55 : 50));

  const evidence = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 32)
    .slice(0, 3)
    .map((line, index) => ({
      snippet: clipText(line),
      similarity_score: clampScore(score - index * 4),
      why_it_matters: matched.length
        ? `Heuristic intent overlap found around ${matched.slice(0, 2).join(" and ")}.`
        : "Heuristic signal from resume context.",
      source: "resume" as const,
    }));

  return {
    semantic_match_score: score,
    coverage_summary: matched.length
      ? `Heuristic scan found ${matched.length}/${Math.max(1, intents.length)} role intents in this resume.`
      : "Heuristic scan found limited direct intent overlap for this JD.",
    missing_intents: missing,
    top_evidence: evidence,
    retrieval_mode: "heuristic" as const,
    embedding_provider: null,
  };
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as {
      resumeText?: string;
      jobDescription?: string;
      fileName?: string;
    };

    const resumeText = typeof payload.resumeText === "string" ? payload.resumeText.trim() : "";
    const jobDescription = typeof payload.jobDescription === "string" ? payload.jobDescription.trim() : "";
    const fileName = typeof payload.fileName === "string" && payload.fileName.trim() ? payload.fileName.trim() : "resume";

    if (!resumeText || !jobDescription) {
      return NextResponse.json(
        { error: "resumeText and jobDescription are required" },
        { status: 400 }
      );
    }

    const authConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const authenticatedUser = await getAuthenticatedUserWithTier(req);

    if (authConfigured && !authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const heuristic = buildHeuristicResponse(resumeText, jobDescription);
    const genAI = process.env.GEMINI_API_KEY
      ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      : null;

    const jobEmbedding = await embedText(jobDescription, genAI);
    if (!jobEmbedding) {
      return NextResponse.json(heuristic);
    }
    const retrievalQueries = buildRetrievalQueries(jobDescription);

    const chunks = splitIntoChunks(resumeText, 90, 20, 10);
    if (!chunks.length) {
      return NextResponse.json(heuristic);
    }

    const scored = [] as Array<{ chunk: string; index: number; vector: number[]; similarity: number }>;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const chunkEmbedding = await embedText(chunk, genAI, jobEmbedding.provider);
      if (!chunkEmbedding) {
        continue;
      }

      scored.push({
        chunk,
        index,
        vector: chunkEmbedding.vector,
        similarity: cosineSimilarity(jobEmbedding.vector, chunkEmbedding.vector),
      });
    }

    if (!scored.length) {
      return NextResponse.json(heuristic);
    }

    const topLocal = [...scored]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map((entry) => ({
        snippet: clipText(entry.chunk),
        similarity_score: clampScore(((entry.similarity + 1) / 2) * 100),
        why_it_matters: "This resume segment is semantically close to JD intent.",
        source: "resume" as const,
      }));

    const userId = authenticatedUser?.userId ?? null;
    let memoryEvidence: SemanticEvidence[] = [];

    if (userId) {
      const namespace = "hr_candidates";
      const documentKey = createHash("sha256")
        .update(`${fileName}|${resumeText}`)
        .digest("hex")
        .slice(0, 24);

      for (const entry of scored.slice(0, 8)) {
        await upsertVectorDocument({
          namespace,
          userId,
          documentKey,
          chunkIndex: entry.index,
          content: clipText(entry.chunk, 320),
          embedding: entry.vector,
          embeddingProvider: jobEmbedding.provider,
          embeddingModel:
            jobEmbedding.provider === "huggingface-sentence-transformers"
              ? getActiveHuggingFaceEmbedModel()
              : process.env.GEMINI_EMBED_MODEL || "text-embedding-004",
          metadata: {
            source: "hr-batch",
            fileName,
          },
        });
      }

      const historicalByChunk = new Map<string, { content: string; similarity: number }>();
      const querySet = retrievalQueries.length ? retrievalQueries : [jobDescription];

      for (const query of querySet.slice(0, 3)) {
        const queryEmbeddingResult =
          query === jobDescription
            ? jobEmbedding
            : await embedText(query, genAI, jobEmbedding.provider);

        if (!queryEmbeddingResult) {
          continue;
        }

        const memoryMatches = await searchVectorDocuments({
          namespace,
          userId,
          queryEmbedding: queryEmbeddingResult.vector,
          queryText: query,
          topK: 2,
          minSimilarity: 0.42,
          scanLimit: 280,
          excludeDocumentKey: documentKey,
          blendAlpha: 0.8,
        });

        for (const match of memoryMatches) {
          const key = `${match.documentKey}:${match.chunkIndex}`;
          const current = historicalByChunk.get(key);
          if (!current || match.similarity > current.similarity) {
            historicalByChunk.set(key, {
              content: match.content,
              similarity: match.similarity,
            });
          }
        }
      }

      memoryEvidence = [...historicalByChunk.values()]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 2)
        .map((match) => ({
        snippet: clipText(match.content),
        similarity_score: clampScore(((match.similarity + 1) / 2) * 100),
        why_it_matters: "Historical high-match candidate evidence from earlier HR analyses.",
        source: "resume",
      }));
    }

    const combinedEvidence = [...topLocal, ...memoryEvidence]
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 3);

    const avgSimilarity =
      combinedEvidence.reduce((sum, entry) => sum + entry.similarity_score, 0) /
      Math.max(1, combinedEvidence.length);

    const score = clampScore(avgSimilarity * 0.72 + heuristic.semantic_match_score * 0.28);

    if (userId) {
      await recordFineTuneSample({
        userId,
        namespace: "hr_candidates",
        jobDescription,
        resumeText,
        semanticMatchScore: score,
        embeddingProvider: jobEmbedding.provider,
        missingIntents: heuristic.missing_intents,
        topEvidence: combinedEvidence,
        metadata: {
          source: "api-hr-semantic",
          file_name: fileName,
        },
      });
    }

    return NextResponse.json({
      semantic_match_score: score,
      coverage_summary:
        memoryEvidence.length > 0
          ? `Hybrid retrieval orchestrated ${Math.min(3, retrievalQueries.length || 1)} query path(s) and found ${memoryEvidence.length} historical HR memory hit(s).`
          : "Hybrid retrieval matched this resume against JD intent.",
      missing_intents: heuristic.missing_intents,
      top_evidence: combinedEvidence,
      retrieval_mode: "embedding",
      embedding_provider: jobEmbedding.provider,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to compute semantic HR score";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
