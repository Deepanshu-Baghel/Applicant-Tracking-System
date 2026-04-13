import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { detectMissingCoreSections, getExampleResumeTextTemplate } from '@/utils/resumeQuality';
import {
  getTierFeatureAccess,
  type SubscriptionTier,
} from '@/lib/subscriptionPlans';
import { getAuthenticatedUserWithTier } from '@/lib/subscriptionServer';
import { searchVectorDocuments, upsertVectorDocument } from '@/lib/vectorMemoryServer';

const DEFAULT_MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
].filter((model): model is string => Boolean(model));

const EMBEDDING_MODEL_CANDIDATES = [
  process.env.GEMINI_EMBED_MODEL,
  'text-embedding-004',
  'embedding-001',
].filter((model): model is string => Boolean(model));

const SEMANTIC_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'by',
  'from',
  'is',
  'are',
  'be',
  'as',
  'this',
  'that',
  'these',
  'those',
  'at',
  'your',
  'you',
  'our',
  'we',
  'will',
  'can',
  'must',
  'should',
  'role',
  'job',
  'candidate',
  'experience',
  'years',
  'work',
  'team',
  'skills',
  'skill',
  'requirement',
  'requirements',
]);

function isModelUnavailableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('404') ||
    normalized.includes('not found') ||
    normalized.includes('not supported') ||
    normalized.includes('unsupported')
  );
}

function isQuotaExceededError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('429') ||
    normalized.includes('too many requests') ||
    normalized.includes('quota exceeded') ||
    normalized.includes('quota') ||
    normalized.includes('rate limit')
  );
}

function extractRetryAfterSeconds(message: string): number | null {
  const retryMatch = message.match(/retry in\s+([\d.]+)s/i);
  if (!retryMatch) {
    return null;
  }

  const parsed = Math.ceil(Number(retryMatch[1]));
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

type ExplainabilityPriority = 'High' | 'Medium' | 'Low';

type ScoreExplainabilityEntry = {
  reason: string;
  priority: ExplainabilityPriority;
  fix: string;
};

type ScoreExplainability = {
  ats_score: ScoreExplainabilityEntry;
  readability_score: ScoreExplainabilityEntry;
  completeness_score: ScoreExplainabilityEntry;
  overall_score: ScoreExplainabilityEntry;
};

function toExplainabilityPriority(score: number): ExplainabilityPriority {
  if (score < 60) {
    return 'High';
  }

  if (score < 80) {
    return 'Medium';
  }

  return 'Low';
}

function normalizeExplainabilityPriority(value: unknown): ExplainabilityPriority | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'high') {
    return 'High';
  }

  if (normalized === 'medium') {
    return 'Medium';
  }

  if (normalized === 'low') {
    return 'Low';
  }

  return null;
}

function buildDefaultScoreExplainability(params: {
  atsScore: number;
  readabilityScore: number;
  completenessScore: number;
  overallScore: number;
  missingSkillsCount: number;
  wordCount: number;
}): ScoreExplainability {
  const {
    atsScore,
    readabilityScore,
    completenessScore,
    overallScore,
    missingSkillsCount,
    wordCount,
  } = params;

  return {
    ats_score: {
      reason:
        missingSkillsCount > 0
          ? `JD overlap is reduced because ${missingSkillsCount} important skills are missing from the resume keywords.`
          : 'Strong keyword and role alignment was detected for ATS parsing.',
      priority: toExplainabilityPriority(atsScore),
      fix:
        missingSkillsCount > 0
          ? 'Add missing JD keywords naturally in summary, skills, and project impact bullets.'
          : 'Keep tailoring keywords for each role and avoid generic skill stuffing.',
    },
    readability_score: {
      reason:
        readabilityScore < 65
          ? 'Sentence structure is dense, which reduces scan speed for recruiters and ATS readability checks.'
          : 'Sentence structure and phrasing are mostly clear and recruiter-friendly.',
      priority: toExplainabilityPriority(readabilityScore),
      fix: 'Use concise action-driven bullets with one metric per line and remove filler phrasing.',
    },
    completeness_score: {
      reason:
        wordCount < 220
          ? 'Resume appears short on context, so core sections or impact depth may be missing.'
          : 'Resume has reasonable coverage, but some sections can still be strengthened with outcomes.',
      priority: toExplainabilityPriority(completenessScore),
      fix: 'Ensure summary, experience, projects, skills, and education sections include quantified outcomes.',
    },
    overall_score: {
      reason: 'Overall score combines ATS alignment, readability, and completeness into one hiring readiness index.',
      priority: toExplainabilityPriority(overallScore),
      fix: 'Prioritize high-impact fixes first: missing keywords, measurable outcomes, then formatting clarity.',
    },
  };
}

function normalizeScoreExplainability(raw: unknown, fallback: ScoreExplainability): ScoreExplainability {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const keys: Array<keyof ScoreExplainability> = [
    'ats_score',
    'readability_score',
    'completeness_score',
    'overall_score',
  ];

  const result: ScoreExplainability = { ...fallback };

  for (const key of keys) {
    const value = source[key];
    if (!value || typeof value !== 'object') {
      continue;
    }

    const entry = value as Record<string, unknown>;
    const reason = typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason.trim() : fallback[key].reason;
    const fix = typeof entry.fix === 'string' && entry.fix.trim() ? entry.fix.trim() : fallback[key].fix;
    const priority = normalizeExplainabilityPriority(entry.priority) ?? fallback[key].priority;

    result[key] = {
      reason,
      priority,
      fix,
    };
  }

  return result;
}

function extractYearsExperience(text: string): number | null {
  const matches = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi)];
  if (!matches.length) {
    return null;
  }

  const years = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (!years.length) {
    return null;
  }

  return Math.max(...years);
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function estimatePredictedSalaryLpa(params: {
  resumeText: string;
  jobDescription?: string;
  experienceYears: number | null;
  skillsFoundCount: number;
  overallScore: number;
}): number {
  const { resumeText, jobDescription, experienceYears, skillsFoundCount, overallScore } = params;

  const resumeLower = resumeText.toLowerCase();
  const jdLower = (jobDescription ?? '').toLowerCase();

  // Base estimate starts with fresher market baseline and grows by profile strength.
  let predicted = 3.8;

  if (experienceYears !== null) {
    predicted += Math.min(15, experienceYears) * 1.9;
  }

  predicted += Math.min(12, skillsFoundCount) * 0.35;
  predicted += Math.max(0, overallScore - 55) * 0.08;

  if (/\b(lead|senior|principal|architect|staff|manager)\b/i.test(resumeText)) {
    predicted += 2;
  }

  if (/\b(startup|founder|cofounder|team lead)\b/i.test(resumeText)) {
    predicted += 1;
  }

  if (/\b(internship|intern|fresher|entry[-\s]?level)\b/i.test(resumeLower) && (experienceYears ?? 0) < 2) {
    predicted -= 0.8;
  }

  if (/\b(senior|lead|manager|architect)\b/i.test(jdLower)) {
    predicted += 1.5;
  }

  return roundToSingleDecimal(Math.max(3, Math.min(95, predicted)));
}

function normalizeSalaryPayload(salary: unknown, fallbackPredictedLpa: number, fallbackAssumptions: string[]) {
  const salaryObject = (salary && typeof salary === 'object')
    ? (salary as Record<string, unknown>)
    : {};

  const numeric = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const predictedDirect = numeric(salaryObject.predicted_lpa);
  const minLpa = numeric(salaryObject.min_lpa);
  const maxLpa = numeric(salaryObject.max_lpa);
  const predictedFromLegacyRange =
    minLpa !== null && maxLpa !== null ? roundToSingleDecimal((minLpa + maxLpa) / 2) : null;

  const predictedLpa = roundToSingleDecimal(
    Math.max(3, Math.min(95, predictedDirect ?? predictedFromLegacyRange ?? fallbackPredictedLpa))
  );

  const rationale =
    typeof salaryObject.rationale === 'string' && salaryObject.rationale.trim()
      ? salaryObject.rationale.trim()
      : 'Estimated from your experience depth, resume impact, and market role fit.';

  const confidenceRaw =
    typeof salaryObject.confidence === 'string' ? salaryObject.confidence.trim() : 'Medium';
  const confidence = ['Low', 'Medium', 'High'].includes(confidenceRaw) ? confidenceRaw : 'Medium';

  const tips = Array.isArray(salaryObject.negotiation_tips)
    ? salaryObject.negotiation_tips.filter((tip): tip is string => typeof tip === 'string' && tip.trim().length > 0).slice(0, 3)
    : [];

  const assumptions = Array.isArray(salaryObject.assumptions)
    ? salaryObject.assumptions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
    : [];

  return {
    predicted_lpa: predictedLpa,
    rationale,
    confidence,
    assumptions: assumptions.length ? assumptions : fallbackAssumptions,
    negotiation_tips: tips.length
      ? tips
      : [
          'Anchor your ask with business impact and measurable outcomes.',
          'State your expected number confidently, then justify with role fit and delivery.',
          'Negotiate total compensation (fixed, bonus, benefits), not only base pay.',
        ],
  };
}

type AtsPlatformStatus = 'Strong' | 'Average' | 'Weak';

type AtsPlatform = 'Greenhouse' | 'Lever' | 'Workday';

type AtsSimulatorItem = {
  platform: AtsPlatform;
  score: number;
  status: AtsPlatformStatus;
  reason: string;
  top_fixes: string[];
};

type InterviewConversionBand = 'Low' | 'Medium' | 'High';

type InterviewConversionPredictor = {
  probability_percent: number;
  band: InterviewConversionBand;
  confidence: 'Low' | 'Medium' | 'High';
  key_drivers: string[];
  key_risks: string[];
  next_actions: string[];
};

type OfferNegotiationCopilot = {
  role_hint: string;
  ideal_ask_lpa: number;
  acceptable_floor_lpa: number;
  walk_away_lpa: number;
  opening_pitch: string;
  value_proofs: string[];
  objection_handling: Array<{
    objection: string;
    response: string;
  }>;
  closing_line: string;
};

type ApplicationPackGenerator = {
  tailored_summary: string;
  cover_letter: string;
  recruiter_email: string;
  linkedin_dm: string;
  interview_pitch_30s: string;
  ats_keyword_checklist: string[];
};

type JobTailoredResumeVariant = {
  title: string;
  summary: string;
  focus_skills: string[];
  highlight_bullets: string[];
};

type HiddenRedFlag = {
  flag: string;
  severity: 'High' | 'Medium' | 'Low';
  why_it_hurts: string;
  fix: string;
};

type RecruiterEyePathFold = {
  fold: 'Top Fold' | 'Upper Middle' | 'Mid Section' | 'Bottom Section';
  attention_percent: number;
  first_focus: string;
  recruiter_question: string;
  fix: string;
};

type RecruiterEyePath = {
  total_scan_seconds: number;
  folds: RecruiterEyePathFold[];
};

type CareerTrack = 'IC' | 'Manager' | 'Specialist';

type CareerTrackScore = {
  track: CareerTrack;
  readiness_score: number;
  evidence: string[];
  gaps: string[];
};

type CareerNarrativeGraph = {
  primary_track: CareerTrack;
  tracks: CareerTrackScore[];
};

type ReachabilityVerdict = 'Apply now' | 'Upskill first' | 'Stretch';

type JobReachabilityScore = {
  score: number;
  verdict: ReachabilityVerdict;
  reasoning: string[];
  target_gaps: string[];
};

type SkillRoiPlanItem = {
  skill: string;
  shortlist_uplift_percent: number;
  salary_uplift_lpa: number;
  effort_weeks: number;
  reason: string;
};

type SkillRoiPlanner = {
  recommendation: string;
  skills: SkillRoiPlanItem[];
};

type EmbeddingProvider = 'huggingface-sentence-transformers' | 'gemini';

type EmbeddingVectorResult = {
  vector: number[];
  provider: EmbeddingProvider;
};

type SemanticRagEvidenceItem = {
  snippet: string;
  similarity_score: number;
  why_it_matters: string;
  source: 'resume' | 'job_description';
};

type SemanticRagInsights = {
  semantic_match_score: number;
  coverage_summary: string;
  missing_intents: string[];
  top_evidence: SemanticRagEvidenceItem[];
  retrieval_mode: 'embedding' | 'heuristic';
  embedding_provider: EmbeddingProvider | null;
};

function atsStatusFromScore(score: number): AtsPlatformStatus {
  if (score >= 75) {
    return 'Strong';
  }

  if (score >= 55) {
    return 'Average';
  }

  return 'Weak';
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function clipSnippet(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trim()}...`;
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

function cosineSimilarity(normalizedA: number[], normalizedB: number[]): number {
  const length = Math.min(normalizedA.length, normalizedB.length);
  if (!length) {
    return 0;
  }

  let dotProduct = 0;
  for (let index = 0; index < length; index += 1) {
    dotProduct += normalizedA[index] * normalizedB[index];
  }

  return Math.max(-1, Math.min(1, dotProduct));
}

function splitIntoSemanticChunks(text: string, targetWords = 90, overlapWords = 20, maxChunks = 12): string[] {
  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0);

  if (!words.length) {
    return [];
  }

  const chunks: string[] = [];
  const step = Math.max(1, targetWords - overlapWords);

  for (let start = 0; start < words.length && chunks.length < maxChunks; start += step) {
    const chunk = words.slice(start, start + targetWords).join(' ').trim();
    if (chunk.length >= 40) {
      chunks.push(chunk);
    }

    if (start + targetWords >= words.length) {
      break;
    }
  }

  return chunks;
}

function extractNumericVectors(value: unknown, depth = 0): number[][] {
  if (depth > 4 || !Array.isArray(value)) {
    return [];
  }

  if (value.length > 0 && value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
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

  const modelName = process.env.HUGGINGFACE_EMBED_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
  const endpoint = `https://api-inference.huggingface.co/pipeline/feature-extraction/${encodeURIComponent(modelName)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text.slice(0, 3000),
        options: {
          wait_for_model: true,
        },
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

function extractIntentKeywords(text: string, limit: number): string[] {
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? [];
  const frequency = new Map<string, number>();

  for (const token of tokens) {
    if (SEMANTIC_STOPWORDS.has(token)) {
      continue;
    }
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((a, b) => {
      if (b[1] === a[1]) {
        return b[0].length - a[0].length;
      }

      return b[1] - a[1];
    })
    .map(([token]) => token)
    .slice(0, limit);
}

function buildHeuristicSemanticRagInsights(
  resumeText: string,
  jobDescription?: string
): SemanticRagInsights {
  const resumeLower = resumeText.toLowerCase();
  const intentKeywords = extractIntentKeywords(jobDescription ?? '', 14);
  const missingIntents = intentKeywords.filter((keyword) => !resumeLower.includes(keyword)).slice(0, 5);
  const matchedIntents = intentKeywords.filter((keyword) => resumeLower.includes(keyword));
  const overlapRatio = intentKeywords.length ? matchedIntents.length / intentKeywords.length : 0.55;
  const semanticMatchScore = clampScore(35 + overlapRatio * 60);

  const candidateLines = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 32);

  const evidenceLines = candidateLines
    .filter((line) => {
      if (!matchedIntents.length) {
        return true;
      }

      const lower = line.toLowerCase();
      return matchedIntents.some((keyword) => lower.includes(keyword));
    })
    .slice(0, 3);

  const topEvidence = (evidenceLines.length ? evidenceLines : candidateLines.slice(0, 3)).map((line, index) => ({
    snippet: clipSnippet(line),
    similarity_score: clampScore(semanticMatchScore - index * 4),
    why_it_matters: matchedIntents.length
      ? `This evidence reflects target intent around ${matchedIntents.slice(0, 2).join(' and ')}.`
      : 'This evidence highlights role-relevant execution context in the resume.',
    source: 'resume' as const,
  }));

  const coverageSummary = jobDescription && jobDescription.trim().length > 0
    ? matchedIntents.length
      ? `Heuristic semantic scan found ${matchedIntents.length}/${intentKeywords.length || 1} target intents represented in resume evidence.`
      : 'Heuristic semantic scan found limited direct alignment with the target job intent.'
    : 'No job description provided, so semantic retrieval used resume-only evidence cues.';

  return {
    semantic_match_score: semanticMatchScore,
    coverage_summary: coverageSummary,
    missing_intents: missingIntents,
    top_evidence: topEvidence,
    retrieval_mode: 'heuristic',
    embedding_provider: null,
  };
}

async function embedWithGemini(genAI: GoogleGenerativeAI, text: string): Promise<number[] | null> {
  const payload = text.replace(/\s+/g, ' ').trim();
  if (!payload) {
    return null;
  }

  for (const modelName of EMBEDDING_MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.embedContent(payload.slice(0, 8000));
      const values = Array.isArray(response.embedding?.values)
        ? response.embedding.values.filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value)
          )
        : [];
      const normalized = normalizeEmbedding(values);

      if (normalized) {
        return normalized;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (isModelUnavailableError(message) || isQuotaExceededError(message)) {
        continue;
      }

      continue;
    }
  }

  return null;
}

async function embedText(
  genAI: GoogleGenerativeAI,
  text: string,
  preferredProvider?: EmbeddingProvider
): Promise<EmbeddingVectorResult | null> {
  const payload = text.replace(/\s+/g, ' ').trim();
  if (!payload) {
    return null;
  }

  const providers: EmbeddingProvider[] = preferredProvider
    ? [preferredProvider]
    : ['huggingface-sentence-transformers', 'gemini'];

  for (const provider of providers) {
    if (provider === 'huggingface-sentence-transformers') {
      const vector = await embedWithHuggingFace(payload);
      if (vector) {
        return {
          vector,
          provider,
        };
      }
      continue;
    }

    const vector = await embedWithGemini(genAI, payload);
    if (vector) {
      return {
        vector,
        provider: 'gemini',
      };
    }
  }

  return null;
}

async function buildSemanticRagInsights(params: {
  genAI: GoogleGenerativeAI;
  resumeText: string;
  jobDescription?: string;
  userId?: string | null;
}): Promise<SemanticRagInsights> {
  const { genAI, resumeText, jobDescription, userId } = params;
  const heuristicInsights = buildHeuristicSemanticRagInsights(resumeText, jobDescription);

  if (!jobDescription || !jobDescription.trim()) {
    return heuristicInsights;
  }

  const jobEmbedding = await embedText(genAI, jobDescription);
  if (!jobEmbedding) {
    return heuristicInsights;
  }

  const chunks = splitIntoSemanticChunks(resumeText, 95, 24, 12);
  if (!chunks.length) {
    return heuristicInsights;
  }

  const scoredChunks: Array<{ snippet: string; rawSimilarity: number; vector: number[]; chunkIndex: number }> = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkEmbedding = await embedText(genAI, chunk, jobEmbedding.provider);
    if (!chunkEmbedding) {
      continue;
    }

    scoredChunks.push({
      snippet: chunk,
      rawSimilarity: cosineSimilarity(jobEmbedding.vector, chunkEmbedding.vector),
      vector: chunkEmbedding.vector,
      chunkIndex: index,
    });
  }

  if (!scoredChunks.length) {
    return heuristicInsights;
  }

  const sortedScored = [...scoredChunks].sort((a, b) => b.rawSimilarity - a.rawSimilarity);
  const topScored = sortedScored
    .sort((a, b) => b.rawSimilarity - a.rawSimilarity)
    .slice(0, 3);

  const intentKeywords = extractIntentKeywords(jobDescription, 10);
  const topEvidence: SemanticRagEvidenceItem[] = topScored.map((entry) => {
    const snippetLower = entry.snippet.toLowerCase();
    const overlap = intentKeywords.filter((keyword) => snippetLower.includes(keyword)).slice(0, 2);

    return {
      snippet: clipSnippet(entry.snippet),
      similarity_score: clampScore(((entry.rawSimilarity + 1) / 2) * 100),
      why_it_matters: overlap.length
        ? `Matches target intent around ${overlap.join(' and ')} with concrete resume evidence.`
        : 'Semantically close to target role context even when exact keyword match is low.',
      source: 'resume',
    };
  });

  let memoryEvidence: SemanticRagEvidenceItem[] = [];
  if (userId) {
    const namespace = 'resume_analysis';
    const documentKey = createHash('sha256').update(resumeText).digest('hex').slice(0, 24);

    for (const entry of sortedScored.slice(0, 8)) {
      await upsertVectorDocument({
        namespace,
        userId,
        documentKey,
        chunkIndex: entry.chunkIndex,
        content: clipSnippet(entry.snippet, 320),
        embedding: entry.vector,
        embeddingProvider: jobEmbedding.provider,
        embeddingModel:
          jobEmbedding.provider === 'huggingface-sentence-transformers'
            ? (process.env.HUGGINGFACE_EMBED_MODEL || 'sentence-transformers/all-MiniLM-L6-v2')
            : (process.env.GEMINI_EMBED_MODEL || 'text-embedding-004'),
        metadata: {
          source: 'resume-analysis',
        },
      });
    }

    const historicalMatches = await searchVectorDocuments({
      namespace,
      userId,
      queryEmbedding: jobEmbedding.vector,
      topK: 2,
      minSimilarity: 0.42,
      scanLimit: 260,
      excludeDocumentKey: documentKey,
    });

    memoryEvidence = historicalMatches.map((match, index) => ({
      snippet: clipSnippet(match.content),
      similarity_score: clampScore(((match.similarity + 1) / 2) * 100),
      why_it_matters:
        index === 0
          ? 'High-similarity evidence from your previous analyses supports this role intent.'
          : 'Historical resume evidence reinforces recurring role-fit signals.',
      source: 'resume',
    }));
  }

  const combinedEvidence = [...topEvidence, ...memoryEvidence]
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, 3);

  const averageSimilarity =
    combinedEvidence.reduce((sum, entry) => sum + entry.similarity_score, 0) /
    Math.max(1, combinedEvidence.length);

  const semanticMatchScore = clampScore(
    averageSimilarity * 0.72 + heuristicInsights.semantic_match_score * 0.28
  );

  return {
    semantic_match_score: semanticMatchScore,
    coverage_summary:
      memoryEvidence.length > 0
        ? `Embedding retrieval matched current resume chunks and ${memoryEvidence.length} historical memory hit(s) using ${jobEmbedding.provider === 'huggingface-sentence-transformers' ? 'Sentence-Transformers' : 'Gemini embeddings'}.`
        : `Embedding retrieval matched ${topEvidence.length} high-similarity resume evidence chunks against the job description intent using ${jobEmbedding.provider === 'huggingface-sentence-transformers' ? 'Sentence-Transformers' : 'Gemini embeddings'}.`,
    missing_intents: heuristicInsights.missing_intents,
    top_evidence: combinedEvidence,
    retrieval_mode: 'embedding',
    embedding_provider: jobEmbedding.provider,
  };
}

function normalizeSemanticRagInsightsPayload(
  raw: unknown,
  fallback: SemanticRagInsights
): SemanticRagInsights {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const score =
    typeof source.semantic_match_score === 'number' && Number.isFinite(source.semantic_match_score)
      ? clampScore(source.semantic_match_score)
      : fallback.semantic_match_score;

  const coverageSummary =
    typeof source.coverage_summary === 'string' && source.coverage_summary.trim()
      ? source.coverage_summary.trim()
      : fallback.coverage_summary;

  const missingIntents = normalizeStringArray(source.missing_intents, 5);
  const retrievalMode =
    source.retrieval_mode === 'embedding' || source.retrieval_mode === 'heuristic'
      ? source.retrieval_mode
      : fallback.retrieval_mode;
  const embeddingProvider =
    source.embedding_provider === 'huggingface-sentence-transformers' || source.embedding_provider === 'gemini'
      ? source.embedding_provider
      : fallback.embedding_provider;

  const topEvidence = Array.isArray(source.top_evidence)
    ? source.top_evidence
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const row = entry as Record<string, unknown>;
          const snippet = typeof row.snippet === 'string' ? clipSnippet(row.snippet) : '';
          const whyItMatters =
            typeof row.why_it_matters === 'string' && row.why_it_matters.trim()
              ? row.why_it_matters.trim()
              : '';
          const similarity =
            typeof row.similarity_score === 'number' && Number.isFinite(row.similarity_score)
              ? clampScore(row.similarity_score)
              : null;
          const sourceType = row.source === 'resume' || row.source === 'job_description'
            ? row.source
            : 'resume';

          if (!snippet || !whyItMatters || similarity === null) {
            return null;
          }

          return {
            snippet,
            similarity_score: similarity,
            why_it_matters: whyItMatters,
            source: sourceType,
          };
        })
        .filter((entry): entry is SemanticRagEvidenceItem => Boolean(entry))
        .slice(0, 3)
    : [];

  return {
    semantic_match_score: score,
    coverage_summary: coverageSummary,
    missing_intents: missingIntents.length ? missingIntents : fallback.missing_intents,
    top_evidence: topEvidence.length ? topEvidence : fallback.top_evidence,
    retrieval_mode: retrievalMode,
    embedding_provider: embeddingProvider,
  };
}

function buildFallbackAtsSimulator(params: {
  atsScore: number;
  readabilityScore: number;
  completenessScore: number;
  missingSkills: string[];
}): AtsSimulatorItem[] {
  const { atsScore, readabilityScore, completenessScore, missingSkills } = params;

  const commonFixes = missingSkills.length
    ? [
        `Add role keywords: ${missingSkills.slice(0, 3).join(', ')}.`,
        'Use exact JD-aligned terminology in summary and project bullets.',
      ]
    : ['Maintain role-specific keywords for each application.', 'Keep formatting ATS-safe and text-parsable.'];

  const greenhouseScore = clampScore(atsScore * 0.7 + completenessScore * 0.3 - missingSkills.length * 1.5);
  const leverScore = clampScore(atsScore * 0.45 + readabilityScore * 0.35 + completenessScore * 0.2);
  const workdayScore = clampScore(atsScore * 0.55 + completenessScore * 0.3 + readabilityScore * 0.15 - missingSkills.length);

  return [
    {
      platform: 'Greenhouse',
      score: greenhouseScore,
      status: atsStatusFromScore(greenhouseScore),
      reason:
        'Greenhouse-style parsers heavily reward explicit keyword alignment and clear section structure.',
      top_fixes: [...commonFixes, 'Ensure section headers are standard (Education, Skills, Experience).'].slice(0, 3),
    },
    {
      platform: 'Lever',
      score: leverScore,
      status: atsStatusFromScore(leverScore),
      reason:
        'Lever-style screening places additional weight on readability and concise impact statements.',
      top_fixes: [
        'Convert dense paragraphs into concise action + impact bullet points.',
        ...commonFixes,
      ].slice(0, 3),
    },
    {
      platform: 'Workday',
      score: workdayScore,
      status: atsStatusFromScore(workdayScore),
      reason:
        'Workday-style filtering strongly favors section completeness, chronology clarity, and parser-safe formatting.',
      top_fixes: [
        'Include complete section coverage with measurable outcomes.',
        ...commonFixes,
      ].slice(0, 3),
    },
  ];
}

function normalizeAtsSimulatorPayload(raw: unknown, fallback: AtsSimulatorItem[]): AtsSimulatorItem[] {
  if (!Array.isArray(raw)) {
    return fallback;
  }

  const validPlatforms: AtsPlatform[] = ['Greenhouse', 'Lever', 'Workday'];
  const byPlatform = new Map<AtsPlatform, AtsSimulatorItem>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const platform =
      typeof candidate.platform === 'string' && validPlatforms.includes(candidate.platform as AtsPlatform)
        ? (candidate.platform as AtsPlatform)
        : null;

    if (!platform) {
      continue;
    }

    const fallbackItem = fallback.find((entry) => entry.platform === platform);
    if (!fallbackItem) {
      continue;
    }

    const score = typeof candidate.score === 'number' ? clampScore(candidate.score) : fallbackItem.score;
    const reason = typeof candidate.reason === 'string' && candidate.reason.trim() ? candidate.reason.trim() : fallbackItem.reason;
    const status =
      typeof candidate.status === 'string' && ['Strong', 'Average', 'Weak'].includes(candidate.status)
        ? (candidate.status as AtsPlatformStatus)
        : atsStatusFromScore(score);
    const topFixes = normalizeStringArray(candidate.top_fixes, 3);

    byPlatform.set(platform, {
      platform,
      score,
      status,
      reason,
      top_fixes: topFixes.length ? topFixes : fallbackItem.top_fixes,
    });
  }

  return (['Greenhouse', 'Lever', 'Workday'] as AtsPlatform[]).map(
    (platform) => byPlatform.get(platform) ?? fallback.find((entry) => entry.platform === platform)!
  );
}

function conversionBandFromProbability(probability: number): InterviewConversionBand {
  if (probability >= 65) {
    return 'High';
  }

  if (probability >= 40) {
    return 'Medium';
  }

  return 'Low';
}

function normalizeReachabilityVerdict(value: unknown): ReachabilityVerdict | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value === 'Apply now' || value === 'Upskill first' || value === 'Stretch') {
    return value;
  }

  return null;
}

function normalizeRecruiterEyePathPayload(
  raw: unknown,
  fallback: RecruiterEyePath
): RecruiterEyePath {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const totalScanSeconds =
    typeof source.total_scan_seconds === 'number' && Number.isFinite(source.total_scan_seconds)
      ? Math.max(5, Math.min(12, Math.round(source.total_scan_seconds)))
      : fallback.total_scan_seconds;

  const folds = Array.isArray(source.folds)
    ? source.folds
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const row = entry as Record<string, unknown>;
          const fold =
            row.fold === 'Top Fold' ||
            row.fold === 'Upper Middle' ||
            row.fold === 'Mid Section' ||
            row.fold === 'Bottom Section'
              ? row.fold
              : null;

          const firstFocus =
            typeof row.first_focus === 'string' && row.first_focus.trim()
              ? row.first_focus.trim()
              : '';
          const recruiterQuestion =
            typeof row.recruiter_question === 'string' && row.recruiter_question.trim()
              ? row.recruiter_question.trim()
              : '';
          const fix = typeof row.fix === 'string' && row.fix.trim() ? row.fix.trim() : '';
          const attentionPercent =
            typeof row.attention_percent === 'number' && Number.isFinite(row.attention_percent)
              ? Math.max(5, Math.min(60, Math.round(row.attention_percent)))
              : null;

          if (!fold || !firstFocus || !recruiterQuestion || !fix || attentionPercent === null) {
            return null;
          }

          return {
            fold,
            attention_percent: attentionPercent,
            first_focus: firstFocus,
            recruiter_question: recruiterQuestion,
            fix,
          };
        })
        .filter((entry): entry is RecruiterEyePathFold => Boolean(entry))
    : [];

  return {
    total_scan_seconds: totalScanSeconds,
    folds: folds.length ? folds : fallback.folds,
  };
}

function normalizeCareerNarrativeGraphPayload(
  raw: unknown,
  fallback: CareerNarrativeGraph
): CareerNarrativeGraph {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const tracks = Array.isArray(source.tracks)
    ? source.tracks
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const row = entry as Record<string, unknown>;
          const track = row.track === 'IC' || row.track === 'Manager' || row.track === 'Specialist'
            ? row.track
            : null;
          const readinessScore =
            typeof row.readiness_score === 'number' && Number.isFinite(row.readiness_score)
              ? clampScore(row.readiness_score)
              : null;
          const evidence = normalizeStringArray(row.evidence, 3);
          const gaps = normalizeStringArray(row.gaps, 3);

          if (!track || readinessScore === null) {
            return null;
          }

          return {
            track,
            readiness_score: readinessScore,
            evidence: evidence.length ? evidence : ['Role-fit signals detected in current profile.'],
            gaps: gaps.length ? gaps : ['Improve role-specific impact evidence.'],
          };
        })
        .filter((entry): entry is CareerTrackScore => Boolean(entry))
    : [];

  if (!tracks.length) {
    return fallback;
  }

  const primaryFromPayload =
    source.primary_track === 'IC' || source.primary_track === 'Manager' || source.primary_track === 'Specialist'
      ? source.primary_track
      : null;

  const maxTrack = tracks.reduce((best, current) =>
    current.readiness_score > best.readiness_score ? current : best
  );

  return {
    tracks,
    primary_track: primaryFromPayload ?? maxTrack.track,
  };
}

function normalizeJobReachabilityPayload(
  raw: unknown,
  fallback: JobReachabilityScore
): JobReachabilityScore {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const score =
    typeof source.score === 'number' && Number.isFinite(source.score)
      ? clampScore(source.score)
      : fallback.score;
  const inferredVerdict: ReachabilityVerdict =
    score >= 70 ? 'Apply now' : score >= 45 ? 'Upskill first' : 'Stretch';

  return {
    score,
    verdict: normalizeReachabilityVerdict(source.verdict) ?? inferredVerdict,
    reasoning: normalizeStringArray(source.reasoning, 4).length
      ? normalizeStringArray(source.reasoning, 4)
      : fallback.reasoning,
    target_gaps: normalizeStringArray(source.target_gaps, 5).length
      ? normalizeStringArray(source.target_gaps, 5)
      : fallback.target_gaps,
  };
}

function normalizeSkillRoiPayload(raw: unknown, fallback: SkillRoiPlanner): SkillRoiPlanner {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const skills = Array.isArray(source.skills)
    ? source.skills
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const row = entry as Record<string, unknown>;
          const skill = typeof row.skill === 'string' && row.skill.trim() ? row.skill.trim() : '';
          const shortlistUplift =
            typeof row.shortlist_uplift_percent === 'number' && Number.isFinite(row.shortlist_uplift_percent)
              ? Math.max(1, Math.min(35, Math.round(row.shortlist_uplift_percent)))
              : null;
          const salaryUplift =
            typeof row.salary_uplift_lpa === 'number' && Number.isFinite(row.salary_uplift_lpa)
              ? roundToSingleDecimal(Math.max(0.2, Math.min(9, row.salary_uplift_lpa)))
              : null;
          const effortWeeks =
            typeof row.effort_weeks === 'number' && Number.isFinite(row.effort_weeks)
              ? Math.max(2, Math.min(24, Math.round(row.effort_weeks)))
              : null;
          const reason = typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : '';

          if (!skill || shortlistUplift === null || salaryUplift === null || effortWeeks === null || !reason) {
            return null;
          }

          return {
            skill,
            shortlist_uplift_percent: shortlistUplift,
            salary_uplift_lpa: salaryUplift,
            effort_weeks: effortWeeks,
            reason,
          };
        })
        .filter((entry): entry is SkillRoiPlanItem => Boolean(entry))
        .slice(0, 5)
    : [];

  return {
    recommendation:
      typeof source.recommendation === 'string' && source.recommendation.trim()
        ? source.recommendation.trim()
        : fallback.recommendation,
    skills: skills.length ? skills : fallback.skills,
  };
}

function buildFallbackInterviewConversion(params: {
  atsScore: number;
  readabilityScore: number;
  completenessScore: number;
  overallScore: number;
  skillsFound: string[];
  missingSkills: string[];
  strengths: string[];
  improvements: string[];
}): InterviewConversionPredictor {
  const {
    atsScore,
    readabilityScore,
    completenessScore,
    overallScore,
    skillsFound,
    missingSkills,
    strengths,
    improvements,
  } = params;

  const rawProbability =
    overallScore * 0.45 +
    atsScore * 0.25 +
    readabilityScore * 0.15 +
    completenessScore * 0.15 -
    missingSkills.length * 2.5;

  const probability = clampScore(rawProbability);
  const band = conversionBandFromProbability(probability);
  const confidence: 'Low' | 'Medium' | 'High' =
    missingSkills.length <= 2 && overallScore >= 70 ? 'High' : missingSkills.length >= 6 ? 'Low' : 'Medium';

  const keyDrivers = [
    ...(strengths.slice(0, 2)),
    skillsFound.length ? `Detected ${skillsFound.length} role-relevant skills in resume content.` : 'Resume shows baseline role relevance.',
  ].slice(0, 3);

  const keyRisks = [
    ...(improvements.slice(0, 2)),
    missingSkills.length ? `Missing high-priority JD skills: ${missingSkills.slice(0, 3).join(', ')}.` : 'No major keyword gaps detected.',
  ].slice(0, 3);

  const nextActions = [
    'Tailor top 5 bullets to role-specific outcomes and measurable impact.',
    'Address missing JD keywords in summary, skills, and project sections.',
    'Use one-page recruiter-friendly formatting before applications.',
  ];

  return {
    probability_percent: probability,
    band,
    confidence,
    key_drivers: keyDrivers,
    key_risks: keyRisks,
    next_actions: nextActions,
  };
}

function normalizeInterviewConversionPayload(
  raw: unknown,
  fallback: InterviewConversionPredictor
): InterviewConversionPredictor {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const probability =
    typeof source.probability_percent === 'number'
      ? clampScore(source.probability_percent)
      : fallback.probability_percent;

  const band =
    typeof source.band === 'string' && ['Low', 'Medium', 'High'].includes(source.band)
      ? (source.band as InterviewConversionBand)
      : conversionBandFromProbability(probability);

  const confidence =
    typeof source.confidence === 'string' && ['Low', 'Medium', 'High'].includes(source.confidence)
      ? (source.confidence as 'Low' | 'Medium' | 'High')
      : fallback.confidence;

  const keyDrivers = normalizeStringArray(source.key_drivers, 3);
  const keyRisks = normalizeStringArray(source.key_risks, 3);
  const nextActions = normalizeStringArray(source.next_actions, 4);

  return {
    probability_percent: probability,
    band,
    confidence,
    key_drivers: keyDrivers.length ? keyDrivers : fallback.key_drivers,
    key_risks: keyRisks.length ? keyRisks : fallback.key_risks,
    next_actions: nextActions.length ? nextActions : fallback.next_actions,
  };
}

function normalizeOfferNegotiationPayload(
  raw: unknown,
  fallback: OfferNegotiationCopilot
): OfferNegotiationCopilot {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;

  const numericOrFallback = (value: unknown, fallbackValue: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? roundToSingleDecimal(Math.max(3, Math.min(95, value)))
      : fallbackValue;

  const roleHint =
    typeof source.role_hint === 'string' && source.role_hint.trim()
      ? source.role_hint.trim()
      : fallback.role_hint;

  const idealAsk = numericOrFallback(source.ideal_ask_lpa, fallback.ideal_ask_lpa);
  const acceptableFloor = numericOrFallback(source.acceptable_floor_lpa, fallback.acceptable_floor_lpa);
  const walkAway = numericOrFallback(source.walk_away_lpa, fallback.walk_away_lpa);

  const openingPitch =
    typeof source.opening_pitch === 'string' && source.opening_pitch.trim()
      ? source.opening_pitch.trim()
      : fallback.opening_pitch;

  const valueProofs = normalizeStringArray(source.value_proofs, 4);

  const objectionHandling = Array.isArray(source.objection_handling)
    ? source.objection_handling
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const row = item as { objection?: unknown; response?: unknown };
          const objection =
            typeof row.objection === 'string' && row.objection.trim()
              ? row.objection.trim()
              : '';
          const response =
            typeof row.response === 'string' && row.response.trim()
              ? row.response.trim()
              : '';

          if (!objection || !response) {
            return null;
          }

          return { objection, response };
        })
        .filter((item): item is { objection: string; response: string } => Boolean(item))
        .slice(0, 3)
    : [];

  const closingLine =
    typeof source.closing_line === 'string' && source.closing_line.trim()
      ? source.closing_line.trim()
      : fallback.closing_line;

  return {
    role_hint: roleHint,
    ideal_ask_lpa: idealAsk,
    acceptable_floor_lpa: Math.min(idealAsk, acceptableFloor),
    walk_away_lpa: Math.min(Math.min(idealAsk, acceptableFloor), walkAway),
    opening_pitch: openingPitch,
    value_proofs: valueProofs.length ? valueProofs : fallback.value_proofs,
    objection_handling: objectionHandling.length ? objectionHandling : fallback.objection_handling,
    closing_line: closingLine,
  };
}

function normalizeApplicationPackPayload(
  raw: unknown,
  fallback: ApplicationPackGenerator
): ApplicationPackGenerator {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const readText = (
    key: 'tailored_summary' | 'cover_letter' | 'recruiter_email' | 'linkedin_dm' | 'interview_pitch_30s'
  ): string => {
    const value = source[key as string];
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : fallback[key];
  };

  const checklist = normalizeStringArray(source.ats_keyword_checklist, 8);

  return {
    tailored_summary: readText('tailored_summary'),
    cover_letter: readText('cover_letter'),
    recruiter_email: readText('recruiter_email'),
    linkedin_dm: readText('linkedin_dm'),
    interview_pitch_30s: readText('interview_pitch_30s'),
    ats_keyword_checklist: checklist.length ? checklist : fallback.ats_keyword_checklist,
  };
}

function normalizeVariantPayload(
  raw: unknown,
  fallback: JobTailoredResumeVariant[]
): JobTailoredResumeVariant[] {
  if (!Array.isArray(raw)) {
    return fallback;
  }

  const variants = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null;
      const summary = typeof row.summary === 'string' && row.summary.trim() ? row.summary.trim() : null;
      const focusSkills = normalizeStringArray(row.focus_skills, 5);
      const highlights = normalizeStringArray(row.highlight_bullets, 4);

      if (!title || !summary) {
        return null;
      }

      return {
        title,
        summary,
        focus_skills: focusSkills.length ? focusSkills : ['Role alignment', 'Delivery impact'],
        highlight_bullets: highlights.length ? highlights : ['Quantify impact per project bullet.'],
      };
    })
    .filter((entry): entry is JobTailoredResumeVariant => Boolean(entry))
    .slice(0, 3);

  return variants.length ? variants : fallback;
}

function normalizeRedFlagSeverity(value: unknown): HiddenRedFlag['severity'] | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value === 'High' || value === 'Medium' || value === 'Low') {
    return value;
  }

  return null;
}

function normalizeRedFlagPayload(raw: unknown, fallback: HiddenRedFlag[]): HiddenRedFlag[] {
  if (!Array.isArray(raw)) {
    return fallback;
  }

  const parsed = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const flag = typeof row.flag === 'string' && row.flag.trim() ? row.flag.trim() : null;
      const why =
        typeof row.why_it_hurts === 'string' && row.why_it_hurts.trim()
          ? row.why_it_hurts.trim()
          : null;
      const fix = typeof row.fix === 'string' && row.fix.trim() ? row.fix.trim() : null;
      const severity = normalizeRedFlagSeverity(row.severity);

      if (!flag || !why || !fix || !severity) {
        return null;
      }

      return {
        flag,
        severity,
        why_it_hurts: why,
        fix,
      };
    })
    .filter((entry): entry is HiddenRedFlag => Boolean(entry))
    .slice(0, 4);

  return parsed.length ? parsed : fallback;
}

function buildFallbackJobTailoredVariants(params: {
  roleHint: string;
  strengths: string[];
  skillsFound: string[];
  missingSkills: string[];
}): JobTailoredResumeVariant[] {
  const { roleHint, strengths, skillsFound, missingSkills } = params;

  const coreSkills = skillsFound.length ? skillsFound.slice(0, 4) : ['Execution', 'Problem solving'];
  const gapSkills = missingSkills.slice(0, 3);

  return [
    {
      title: `${roleHint} - Outcome First`,
      summary: 'Emphasizes business outcomes, delivery velocity, and measurable impact over task lists.',
      focus_skills: coreSkills,
      highlight_bullets: [
        'Open each experience bullet with action + metric + business result.',
        'Prioritize projects with ownership and scale impact.',
        strengths[0] ?? 'Keep evidence of role ownership visible in the top half.',
      ].slice(0, 4),
    },
    {
      title: `${roleHint} - ATS Keyword Match`,
      summary: 'Optimized for ATS parsing and keyword alignment with target job descriptions.',
      focus_skills: gapSkills.length ? [...coreSkills.slice(0, 2), ...gapSkills].slice(0, 5) : coreSkills,
      highlight_bullets: [
        'Mirror JD terminology naturally in summary and skill blocks.',
        'Use explicit tool and domain keywords in project bullets.',
        gapSkills.length
          ? `Close top gaps: ${gapSkills.join(', ')}.`
          : 'Maintain high overlap with role-specific terminology.',
      ].slice(0, 4),
    },
    {
      title: `${roleHint} - Leadership Narrative`,
      summary: 'Shifts focus from execution-only profile to ownership, mentoring, and decision impact.',
      focus_skills: ['Stakeholder communication', 'Ownership', ...coreSkills.slice(0, 3)].slice(0, 5),
      highlight_bullets: [
        'Show decisions made under ambiguity and trade-off reasoning.',
        'Highlight cross-functional collaboration outcomes.',
        'Add one bullet on mentoring, process improvement, or initiative ownership.',
      ],
    },
  ];
}

function buildFallbackHiddenRedFlags(params: {
  missingSkills: string[];
  jargonDetected: string[];
  improvements: string[];
}): HiddenRedFlag[] {
  const { missingSkills, jargonDetected, improvements } = params;

  const flags: HiddenRedFlag[] = [];

  if (missingSkills.length >= 3) {
    flags.push({
      flag: `Critical JD keywords missing: ${missingSkills.slice(0, 3).join(', ')}`,
      severity: 'High',
      why_it_hurts: 'ATS shortlisting likelihood drops when core role terms are absent.',
      fix: 'Integrate missing terms naturally into summary, skills, and impact bullets.',
    });
  }

  if (jargonDetected.length > 0) {
    flags.push({
      flag: `Generic buzzwords detected: ${jargonDetected.slice(0, 3).join(', ')}`,
      severity: 'Medium',
      why_it_hurts: 'Signals vague communication and weak evidence of concrete achievements.',
      fix: 'Replace buzzwords with measurable outcomes, owned scope, and delivered metrics.',
    });
  }

  flags.push({
    flag: 'Impact statements appear under-quantified',
    severity: 'Medium',
    why_it_hurts: 'Recruiters struggle to estimate seniority and value without numbers.',
    fix: 'Rewrite top bullets with explicit before/after metrics and business outcomes.',
  });

  if (improvements.length > 0) {
    flags.push({
      flag: improvements[0],
      severity: 'Low',
      why_it_hurts: 'This gap can reduce recruiter confidence in role readiness.',
      fix: 'Address this in the next resume iteration before broad applications.',
    });
  }

  return flags.slice(0, 4);
}

function buildFallbackRecruiterEyePath(params: {
  skillsFound: string[];
  missingSkills: string[];
  overallScore: number;
}): RecruiterEyePath {
  const { skillsFound, missingSkills, overallScore } = params;

  const topSkill = skillsFound[0] ?? 'Role summary';
  const topGap = missingSkills[0] ?? 'Outcome metrics';

  const baseAttention = overallScore >= 70 ? [34, 28, 22, 16] : [38, 27, 21, 14];

  return {
    total_scan_seconds: 7,
    folds: [
      {
        fold: 'Top Fold',
        attention_percent: baseAttention[0],
        first_focus: `Headline + ${topSkill}`,
        recruiter_question: 'Is this candidate immediately role-relevant?',
        fix: 'Keep the first 4 lines role-specific and metric-backed.',
      },
      {
        fold: 'Upper Middle',
        attention_percent: baseAttention[1],
        first_focus: 'Most recent experience bullets',
        recruiter_question: 'Do outcomes show ownership and impact?',
        fix: 'Convert 2 bullets into action + metric + business result format.',
      },
      {
        fold: 'Mid Section',
        attention_percent: baseAttention[2],
        first_focus: 'Skills and project stack alignment',
        recruiter_question: `Are mandatory skills like ${topGap} covered?`,
        fix: 'Mirror JD terms naturally in skills and project evidence.',
      },
      {
        fold: 'Bottom Section',
        attention_percent: baseAttention[3],
        first_focus: 'Education and certifications',
        recruiter_question: 'Is baseline qualification trustworthy and complete?',
        fix: 'Add dates, clear degree/cert names, and relevant credentials.',
      },
    ],
  };
}

function buildFallbackCareerNarrativeGraph(params: {
  resumeText: string;
  experienceYears: number | null;
  skillsFound: string[];
  missingSkills: string[];
  strengths: string[];
  improvements: string[];
}): CareerNarrativeGraph {
  const { resumeText, experienceYears, skillsFound, missingSkills, strengths, improvements } = params;
  const lower = resumeText.toLowerCase();

  const managerSignal = /\b(lead|manager|stakeholder|mentor|ownership|roadmap)\b/i.test(lower) ? 10 : 0;
  const specialistSignal = /\b(architect|optimization|kubernetes|ml|ai|distributed|scalable)\b/i.test(lower) ? 10 : 0;
  const expFactor = Math.min(18, Math.max(0, (experienceYears ?? 0) * 3));

  const icScore = clampScore(56 + expFactor + skillsFound.length * 2 - missingSkills.length * 2);
  const managerScore = clampScore(48 + expFactor + managerSignal + strengths.length * 2 - missingSkills.length * 2);
  const specialistScore = clampScore(50 + expFactor + specialistSignal + skillsFound.length * 1.5 - missingSkills.length * 1.8);

  const tracks: CareerTrackScore[] = [
    {
      track: 'IC',
      readiness_score: icScore,
      evidence: [
        strengths[0] ?? 'Execution-oriented profile strength detected.',
        `Skills coverage supports IC depth (${skillsFound.length} matched).`,
      ],
      gaps: [
        improvements[0] ?? 'Increase measurable ownership impact in top experience bullets.',
      ],
    },
    {
      track: 'Manager',
      readiness_score: managerScore,
      evidence: [
        managerSignal > 0 ? 'Leadership/ownership language is present.' : 'Some collaboration signals are present.',
        strengths[1] ?? 'Cross-functional alignment potential observed.',
      ],
      gaps: [
        'Add direct people/process ownership examples.',
        'Show stakeholder decision trade-offs and business outcomes.',
      ],
    },
    {
      track: 'Specialist',
      readiness_score: specialistScore,
      evidence: [
        specialistSignal > 0 ? 'Deep-technical specialization signals detected.' : 'Technical foundation is present for specialization growth.',
        strengths[2] ?? 'Problem-solving depth can be positioned as specialist value.',
      ],
      gaps: [
        missingSkills[0] ? `Build depth in ${missingSkills[0]}.` : 'Add one advanced depth project with measurable outcomes.',
      ],
    },
  ];

  const primary = tracks.reduce((best, current) =>
    current.readiness_score > best.readiness_score ? current : best
  ).track;

  return {
    primary_track: primary,
    tracks,
  };
}

function buildFallbackJobReachability(params: {
  roleHint: string;
  overallScore: number;
  missingSkills: string[];
  experienceYears: number | null;
}): JobReachabilityScore {
  const { roleHint, overallScore, missingSkills, experienceYears } = params;
  const score = clampScore(overallScore - missingSkills.length * 3 + Math.min(12, (experienceYears ?? 0) * 2));
  const verdict: ReachabilityVerdict =
    score >= 70 ? 'Apply now' : score >= 45 ? 'Upskill first' : 'Stretch';

  return {
    score,
    verdict,
    reasoning: [
      `Current role target considered: ${roleHint}.`,
      `Overall readiness baseline: ${overallScore}% with ${missingSkills.length} key skill gaps.`,
      verdict === 'Apply now'
        ? 'Profile fit is sufficient for immediate applications with minor tuning.'
        : verdict === 'Upskill first'
          ? 'A short upskilling sprint can materially improve shortlist probability.'
          : 'This is a stretch role; apply selectively while building depth in core gaps.',
    ],
    target_gaps: missingSkills.slice(0, 5),
  };
}

function buildFallbackSkillRoiPlanner(params: {
  missingSkills: string[];
  skillsFound: string[];
  predictedLpa: number;
  interviewProbability: number;
}): SkillRoiPlanner {
  const { missingSkills, skillsFound, predictedLpa, interviewProbability } = params;
  const seeded = missingSkills.length
    ? missingSkills
    : ['System Design', 'Cloud', 'Data Storytelling', 'Automation', 'Domain Fundamentals'];

  const skills = seeded.slice(0, 5).map((skill, index) => {
    const upliftBase = Math.max(4, 18 - index * 3);
    const shortlistUplift = Math.max(3, Math.round(upliftBase + Math.max(0, (65 - interviewProbability) / 15)));
    const salaryUplift = roundToSingleDecimal(Math.max(0.4, 2.2 - index * 0.3 + Math.max(0, (predictedLpa - 8) / 20)));
    const effortWeeks = Math.min(16, 4 + index * 2);

    return {
      skill,
      shortlist_uplift_percent: shortlistUplift,
      salary_uplift_lpa: salaryUplift,
      effort_weeks: effortWeeks,
      reason: skillsFound.length
        ? `Closes high-impact role gap while strengthening interview confidence.`
        : `High signal skill for ATS + recruiter shortlist across similar roles.`,
    };
  });

  return {
    recommendation: `Start with ${skills[0]?.skill ?? 'core role skill'} in the next 4 weeks, then stack the next two skills for compounding shortlist and salary gains.`,
    skills,
  };
}

function generateFallbackReport(
  resumeText: string,
  jobDescription?: string,
  semanticRagInsights?: SemanticRagInsights
) {
  const resumeLower = resumeText.toLowerCase();
  const jdLower = (jobDescription ?? '').toLowerCase();
  const jdWords = new Set(jdLower.match(/[a-zA-Z][a-zA-Z0-9+.#-]{1,}/g) ?? []);

  const sectionHints = ['summary', 'experience', 'education', 'skills', 'projects', 'certification'];
  const sectionHits = sectionHints.filter((section) => resumeLower.includes(section)).length;

  const sentenceCount = Math.max(1, (resumeText.match(/[.!?]/g) ?? []).length);
  const wordCount = Math.max(1, (resumeText.match(/\b\w+\b/g) ?? []).length);
  const avgSentenceLength = wordCount / sentenceCount;

  const commonSkills = [
    'javascript',
    'typescript',
    'react',
    'next.js',
    'node.js',
    'python',
    'java',
    'sql',
    'aws',
    'docker',
    'kubernetes',
    'git',
    'rest api',
    'mongodb',
    'postgresql',
    'tailwind',
  ];

  const skillsFound = commonSkills.filter((skill) => resumeLower.includes(skill));
  const missingSkills = commonSkills.filter((skill) => jdLower.includes(skill) && !resumeLower.includes(skill));

  const overlapScore = jdWords.size
    ? (Array.from(jdWords).filter((word) => resumeLower.includes(word)).length / jdWords.size) * 100
    : 65;

  const readabilityScore = clampScore(100 - Math.max(0, (avgSentenceLength - 18) * 3));
  const completenessScore = clampScore(40 + sectionHits * 10 + Math.min(20, skillsFound.length * 2));
  const atsScore = clampScore(overlapScore * 0.6 + skillsFound.length * 3 + sectionHits * 4);
  const overallScore = clampScore((atsScore + readabilityScore + completenessScore) / 3);

  const experienceYears = extractYearsExperience(resumeText);
  const predictedLpa = estimatePredictedSalaryLpa({
    resumeText,
    jobDescription,
    experienceYears,
    skillsFoundCount: skillsFound.length,
    overallScore,
  });

  const bulletLines = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20)
    .slice(0, 3);

  const rewriteSuggestions = bulletLines.map((line) => ({
    original: line,
    improved: `${line.replace(/\.$/, '')} and quantified impact with measurable outcomes (for example, improved KPI by 25%).`,
    reason: 'Adding measurable impact and outcomes makes this line stronger for recruiters and ATS systems.',
  }));

  const jargonBank = ['hardworking', 'go-getter', 'team player', 'synergy', 'dynamic'];
  const jargonDetected = jargonBank.filter((term) => resumeLower.includes(term));

  const recruiterHeatmap = (skillsFound.slice(0, 3).length ? skillsFound.slice(0, 3) : ['projects', 'experience', 'skills']).map(
    (text, idx) => ({
      text,
      impact: idx === 0 ? 'High' : idx === 1 ? 'Medium' : 'Low',
    })
  );

  const recommendations = [
    missingSkills.length
      ? `Add missing job-critical keywords: ${missingSkills.slice(0, 4).join(', ')}.`
      : 'Tailor your resume summary and project bullets for each target role.',
    'Rewrite top 3 experience bullets with action + metric + business impact format.',
    'Keep resume to clear sections and concise achievements to improve ATS parsing.',
    'AI fallback mode was used due to Gemini quota limits; rerun later for full AI report.',
  ];

  const scoreExplainability = buildDefaultScoreExplainability({
    atsScore,
    readabilityScore,
    completenessScore,
    overallScore,
    missingSkillsCount: missingSkills.length,
    wordCount,
  });

  const atsSimulator = buildFallbackAtsSimulator({
    atsScore,
    readabilityScore,
    completenessScore,
    missingSkills,
  });

  const strengths = [
    'Resume has core structure and role-relevant content.',
    skillsFound.length ? `Relevant skills detected: ${skillsFound.slice(0, 4).join(', ')}.` : 'Broad technical exposure appears in the resume text.',
    'Experience narrative is present and can be strengthened with stronger metrics.',
  ];

  const improvements = [
    missingSkills.length
      ? `Missing keyword coverage for target JD: ${missingSkills.slice(0, 4).join(', ')}.`
      : 'Add more explicit role-aligned keywords from the target JD.',
    'Use quantified impact in bullet points (percent, revenue, latency, cost).',
    'Tighten phrasing and avoid generic buzzwords.',
  ];

  const interviewConversionPredictor = buildFallbackInterviewConversion({
    atsScore,
    readabilityScore,
    completenessScore,
    overallScore,
    skillsFound,
    missingSkills,
    strengths,
    improvements,
  });

  const roleHint =
    jobDescription && jobDescription.trim()
      ? (jobDescription.split(/\r?\n/)[0]?.slice(0, 80).trim() || 'Target Role')
      : 'Target Role';

  const idealAskLpa = roundToSingleDecimal(Math.min(95, predictedLpa + (overallScore >= 75 ? 1.6 : 1.1)));
  const acceptableFloorLpa = roundToSingleDecimal(Math.max(3, predictedLpa));
  const walkAwayLpa = roundToSingleDecimal(Math.max(3, predictedLpa - 0.8));

  const offerNegotiationCopilot: OfferNegotiationCopilot = {
    role_hint: roleHint,
    ideal_ask_lpa: idealAskLpa,
    acceptable_floor_lpa: acceptableFloorLpa,
    walk_away_lpa: walkAwayLpa,
    opening_pitch:
      `Based on my fit for ${roleHint}, I am targeting around INR ${idealAskLpa} LPA, backed by role-relevant delivery and measurable outcomes.`,
    value_proofs: [
      `Current profile shows ATS score of ${atsScore}% with ${skillsFound.length} relevant skills detected.`,
      'Resume contains measurable impact language suitable for performance-linked compensation discussion.',
      'Role alignment improves when JD keywords are mapped to proven project outcomes.',
    ],
    objection_handling: [
      {
        objection: 'This is above our current budget band.',
        response:
          `I am open to structuring compensation across fixed and performance components, but I would like total comp aligned near INR ${idealAskLpa} LPA considering impact expectations.`,
      },
      {
        objection: 'We need someone with deeper immediate domain context.',
        response:
          'I can bridge domain ramp-up quickly with a 30-60-90 day execution plan and outcome milestones in the first quarter.',
      },
      {
        objection: 'Can you be flexible on numbers?',
        response:
          `Yes, I can be flexible within a fair range, though I would prefer not to go below INR ${acceptableFloorLpa} LPA given role scope and deliverables.`,
      },
    ],
    closing_line:
      'I am excited about the role and ready to move quickly if we can align compensation with expected business impact.',
  };

  const primaryMissing = missingSkills.slice(0, 4);
  const applicationPackGenerator: ApplicationPackGenerator = {
    tailored_summary:
      `Results-focused candidate with ${experienceYears ?? 'relevant'} years of experience, strong execution in ${skillsFound.slice(0, 3).join(', ') || 'core technical delivery'}, and proven ability to ship measurable outcomes aligned to ${roleHint}.`,
    cover_letter:
      `Dear Hiring Manager,\n\nI am writing to express interest in the ${roleHint} opportunity. My background combines practical execution, outcome-focused delivery, and strong alignment with your role needs. I have consistently translated requirements into measurable results and can contribute quickly to your team's goals.\n\nI would value the opportunity to discuss how my profile can support immediate priorities and longer-term growth.\n\nSincerely,\n[Your Name]`,
    recruiter_email:
      `Subject: Application for ${roleHint}\n\nHi Recruiter,\n\nI am applying for the ${roleHint} role. My profile aligns well with your requirements, especially in ${skillsFound.slice(0, 2).join(' and ') || 'core role skills'}. I am attaching my resume for review and would appreciate the opportunity to discuss next steps.\n\nThanks,\n[Your Name]`,
    linkedin_dm:
      `Hi, I came across the ${roleHint} opening and found it strongly aligned with my background. I have hands-on experience delivering measurable outcomes and would love to be considered. Happy to share my resume if helpful.`,
    interview_pitch_30s:
      `I am a results-oriented professional with ${experienceYears ?? 'solid'} years of experience and a strong track record in ${skillsFound.slice(0, 2).join(' and ') || 'role-relevant skills'}. I focus on shipping practical outcomes, improving efficiency, and aligning execution with business goals.`,
    ats_keyword_checklist: primaryMissing.length
      ? primaryMissing
      : ['Role title keyword', 'Top JD tools', 'Domain terms', 'Impact metrics'],
  };

  const jobTailoredResumeVariants = buildFallbackJobTailoredVariants({
    roleHint,
    strengths,
    skillsFound,
    missingSkills,
  });

  const hiddenRedFlags = buildFallbackHiddenRedFlags({
    missingSkills,
    jargonDetected,
    improvements,
  });
  const recruiterEyePath = buildFallbackRecruiterEyePath({
    skillsFound,
    missingSkills,
    overallScore,
  });
  const careerNarrativeGraph = buildFallbackCareerNarrativeGraph({
    resumeText,
    experienceYears,
    skillsFound,
    missingSkills,
    strengths,
    improvements,
  });
  const jobReachabilityScore = buildFallbackJobReachability({
    roleHint,
    overallScore,
    missingSkills,
    experienceYears,
  });
  const skillRoiPlanner = buildFallbackSkillRoiPlanner({
    missingSkills,
    skillsFound,
    predictedLpa,
    interviewProbability: interviewConversionPredictor.probability_percent,
  });
  const resolvedSemanticRagInsights = semanticRagInsights ?? buildHeuristicSemanticRagInsights(resumeText, jobDescription);

  const salaryAssumptions = [
    `Experience inferred from resume text: ${experienceYears ?? 'not explicitly stated'} years.`,
    `Role-fit signals considered: ${skillsFound.length} relevant skills and ${missingSkills.length} missing JD skills.`,
    `Score baseline used in estimate: overall ${overallScore}% with ATS ${atsScore}%.`,
    'Estimate assumes metro India market and base-to-mid cash component.',
  ];

  return {
    ats_score: atsScore,
    readability_score: readabilityScore,
    completeness_score: completenessScore,
    overall_score: overallScore,
    experience_years: experienceYears,
    salary: {
      predicted_lpa: predictedLpa,
      rationale:
        'Estimated from experience depth, skill coverage, and overall resume strength in current hiring market conditions.',
      confidence: 'Medium',
      assumptions: salaryAssumptions,
      negotiation_tips: [
        'Anchor discussion with role impact and measurable achievements.',
        'State one clear target number and justify it with outcomes.',
        'Negotiate total compensation, not just fixed pay.',
      ],
    },
    score_explainability: scoreExplainability,
    ats_simulator: atsSimulator,
    job_tailored_resume_variants: jobTailoredResumeVariants,
    hidden_red_flag_detector: hiddenRedFlags,
    interview_conversion_predictor: interviewConversionPredictor,
    offer_negotiation_copilot: offerNegotiationCopilot,
    application_pack_generator: applicationPackGenerator,
    strengths,
    improvements,
    skills_found: skillsFound,
    missing_skills: missingSkills,
    recommendations: recommendations.slice(0, 3),
    rewrite_suggestions: rewriteSuggestions,
    semantic_rag_insights: resolvedSemanticRagInsights,
    recruiter_eye_path: recruiterEyePath,
    recruiter_heatmap: recruiterHeatmap,
    career_narrative_graph: careerNarrativeGraph,
    job_reachability_score: jobReachabilityScore,
    skill_roi_planner: skillRoiPlanner,
    tone_analysis: {
      dominant_tone: skillsFound.length >= 3 ? 'Confident' : 'Vague',
      reasoning:
        skillsFound.length >= 3
          ? 'The resume uses concrete technical terms and role-focused content.'
          : 'The resume can be more specific with technical depth and measurable outcomes.',
    },
    story_arc: {
      trajectory:
        experienceYears && experienceYears > 3
          ? 'Shows steady progression, but leadership and business impact can be highlighted more clearly.'
          : 'Shows early-to-mid growth potential; add stronger project outcomes for a sharper narrative.',
      cohesiveness_score: clampScore(55 + sectionHits * 6),
    },
    jargon_detected: jargonDetected,
    emotion_score: {
      confidence: clampScore(50 + skillsFound.length * 4),
      humility: 58,
      ambition: clampScore(55 + sectionHits * 5),
    },
  };
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as {
      resumeText?: string;
      jobDescription?: string;
      premiumEnabled?: boolean;
    };

    const resumeText = typeof payload.resumeText === 'string' ? payload.resumeText : '';
    const jobDescription = typeof payload.jobDescription === 'string' ? payload.jobDescription : '';
    const premiumRequested = payload.premiumEnabled !== false;

    if (!resumeText) {
      return NextResponse.json({ error: 'Resume text is required' }, { status: 400 });
    }

    const missingCoreSections = detectMissingCoreSections(resumeText);
    if (missingCoreSections.length > 0) {
      return NextResponse.json(
        {
          error:
            'Resume structure is incomplete. Please make your resume properly before analysis.',
          missingSections: missingCoreSections,
          exampleResumeTextTemplate: getExampleResumeTextTemplate(),
        },
        { status: 422 }
      );
    }

    const authConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const authenticatedUser = await getAuthenticatedUserWithTier(req);
    const authenticatedUserId = authenticatedUser?.userId ?? null;
    const subscriptionTier: SubscriptionTier = authenticatedUser?.tier ?? 'free';

    if (authConfigured && !authenticatedUser) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in and try again.' },
        { status: 401 }
      );
    }

    let accessResolutionPromise:
      | Promise<{
          tier: SubscriptionTier;
          proUnlocked: boolean;
          premiumUnlocked: boolean;
          priorityModel: boolean;
          remainingCredits: number | null;
          premiumMessage: string | null;
        }>
      | null = null;

    const resolveFeatureAccess = async () => {
      if (accessResolutionPromise) {
        return accessResolutionPromise;
      }

      accessResolutionPromise = (async () => {
        const tierAccess = getTierFeatureAccess(subscriptionTier);

        if (!premiumRequested) {
          return {
            tier: subscriptionTier,
            proUnlocked: false,
            premiumUnlocked: false,
            priorityModel: false,
            remainingCredits: null,
            premiumMessage: null,
          };
        }

        if (!authConfigured || !authenticatedUserId) {
          return {
            tier: authConfigured ? 'free' : subscriptionTier,
            proUnlocked: false,
            premiumUnlocked: false,
            priorityModel: false,
            remainingCredits: null,
            premiumMessage: authConfigured
              ? 'Pro insights are locked. Please log in with an active Pro or Premium subscription.'
              : 'Pro insights are locked. Configure auth and use a Pro or Premium subscription.',
          };
        }

        if (subscriptionTier === 'pro' || subscriptionTier === 'premium') {
          return {
            tier: subscriptionTier,
            proUnlocked: tierAccess.proUnlocked,
            premiumUnlocked: tierAccess.premiumUnlocked,
            priorityModel: tierAccess.priorityModel,
            remainingCredits: null,
            premiumMessage:
              subscriptionTier === 'premium'
                ? 'Premium subscription active. Premium features unlocked.'
                : 'Pro subscription active. Pro features unlocked.',
          };
        }

        return {
          tier: 'free' as SubscriptionTier,
          proUnlocked: false,
          premiumUnlocked: false,
          priorityModel: false,
          remainingCredits: null,
          premiumMessage:
            'Free tier has basic access only. Upgrade to Pro or Premium to unlock advanced modules.',
        };
      })();

      return accessResolutionPromise;
    };

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY is not set.' }, 
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const semanticRagInsights = await buildSemanticRagInsights({
      genAI,
      resumeText,
      jobDescription,
      userId: authenticatedUserId,
    });

    const userMessage = `Resume:\n${resumeText.slice(0, 4000)}${jobDescription ? '\n\nJob Description:\n' + jobDescription.slice(0, 2000) : ''}`;

    const systemInstruction = `You are an elite, highly experienced resume analyst, career coach, and recruiter for top tier tech and fortune 500 companies. Analyse the resume and return exactly a JSON object with this exact structure:
{
  "ats_score": number (0-100),
  "readability_score": number (0-100),
  "completeness_score": number (0-100),
  "overall_score": number (0-100),
  "experience_years": number or null,
  "salary": {
    "predicted_lpa": number,
    "rationale": "1-2 sentences explaining why",
    "confidence": "Low" | "Medium" | "High",
    "assumptions": ["a1", "a2", "a3", "a4"],
    "negotiation_tips": ["tip1", "tip2", "tip3"]
  },
  "score_explainability": {
    "ats_score": {"reason": "exact reason", "priority": "High" | "Medium" | "Low", "fix": "specific fix"},
    "readability_score": {"reason": "exact reason", "priority": "High" | "Medium" | "Low", "fix": "specific fix"},
    "completeness_score": {"reason": "exact reason", "priority": "High" | "Medium" | "Low", "fix": "specific fix"},
    "overall_score": {"reason": "exact reason", "priority": "High" | "Medium" | "Low", "fix": "specific fix"}
  },
  "ats_simulator": [
    {
      "platform": "Greenhouse" | "Lever" | "Workday",
      "score": number (0-100),
      "status": "Strong" | "Average" | "Weak",
      "reason": "one sentence",
      "top_fixes": ["fix1", "fix2", "fix3"]
    }
  ],
  "job_tailored_resume_variants": [
    {
      "title": "variant name",
      "summary": "what this variant optimizes",
      "focus_skills": ["s1", "s2", "s3"],
      "highlight_bullets": ["b1", "b2", "b3"]
    }
  ],
  "hidden_red_flag_detector": [
    {
      "flag": "specific risk",
      "severity": "High" | "Medium" | "Low",
      "why_it_hurts": "one sentence",
      "fix": "specific fix"
    }
  ],
  "interview_conversion_predictor": {
    "probability_percent": number (0-100),
    "band": "Low" | "Medium" | "High",
    "confidence": "Low" | "Medium" | "High",
    "key_drivers": ["d1", "d2", "d3"],
    "key_risks": ["r1", "r2", "r3"],
    "next_actions": ["a1", "a2", "a3", "a4"]
  },
  "offer_negotiation_copilot": {
    "role_hint": "target role name",
    "ideal_ask_lpa": number,
    "acceptable_floor_lpa": number,
    "walk_away_lpa": number,
    "opening_pitch": "2-3 line negotiation opener",
    "value_proofs": ["p1", "p2", "p3"],
    "objection_handling": [
      {"objection": "o1", "response": "r1"},
      {"objection": "o2", "response": "r2"},
      {"objection": "o3", "response": "r3"}
    ],
    "closing_line": "short confident close"
  },
  "application_pack_generator": {
    "tailored_summary": "4-6 lines profile summary",
    "cover_letter": "ready-to-send concise cover letter",
    "recruiter_email": "short recruiter mail draft with subject",
    "linkedin_dm": "short outreach DM",
    "interview_pitch_30s": "30 second pitch",
    "ats_keyword_checklist": ["k1", "k2", "k3", "k4"]
  },
  "strengths": ["s1", "s2", "s3"],
  "improvements": ["i1", "i2", "i3"],
  "skills_found": ["sk1", "sk2", "sk3"],
  "missing_skills": ["m1", "m2", "m3"],
  "recommendations": ["r1", "r2", "r3"],
  "rewrite_suggestions": [
     {
       "original": "single weak bullet line found in resume (max 220 chars)",
       "improved": "single strong rewritten bullet line for the same point (max 220 chars)",
       "reason": "short string explaining why the improved version is better"
     }
  ],
  "recruiter_eye_path": {
    "total_scan_seconds": 7,
    "folds": [
      {
        "fold": "Top Fold" | "Upper Middle" | "Mid Section" | "Bottom Section",
        "attention_percent": number (0-100),
        "first_focus": "what recruiter sees first",
        "recruiter_question": "screening question",
        "fix": "specific fix"
      }
    ]
  },
  "recruiter_heatmap": [
     {"text": "A tiny snippet or buzzword from the resume that catches the eye immediately", "impact": "High" | "Medium" | "Low"}
  ],
  "career_narrative_graph": {
    "primary_track": "IC" | "Manager" | "Specialist",
    "tracks": [
      {
        "track": "IC" | "Manager" | "Specialist",
        "readiness_score": number (0-100),
        "evidence": ["e1", "e2"],
        "gaps": ["g1", "g2"]
      }
    ]
  },
  "job_reachability_score": {
    "score": number (0-100),
    "verdict": "Apply now" | "Upskill first" | "Stretch",
    "reasoning": ["r1", "r2", "r3"],
    "target_gaps": ["gap1", "gap2"]
  },
  "skill_roi_planner": {
    "recommendation": "one line plan",
    "skills": [
      {
        "skill": "skill name",
        "shortlist_uplift_percent": number,
        "salary_uplift_lpa": number,
        "effort_weeks": number,
        "reason": "why this skill is high ROI"
      }
    ]
  },
  "semantic_rag_insights": {
    "semantic_match_score": number (0-100),
    "coverage_summary": "1 sentence summary of semantic coverage",
    "missing_intents": ["intent1", "intent2", "intent3"],
    "top_evidence": [
      {
        "snippet": "short resume snippet that supports alignment",
        "similarity_score": number (0-100),
        "why_it_matters": "why this snippet matters for the target role",
        "source": "resume" | "job_description"
      }
    ],
    "retrieval_mode": "embedding" | "heuristic",
    "embedding_provider": "huggingface-sentence-transformers" | "gemini" | null
  },
  "tone_analysis": {
    "dominant_tone": "Confident" | "Aggressive" | "Passive" | "Vague",
    "reasoning": "1 sentence explanation"
  },
  "story_arc": {
    "trajectory": "1-2 sentences summarizing the narrative arc of their career (e.g. 'Steady technical growth but lacks leadership transitions')",
    "cohesiveness_score": number (0-100)
  },
  "jargon_detected": ["outdated buzzwords found like 'go-getter', 'synergy'"],
  "emotion_score": {
    "confidence": number (0-100),
    "humility": number (0-100),
    "ambition": number (0-100)
  }
}
Be highly realistic, critical, and objective.
Important: rewrite_suggestions must contain only specific line-level rewrites, never full paragraph or full resume text.
Important: ats_simulator must include exactly 3 entries for Greenhouse, Lever, and Workday.
Important: job_tailored_resume_variants should include exactly 3 compact variants with practical bullet guidance.
Important: hidden_red_flag_detector should include subtle recruiter concerns, not generic resume tips.
Important: interview_conversion_predictor should estimate realistic interview-call likelihood, not generic optimism.
Important: offer_negotiation_copilot should be practical and realistic for India salary discussions.
Important: application_pack_generator content should be concise, role-specific, and ready to send with minimal edits.
Important: recruiter_eye_path must be fold-by-fold and realistic for a 7-second recruiter scan.
Important: career_narrative_graph must include IC/Manager/Specialist readiness scores.
Important: job_reachability_score must output only one verdict from Apply now / Upskill first / Stretch.
Important: skill_roi_planner must prioritize high-ROI skills with realistic effort and uplift.
Important: semantic_rag_insights must be grounded in resume and JD evidence only; do not fabricate snippets.
Important: salary.predicted_lpa must be exactly one resume-specific number in LPA. Never return min/max salary range.`;

    let responseText = '';
  let selectedModelName: string | null = null;
    let lastModelError: Error | null = null;
    let lastQuotaRetrySeconds: number | null = null;
    let sawQuotaError = false;

    for (const modelName of DEFAULT_MODEL_CANDIDATES) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
        });

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        responseText = result.response.text();
        selectedModelName = modelName;
        break;
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);
        if (isQuotaExceededError(errMessage)) {
          sawQuotaError = true;
          lastModelError = error instanceof Error ? error : new Error(errMessage);
          const retryAfterSeconds = extractRetryAfterSeconds(errMessage);
          if (retryAfterSeconds) {
            lastQuotaRetrySeconds = retryAfterSeconds;
          }
          continue;
        }

        if (isModelUnavailableError(errMessage)) {
          lastModelError = error instanceof Error ? error : new Error(errMessage);
          continue;
        }
        throw error;
      }
    }

    if (!responseText) {
      if (sawQuotaError) {
        const fallbackReport = generateFallbackReport(resumeText, jobDescription, semanticRagInsights);
        const accessState = await resolveFeatureAccess();

        const premiumAwareFallback = {
          ...fallbackReport,
          subscription_tier: accessState.tier,
          pro_unlocked: accessState.proUnlocked,
          premium_unlocked: accessState.premiumUnlocked,
          priority_model: accessState.priorityModel
            ? {
                enabled: true,
                model: selectedModelName ?? DEFAULT_MODEL_CANDIDATES[0] ?? 'gemini-priority',
              }
            : null,
          ats_simulator: accessState.proUnlocked ? fallbackReport.ats_simulator : [],
          job_tailored_resume_variants: accessState.proUnlocked
            ? fallbackReport.job_tailored_resume_variants
            : [],
          hidden_red_flag_detector: accessState.proUnlocked
            ? fallbackReport.hidden_red_flag_detector
            : [],
          recruiter_eye_path: accessState.proUnlocked ? fallbackReport.recruiter_eye_path : null,
          interview_conversion_predictor: accessState.premiumUnlocked
            ? fallbackReport.interview_conversion_predictor
            : null,
          offer_negotiation_copilot: accessState.premiumUnlocked
            ? fallbackReport.offer_negotiation_copilot
            : null,
          application_pack_generator: accessState.premiumUnlocked
            ? fallbackReport.application_pack_generator
            : null,
          career_narrative_graph: accessState.premiumUnlocked
            ? fallbackReport.career_narrative_graph
            : null,
          job_reachability_score: accessState.premiumUnlocked
            ? fallbackReport.job_reachability_score
            : null,
          skill_roi_planner: accessState.premiumUnlocked
            ? fallbackReport.skill_roi_planner
            : null,
        };

        return NextResponse.json(
          {
            ...premiumAwareFallback,
            remaining_credits: accessState.remainingCredits,
            premium_message: accessState.premiumMessage,
            recommendations: [
              ...fallbackReport.recommendations.slice(0, 2),
              accessState.proUnlocked
                ? 'Gemini quota exceeded, so this report was generated in fallback mode. Enable billing or retry later for full AI quality.'
                : 'Pro insights are locked on free tier. Upgrade to Pro or Premium to unlock ATS simulator and resume variants.',
            ],
          },
          {
            status: 200,
            headers: {
              'X-Analysis-Mode': 'heuristic-fallback',
              'Retry-After': String(lastQuotaRetrySeconds ?? 60),
            },
          }
        );
      }

      const detail = lastModelError?.message ?? 'No compatible Gemini model found';
      throw new Error(
        `Configured Gemini model is unavailable. Set GEMINI_MODEL in .env.local to a supported model. Details: ${detail}`
      );
    }

    const parsedResponse = JSON.parse(responseText) as Record<string, unknown>;
    delete parsedResponse.tough_questions;
    const fallbackReport = generateFallbackReport(resumeText, jobDescription, semanticRagInsights);
    const wordCount = Math.max(1, (resumeText.match(/\b\w+\b/g) ?? []).length);
    const modelAts = typeof parsedResponse.ats_score === 'number' ? parsedResponse.ats_score : fallbackReport.ats_score;
    const modelReadability =
      typeof parsedResponse.readability_score === 'number'
        ? parsedResponse.readability_score
        : fallbackReport.readability_score;
    const modelCompleteness =
      typeof parsedResponse.completeness_score === 'number'
        ? parsedResponse.completeness_score
        : fallbackReport.completeness_score;
    const modelOverall =
      typeof parsedResponse.overall_score === 'number'
        ? parsedResponse.overall_score
        : fallbackReport.overall_score;
    const modelMissingSkillsCount = Array.isArray(parsedResponse.missing_skills)
      ? parsedResponse.missing_skills.filter((item): item is string => typeof item === 'string').length
      : fallbackReport.missing_skills.length;
    const modelMissingSkills = Array.isArray(parsedResponse.missing_skills)
      ? parsedResponse.missing_skills.filter((item): item is string => typeof item === 'string')
      : fallbackReport.missing_skills;
    const modelSkillsFound = Array.isArray(parsedResponse.skills_found)
      ? parsedResponse.skills_found.filter((item): item is string => typeof item === 'string')
      : fallbackReport.skills_found;
    const modelStrengths = Array.isArray(parsedResponse.strengths)
      ? parsedResponse.strengths.filter((item): item is string => typeof item === 'string')
      : fallbackReport.strengths;
    const modelImprovements = Array.isArray(parsedResponse.improvements)
      ? parsedResponse.improvements.filter((item): item is string => typeof item === 'string')
      : fallbackReport.improvements;

    const fallbackExplainability = buildDefaultScoreExplainability({
      atsScore: modelAts,
      readabilityScore: modelReadability,
      completenessScore: modelCompleteness,
      overallScore: modelOverall,
      missingSkillsCount: modelMissingSkillsCount,
      wordCount,
    });

    const fallbackAtsSimulator = buildFallbackAtsSimulator({
      atsScore: modelAts,
      readabilityScore: modelReadability,
      completenessScore: modelCompleteness,
      missingSkills: modelMissingSkills,
    });

    const fallbackInterviewConversion = buildFallbackInterviewConversion({
      atsScore: modelAts,
      readabilityScore: modelReadability,
      completenessScore: modelCompleteness,
      overallScore: modelOverall,
      skillsFound: modelSkillsFound,
      missingSkills: modelMissingSkills,
      strengths: modelStrengths,
      improvements: modelImprovements,
    });
    const roleHint =
      jobDescription && jobDescription.trim()
        ? (jobDescription.split(/\r?\n/)[0]?.slice(0, 80).trim() || 'Target Role')
        : 'Target Role';
    const fallbackVariants = buildFallbackJobTailoredVariants({
      roleHint,
      strengths: modelStrengths,
      skillsFound: modelSkillsFound,
      missingSkills: modelMissingSkills,
    });
    const fallbackRedFlags = buildFallbackHiddenRedFlags({
      missingSkills: modelMissingSkills,
      jargonDetected: Array.isArray(parsedResponse.jargon_detected)
        ? parsedResponse.jargon_detected.filter((item): item is string => typeof item === 'string')
        : fallbackReport.jargon_detected,
      improvements: modelImprovements,
    });
    const fallbackOfferNegotiation = fallbackReport.offer_negotiation_copilot as OfferNegotiationCopilot;
    const fallbackApplicationPack = fallbackReport.application_pack_generator as ApplicationPackGenerator;
    const fallbackRecruiterEyePath = fallbackReport.recruiter_eye_path as RecruiterEyePath;
    const fallbackCareerNarrativeGraph = fallbackReport.career_narrative_graph as CareerNarrativeGraph;
    const fallbackJobReachability = fallbackReport.job_reachability_score as JobReachabilityScore;
    const fallbackSkillRoiPlanner = fallbackReport.skill_roi_planner as SkillRoiPlanner;
    const fallbackSemanticRagInsights = fallbackReport.semantic_rag_insights as SemanticRagInsights;
    const accessState = await resolveFeatureAccess();

    const responsePayload: Record<string, unknown> = {
      ...parsedResponse,
      subscription_tier: accessState.tier,
      pro_unlocked: accessState.proUnlocked,
      premium_unlocked: accessState.premiumUnlocked,
      remaining_credits: accessState.remainingCredits,
      premium_message: accessState.premiumMessage,
      priority_model: accessState.priorityModel
        ? {
            enabled: true,
            model: selectedModelName ?? DEFAULT_MODEL_CANDIDATES[0] ?? 'gemini-priority',
          }
        : null,
      score_explainability: normalizeScoreExplainability(parsedResponse.score_explainability, fallbackExplainability),
      salary: normalizeSalaryPayload(
        parsedResponse.salary,
        fallbackReport.salary.predicted_lpa,
        fallbackReport.salary.assumptions
      ),
      semantic_rag_insights: normalizeSemanticRagInsightsPayload(
        parsedResponse.semantic_rag_insights,
        fallbackSemanticRagInsights
      ),
    };

    if (accessState.proUnlocked) {
      responsePayload.ats_simulator = normalizeAtsSimulatorPayload(parsedResponse.ats_simulator, fallbackAtsSimulator);
      responsePayload.job_tailored_resume_variants = normalizeVariantPayload(
        parsedResponse.job_tailored_resume_variants,
        fallbackVariants
      );
      responsePayload.hidden_red_flag_detector = normalizeRedFlagPayload(
        parsedResponse.hidden_red_flag_detector,
        fallbackRedFlags
      );
      responsePayload.recruiter_eye_path = normalizeRecruiterEyePathPayload(
        parsedResponse.recruiter_eye_path,
        fallbackRecruiterEyePath
      );
    } else {
      responsePayload.ats_simulator = [];
      responsePayload.job_tailored_resume_variants = [];
      responsePayload.hidden_red_flag_detector = [];
      responsePayload.recruiter_eye_path = null;
    }

    if (accessState.premiumUnlocked) {
      responsePayload.interview_conversion_predictor = normalizeInterviewConversionPayload(
        parsedResponse.interview_conversion_predictor,
        fallbackInterviewConversion
      );
      responsePayload.offer_negotiation_copilot = normalizeOfferNegotiationPayload(
        parsedResponse.offer_negotiation_copilot,
        fallbackOfferNegotiation
      );
      responsePayload.application_pack_generator = normalizeApplicationPackPayload(
        parsedResponse.application_pack_generator,
        fallbackApplicationPack
      );
      responsePayload.career_narrative_graph = normalizeCareerNarrativeGraphPayload(
        parsedResponse.career_narrative_graph,
        fallbackCareerNarrativeGraph
      );
      responsePayload.job_reachability_score = normalizeJobReachabilityPayload(
        parsedResponse.job_reachability_score,
        fallbackJobReachability
      );
      responsePayload.skill_roi_planner = normalizeSkillRoiPayload(
        parsedResponse.skill_roi_planner,
        fallbackSkillRoiPlanner
      );
    } else {
      responsePayload.interview_conversion_predictor = null;
      responsePayload.offer_negotiation_copilot = null;
      responsePayload.application_pack_generator = null;
      responsePayload.career_narrative_graph = null;
      responsePayload.job_reachability_score = null;
      responsePayload.skill_roi_planner = null;
    }

    return NextResponse.json(responsePayload);

  } catch (error: unknown) {
    console.error('API Error:', error);
    const errMessage = error instanceof Error ? error.message : 'Error occurred while processing request';

    if (isQuotaExceededError(errMessage)) {
      const retryAfterSeconds = extractRetryAfterSeconds(errMessage) ?? 60;
      return NextResponse.json(
        {
          error:
            'Gemini API quota exceeded. Please wait and retry, or configure a billed API key/project.',
          details: errMessage,
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }

    return NextResponse.json(
      { error: errMessage }, 
      { status: 500 }
    );
  }
}
