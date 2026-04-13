"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import CreditPlansCard from "@/components/CreditPlansCard";
import { supabase } from "@/lib/supabase";
import { 
  ArrowLeft, CheckCircle2, XCircle, TrendingUp, Sparkles, 
  Coins, Eye, Activity, History, AlertTriangle, Flame, Building2, Gauge, Rocket, LineChart, Lock, Target
} from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { getLocalHistory, type HistoryRecord } from "@/utils/historyStore";
import { getCreditWallet, setCreditWallet, syncCreditWalletFromServer } from "@/utils/creditWallet";
import { type SubscriptionTier } from "@/lib/subscriptionPlans";

type RewriteSuggestion = {
  original: string;
  improved: string;
  reason: string;
};

type SalaryPayload = {
  predicted_lpa?: unknown;
  min_lpa?: unknown;
  max_lpa?: unknown;
  rationale?: unknown;
  confidence?: unknown;
  assumptions?: unknown;
  negotiation_tips?: unknown;
};

type ScorePriority = "High" | "Medium" | "Low";

type ScoreExplainabilityEntry = {
  reason: string;
  fix: string;
  priority: ScorePriority;
};

type AtsPlatformStatus = "Strong" | "Average" | "Weak";

type AtsSimulatorItem = {
  platform: "Greenhouse" | "Lever" | "Workday";
  score: number;
  status: AtsPlatformStatus;
  reason: string;
  top_fixes: string[];
};

type InterviewConversionPredictor = {
  probability_percent: number;
  band: "Low" | "Medium" | "High";
  confidence: "Low" | "Medium" | "High";
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
  objection_handling: Array<{ objection: string; response: string }>;
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
  severity: "High" | "Medium" | "Low";
  why_it_hurts: string;
  fix: string;
};

type ConversionTrendPoint = {
  label: string;
  probability: number;
};

type RecruiterHeatmapItem = {
  text: string;
  impact: "High" | "Medium" | "Low";
};

type RecruiterEyePathFold = {
  fold: "Top Fold" | "Upper Middle" | "Mid Section" | "Bottom Section";
  attention_percent: number;
  first_focus: string;
  recruiter_question: string;
  fix: string;
};

type RecruiterEyePath = {
  total_scan_seconds: number;
  folds: RecruiterEyePathFold[];
};

type CareerTrack = "IC" | "Manager" | "Specialist";

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

type ReachabilityVerdict = "Apply now" | "Upskill first" | "Stretch";

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

type SemanticRagEvidenceItem = {
  snippet: string;
  similarity_score: number;
  why_it_matters: string;
  source: "resume" | "job_description";
};

type SemanticRagInsights = {
  semantic_match_score: number;
  coverage_summary: string;
  missing_intents: string[];
  top_evidence: SemanticRagEvidenceItem[];
  retrieval_mode: "embedding" | "heuristic";
};

type AnalysisReport = {
  ats_score?: number;
  readability_score?: number;
  completeness_score?: number;
  overall_score?: number;
  experience_years?: number | null;
  subscription_tier?: SubscriptionTier;
  pro_unlocked?: boolean;
  premium_unlocked?: boolean;
  premium_message?: string;
  remaining_credits?: number;
  priority_model?: { enabled?: boolean; model?: string } | null;
  salary?: SalaryPayload;
  score_explainability?: Record<string, unknown>;
  ats_simulator?: unknown;
  job_tailored_resume_variants?: unknown;
  hidden_red_flag_detector?: unknown;
  interview_conversion_predictor?: unknown;
  offer_negotiation_copilot?: unknown;
  application_pack_generator?: unknown;
  strengths?: string[];
  improvements?: string[];
  skills_found?: string[];
  missing_skills?: string[];
  recommendations?: string[];
  rewrite_suggestions?: unknown;
  recruiter_eye_path?: unknown;
  recruiter_heatmap?: Array<{ text?: unknown; impact?: unknown }>;
  career_narrative_graph?: unknown;
  job_reachability_score?: unknown;
  skill_roi_planner?: unknown;
  semantic_rag_insights?: unknown;
  tone_analysis?: { dominant_tone?: string; reasoning?: string };
  emotion_score?: { confidence?: number; humility?: number; ambition?: number };
  jargon_detected?: string[];
  story_arc?: { trajectory?: string; cohesiveness_score?: number };
  [key: string]: unknown;
};

function getPredictedSalaryLpa(salary: unknown): number | null {
  if (!salary || typeof salary !== "object") {
    return null;
  }

  const payload = salary as SalaryPayload;
  const predicted = typeof payload.predicted_lpa === "number" ? payload.predicted_lpa : null;

  if (predicted !== null && Number.isFinite(predicted)) {
    return Math.round(predicted * 10) / 10;
  }

  const min = typeof payload.min_lpa === "number" ? payload.min_lpa : null;
  const max = typeof payload.max_lpa === "number" ? payload.max_lpa : null;

  if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max)) {
    return Math.round(((min + max) / 2) * 10) / 10;
  }

  return null;
}

function normalizeScorePriority(value: unknown): ScorePriority | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "high") {
    return "High";
  }

  if (normalized === "medium") {
    return "Medium";
  }

  if (normalized === "low") {
    return "Low";
  }

  return null;
}

function priorityStyles(priority: ScorePriority): string {
  if (priority === "High") {
    return "bg-rose-500/15 text-rose-600";
  }

  if (priority === "Medium") {
    return "bg-amber-500/15 text-amber-600";
  }

  return "bg-green-500/15 text-green-600";
}

function atsStatusStyles(status: AtsPlatformStatus): string {
  if (status === "Strong") {
    return "bg-green-500/15 text-green-600";
  }

  if (status === "Average") {
    return "bg-amber-500/15 text-amber-600";
  }

  return "bg-rose-500/15 text-rose-600";
}

function conversionBandStyles(band: "Low" | "Medium" | "High"): string {
  if (band === "High") {
    return "bg-green-500/15 text-green-600";
  }

  if (band === "Medium") {
    return "bg-amber-500/15 text-amber-600";
  }

  return "bg-rose-500/15 text-rose-600";
}

function redFlagSeverityStyles(severity: HiddenRedFlag["severity"]): string {
  if (severity === "High") {
    return "bg-rose-500/15 text-rose-600";
  }

  if (severity === "Medium") {
    return "bg-amber-500/15 text-amber-600";
  }

  return "bg-slate-500/15 text-slate-600";
}

function normalizeAtsStatus(value: unknown): AtsPlatformStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "strong") {
    return "Strong";
  }

  if (normalized === "average") {
    return "Average";
  }

  if (normalized === "weak") {
    return "Weak";
  }

  return null;
}

function normalizeInterviewBand(value: unknown): "Low" | "Medium" | "High" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "high") {
    return "High";
  }

  if (normalized === "medium") {
    return "Medium";
  }

  if (normalized === "low") {
    return "Low";
  }

  return null;
}

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeAtsSimulator(
  raw: unknown,
  fallback: AtsSimulatorItem[]
): AtsSimulatorItem[] {
  if (!Array.isArray(raw)) {
    return fallback;
  }

  const validPlatforms: AtsSimulatorItem["platform"][] = ["Greenhouse", "Lever", "Workday"];
  const mapped = new Map<AtsSimulatorItem["platform"], AtsSimulatorItem>();

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const platform =
      typeof candidate.platform === "string" && validPlatforms.includes(candidate.platform as AtsSimulatorItem["platform"])
        ? (candidate.platform as AtsSimulatorItem["platform"])
        : null;

    if (!platform) {
      continue;
    }

    const fallbackItem = fallback.find((entry) => entry.platform === platform);
    if (!fallbackItem) {
      continue;
    }

    const score =
      typeof candidate.score === "number" && Number.isFinite(candidate.score)
        ? Math.max(0, Math.min(100, Math.round(candidate.score)))
        : fallbackItem.score;

    const status = normalizeAtsStatus(candidate.status) ?? (score >= 75 ? "Strong" : score >= 55 ? "Average" : "Weak");
    const reason =
      typeof candidate.reason === "string" && candidate.reason.trim()
        ? candidate.reason.trim()
        : fallbackItem.reason;
    const topFixes = normalizeStringList(candidate.top_fixes, 3);

    mapped.set(platform, {
      platform,
      score,
      status,
      reason,
      top_fixes: topFixes.length ? topFixes : fallbackItem.top_fixes,
    });
  }

  return validPlatforms.map((platform) => mapped.get(platform) ?? fallback.find((entry) => entry.platform === platform)!);
}

function normalizeInterviewConversion(
  raw: unknown,
  fallback: InterviewConversionPredictor
): InterviewConversionPredictor {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const probability =
    typeof source.probability_percent === "number" && Number.isFinite(source.probability_percent)
      ? Math.max(0, Math.min(100, Math.round(source.probability_percent)))
      : fallback.probability_percent;

  const band = normalizeInterviewBand(source.band) ?? (probability >= 65 ? "High" : probability >= 40 ? "Medium" : "Low");
  const confidence = normalizeInterviewBand(source.confidence) ?? fallback.confidence;

  const drivers = normalizeStringList(source.key_drivers, 3);
  const risks = normalizeStringList(source.key_risks, 3);
  const actions = normalizeStringList(source.next_actions, 4);

  return {
    probability_percent: probability,
    band,
    confidence,
    key_drivers: drivers.length ? drivers : fallback.key_drivers,
    key_risks: risks.length ? risks : fallback.key_risks,
    next_actions: actions.length ? actions : fallback.next_actions,
  };
}

function normalizeOfferNegotiationCopilot(
  raw: unknown,
  fallback: OfferNegotiationCopilot
): OfferNegotiationCopilot {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const numberOrFallback = (value: unknown, fallbackValue: number): number =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(3, Math.min(95, Math.round(value * 10) / 10))
      : fallbackValue;

  const objections = Array.isArray(source.objection_handling)
    ? source.objection_handling
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const row = item as { objection?: unknown; response?: unknown };
          const objection = typeof row.objection === "string" ? row.objection.trim() : "";
          const response = typeof row.response === "string" ? row.response.trim() : "";
          if (!objection || !response) {
            return null;
          }

          return { objection, response };
        })
        .filter((item): item is { objection: string; response: string } => Boolean(item))
        .slice(0, 3)
    : [];

  const idealAsk = numberOrFallback(source.ideal_ask_lpa, fallback.ideal_ask_lpa);
  const acceptableFloor = Math.min(
    idealAsk,
    numberOrFallback(source.acceptable_floor_lpa, fallback.acceptable_floor_lpa)
  );
  const walkAway = Math.min(
    acceptableFloor,
    numberOrFallback(source.walk_away_lpa, fallback.walk_away_lpa)
  );

  return {
    role_hint:
      typeof source.role_hint === "string" && source.role_hint.trim()
        ? source.role_hint.trim()
        : fallback.role_hint,
    ideal_ask_lpa: idealAsk,
    acceptable_floor_lpa: acceptableFloor,
    walk_away_lpa: walkAway,
    opening_pitch:
      typeof source.opening_pitch === "string" && source.opening_pitch.trim()
        ? source.opening_pitch.trim()
        : fallback.opening_pitch,
    value_proofs: normalizeStringList(source.value_proofs, 4).length
      ? normalizeStringList(source.value_proofs, 4)
      : fallback.value_proofs,
    objection_handling: objections.length ? objections : fallback.objection_handling,
    closing_line:
      typeof source.closing_line === "string" && source.closing_line.trim()
        ? source.closing_line.trim()
        : fallback.closing_line,
  };
}

function normalizeApplicationPackGenerator(
  raw: unknown,
  fallback: ApplicationPackGenerator
): ApplicationPackGenerator {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const readText = (
    key: "tailored_summary" | "cover_letter" | "recruiter_email" | "linkedin_dm" | "interview_pitch_30s"
  ): string => {
    const value = source[key as string];
    return typeof value === "string" && value.trim() ? value.trim() : fallback[key];
  };

  const checklist = normalizeStringList(source.ats_keyword_checklist, 8);

  return {
    tailored_summary: readText("tailored_summary"),
    cover_letter: readText("cover_letter"),
    recruiter_email: readText("recruiter_email"),
    linkedin_dm: readText("linkedin_dm"),
    interview_pitch_30s: readText("interview_pitch_30s"),
    ats_keyword_checklist: checklist.length ? checklist : fallback.ats_keyword_checklist,
  };
}

function normalizeJobVariants(raw: unknown): JobTailoredResumeVariant[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const summary = typeof row.summary === "string" ? row.summary.trim() : "";
      if (!title || !summary) {
        return null;
      }

      return {
        title,
        summary,
        focus_skills: normalizeStringList(row.focus_skills, 5),
        highlight_bullets: normalizeStringList(row.highlight_bullets, 4),
      };
    })
    .filter((entry): entry is JobTailoredResumeVariant => Boolean(entry))
    .slice(0, 3);
}

function normalizeHiddenRedFlags(raw: unknown): HiddenRedFlag[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const flag = typeof row.flag === "string" ? row.flag.trim() : "";
      const why = typeof row.why_it_hurts === "string" ? row.why_it_hurts.trim() : "";
      const fix = typeof row.fix === "string" ? row.fix.trim() : "";
      const severity = row.severity === "High" || row.severity === "Medium" || row.severity === "Low"
        ? row.severity
        : null;

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
}

function normalizeReachabilityVerdict(value: unknown): ReachabilityVerdict {
  if (value === "Apply now" || value === "Upskill first" || value === "Stretch") {
    return value;
  }

  return "Upskill first";
}

function normalizeRecruiterEyePath(raw: unknown): RecruiterEyePath {
  const fallback: RecruiterEyePath = {
    total_scan_seconds: 7,
    folds: [],
  };

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const folds = Array.isArray(source.folds)
    ? source.folds
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const row = entry as Record<string, unknown>;
          const fold =
            row.fold === "Top Fold" ||
            row.fold === "Upper Middle" ||
            row.fold === "Mid Section" ||
            row.fold === "Bottom Section"
              ? row.fold
              : null;

          const firstFocus = typeof row.first_focus === "string" ? row.first_focus.trim() : "";
          const recruiterQuestion = typeof row.recruiter_question === "string" ? row.recruiter_question.trim() : "";
          const fix = typeof row.fix === "string" ? row.fix.trim() : "";
          const attention =
            typeof row.attention_percent === "number" && Number.isFinite(row.attention_percent)
              ? Math.max(5, Math.min(60, Math.round(row.attention_percent)))
              : null;

          if (!fold || !firstFocus || !recruiterQuestion || !fix || attention === null) {
            return null;
          }

          return {
            fold,
            attention_percent: attention,
            first_focus: firstFocus,
            recruiter_question: recruiterQuestion,
            fix,
          };
        })
        .filter((entry): entry is RecruiterEyePathFold => Boolean(entry))
    : [];

  return {
    total_scan_seconds:
      typeof source.total_scan_seconds === "number" && Number.isFinite(source.total_scan_seconds)
        ? Math.max(5, Math.min(12, Math.round(source.total_scan_seconds)))
        : fallback.total_scan_seconds,
    folds,
  };
}

function normalizeCareerNarrativeGraph(raw: unknown): CareerNarrativeGraph | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const tracks = Array.isArray(source.tracks)
    ? source.tracks
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const row = entry as Record<string, unknown>;
          const track = row.track === "IC" || row.track === "Manager" || row.track === "Specialist" ? row.track : null;
          const readiness =
            typeof row.readiness_score === "number" && Number.isFinite(row.readiness_score)
              ? Math.max(0, Math.min(100, Math.round(row.readiness_score)))
              : null;

          if (!track || readiness === null) {
            return null;
          }

          return {
            track,
            readiness_score: readiness,
            evidence: normalizeStringList(row.evidence, 3),
            gaps: normalizeStringList(row.gaps, 3),
          };
        })
        .filter((entry): entry is CareerTrackScore => Boolean(entry))
    : [];

  if (!tracks.length) {
    return null;
  }

  const bestTrack = tracks.reduce((best, current) =>
    current.readiness_score > best.readiness_score ? current : best
  );

  return {
    primary_track:
      source.primary_track === "IC" || source.primary_track === "Manager" || source.primary_track === "Specialist"
        ? source.primary_track
        : bestTrack.track,
    tracks,
  };
}

function normalizeJobReachabilityScore(raw: unknown): JobReachabilityScore | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const score =
    typeof source.score === "number" && Number.isFinite(source.score)
      ? Math.max(0, Math.min(100, Math.round(source.score)))
      : null;

  if (score === null) {
    return null;
  }

  return {
    score,
    verdict: normalizeReachabilityVerdict(source.verdict),
    reasoning: normalizeStringList(source.reasoning, 4),
    target_gaps: normalizeStringList(source.target_gaps, 5),
  };
}

function normalizeSkillRoiPlanner(raw: unknown): SkillRoiPlanner | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const skills = Array.isArray(source.skills)
    ? source.skills
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const row = entry as Record<string, unknown>;
          const skill = typeof row.skill === "string" ? row.skill.trim() : "";
          const uplift =
            typeof row.shortlist_uplift_percent === "number" && Number.isFinite(row.shortlist_uplift_percent)
              ? Math.max(1, Math.min(35, Math.round(row.shortlist_uplift_percent)))
              : null;
          const salaryUplift =
            typeof row.salary_uplift_lpa === "number" && Number.isFinite(row.salary_uplift_lpa)
              ? Math.max(0.2, Math.min(9, Math.round(row.salary_uplift_lpa * 10) / 10))
              : null;
          const effortWeeks =
            typeof row.effort_weeks === "number" && Number.isFinite(row.effort_weeks)
              ? Math.max(2, Math.min(24, Math.round(row.effort_weeks)))
              : null;
          const reason = typeof row.reason === "string" ? row.reason.trim() : "";

          if (!skill || uplift === null || salaryUplift === null || effortWeeks === null || !reason) {
            return null;
          }

          return {
            skill,
            shortlist_uplift_percent: uplift,
            salary_uplift_lpa: salaryUplift,
            effort_weeks: effortWeeks,
            reason,
          };
        })
        .filter((entry): entry is SkillRoiPlanItem => Boolean(entry))
        .slice(0, 5)
    : [];

  if (!skills.length) {
    return null;
  }

  return {
    recommendation:
      typeof source.recommendation === "string" && source.recommendation.trim()
        ? source.recommendation.trim()
        : `Start with ${skills[0].skill} for maximum shortlist and compensation uplift.`,
    skills,
  };
}

function normalizeSemanticRagInsights(raw: unknown): SemanticRagInsights | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const semanticMatchScore =
    typeof source.semantic_match_score === "number" && Number.isFinite(source.semantic_match_score)
      ? Math.max(0, Math.min(100, Math.round(source.semantic_match_score)))
      : null;

  const coverageSummary =
    typeof source.coverage_summary === "string" && source.coverage_summary.trim()
      ? source.coverage_summary.trim()
      : "";

  const retrievalMode =
    source.retrieval_mode === "embedding" || source.retrieval_mode === "heuristic"
      ? source.retrieval_mode
      : "heuristic";

  const topEvidence = Array.isArray(source.top_evidence)
    ? source.top_evidence
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
          const evidenceSource = row.source === "resume" || row.source === "job_description" ? row.source : "resume";

          if (!snippet || !why || similarity === null) {
            return null;
          }

          return {
            snippet,
            similarity_score: similarity,
            why_it_matters: why,
            source: evidenceSource,
          };
        })
        .filter((entry): entry is SemanticRagEvidenceItem => Boolean(entry))
        .slice(0, 3)
    : [];

  if (semanticMatchScore === null || !coverageSummary) {
    return null;
  }

  return {
    semantic_match_score: semanticMatchScore,
    coverage_summary: coverageSummary,
    missing_intents: normalizeStringList(source.missing_intents, 5),
    top_evidence: topEvidence,
    retrieval_mode: retrievalMode,
  };
}

function normalizeLineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipLine(value: string, maxLen = 180): string {
  const normalized = normalizeLineText(value);
  if (normalized.length <= maxLen) {
    return normalized;
  }

  return `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function sanitizeRewriteSuggestions(raw: unknown): RewriteSuggestion[] {
  let input: unknown = raw;

  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = [];
    }
  }

  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as { original?: unknown; improved?: unknown; reason?: unknown };
      const original = clipLine(String(candidate.original ?? ""));
      const improved = clipLine(String(candidate.improved ?? ""));
      const reason = clipLine(String(candidate.reason ?? "Improved clarity and ATS impact."), 260);

      if (!original || !improved || normalizeLineText(original) === normalizeLineText(improved)) {
        return null;
      }

      return { original, improved, reason };
    })
    .filter((item): item is RewriteSuggestion => Boolean(item));
}

function extractCandidateLinesFromResume(resumeText: string): string[] {
  const pieces = resumeText
    .split(/\r?\n|(?<=[.!?;])\s+/)
    .map((piece) => normalizeLineText(piece))
    .filter((piece) => piece.length >= 35 && piece.length <= 180)
    .filter((piece) => /[a-zA-Z]/.test(piece));

  return Array.from(new Set(pieces)).slice(0, 12);
}

function buildFallbackRewriteSuggestions(resumeText: string, missingSkills: string[]): RewriteSuggestion[] {
  const candidates = extractCandidateLinesFromResume(resumeText).slice(0, 5);
  if (!candidates.length) {
    return [];
  }

  return candidates.map((line, index) => {
    const suggestedSkill = missingSkills[index] ?? "role-relevant keywords";
    const improved = clipLine(
      `${line.replace(/[.;,\s]+$/, "")}; delivered measurable impact (e.g., +20% efficiency) and aligned with ${suggestedSkill}.`
    );

    return {
      original: clipLine(line),
      improved,
      reason: "Converted to an action + impact + keyword-aligned bullet for stronger ATS and recruiter readability.",
    };
  });
}

function estimateLineAtsGain(item: RewriteSuggestion, missingSkills: string[]): number {
  const before = item.original.toLowerCase();
  const after = item.improved.toLowerCase();

  let gain = 0;

  const newlyAddedMissingSkills = missingSkills.filter((skill) => {
    const s = skill.toLowerCase();
    return after.includes(s) && !before.includes(s);
  });
  gain += Math.min(6, newlyAddedMissingSkills.length * 2);

  const hasNewMetric = /\d+\s*%|\d+\s*(?:x|k|m|ms|s|sec|days?|months?|years?)/i.test(after) &&
    !/\d+\s*%|\d+\s*(?:x|k|m|ms|s|sec|days?|months?|years?)/i.test(before);
  if (hasNewMetric) {
    gain += 2;
  }

  const actionWords = ["built", "led", "implemented", "designed", "optimized", "improved", "reduced", "increased", "delivered", "automated", "scaled"];
  const newActionWords = actionWords.filter((word) => after.includes(word) && !before.includes(word));
  gain += Math.min(3, newActionWords.length);

  return Math.min(10, gain);
}

function extractInterviewProbability(data: unknown): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const report = data as Record<string, unknown>;
  const predictor = report.interview_conversion_predictor;

  if (predictor && typeof predictor === "object") {
    const source = predictor as Record<string, unknown>;
    if (typeof source.probability_percent === "number" && Number.isFinite(source.probability_percent)) {
      return Math.max(0, Math.min(100, Math.round(source.probability_percent)));
    }
  }

  const ats = typeof report.ats_score === "number" ? report.ats_score : null;
  const readability = typeof report.readability_score === "number" ? report.readability_score : null;
  const completeness = typeof report.completeness_score === "number" ? report.completeness_score : null;

  if (ats === null && readability === null && completeness === null) {
    return null;
  }

  const fallback = (Math.max(0, ats ?? 0) * 0.6) + (Math.max(0, readability ?? 0) * 0.25) + (Math.max(0, completeness ?? 0) * 0.15);
  return Math.max(0, Math.min(100, Math.round(fallback)));
}

function buildInterviewTrend(records: HistoryRecord[], fallbackCurrent: number): ConversionTrendPoint[] {
  const points = records
    .slice(0, 20)
    .reverse()
    .map((item) => {
      const probability = extractInterviewProbability(item.data);
      if (probability === null) {
        return null;
      }

      const date = new Date(item.created_at);
      const label = Number.isNaN(date.getTime())
        ? "Recent"
        : `${date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;

      return {
        label,
        probability,
      };
    })
    .filter((item): item is ConversionTrendPoint => Boolean(item));

  if (!points.length) {
    return [{ label: "Current", probability: Math.max(0, Math.min(100, Math.round(fallbackCurrent))) }];
  }

  return points.slice(-8);
}

export default function AnalysisPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [creditOwnerId, setCreditOwnerId] = useState("guest");
  const [creditBalance, setCreditBalance] = useState(() => getCreditWallet("guest").balance);
  const [data, setData] = useState<AnalysisReport | null>(null);
  const [originalResumeText, setOriginalResumeText] = useState("");

  useEffect(() => {
    const hydratePage = async () => {
      let resolvedOwnerId = "guest";

      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        resolvedOwnerId = user.id;
        setCreditOwnerId(user.id);
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          const synced = await syncCreditWalletFromServer(user.id, session.access_token);
          setCreditBalance(synced?.balance ?? getCreditWallet(user.id).balance);
        } else {
          setCreditBalance(getCreditWallet(user.id).balance);
        }
      } else {
        resolvedOwnerId = "guest";
        setCreditOwnerId("guest");
        setCreditBalance(getCreditWallet("guest").balance);
      }

      const raw = sessionStorage.getItem("lastAnalysisResult");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setData(parsed);

          if (typeof parsed?.remaining_credits === "number") {
            const nextWallet = setCreditWallet(resolvedOwnerId, {
              ...getCreditWallet(resolvedOwnerId),
              balance: parsed.remaining_credits,
              updatedAt: new Date().toISOString(),
            });
            setCreditBalance(nextWallet.balance);
          }

          const sourceResume = sessionStorage.getItem("lastUploadedResumeText") ?? "";
          setOriginalResumeText(sourceResume);
          setAuthChecked(true);
          return;
        } catch {
          router.replace("/upload");
          return;
        }
      }

      router.replace("/upload");
    };

    hydratePage();
  }, [router]);

  if (!authChecked || !data) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-muted">Loading your personalized analysis...</p>
      </main>
    );
  }

  const scoreColor = (s: number) => s >= 75 ? "text-green-500" : s >= 50 ? "text-amber-500" : "text-rose-500";
  const missingSkills: string[] = Array.isArray(data.missing_skills)
    ? data.missing_skills.filter((skill: unknown): skill is string => typeof skill === "string")
    : [];
  const parsedRewriteSuggestions = sanitizeRewriteSuggestions(data.rewrite_suggestions);
  const rewriteSuggestions = parsedRewriteSuggestions.length
    ? parsedRewriteSuggestions
    : buildFallbackRewriteSuggestions(originalResumeText, missingSkills);
  const rewriteImpacts = rewriteSuggestions
    .map((item) => ({
      ...item,
      estimatedGain: estimateLineAtsGain(item, missingSkills),
    }))
    .filter((item) => item.estimatedGain > 0);
  const totalEstimatedGain = rewriteImpacts.reduce((sum, item) => sum + item.estimatedGain, 0);
  const currentAtsScore = typeof data.ats_score === "number" ? data.ats_score : 0;
  const projectedAtsScore = Math.min(100, currentAtsScore + totalEstimatedGain);
  const predictedSalaryLpa = getPredictedSalaryLpa(data.salary);
  const salaryConfidenceRaw = data.salary?.confidence;
  const salaryConfidence: "Low" | "Medium" | "High" | null =
    salaryConfidenceRaw === "Low" || salaryConfidenceRaw === "Medium" || salaryConfidenceRaw === "High"
      ? salaryConfidenceRaw
      : null;
  const salaryRationale =
    typeof data.salary?.rationale === "string" && data.salary.rationale.trim()
      ? data.salary.rationale.trim()
      : "Estimated from profile strength, role fit, and market compensation signals.";
  const salaryNegotiationTips = Array.isArray(data.salary?.negotiation_tips)
    ? data.salary.negotiation_tips.filter(
        (tip: unknown): tip is string => typeof tip === "string" && tip.trim().length > 0
      )
    : [];
  const salaryAssumptions = Array.isArray(data.salary?.assumptions)
    ? data.salary.assumptions.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
    : [];
  const defaultAssumptions = [
    `Experience considered: ${typeof data.experience_years === "number" ? data.experience_years : "N/A"} years from resume content.`,
    `Skills alignment considered: ${(Array.isArray(data.skills_found) ? data.skills_found.length : 0)} matched and ${missingSkills.length} missing keywords.`,
    `Score baseline used in estimate: ATS ${typeof data.ats_score === "number" ? data.ats_score : 0}% and overall ${typeof data.overall_score === "number" ? data.overall_score : 0}%.`,
  ];
  const resolvedSalaryAssumptions = salaryAssumptions.length ? salaryAssumptions : defaultAssumptions;
  const confidenceBandPercent = salaryConfidence === "High" ? 85 : salaryConfidence === "Low" ? 35 : 65;

  const scoreExplainabilityRaw =
    data.score_explainability && typeof data.score_explainability === "object"
      ? (data.score_explainability as Record<string, unknown>)
      : {};

  const explainabilityDefaults: Record<"overall_score" | "ats_score" | "readability_score" | "completeness_score", ScoreExplainabilityEntry> = {
    overall_score: {
      reason: "Overall score is a weighted view of ATS alignment, readability, and completeness.",
      fix: "Prioritize high-impact gaps first, then optimize language clarity.",
      priority: typeof data.overall_score === "number" && data.overall_score < 60 ? "High" : typeof data.overall_score === "number" && data.overall_score < 80 ? "Medium" : "Low",
    },
    ats_score: {
      reason: missingSkills.length
        ? `${missingSkills.length} important JD keywords are missing, reducing parser alignment.`
        : "Keyword alignment with target role is mostly strong.",
      fix: "Add missing JD keywords naturally in summary, skills, and impact bullets.",
      priority: typeof data.ats_score === "number" && data.ats_score < 60 ? "High" : typeof data.ats_score === "number" && data.ats_score < 80 ? "Medium" : "Low",
    },
    readability_score: {
      reason: "Readability reflects how quickly recruiters can scan and understand value.",
      fix: "Keep bullets concise, action-first, and metric-backed.",
      priority:
        typeof data.readability_score === "number" && data.readability_score < 60
          ? "High"
          : typeof data.readability_score === "number" && data.readability_score < 80
            ? "Medium"
            : "Low",
    },
    completeness_score: {
      reason: "Completeness checks if critical sections and evidence depth are present.",
      fix: "Strengthen projects/experience with quantified outcomes and role context.",
      priority:
        typeof data.completeness_score === "number" && data.completeness_score < 60
          ? "High"
          : typeof data.completeness_score === "number" && data.completeness_score < 80
            ? "Medium"
            : "Low",
    },
  };

  const getScoreExplainability = (
    key: "overall_score" | "ats_score" | "readability_score" | "completeness_score"
  ): ScoreExplainabilityEntry => {
    const fallback = explainabilityDefaults[key];
    const raw = scoreExplainabilityRaw[key];

    if (!raw || typeof raw !== "object") {
      return fallback;
    }

    const entry = raw as Record<string, unknown>;
    return {
      reason: typeof entry.reason === "string" && entry.reason.trim() ? entry.reason.trim() : fallback.reason,
      fix: typeof entry.fix === "string" && entry.fix.trim() ? entry.fix.trim() : fallback.fix,
      priority: normalizeScorePriority(entry.priority) ?? fallback.priority,
    };
  };

  const metricCards: Array<{
    key: "overall_score" | "ats_score" | "readability_score" | "completeness_score";
    label: string;
    val: number;
    suffix: string;
    explainability: ScoreExplainabilityEntry;
  }> = [
    {
      key: "overall_score",
      label: "Overall Match",
      val: typeof data.overall_score === "number" ? data.overall_score : 0,
      suffix: "%",
      explainability: getScoreExplainability("overall_score"),
    },
    {
      key: "ats_score",
      label: "ATS Score",
      val: typeof data.ats_score === "number" ? data.ats_score : 0,
      suffix: "%",
      explainability: getScoreExplainability("ats_score"),
    },
    {
      key: "readability_score",
      label: "Readability",
      val: typeof data.readability_score === "number" ? data.readability_score : 0,
      suffix: "%",
      explainability: getScoreExplainability("readability_score"),
    },
    {
      key: "completeness_score",
      label: "Completeness",
      val: typeof data.completeness_score === "number" ? data.completeness_score : 0,
      suffix: "%",
      explainability: getScoreExplainability("completeness_score"),
    },
  ];

  const atsSimulatorFallback: AtsSimulatorItem[] = [
    {
      platform: "Greenhouse",
      score: Math.max(0, Math.min(100, Math.round(currentAtsScore))),
      status: currentAtsScore >= 75 ? "Strong" : currentAtsScore >= 55 ? "Average" : "Weak",
      reason: missingSkills.length
        ? `Keyword gaps (${missingSkills.length}) reduce parser confidence for strict skill matching.`
        : "Strong keyword coverage and section clarity support stable parsing.",
      top_fixes: [
        missingSkills[0] ? `Add '${missingSkills[0]}' in a measurable experience bullet.` : "Add 1-2 quantified impact bullets in experience.",
        "Keep summary and skills section role-aligned and concise.",
        "Use standard headings like Experience, Projects, Education.",
      ],
    },
    {
      platform: "Lever",
      score: Math.max(0, Math.min(100, Math.round(currentAtsScore - 4))),
      status: currentAtsScore >= 79 ? "Strong" : currentAtsScore >= 59 ? "Average" : "Weak",
      reason: "Lever-style parsers weigh relevance, brevity, and action-oriented bullets heavily.",
      top_fixes: [
        "Start bullets with strong action verbs and outcomes.",
        missingSkills[1] ? `Naturally include '${missingSkills[1]}' where you already show proof.` : "Increase role-specific keyword depth in projects.",
        "Trim generic claims and avoid repeated buzzwords.",
      ],
    },
    {
      platform: "Workday",
      score: Math.max(0, Math.min(100, Math.round(currentAtsScore - 7))),
      status: currentAtsScore >= 82 ? "Strong" : currentAtsScore >= 62 ? "Average" : "Weak",
      reason: "Workday-style extraction is stricter about structure and complete section coverage.",
      top_fixes: [
        "Ensure Projects, Education, Certifications/Achievements, and Skills are explicit.",
        "Use plain formatting and avoid dense paragraph blocks.",
        "Add dates and context consistently for each major experience entry.",
      ],
    },
  ];

  const atsSimulator = normalizeAtsSimulator(data.ats_simulator, atsSimulatorFallback);

  const interviewFallback: InterviewConversionPredictor = {
    probability_percent: Math.max(0, Math.min(100, Math.round((currentAtsScore * 0.6) + (typeof data.readability_score === "number" ? data.readability_score * 0.25 : 0) + (typeof data.completeness_score === "number" ? data.completeness_score * 0.15 : 0)))),
    band: currentAtsScore >= 70 ? "High" : currentAtsScore >= 50 ? "Medium" : "Low",
    confidence: salaryConfidence ?? "Medium",
    key_drivers: [
      typeof data.readability_score === "number" && data.readability_score >= 70
        ? "Readable, scannable bullet quality supports recruiter shortlisting speed."
        : "Improving readability will immediately boost recruiter confidence.",
      typeof data.completeness_score === "number" && data.completeness_score >= 70
        ? "Core sections are present with relatively strong depth."
        : "Section depth can be improved with stronger quantified outcomes.",
      "Resume-to-JD keyword overlap remains a top conversion lever.",
    ],
    key_risks: [
      missingSkills.length
        ? `${missingSkills.length} missing role keywords can reduce shortlisting probability.`
        : "Few explicit risk signals detected in keyword coverage.",
      "Generic achievements without hard metrics weaken interview momentum.",
      "Inconsistent formatting can lower parser extraction quality.",
    ],
    next_actions: [
      "Update top 5 bullets with action + metric + business impact.",
      missingSkills[0] ? `Integrate '${missingSkills[0]}' in summary and one project bullet.` : "Align summary keywords with your target role title.",
      "Tailor resume per job by mapping JD terms to proven experiences.",
      "Run one more ATS scan after edits and compare conversion uplift.",
    ],
  };

  const interviewPredictor = normalizeInterviewConversion(data.interview_conversion_predictor, interviewFallback);
  const baseNegotiationLpa = predictedSalaryLpa ?? Math.max(4, Math.round((currentAtsScore / 10) * 10) / 10);
  const offerNegotiationFallback: OfferNegotiationCopilot = {
    role_hint: "Target Role",
    ideal_ask_lpa: Math.min(95, Math.round((baseNegotiationLpa + 1.2) * 10) / 10),
    acceptable_floor_lpa: Math.min(95, Math.round(baseNegotiationLpa * 10) / 10),
    walk_away_lpa: Math.max(3, Math.round((baseNegotiationLpa - 0.8) * 10) / 10),
    opening_pitch:
      "I am excited about this role and based on my fit and expected impact, I am targeting compensation aligned to market and outcomes.",
    value_proofs: [
      `Current ATS strength is ${currentAtsScore}% with role-focused keyword alignment.`,
      `Interview conversion probability is estimated at ${interviewPredictor.probability_percent}%.`,
      "Profile highlights measurable outcomes and execution-focused delivery.",
    ],
    objection_handling: [
      {
        objection: "This is above our current budget.",
        response: "I am flexible on structure, but I would prefer total compensation aligned with expected role impact.",
      },
      {
        objection: "Can you reduce your expected package?",
        response: "I can be flexible within a fair range while keeping scope, ownership, and outcomes aligned.",
      },
      {
        objection: "We need stronger immediate domain exposure.",
        response: "I can ramp quickly with a 30-60-90 day plan and measurable delivery milestones.",
      },
    ],
    closing_line:
      "I am keen to move forward and confident we can finalize a package that reflects role expectations and business impact.",
  };
  const offerNegotiationCopilot = normalizeOfferNegotiationCopilot(
    data.offer_negotiation_copilot,
    offerNegotiationFallback
  );

  const applicationPackFallback: ApplicationPackGenerator = {
    tailored_summary:
      `Outcome-driven professional with ${typeof data.experience_years === "number" ? data.experience_years : "relevant"} years of experience, strong execution across ${Array.isArray(data.skills_found) ? data.skills_found.slice(0, 3).join(", ") || "core skills" : "core skills"}, and proven delivery under business priorities.`,
    cover_letter:
      "Dear Hiring Manager,\n\nI am writing to apply for this role. My profile combines role-relevant skills, measurable outcomes, and strong execution focus. I am confident I can contribute quickly and deliver impact in your team.\n\nI would welcome the opportunity to discuss next steps.\n\nSincerely,\n[Your Name]",
    recruiter_email:
      "Subject: Application for the role\n\nHi Recruiter,\n\nI am interested in this opportunity and believe my background aligns well with your requirements. Please find my resume attached and let me know if we can schedule a discussion.\n\nThanks,\n[Your Name]",
    linkedin_dm:
      "Hi, I came across your opening and found it strongly aligned with my background. I would love to share my resume and explore whether my profile could be a fit.",
    interview_pitch_30s:
      "I am a results-oriented professional with hands-on experience in role-relevant skills and a strong track record of delivering measurable business outcomes.",
    ats_keyword_checklist: missingSkills.length ? missingSkills.slice(0, 6) : ["Role title", "Core tools", "Domain keywords", "Impact metrics"],
  };
  const applicationPackGenerator = normalizeApplicationPackGenerator(
    data.application_pack_generator,
    applicationPackFallback
  );

  const subscriptionTier: SubscriptionTier =
    data.subscription_tier === "pro" || data.subscription_tier === "premium" || data.subscription_tier === "free"
      ? data.subscription_tier
      : "free";
  const proUnlocked = data.pro_unlocked === true || subscriptionTier === "pro" || subscriptionTier === "premium";
  const premiumUnlocked = data.premium_unlocked === true || subscriptionTier === "premium";
  const priorityModel = data.priority_model && typeof data.priority_model === "object"
    ? (data.priority_model as { enabled?: boolean; model?: string })
    : null;
  const jobTailoredVariants = normalizeJobVariants(data.job_tailored_resume_variants);
  const hiddenRedFlags = normalizeHiddenRedFlags(data.hidden_red_flag_detector);
  const premiumMessage =
    typeof data.premium_message === "string" && data.premium_message.trim()
      ? data.premium_message
      : null;
  const recruiterHeatmap: RecruiterHeatmapItem[] = Array.isArray(data.recruiter_heatmap)
    ? data.recruiter_heatmap
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const row = item as { text?: unknown; impact?: unknown };
          const text = typeof row.text === "string" ? row.text.trim() : "";
          const impact =
            row.impact === "High" || row.impact === "Medium" || row.impact === "Low"
              ? row.impact
              : "Low";

          if (!text) {
            return null;
          }

          return { text, impact };
        })
        .filter((item): item is RecruiterHeatmapItem => Boolean(item))
    : [];
  const recruiterEyePath = normalizeRecruiterEyePath(data.recruiter_eye_path);
  const careerNarrativeGraph = normalizeCareerNarrativeGraph(data.career_narrative_graph);
  const jobReachabilityScore = normalizeJobReachabilityScore(data.job_reachability_score);
  const skillRoiPlanner = normalizeSkillRoiPlanner(data.skill_roi_planner);
  const semanticRagInsights = normalizeSemanticRagInsights(data.semantic_rag_insights);
  const conversionTrend = buildInterviewTrend(getLocalHistory(creditOwnerId), interviewPredictor.probability_percent);

  return (
    <main className="flex flex-col min-h-screen bg-background pb-20">
      <NavBar />
      
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-24 mt-10">
        <button 
          onClick={() => router.push("/upload")}
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Resume Lab
        </button>

        <header className="mb-12">
          <h1 className="text-3xl md:text-5xl font-heading font-bold mb-4">Your Strategic <span className="text-primary-500">Resume Report</span></h1>
          <p className="text-muted text-lg">ATS diagnostics, recruiter-behavior insights, and compensation strategy in one report.</p>
        </header>

        <div className="mb-8 space-y-3">
          <CreditPlansCard
            ownerId={creditOwnerId}
            title="Credit + Tier Access"
            subtitle="Free tier includes basic analysis. Upgrade to Pro or Premium subscription to unlock advanced modules."
            onWalletChange={(wallet) => setCreditBalance(wallet.balance)}
          />
          <p className="text-xs text-muted">
            Live balance: <span className="font-semibold text-primary-600">{creditBalance} credits</span>
          </p>
          <p className="text-xs text-muted">
            Active tier: <span className="font-semibold text-primary-600 capitalize">{subscriptionTier}</span>
            {priorityModel?.enabled ? (
              <span className="ml-2">| Priority model: <span className="font-semibold text-primary-600">{priorityModel.model ?? "enabled"}</span></span>
            ) : null}
          </p>
          {premiumMessage ? <p className="text-xs text-muted">{premiumMessage}</p> : null}
        </div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {metricCards.map((m, i) => (
            <motion.div 
              key={m.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-card p-5 flex flex-col text-center"
            >
              <span className={clsx("text-4xl font-heading font-bold mb-1", typeof m.val === 'number' && typeof m.label === 'string' && m.label.includes('Score') ? scoreColor(m.val) : "text-foreground")}>
                {m.val}{m.suffix}
              </span>
              <span className="text-xs uppercase tracking-wider text-muted font-medium">{m.label}</span>
              <p className="mt-3 text-[11px] leading-relaxed text-muted min-h-[44px]">{m.explainability.reason}</p>
              <div className="mt-2 flex items-center justify-center">
                <span className={clsx("px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider", priorityStyles(m.explainability.priority))}>
                  Fix Priority: {m.explainability.priority}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-foreground/80">{m.explainability.fix}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* MAIN LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Salary Hint (Killer Feature) */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-indigo-900 via-primary-900 to-indigo-950 text-white shadow-2xl border border-primary-500/30 group"
            >
              <div className="absolute top-0 right-0 p-10 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                <Coins className="w-48 h-48" />
              </div>
              <h2 className="text-sm font-bold tracking-widest text-primary-300 uppercase mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Salary Negotiation Hint
              </h2>
              <div className="text-4xl md:text-6xl font-heading font-bold mb-4 tracking-tight">
                {predictedSalaryLpa !== null ? `₹${predictedSalaryLpa}` : "N/A"} <span className="text-xl text-primary-300">Predicted LPA</span>
              </div>
              {salaryConfidence && (
                <p className="text-xs text-primary-200 mb-3 uppercase tracking-wider">Confidence: {salaryConfidence}</p>
              )}
              <p className="text-primary-100/80 leading-relaxed mb-6 max-w-xl text-sm">
                {salaryRationale}
              </p>

              <div className="mb-6 rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-primary-200 uppercase tracking-wider">Why this salary number?</h3>
                <div className="flex items-center justify-between text-xs text-primary-100/80">
                  <span>Confidence Band</span>
                  <span className="font-semibold text-primary-100">{salaryConfidence ?? "Medium"} ({confidenceBandPercent}%)</span>
                </div>
                <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className={clsx(
                      "h-full transition-all",
                      salaryConfidence === "High"
                        ? "bg-green-400"
                        : salaryConfidence === "Low"
                          ? "bg-rose-400"
                          : "bg-amber-400"
                    )}
                    style={{ width: `${confidenceBandPercent}%` }}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-primary-200 uppercase tracking-wider">Assumptions</p>
                  <ul className="space-y-1.5">
                    {resolvedSalaryAssumptions.map((assumption, index) => (
                      <li key={`salary-assumption-${index}`} className="text-xs text-primary-100/85 leading-relaxed flex gap-2">
                        <span className="mt-0.5">•</span>
                        <span>{assumption}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-primary-300 uppercase">Negotiation Tactics:</h3>
                <ul className="space-y-2">
                  {salaryNegotiationTips.map((tip, i) => (
                    <li key={i} className="flex gap-3 text-sm text-primary-50">
                      <Sparkles className="w-4 h-4 text-primary-400 flex-shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            {semanticRagInsights && (
            <div className="glass-card p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary-500" /> Semantic Match Evidence
                  </h2>
                  <p className="text-xs text-muted mt-2">
                    Retrieval-grounded match between your resume context and target job intent.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                  {semanticRagInsights.retrieval_mode === "embedding" ? "Embedding RAG" : "Heuristic RAG"}
                </span>
              </div>

              <div className="grid md:grid-cols-[220px_1fr] gap-5 mb-5">
                <div className="rounded-xl border border-border bg-card/60 p-4">
                  <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-1">Semantic Match</p>
                  <p className="text-3xl font-heading font-bold text-foreground mb-3">
                    {semanticRagInsights.semantic_match_score}%
                  </p>
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${semanticRagInsights.semantic_match_score}%` }}
                      transition={{ duration: 0.7 }}
                      className={clsx(
                        "h-full rounded-full",
                        semanticRagInsights.semantic_match_score >= 75
                          ? "bg-green-500"
                          : semanticRagInsights.semantic_match_score >= 55
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      )}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary-600">Coverage Summary</p>
                  <p className="text-sm text-foreground/85 leading-relaxed">{semanticRagInsights.coverage_summary}</p>
                  {semanticRagInsights.missing_intents.length > 0 ? (
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-muted mb-2">Missing Intents</p>
                      <div className="flex flex-wrap gap-1.5">
                        {semanticRagInsights.missing_intents.map((intent, index) => (
                          <span key={`intent-${index}`} className="px-2 py-1 rounded text-[11px] bg-rose-500/10 text-rose-600">
                            {intent}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {semanticRagInsights.top_evidence.length > 0 ? (
                <div className="grid md:grid-cols-3 gap-4">
                  {semanticRagInsights.top_evidence.map((evidence, index) => (
                    <div key={`semantic-evidence-${index}`} className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
                          Evidence {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-foreground">{evidence.similarity_score}%</span>
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">{evidence.snippet}</p>
                      <p className="text-xs text-muted leading-relaxed">{evidence.why_it_matters}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            )}

            {premiumUnlocked && (
            <div className="glass-card p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                    <Coins className="w-5 h-5 text-primary-500" /> Offer Negotiation Copilot
                  </h2>
                  <p className="text-xs text-muted mt-2">
                    Ready-to-use salary negotiation strategy with ask range, rebuttals, and closing script.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                  Premium
                </span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-5">
                <div className="rounded-xl border border-border bg-card/60 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted mb-1">Ideal Ask</p>
                  <p className="text-xl font-heading font-bold text-foreground">INR {offerNegotiationCopilot.ideal_ask_lpa} LPA</p>
                </div>
                <div className="rounded-xl border border-border bg-card/60 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted mb-1">Acceptable Floor</p>
                  <p className="text-xl font-heading font-bold text-foreground">INR {offerNegotiationCopilot.acceptable_floor_lpa} LPA</p>
                </div>
                <div className="rounded-xl border border-border bg-card/60 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted mb-1">Walk Away</p>
                  <p className="text-xl font-heading font-bold text-foreground">INR {offerNegotiationCopilot.walk_away_lpa} LPA</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/50 p-4 mb-4">
                <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-2">Opening Pitch</p>
                <p className="text-sm text-foreground/85 leading-relaxed">{offerNegotiationCopilot.opening_pitch}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-3">Value Proofs</p>
                  <div className="space-y-2">
                    {offerNegotiationCopilot.value_proofs.map((proof, index) => (
                      <p key={`proof-${index}`} className="text-xs text-foreground/80 flex gap-2 leading-relaxed">
                        <span className="mt-0.5">•</span>
                        <span>{proof}</span>
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-3">Objection Handling</p>
                  <div className="space-y-2">
                    {offerNegotiationCopilot.objection_handling.map((item, index) => (
                      <div key={`objection-${index}`} className="text-xs text-foreground/80 rounded-lg border border-border px-3 py-2 space-y-1">
                        <p className="font-semibold text-foreground">Q: {item.objection}</p>
                        <p>A: {item.response}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted mt-4">{offerNegotiationCopilot.closing_line}</p>
            </div>
            )}

            {premiumUnlocked && (
            <div className="glass-card p-8 border-primary-500/20">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary-500" /> Application Pack Generator
                  </h2>
                  <p className="text-xs text-muted mt-2">
                    Ready drafts for recruiter outreach, cover letter, and interview self-intro.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                  Premium
                </span>
              </div>

              <div className="rounded-xl border border-border bg-card/50 p-4 mb-4">
                <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-2">Tailored Summary</p>
                <p className="text-sm text-foreground/85 leading-relaxed">{applicationPackGenerator.tailored_summary}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-2">Recruiter Email</p>
                  <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed">{applicationPackGenerator.recruiter_email}</p>
                </div>
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-2">LinkedIn DM</p>
                  <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed">{applicationPackGenerator.linkedin_dm}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-2">30s Interview Pitch</p>
                  <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed">{applicationPackGenerator.interview_pitch_30s}</p>
                </div>
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-2">ATS Keyword Checklist</p>
                  <div className="flex flex-wrap gap-1.5">
                    {applicationPackGenerator.ats_keyword_checklist.map((keyword, index) => (
                      <span key={`keyword-${index}`} className="px-2 py-1 rounded text-[11px] bg-primary-500/10 text-primary-600">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/50 p-4">
                <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-2">Cover Letter Draft</p>
                <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed">{applicationPackGenerator.cover_letter}</p>
              </div>
            </div>
            )}

            {proUnlocked ? (
              <>
                {/* Pro: Company-Specific ATS Simulator */}
                <div className="glass-card p-8 border-primary-500/20">
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-primary-500" /> Company-Specific ATS Simulator
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Platform-wise pass likelihood and high-impact fixes for enterprise ATS systems.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                      Pro
                    </span>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {atsSimulator.map((item) => (
                      <div key={item.platform} className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">{item.platform}</p>
                          <span className={clsx("px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider", atsStatusStyles(item.status))}>
                            {item.status}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                            <span>Compatibility</span>
                            <span className="font-semibold text-foreground">{item.score}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-border overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${item.score}%` }}
                              transition={{ duration: 0.8 }}
                              className={clsx(
                                "h-full rounded-full",
                                item.status === "Strong"
                                  ? "bg-green-500"
                                  : item.status === "Average"
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                              )}
                            />
                          </div>
                        </div>

                        <p className="text-xs text-foreground/80 leading-relaxed">{item.reason}</p>

                        <div className="space-y-1.5">
                          {item.top_fixes.map((fix, index) => (
                            <p key={`${item.platform}-fix-${index}`} className="text-xs text-muted flex gap-2 leading-relaxed">
                              <span className="mt-0.5">•</span>
                              <span>{fix}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {recruiterEyePath.folds.length > 0 && (
                <div className="glass-card p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                        <Eye className="w-5 h-5 text-primary-500" /> Recruiter 7-Second Eye Path
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Fold-by-fold scan map showing where recruiters look first in ~{recruiterEyePath.total_scan_seconds} seconds.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                      Pro
                    </span>
                  </div>

                  <div className="space-y-3">
                    {recruiterEyePath.folds.map((fold, index) => (
                      <div key={`eye-path-${index}`} className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">{fold.fold}</p>
                          <span className="text-xs font-semibold text-primary-600">Attention {fold.attention_percent}%</span>
                        </div>
                        <p className="text-xs text-foreground/80"><span className="font-semibold">First focus:</span> {fold.first_focus}</p>
                        <p className="text-xs text-foreground/80"><span className="font-semibold">Recruiter asks:</span> {fold.recruiter_question}</p>
                        <p className="text-xs text-muted"><span className="font-semibold text-foreground">Fix:</span> {fold.fix}</p>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {jobTailoredVariants.length > 0 && (
                <div className="glass-card p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary-500" /> Job-Tailored Resume Variants
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Three role positioning angles you can use as separate resume versions.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                      Pro
                    </span>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {jobTailoredVariants.map((variant, index) => (
                      <div key={`variant-${index}`} className="rounded-xl border border-border bg-card/70 p-4 space-y-3">
                        <p className="text-sm font-semibold text-foreground">{variant.title}</p>
                        <p className="text-xs text-foreground/80 leading-relaxed">{variant.summary}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {variant.focus_skills.map((skill, idx) => (
                            <span key={`variant-skill-${index}-${idx}`} className="px-2 py-1 rounded text-[11px] bg-primary-500/10 text-primary-600">
                              {skill}
                            </span>
                          ))}
                        </div>
                        <div className="space-y-1.5">
                          {variant.highlight_bullets.map((bullet, idx) => (
                            <p key={`variant-bullet-${index}-${idx}`} className="text-xs text-muted flex gap-2 leading-relaxed">
                              <span className="mt-0.5">•</span>
                              <span>{bullet}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {hiddenRedFlags.length > 0 && (
                <div className="glass-card p-8 border-rose-500/20 bg-rose-500/5">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2 text-rose-600">
                        <AlertTriangle className="w-5 h-5" /> Hidden Red-Flag Detector
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Subtle issues recruiters notice even when ATS score looks acceptable.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-rose-500/10 text-rose-600">
                      Pro
                    </span>
                  </div>

                  <div className="space-y-3">
                    {hiddenRedFlags.map((flag, index) => (
                      <div key={`red-flag-${index}`} className="rounded-xl border border-border bg-card/70 p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">{flag.flag}</p>
                          <span className={clsx("px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider", redFlagSeverityStyles(flag.severity))}>
                            {flag.severity}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{flag.why_it_hurts}</p>
                        <p className="text-xs text-muted leading-relaxed"><span className="font-semibold text-foreground">Fix:</span> {flag.fix}</p>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {premiumUnlocked && (
                <div className="glass-card p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                        <Rocket className="w-5 h-5 text-primary-500" /> Interview Conversion Predictor
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Estimates shortlist-to-interview probability with clear drivers, risks, and next actions.
                      </p>
                    </div>
                    <span className={clsx("px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider", conversionBandStyles(interviewPredictor.band))}>
                      {interviewPredictor.band} Band
                    </span>
                  </div>

                  <div className="mb-6 rounded-xl border border-border bg-card/70 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-wider text-muted font-semibold">Interview Probability</p>
                      <p className="text-xs text-muted">Confidence: <span className="font-semibold text-foreground">{interviewPredictor.confidence}</span></p>
                    </div>
                    <div className="flex items-end justify-between gap-3 mb-3">
                      <p className="text-4xl font-heading font-bold text-foreground">{interviewPredictor.probability_percent}%</p>
                      <Gauge className="w-5 h-5 text-primary-500 mb-1" />
                    </div>
                    <div className="h-2.5 rounded-full bg-border overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${interviewPredictor.probability_percent}%` }}
                        transition={{ duration: 0.8 }}
                        className={clsx(
                          "h-full rounded-full",
                          interviewPredictor.band === "High"
                            ? "bg-green-500"
                            : interviewPredictor.band === "Medium"
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                      <p className="text-xs uppercase tracking-wider font-semibold text-green-600 mb-3">Key Drivers</p>
                      <div className="space-y-2">
                        {interviewPredictor.key_drivers.map((driver, index) => (
                          <p key={`driver-${index}`} className="text-xs text-foreground/80 flex gap-2 leading-relaxed">
                            <span className="mt-0.5">•</span>
                            <span>{driver}</span>
                          </p>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                      <p className="text-xs uppercase tracking-wider font-semibold text-rose-600 mb-3">Key Risks</p>
                      <div className="space-y-2">
                        {interviewPredictor.key_risks.map((risk, index) => (
                          <p key={`risk-${index}`} className="text-xs text-foreground/80 flex gap-2 leading-relaxed">
                            <span className="mt-0.5">•</span>
                            <span>{risk}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card/60 p-4">
                    <p className="text-xs uppercase tracking-wider font-semibold text-primary-600 mb-3">Conversion Boost Plan</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {interviewPredictor.next_actions.map((action, index) => (
                        <div key={`action-${index}`} className="text-xs text-foreground/80 rounded-lg border border-border px-3 py-2 flex gap-2">
                          <span className="text-primary-500 font-semibold">{index + 1}.</span>
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                )}

                {premiumUnlocked && careerNarrativeGraph && (
                <div className="glass-card p-8 border-primary-500/20">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                        <LineChart className="w-5 h-5 text-primary-500" /> Career Narrative Graph
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        IC vs Manager vs Specialist readiness map with primary-track recommendation.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                      Premium
                    </span>
                  </div>

                  <div className="mb-4 text-xs text-muted">
                    Primary Track: <span className="font-semibold text-primary-600">{careerNarrativeGraph.primary_track}</span>
                  </div>

                  <div className="grid md:grid-cols-3 gap-3">
                    {careerNarrativeGraph.tracks.map((track) => (
                      <div key={`career-track-${track.track}`} className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground">{track.track}</p>
                          <span className="text-xs font-semibold text-primary-600">{track.readiness_score}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-border overflow-hidden">
                          <div className="h-full bg-primary-500" style={{ width: `${track.readiness_score}%` }} />
                        </div>
                        <div className="space-y-1">
                          {track.evidence.slice(0, 2).map((evidence, index) => (
                            <p key={`track-evidence-${track.track}-${index}`} className="text-xs text-foreground/80 flex gap-2">
                              <span className="mt-0.5">•</span>
                              <span>{evidence}</span>
                            </p>
                          ))}
                        </div>
                        <div className="space-y-1">
                          {track.gaps.slice(0, 2).map((gap, index) => (
                            <p key={`track-gap-${track.track}-${index}`} className="text-xs text-muted flex gap-2">
                              <span className="mt-0.5">•</span>
                              <span>{gap}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {premiumUnlocked && (jobReachabilityScore || skillRoiPlanner) && (
                <div className="glass-card p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary-500" /> Reachability + Skill ROI Planner
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Target-role verdict and highest ROI skills to improve shortlist and salary trajectory.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                      Premium
                    </span>
                  </div>

                  {jobReachabilityScore && (
                    <div className="rounded-xl border border-border bg-card/60 p-4 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs uppercase tracking-wider font-semibold text-muted">Job Reachability Score</p>
                        <span className={clsx(
                          "px-2 py-1 rounded-full text-[11px] font-semibold",
                          jobReachabilityScore.verdict === "Apply now"
                            ? "bg-green-500/15 text-green-600"
                            : jobReachabilityScore.verdict === "Upskill first"
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-rose-500/15 text-rose-600"
                        )}>
                          {jobReachabilityScore.verdict}
                        </span>
                      </div>
                      <p className="text-3xl font-heading font-bold text-foreground mb-3">{jobReachabilityScore.score}%</p>
                      <div className="space-y-1.5 mb-3">
                        {jobReachabilityScore.reasoning.map((item, index) => (
                          <p key={`reachability-reason-${index}`} className="text-xs text-foreground/80 flex gap-2">
                            <span className="mt-0.5">•</span>
                            <span>{item}</span>
                          </p>
                        ))}
                      </div>
                      {jobReachabilityScore.target_gaps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {jobReachabilityScore.target_gaps.map((gap, index) => (
                            <span key={`reachability-gap-${index}`} className="px-2 py-1 rounded text-[11px] bg-rose-500/10 text-rose-600">
                              {gap}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {skillRoiPlanner && (
                    <div className="rounded-xl border border-border bg-card/60 p-4">
                      <p className="text-xs uppercase tracking-wider font-semibold text-muted mb-3">Skill ROI Planner</p>
                      <p className="text-xs text-foreground/80 mb-3">{skillRoiPlanner.recommendation}</p>
                      <div className="space-y-2">
                        {skillRoiPlanner.skills.map((item, index) => (
                          <div key={`skill-roi-${index}`} className="rounded-lg border border-border p-3 text-xs">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="font-semibold text-foreground">{item.skill}</p>
                              <p className="text-primary-600 font-semibold">+{item.shortlist_uplift_percent}% shortlist</p>
                            </div>
                            <p className="text-muted mb-1">Salary uplift: +INR {item.salary_uplift_lpa} LPA | Effort: {item.effort_weeks} weeks</p>
                            <p className="text-foreground/80">{item.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                )}

                {premiumUnlocked && (
                <div className="glass-card p-8 border-primary-500/20">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                        <LineChart className="w-5 h-5 text-primary-500" /> Interview Conversion Trend
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Tracks interview conversion probability changes across your recent resume analyses.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                      Premium
                    </span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 items-end min-h-[160px]">
                    {conversionTrend.map((point, index) => (
                      <div key={`${point.label}-${index}`} className="flex flex-col items-center gap-2">
                        <div className="w-full max-w-[44px] h-[120px] flex items-end">
                          <div
                            className="w-full rounded-t-md bg-primary-500/80"
                            style={{ height: `${Math.max(10, Math.round(point.probability * 1.1))}px` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted text-center">{point.label}</p>
                        <p className="text-[10px] font-semibold text-foreground">{point.probability}%</p>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {!premiumUnlocked && (
                <div className="glass-card p-6 border-primary-500/20 bg-primary-500/5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary-500/15 text-primary-600">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-bold">Premium Layer Locked</h3>
                      <p className="text-sm text-muted mt-1">
                        Upgrade to Premium for interview predictor, offer negotiation copilot, application pack, career narrative graph, reachability verdict, and skill ROI planner.
                      </p>
                    </div>
                  </div>
                </div>
                )}
              </>
            ) : (
              <div className="glass-card p-8 border-amber-500/30 bg-amber-500/5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-heading font-bold">Pro Insights Locked</h2>
                    <p className="text-sm text-muted mt-1">
                      Company-specific ATS simulator, recruiter 7-second eye path, resume variants, and hidden red-flag detector are available in Pro and Premium tiers.
                    </p>
                  </div>
                </div>

                <p className="text-sm text-amber-700">
                  This report was generated in basic mode. Current wallet balance: {creditBalance} credits.
                </p>

                <CreditPlansCard
                  ownerId={creditOwnerId}
                  title="Buy Credits"
                  subtitle="Use credits on Free tier, or upgrade to Pro/Premium for unlimited analyses."
                  onWalletChange={(wallet) => setCreditBalance(wallet.balance)}
                />
              </div>
            )}

            {/* Smart Rewrite Editor */}
            {rewriteImpacts.length > 0 && (
              <div className="glass-card p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                    <Flame className="w-5 h-5 text-primary-500" /> Smart Rewrite Suggestions
                  </h2>
                  <p className="text-xs text-muted mt-2">
                    Estimated ATS impact from these rewrites: <span className="font-semibold text-primary-500">{currentAtsScore}% -&gt; {projectedAtsScore}%</span> (+{totalEstimatedGain})
                  </p>
                </div>

                <div className="space-y-6">
                  {rewriteImpacts.map((item, i) => (
                    <div key={i} className="border border-border rounded-xl overflow-hidden">
                      <div className="grid md:grid-cols-2">
                        <div className="p-4 bg-rose-500/5 border-b md:border-b-0 md:border-r border-border">
                          <div className="text-xs uppercase tracking-wider text-rose-500 font-bold mb-2">Before (Original Line)</div>
                          <p className="text-sm text-foreground/80 line-through decoration-rose-500/50">{item.original}</p>
                        </div>
                        <div className="p-4 bg-green-500/5">
                          <div className="text-xs uppercase tracking-wider text-green-500 font-bold mb-2">After (Improved Line)</div>
                          <p className="text-sm text-foreground font-medium">{item.improved}</p>
                        </div>
                      </div>
                      <div className="p-3 bg-muted/5 border-t border-border text-xs text-muted flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Sparkles className="w-3 h-3 text-primary-500 flex-shrink-0" />
                          <span className="truncate">{item.reason}</span>
                        </div>
                        <span className="px-2 py-1 rounded-full bg-primary-500/10 text-primary-600 font-semibold whitespace-nowrap">
                          ATS +{item.estimatedGain}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strengths & Improvements */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card p-6">
                <h3 className="font-heading font-bold text-lg mb-4 text-green-500">Core Strengths</h3>
                <ul className="space-y-3">
                  {data.strengths?.map((s: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-foreground/80">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="glass-card p-6 border-amber-500/20">
                <h3 className="font-heading font-bold text-lg mb-4 text-amber-500">To Improve</h3>
                <ul className="space-y-3">
                  {data.improvements?.map((imp: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span className="text-foreground/80">{imp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Advanced Insights */}
          <div className="space-y-6">

            {/* Recruiter's First Look (Heatmap) */}
            {recruiterHeatmap.length > 0 && (
              <div className="glass-card p-6 border-purple-500/20">
                <h3 className="font-heading font-bold text-lg mb-2 flex items-center gap-2 text-purple-500">
                  <Eye className="w-5 h-5" /> Recruiter&apos;s First 6 Seconds
                </h3>
                <p className="text-xs text-muted mb-4">The elements a recruiter&apos;s eyes will instantly snap to.</p>
                <div className="flex flex-wrap gap-2">
                  {recruiterHeatmap.map((item, i: number) => (
                    <span key={i} className={clsx(
                      "px-3 py-1.5 rounded-md text-xs font-medium border",
                      item.impact === 'High' ? "bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]" :
                      item.impact === 'Medium' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                      "bg-slate-500/10 text-slate-400 border-slate-500/20"
                    )}>
                      {item.text}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tone & Emotion Score */}
            {(data.tone_analysis || data.emotion_score) && (
              <div className="glass-card p-6 border-pink-500/20">
                <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-pink-500">
                  <Activity className="w-5 h-5" /> Tone & Personality
                </h3>
                {data.tone_analysis && (
                  <div className="mb-6 p-4 rounded-xl bg-pink-500/5 border border-pink-500/10">
                    <p className="text-xs text-muted uppercase font-bold mb-1">Dominant Tone</p>
                    <p className="text-lg font-bold text-foreground mb-1">{data.tone_analysis.dominant_tone}</p>
                    <p className="text-xs text-foreground/70">{data.tone_analysis.reasoning}</p>
                  </div>
                )}
                {data.emotion_score && (
                  <div className="space-y-3">
                    {[
                      { label: "Confidence", val: data.emotion_score.confidence, color: "bg-blue-500" },
                      { label: "Humility", val: data.emotion_score.humility, color: "bg-teal-500" },
                      { label: "Ambition", val: data.emotion_score.ambition, color: "bg-orange-500" }
                    ].map((e, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-muted">{e.label}</span>
                          <span className="text-foreground">{e.val}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${e.val}%` }} transition={{ duration: 1 }} className={clsx("h-full rounded-full", e.color)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Jargon Detector */}
            {data.jargon_detected && data.jargon_detected.length > 0 && (
              <div className="glass-card p-6 border-red-500/20">
                <h3 className="font-heading font-bold text-lg mb-2 flex items-center gap-2 text-red-500">
                  <AlertTriangle className="w-5 h-5" /> Industry Jargon Found
                </h3>
                <p className="text-xs text-muted mb-4">These outdated buzzwords consume space and reduce impact. Remove them.</p>
                <div className="flex flex-wrap gap-2">
                  {data.jargon_detected.map((jargon: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full text-xs font-medium line-through">
                      {jargon}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Career Story Arc */}
            {data.story_arc && (
              <div className="glass-card p-6">
                <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2">
                  <History className="w-5 h-5 text-primary-500" /> Career Story Arc
                </h3>
                <p className="text-sm text-foreground/80 leading-relaxed italic border-l-2 border-primary-500 pl-4 py-1 mb-4">
                  &ldquo;{data.story_arc.trajectory}&rdquo;
                </p>
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                  <span className="text-xs font-bold text-muted uppercase">Cohesiveness Score</span>
                  <span className={clsx(
                    "text-sm font-bold",
                    scoreColor(typeof data.story_arc.cohesiveness_score === "number" ? data.story_arc.cohesiveness_score : 0)
                  )}>
                    {typeof data.story_arc.cohesiveness_score === "number" ? data.story_arc.cohesiveness_score : 0}/100
                  </span>
                </div>
              </div>
            )}

            {/* Skills */}
            <div className="glass-card p-6">
              <h3 className="font-heading font-bold text-lg mb-4">Keyword Match</h3>
              <div className="mb-4">
                <span className="text-xs uppercase font-bold text-muted mb-2 block">Matches Found</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.skills_found?.map((s: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-green-500/10 text-green-600 rounded text-xs font-medium">{s}</span>
                  ))}
                  {(!data.skills_found || data.skills_found.length === 0) && <span className="text-sm text-muted">None found</span>}
                </div>
              </div>
              <div>
                <span className="text-xs uppercase font-bold text-muted mb-2 block">Missing Skills</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.missing_skills?.map((s: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-rose-500/10 text-rose-600 rounded text-xs font-medium">{s}</span>
                  ))}
                  {(!data.missing_skills || data.missing_skills.length === 0) && <span className="text-sm text-muted">No gaps!</span>}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
