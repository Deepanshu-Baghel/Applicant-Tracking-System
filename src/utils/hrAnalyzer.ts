import { detectMissingCoreSections } from "@/utils/resumeQuality";

export type CandidateAnalysis = {
  id: string;
  fileName: string;
  resumeText: string;
  matchScore: number;
  jdMatchScore: number;
  requiredSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  experienceYears: number | null;
  redFlags: string[];
  rankingReason: string;
};

const SKILL_BANK = [
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node.js",
  "python",
  "java",
  "sql",
  "mysql",
  "postgresql",
  "mongodb",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "rest api",
  "graphql",
  "microservices",
  "redis",
  "git",
  "tailwind",
  "figma",
  "excel",
  "power bi",
  "tableau",
  "selenium",
  "cypress",
  "playwright",
  "devops",
  "ci/cd",
  "machine learning",
  "nlp",
  "data analysis",
];

const STOP_WORDS = new Set([
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
  "able",
  "into",
  "about",
  "their",
  "been",
  "our",
  "using",
  "plus",
  "who",
  "you",
  "its",
  "all",
  "any",
  "not",
  "but",
  "has",
  "had",
  "can",
  "per",
  "one",
  "two",
  "three",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
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

function extractYearGaps(text: string): number[] {
  const years = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (years.length < 2) {
    return [];
  }

  const unique = Array.from(new Set(years)).sort((a, b) => b - a);
  const gaps: number[] = [];

  for (let i = 0; i < unique.length - 1; i += 1) {
    const gap = unique[i] - unique[i + 1];
    if (gap > 2) {
      gaps.push(gap);
    }
  }

  return gaps;
}

function extractTopJdKeywords(jdText: string): string[] {
  const tokens = tokenize(jdText);
  const frequency = new Map<string, number>();

  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 30);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function analyzeCandidate(fileName: string, resumeText: string, jdText: string): CandidateAnalysis {
  const resumeLower = resumeText.toLowerCase();
  const jdLower = jdText.toLowerCase();

  const requiredSkills = SKILL_BANK.filter((skill) => jdLower.includes(skill));
  const matchedSkills = requiredSkills.filter((skill) => resumeLower.includes(skill));
  const missingSkills = requiredSkills.filter((skill) => !resumeLower.includes(skill));

  const topJdKeywords = extractTopJdKeywords(jdText);
  const keywordMatches = topJdKeywords.filter((keyword) => resumeLower.includes(keyword)).length;
  const keywordCoverage = topJdKeywords.length ? keywordMatches / topJdKeywords.length : 0.5;

  const skillCoverage = requiredSkills.length ? matchedSkills.length / requiredSkills.length : keywordCoverage;
  const hasQuantifiedImpact = /\d+\s*%|\d+\s*(?:x|k|m|ms|s|days?|months?|years?)/i.test(resumeText);
  const impactScore = hasQuantifiedImpact ? 1 : 0;

  const rawScore = skillCoverage * 65 + keywordCoverage * 25 + impactScore * 10;

  const experienceYears = extractYearsExperience(resumeText);
  const yearGaps = extractYearGaps(resumeText);
  const redFlags: string[] = [];
  const missingCoreSections = detectMissingCoreSections(resumeText);

  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  if (wordCount < 140) {
    redFlags.push("Resume is too short and may miss critical details.");
  }

  if (yearGaps.length > 0) {
    redFlags.push(`Possible employment gap detected (${yearGaps.join(", ")} years).`);
  }

  if (!hasQuantifiedImpact) {
    redFlags.push("No measurable achievements found in key bullets.");
  }

  const seniorTitle = /\b(senior|lead|principal|architect|head)\b/i.test(resumeText);
  if (seniorTitle && experienceYears !== null && experienceYears < 3) {
    redFlags.push("Potential title inflation vs stated years of experience.");
  }

  const listedSkillCount = SKILL_BANK.filter((skill) => resumeLower.includes(skill)).length;
  if (listedSkillCount > 12 && wordCount < 320) {
    redFlags.push("Possible skill stuffing detected (many skills, limited depth).");
  }

  if (missingCoreSections.length > 0) {
    redFlags.push(`Missing mandatory resume sections: ${missingCoreSections.join(", ")}.`);
  }

  if (missingCoreSections.length >= 2) {
    redFlags.push("Resume looks structurally incomplete and may be low-quality or fake-risk.");
  }

  const sectionPenalty = missingCoreSections.length * 8;
  const redFlagPenalty = redFlags.length * 3;
  const penalty = Math.min(35, redFlagPenalty + sectionPenalty);
  let jdMatchScore = clampScore(rawScore - penalty);

  // Hard gate for incomplete resumes: keep score low so recruiters can filter fake/incomplete CVs quickly.
  if (missingCoreSections.length >= 2) {
    jdMatchScore = Math.min(jdMatchScore, 35);
  }

  const rankingParts: string[] = [];
  if (matchedSkills.length > 0) {
    rankingParts.push(`Matched ${matchedSkills.length}/${requiredSkills.length || matchedSkills.length} core JD skills.`);
  } else {
    rankingParts.push("Low core skill overlap with JD requirements.");
  }

  if (hasQuantifiedImpact) {
    rankingParts.push("Has quantified outcomes, improving recruiter confidence.");
  }

  if (redFlags.length === 0) {
    rankingParts.push("No major red flags detected.");
  } else {
    rankingParts.push(`${redFlags.length} red flag(s) need recruiter review.`);
  }

  if (missingCoreSections.length > 0) {
    rankingParts.push("Candidate resume is incomplete on core sections and requires strict validation.");
  }

  return {
    id: `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    resumeText,
    matchScore: jdMatchScore,
    jdMatchScore,
    requiredSkills,
    matchedSkills,
    missingSkills,
    experienceYears,
    redFlags,
    rankingReason: rankingParts.join(" "),
  };
}

export function toCsv(candidates: CandidateAnalysis[]): string {
  const headers = [
    "Candidate",
    "JD Match Score",
    "Experience Years",
    "Matched Skills",
    "Missing Skills",
    "Red Flags",
    "Ranking Reason",
  ];

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const rows = candidates.map((candidate) => [
    candidate.fileName,
    String(candidate.jdMatchScore),
    candidate.experienceYears === null ? "N/A" : String(candidate.experienceYears),
    candidate.matchedSkills.join(" | "),
    candidate.missingSkills.join(" | "),
    candidate.redFlags.join(" | "),
    candidate.rankingReason,
  ]);

  return [headers, ...rows].map((row) => row.map((cell) => escape(cell)).join(",")).join("\n");
}
