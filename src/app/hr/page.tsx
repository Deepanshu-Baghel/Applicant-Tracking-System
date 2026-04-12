"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Coins,
  Download,
  Lock,
  Rocket,
  Scale,
  Target,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import clsx from "clsx";
import NavBar from "@/components/NavBar";
import CreditPlansCard from "@/components/CreditPlansCard";
import { supabase } from "@/lib/supabase";
import { extractTextFromFile } from "@/utils/resumeParser";
import { CandidateAnalysis, analyzeCandidate, toCsv } from "@/utils/hrAnalyzer";
import {
  getCreditWallet,
  syncCreditWalletFromServer,
} from "@/utils/creditWallet";
import { fetchSubscriptionStatus } from "@/utils/subscriptionClient";
import { type SubscriptionTier } from "@/lib/subscriptionPlans";

const MIN_BATCH_UPLOADS = 5;
const DEFAULT_MAX_BATCH_UPLOADS = 40;
const PREMIUM_MAX_BATCH_UPLOADS = 50;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function interviewBand(score: number): "High" | "Medium" | "Low" {
  if (score >= 65) {
    return "High";
  }

  if (score >= 40) {
    return "Medium";
  }

  return "Low";
}

type FlagSeverity = "High" | "Medium" | "Low";

type HiddenFlagInsight = {
  severity: FlagSeverity;
  issue: string;
  fix: string;
};

type CandidateVariant = {
  title: string;
  summary: string;
  actions: string[];
};

function severityStyles(severity: FlagSeverity): string {
  if (severity === "High") {
    return "bg-rose-500/15 text-rose-600";
  }

  if (severity === "Medium") {
    return "bg-amber-500/15 text-amber-600";
  }

  return "bg-slate-500/15 text-slate-600";
}

function inferFlagSeverity(flag: string): FlagSeverity {
  const value = flag.toLowerCase();
  if (
    value.includes("fake-risk") ||
    value.includes("structurally incomplete") ||
    value.includes("missing mandatory resume sections") ||
    value.includes("parsing failed")
  ) {
    return "High";
  }

  if (value.includes("gap") || value.includes("inflation") || value.includes("skill stuffing")) {
    return "Medium";
  }

  return "Low";
}

function buildVariantHints(candidate: CandidateAnalysis): CandidateVariant[] {
  const matched = candidate.matchedSkills.slice(0, 3);
  const missing = candidate.missingSkills.slice(0, 3);

  return [
    {
      title: "Execution-Fit Variant",
      summary:
        "Position candidate as delivery-focused with measurable ownership and implementation depth.",
      actions: [
        "Lead with top 3 shipped outcomes and quantified impact.",
        matched.length
          ? `Highlight strengths: ${matched.join(", ")}.`
          : "Show role-relevant execution proof in first project bullets.",
      ],
    },
    {
      title: "JD-Match Variant",
      summary: "Optimize resume wording around the current JD for higher ATS pass confidence.",
      actions: [
        missing.length
          ? `Close gaps for: ${missing.join(", ")}.`
          : "Keep keyword density balanced with evidence-based achievements.",
        "Mirror JD wording in summary, skills, and role-specific bullets.",
      ],
    },
    {
      title: "Leadership-Narrative Variant",
      summary: "Shift story from task completion to ownership, decisions, and cross-team influence.",
      actions: [
        "Add one bullet showing initiative ownership and business impact.",
        "Emphasize collaboration and decision-making under constraints.",
      ],
    },
  ];
}

function buildHiddenFlagInsights(candidate: CandidateAnalysis): HiddenFlagInsight[] {
  const fromFlags = candidate.redFlags.slice(0, 3).map((flag) => ({
    severity: inferFlagSeverity(flag),
    issue: flag,
    fix:
      inferFlagSeverity(flag) === "High"
        ? "Recruiter should request corrected resume before final shortlist."
        : inferFlagSeverity(flag) === "Medium"
          ? "Ask candidate for evidence-backed examples in screening round."
          : "Mark as watch item and validate during interview discussion.",
  }));

  const fallback: HiddenFlagInsight = {
    severity: candidate.missingSkills.length >= 3 ? "Medium" : "Low",
    issue:
      candidate.missingSkills.length >= 3
        ? `Key JD skills missing: ${candidate.missingSkills.slice(0, 3).join(", ")}.`
        : "No major hidden red flags detected from structure scan.",
    fix:
      candidate.missingSkills.length >= 3
        ? "Request targeted resume revision before final panel evaluation."
        : "Proceed with standard evaluation checklist.",
  };

  return (fromFlags.length ? fromFlags : [fallback]).slice(0, 4);
}

function buildRecruiterOutreach(candidate: CandidateAnalysis) {
  return {
    subject: `Interview Discussion - ${candidate.fileName}`,
    email: `Hi ${candidate.fileName.split(".")[0]}, your profile aligns with our role expectations (JD match ${candidate.jdMatchScore}%). We would like to schedule a discussion for next steps.`,
    linkedin: `Hi ${candidate.fileName.split(".")[0]}, your experience looks relevant for our open role. Would you be open to a quick screening conversation this week?`,
  };
}

export default function HrToolPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [creditOwnerId, setCreditOwnerId] = useState("guest");
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free");
  const [creditBalance, setCreditBalance] = useState(() => getCreditWallet("guest").balance);
  const [files, setFiles] = useState<File[]>([]);
  const [jdText, setJdText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [proUnlockedForBatch, setProUnlockedForBatch] = useState(false);
  const [premiumUnlockedForBatch, setPremiumUnlockedForBatch] = useState(false);
  const [candidates, setCandidates] = useState<CandidateAnalysis[]>([]);
  const [shortlistedIds, setShortlistedIds] = useState<Set<string>>(new Set());
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  const maxBatchUploads =
    subscriptionTier === "premium" ? PREMIUM_MAX_BATCH_UPLOADS : DEFAULT_MAX_BATCH_UPLOADS;

  useEffect(() => {
    const verifyUser = async () => {
      if (!supabase) {
        setCreditOwnerId("guest");
        setCreditBalance(getCreditWallet("guest").balance);
        setAuthChecked(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setCreditOwnerId(user.id);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        const synced = await syncCreditWalletFromServer(user.id, session.access_token);
        setCreditBalance(synced?.balance ?? getCreditWallet(user.id).balance);

        const subscription = await fetchSubscriptionStatus(session.access_token);
        if (subscription?.tier) {
          setSubscriptionTier(subscription.tier);
        }
      } else {
        setCreditBalance(getCreditWallet(user.id).balance);
      }
      setAuthChecked(true);
    };

    verifyUser();
  }, [router]);

  const topThree = useMemo(() => candidates.slice(0, 3), [candidates]);
  const topEight = useMemo(() => candidates.slice(0, 8), [candidates]);

  const matchDistribution = useMemo(() => {
    const bins = [
      { label: "0-40", min: 0, max: 40 },
      { label: "41-60", min: 41, max: 60 },
      { label: "61-75", min: 61, max: 75 },
      { label: "76-100", min: 76, max: 100 },
    ];

    const total = Math.max(1, candidates.length);

    return bins.map((bin) => {
      const count = candidates.filter(
        (candidate) => candidate.jdMatchScore >= bin.min && candidate.jdMatchScore <= bin.max
      ).length;

      return {
        ...bin,
        count,
        percent: Math.round((count / total) * 100),
      };
    });
  }, [candidates]);

  const missingSkillFrequency = useMemo(() => {
    const frequency = new Map<string, number>();

    for (const candidate of candidates) {
      for (const skill of candidate.missingSkills) {
        frequency.set(skill, (frequency.get(skill) ?? 0) + 1);
      }
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill, count]) => ({ skill, count }));
  }, [candidates]);

  const candidateA = useMemo(
    () => candidates.find((candidate) => candidate.id === compareA) ?? null,
    [candidates, compareA]
  );

  const candidateB = useMemo(
    () => candidates.find((candidate) => candidate.id === compareB) ?? null,
    [candidates, compareB]
  );

  function isQualityGatePassed(candidate: CandidateAnalysis): boolean {
    const hasMissingCoreSections = candidate.redFlags.some((flag) =>
      flag.toLowerCase().includes("missing mandatory resume sections")
    );

    const hasFakeRiskSignal = candidate.redFlags.some((flag) =>
      flag.toLowerCase().includes("fake-risk") || flag.toLowerCase().includes("structurally incomplete")
    );

    return !hasMissingCoreSections && !hasFakeRiskSignal;
  }

  const candidateInsights = useMemo(() => {
    return topEight.map((candidate) => {
      const skillMatchRatio = candidate.requiredSkills.length
        ? candidate.matchedSkills.length / candidate.requiredSkills.length
        : 0.5;
      const qualityBonus = isQualityGatePassed(candidate) ? 12 : -8;
      const probability = clampScore(
        candidate.jdMatchScore * 0.6 + skillMatchRatio * 25 - candidate.redFlags.length * 4 + qualityBonus
      );

      const greenhouse = clampScore(candidate.jdMatchScore - candidate.missingSkills.length * 2);
      const lever = clampScore(candidate.jdMatchScore - candidate.redFlags.length * 3 + 3);
      const workday = clampScore(candidate.jdMatchScore - candidate.missingSkills.length - candidate.redFlags.length * 2);

      return {
        id: candidate.id,
        fileName: candidate.fileName,
        probability,
        band: interviewBand(probability),
        greenhouse,
        lever,
        workday,
        variants: buildVariantHints(candidate),
        hiddenFlags: buildHiddenFlagInsights(candidate),
        outreach: buildRecruiterOutreach(candidate),
      };
    });
  }, [topEight]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) {
      return;
    }

    const limited = selected.slice(0, maxBatchUploads);
    setFiles(limited);

    if (selected.length > maxBatchUploads) {
      setErrorText(`Maximum ${maxBatchUploads} resumes allowed. First ${maxBatchUploads} files selected.`);
    } else {
      setErrorText("");
    }
  };

  const toggleShortlist = (candidateId: string) => {
    setShortlistedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  const runBatchAnalysis = async () => {
    setErrorText("");
    setRunNotice(null);

    if (!jdText.trim()) {
      setErrorText("Please add a job description first.");
      return;
    }

    if (files.length < MIN_BATCH_UPLOADS) {
      setErrorText(`Please upload at least ${MIN_BATCH_UPLOADS} resumes for HR batch analysis.`);
      return;
    }

    if (files.length > maxBatchUploads) {
      setErrorText(`Maximum ${maxBatchUploads} resumes can be analyzed at once.`);
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);

    const results: CandidateAnalysis[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      try {
        const text = await extractTextFromFile(file);
        const normalizedText = text.trim();

        if (normalizedText.length < 100) {
          throw new Error("Insufficient extractable text");
        }

        const analysis = analyzeCandidate(file.name, normalizedText, jdText);
        results.push(analysis);
      } catch {
        results.push({
          id: `${file.name}-${Date.now()}-${index}`,
          fileName: file.name,
          resumeText: "",
          matchScore: 0,
          jdMatchScore: 0,
          requiredSkills: [],
          matchedSkills: [],
          missingSkills: [],
          experienceYears: null,
          redFlags: [
            "Resume parsing failed or file has low-quality text.",
            "Candidate needs manual recruiter review.",
          ],
          rankingReason: "Could not parse resume cleanly, so match confidence is very low.",
        });
      }

      setProgress(Math.round(((index + 1) / files.length) * 100));
    }

    const sorted = [...results].sort((a, b) => b.matchScore - a.matchScore);
    setCandidates(sorted);
    setShortlistedIds(new Set());
    setCompareA(sorted[0]?.id ?? "");
    setCompareB(sorted[1]?.id ?? "");

    let proEnabledForBatch = false;
    let premiumEnabledForBatch = subscriptionTier === "premium";
    const hasProSubscription = subscriptionTier === "pro" || subscriptionTier === "premium";

    const {
      data: { session },
    } = supabase ? await supabase.auth.getSession() : { data: { session: null } };

    if (hasProSubscription) {
      proEnabledForBatch = true;
      premiumEnabledForBatch = subscriptionTier === "premium";
      setRunNotice(
        subscriptionTier === "premium"
          ? "Premium subscription active: Pro + Premium HR insights unlocked with no credit deduction."
          : "Pro subscription active: advanced HR insights unlocked with no credit deduction."
      );
    } else if (session?.access_token) {
      proEnabledForBatch = false;
      premiumEnabledForBatch = false;
      setRunNotice(
        "Free tier has basic access only. Upgrade to Pro or Premium to unlock HR Pro insights."
      );
    } else {
      proEnabledForBatch = false;
      premiumEnabledForBatch = false;
      setRunNotice(
        "Free tier has basic access only. Upgrade to Pro or Premium to unlock HR Pro insights."
      );
    }

    setProUnlockedForBatch(proEnabledForBatch);
    setPremiumUnlockedForBatch(premiumEnabledForBatch);

    setIsAnalyzing(false);
  };

  const exportShortlistCsv = () => {
    const selected = shortlistedIds.size
      ? candidates.filter((candidate) => shortlistedIds.has(candidate.id))
      : candidates;

    if (!selected.length) {
      setErrorText("No candidates available for export.");
      return;
    }

    const csv = toCsv(selected);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "hr_shortlist_report.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-muted">Checking authentication...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen bg-background pb-20">
      <NavBar />

      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-24 mt-10 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl md:text-5xl font-heading font-bold">Recruiter Suite</h1>
          <p className="text-muted text-lg max-w-3xl">
            Batch-screen resumes, rank top matches, compare profiles side-by-side, detect hidden risk signals, and export recruiter-ready shortlist reports.
          </p>
        </header>

        <section className="glass-card p-6 md:p-8 space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-4 bg-card/70">
              <h2 className="font-heading font-bold text-lg flex items-center gap-2 mb-2">
                <Upload className="w-5 h-5 text-primary-500" /> Batch Resume Upload
              </h2>
              <p className="text-sm text-muted mb-3">Upload {MIN_BATCH_UPLOADS}-{maxBatchUploads} PDF/DOCX resumes together for a single job opening.</p>
              <input
                type="file"
                multiple
                accept=".pdf,.docx"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-primary-500 file:text-white file:font-medium file:cursor-pointer"
              />
              <p className="text-xs text-muted mt-2">Selected: {files.length} file(s)</p>
            </div>

            <div className="rounded-xl border border-border p-4 bg-card/70">
              <h2 className="font-heading font-bold text-lg flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-primary-500" /> JD Match Setup
              </h2>
              <p className="text-sm text-muted mb-3">JD is required for match scoring, ranking, and red flag quality checks.</p>
              <textarea
                value={jdText}
                onChange={(event) => setJdText(event.target.value)}
                placeholder="Paste job description here..."
                className="w-full min-h-[120px] p-3 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary-500/40 outline-none"
              />
            </div>
          </div>

          {files.length > 0 && (
            <div className="rounded-xl border border-border p-4 bg-card/50">
              <h3 className="text-sm font-semibold mb-2">Selected Files</h3>
              <div className="grid md:grid-cols-2 gap-2 text-xs text-muted max-h-40 overflow-auto">
                {files.map((file) => (
                  <div key={file.name} className="truncate">• {file.name}</div>
                ))}
              </div>
            </div>
          )}

          {errorText && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 text-sm px-3 py-2">
              {errorText}
            </div>
          )}

          <CreditPlansCard
            ownerId={creditOwnerId}
            title="Recruiter Wallet"
            subtitle="Wallet balance is visible here. Pro recruiter modules require Pro/Premium subscription."
            onWalletChange={(wallet) => setCreditBalance(wallet.balance)}
          />

          <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 px-3 py-2 text-sm text-foreground">
            <span className="font-semibold text-primary-600">{creditBalance} credits</span> available in wallet.
            <span className="ml-2 text-xs text-muted">
              Tier: <span className="font-semibold text-primary-600 capitalize">{subscriptionTier}</span> | Max upload: {maxBatchUploads}
            </span>
          </div>

          {runNotice && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 text-sm px-3 py-2">
              {runNotice}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <button
              onClick={runBatchAnalysis}
              disabled={isAnalyzing}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/50 text-white font-medium transition-colors"
            >
              <Users className="w-4 h-4" /> Run Recruiter Analysis <ArrowRight className="w-4 h-4" />
            </button>

            {isAnalyzing && (
              <div className="w-full md:w-80">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>Processing resumes...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {candidates.length > 0 && (
          <>
            <section className="glass-card p-6 md:p-8">
              <h2 className="font-heading font-bold text-xl flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-primary-500" /> Best Candidate Finder
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {topThree.map((candidate, index) => (
                  <div key={candidate.id} className="rounded-xl border border-border p-4 bg-card/70">
                    <div className="text-xs font-semibold text-primary-500 mb-2">Rank #{index + 1}</div>
                    <div className="font-semibold text-sm truncate mb-1">{candidate.fileName}</div>
                    <div className="text-xs text-muted mb-2">JD Match: {candidate.jdMatchScore}%</div>
                    <p className="text-xs text-muted leading-relaxed">{candidate.rankingReason}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-card p-6 md:p-8">
              <h2 className="font-heading font-bold text-xl flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5 text-primary-500" /> Hiring Analytics
              </h2>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="rounded-xl border border-border p-4 bg-card/70">
                  <h3 className="text-sm font-semibold mb-4">JD Match Distribution</h3>
                  <div className="h-44 flex items-end gap-3">
                    {matchDistribution.map((bin) => (
                      <div key={bin.label} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full h-32 flex items-end">
                          <div
                            className="w-full rounded-t-md bg-primary-500/80"
                            style={{ height: `${Math.max(10, Math.round(bin.percent * 1.2))}px` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted text-center">
                          <div>{bin.label}</div>
                          <div className="font-semibold text-foreground">{bin.count}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4 bg-card/70">
                  <h3 className="text-sm font-semibold mb-4">Top Match Index</h3>
                  <div className="space-y-3">
                    {topEight.map((candidate) => (
                      <div key={`${candidate.id}-graph`}>
                        <div className="flex justify-between text-[11px] text-muted mb-1 gap-2">
                          <span className="truncate">{candidate.fileName}</span>
                          <span className="font-semibold text-foreground">{candidate.jdMatchScore}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-border overflow-hidden">
                          <div className="h-full bg-primary-500" style={{ width: `${candidate.jdMatchScore}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4 bg-card/70">
                  <h3 className="text-sm font-semibold mb-4">Missing Skill Frequency</h3>
                  {missingSkillFrequency.length > 0 ? (
                    <div className="space-y-3">
                      {missingSkillFrequency.map((item) => {
                        const width = Math.round((item.count / Math.max(1, candidates.length)) * 100);
                        return (
                          <div key={item.skill}>
                            <div className="flex justify-between text-[11px] text-muted mb-1 gap-2">
                              <span className="truncate">{item.skill}</span>
                              <span className="font-semibold text-foreground">{item.count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-border overflow-hidden">
                              <div className="h-full bg-amber-500" style={{ width: `${Math.max(8, width)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No major recurring missing skills detected in this batch.</p>
                  )}
                </div>
              </div>
            </section>

            {proUnlockedForBatch ? (
              <section className="glass-card p-6 md:p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
                  <div>
                    <h2 className="font-heading font-bold text-xl flex items-center gap-2">
                      <Coins className="w-5 h-5 text-primary-500" /> HR Pro Insights
                    </h2>
                    <p className="text-xs text-muted mt-2">
                      Dashboard-like recruiter intelligence in HR tool: ATS matrix, positioning variants, and hidden red-flag diagnostics.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                    Pro
                  </span>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-border p-4 bg-card/60">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary-500" /> ATS Compatibility Matrix
                    </h3>
                    <div className="overflow-auto">
                      <table className="w-full text-xs min-w-[440px]">
                        <thead>
                          <tr className="text-left border-b border-border text-muted">
                            <th className="py-2 pr-2">Candidate</th>
                            <th className="py-2 pr-2">Greenhouse</th>
                            <th className="py-2 pr-2">Lever</th>
                            <th className="py-2 pr-2">Workday</th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidateInsights.map((item) => (
                            <tr key={`${item.id}-ats-matrix`} className="border-b border-border/50">
                              <td className="py-2 pr-2 max-w-[180px] truncate">{item.fileName}</td>
                              <td className="py-2 pr-2">{item.greenhouse}%</td>
                              <td className="py-2 pr-2">{item.lever}%</td>
                              <td className="py-2 pr-2">{item.workday}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4 bg-card/60">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary-500" /> Candidate Positioning Variants
                    </h3>
                    <div className="space-y-4 max-h-[320px] overflow-auto pr-1">
                      {candidateInsights.slice(0, 4).map((item) => (
                        <div key={`${item.id}-variants`} className="rounded-lg border border-border p-3">
                          <p className="text-xs font-semibold text-foreground truncate mb-2">{item.fileName}</p>
                          <div className="space-y-2">
                            {item.variants.slice(0, 2).map((variant) => (
                              <div key={`${item.id}-${variant.title}`}>
                                <p className="text-[11px] font-semibold text-primary-600">{variant.title}</p>
                                <p className="text-[11px] text-muted leading-relaxed">{variant.summary}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4 bg-card/60">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-primary-500" /> Hidden Red-Flag Detector+
                    </h3>
                    <div className="space-y-3 max-h-[320px] overflow-auto pr-1">
                      {candidateInsights.slice(0, 5).map((item) => (
                        <div key={`${item.id}-flags`} className="rounded-lg border border-border p-3">
                          <p className="text-xs font-semibold text-foreground truncate mb-2">{item.fileName}</p>
                          <div className="space-y-2">
                            {item.hiddenFlags.slice(0, 2).map((flag, index) => (
                              <div key={`${item.id}-hidden-${index}`} className="text-[11px]">
                                <span className={clsx("inline-block px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider", severityStyles(flag.severity))}>
                                  {flag.severity}
                                </span>
                                <p className="text-foreground/80 mt-1 leading-relaxed">{flag.issue}</p>
                                <p className="text-muted leading-relaxed">Fix: {flag.fix}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="glass-card p-6 md:p-8 border-amber-500/30 bg-amber-500/5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-xl">HR Pro Insights Locked</h2>
                    <p className="text-sm text-muted mt-1">
                      Buy credits or upgrade tier to unlock ATS matrix, positioning variants, and hidden red-flag intelligence for this batch.
                    </p>
                  </div>
                </div>
                <p className="text-sm text-amber-700 mb-4">
                  Wallet balance: {creditBalance} credits. Free tier cannot unlock Pro recruiter modules.
                </p>
                <CreditPlansCard
                  ownerId={creditOwnerId}
                  title="Unlock Recruiter Pro"
                  subtitle="Upgrade to Pro/Premium for advanced recruiter intelligence modules."
                  onWalletChange={(wallet) => setCreditBalance(wallet.balance)}
                />
              </section>
            )}

            {proUnlockedForBatch && (
              premiumUnlockedForBatch ? (
                <section className="glass-card p-6 md:p-8 border-primary-500/20 bg-gradient-to-br from-card to-primary-500/5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
                    <div>
                      <h2 className="font-heading font-bold text-xl flex items-center gap-2">
                        <Rocket className="w-5 h-5 text-primary-500" /> HR Premium Layer
                      </h2>
                      <p className="text-xs text-muted mt-2">
                        Premium-only intelligence: interview conversion forecast and recruiter outreach pack.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-500/10 text-primary-600">
                      Premium
                    </span>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-6">
                    <div className="rounded-xl border border-border p-4 bg-card/60">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Rocket className="w-4 h-4 text-primary-500" /> Interview Conversion Forecast
                      </h3>
                      <div className="space-y-3">
                        {candidateInsights.map((item) => (
                          <div key={`${item.id}-probability`}>
                            <div className="flex items-center justify-between text-[11px] text-muted mb-1 gap-2">
                              <span className="truncate">{item.fileName}</span>
                              <span
                                className={clsx(
                                  "font-semibold",
                                  item.band === "High"
                                    ? "text-green-600"
                                    : item.band === "Medium"
                                      ? "text-amber-600"
                                      : "text-rose-600"
                                )}
                              >
                                {item.probability}% ({item.band})
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-border overflow-hidden">
                              <div
                                className={clsx(
                                  "h-full",
                                  item.band === "High"
                                    ? "bg-green-500"
                                    : item.band === "Medium"
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                )}
                                style={{ width: `${item.probability}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border p-4 bg-card/60">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary-500" /> Recruiter Outreach Pack
                      </h3>
                      <div className="space-y-3 max-h-[320px] overflow-auto pr-1">
                        {candidateInsights.slice(0, 4).map((item) => (
                          <div key={`${item.id}-outreach`} className="rounded-lg border border-border p-3 text-[11px]">
                            <p className="font-semibold text-foreground truncate mb-2">{item.fileName}</p>
                            <p className="text-primary-600 font-semibold">Subject</p>
                            <p className="text-muted mb-2">{item.outreach.subject}</p>
                            <p className="text-primary-600 font-semibold">Email Draft</p>
                            <p className="text-muted mb-2 leading-relaxed">{item.outreach.email}</p>
                            <p className="text-primary-600 font-semibold">LinkedIn Outreach</p>
                            <p className="text-muted leading-relaxed">{item.outreach.linkedin}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="glass-card p-6 md:p-8 border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-heading font-bold text-xl">HR Premium Layer Locked</h2>
                      <p className="text-sm text-muted mt-1">
                        Upgrade to Premium for interview forecast and recruiter outreach packs directly inside Recruiter Suite.
                      </p>
                    </div>
                  </div>
                </section>
              )
            )}

            <section className="glass-card p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <h2 className="font-heading font-bold text-xl">Match Score + Shortlist Board</h2>
                <button
                  onClick={exportShortlistCsv}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr className="text-left border-b border-border text-muted">
                      <th className="py-2 pr-3">Candidate</th>
                      <th className="py-2 pr-3">JD Match</th>
                      <th className="py-2 pr-3">Quality Gate</th>
                      <th className="py-2 pr-3">Matched Skills</th>
                      <th className="py-2 pr-3">Missing Skills</th>
                      <th className="py-2 pr-3">Red Flags</th>
                      <th className="py-2 pr-3">Shortlist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate.id} className="border-b border-border/50 align-top">
                        <td className="py-3 pr-3 max-w-[240px]">
                          <div className="truncate font-medium">{candidate.fileName}</div>
                          <div className="text-xs text-muted mt-1">Exp: {candidate.experienceYears ?? "N/A"} years</div>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={clsx(
                              "px-2 py-1 rounded-full text-xs font-semibold",
                              candidate.jdMatchScore >= 75
                                ? "bg-green-500/15 text-green-600"
                                : candidate.jdMatchScore >= 50
                                  ? "bg-amber-500/15 text-amber-600"
                                  : "bg-rose-500/15 text-rose-600"
                            )}
                          >
                            {candidate.jdMatchScore}%
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={clsx(
                              "px-2 py-1 rounded-full text-xs font-semibold",
                              isQualityGatePassed(candidate)
                                ? "bg-green-500/15 text-green-600"
                                : "bg-rose-500/15 text-rose-600"
                            )}
                          >
                            {isQualityGatePassed(candidate) ? "Pass" : "Fail"}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted">{candidate.matchedSkills.length}</td>
                        <td className="py-3 pr-3 text-xs text-muted">{candidate.missingSkills.length}</td>
                        <td className="py-3 pr-3 text-xs text-muted">{candidate.redFlags.length}</td>
                        <td className="py-3 pr-3">
                          <label className="inline-flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={shortlistedIds.has(candidate.id)}
                              onChange={() => toggleShortlist(candidate.id)}
                            />
                            Mark
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="glass-card p-6 md:p-8">
              <h2 className="font-heading font-bold text-xl flex items-center gap-2 mb-4">
                <Scale className="w-5 h-5 text-primary-500" /> Side-by-Side Compare
              </h2>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <select
                  value={compareA}
                  onChange={(event) => setCompareA(event.target.value)}
                  className="p-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="">Select candidate A</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.fileName}</option>
                  ))}
                </select>

                <select
                  value={compareB}
                  onChange={(event) => setCompareB(event.target.value)}
                  className="p-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="">Select candidate B</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.fileName}</option>
                  ))}
                </select>
              </div>

              {candidateA && candidateB && (
                <div className="overflow-auto">
                  <table className="w-full min-w-[640px] text-sm border border-border rounded-lg overflow-hidden">
                    <tbody>
                      {[
                        {
                          label: "JD Match Score",
                          a: `${candidateA.jdMatchScore}%`,
                          b: `${candidateB.jdMatchScore}%`,
                        },
                        {
                          label: "Experience",
                          a: `${candidateA.experienceYears ?? "N/A"} years`,
                          b: `${candidateB.experienceYears ?? "N/A"} years`,
                        },
                        {
                          label: "Matched Skills",
                          a: String(candidateA.matchedSkills.length),
                          b: String(candidateB.matchedSkills.length),
                        },
                        {
                          label: "Missing Skills",
                          a: String(candidateA.missingSkills.length),
                          b: String(candidateB.missingSkills.length),
                        },
                        {
                          label: "Red Flags",
                          a: String(candidateA.redFlags.length),
                          b: String(candidateB.redFlags.length),
                        },
                      ].map((row) => (
                        <tr key={row.label} className="border-b border-border/50 last:border-b-0">
                          <td className="px-3 py-2 font-medium bg-card/70">{row.label}</td>
                          <td className="px-3 py-2">{row.a}</td>
                          <td className="px-3 py-2">{row.b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="glass-card p-6 md:p-8">
              <h2 className="font-heading font-bold text-xl flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-primary-500" /> Red Flag Detector
              </h2>
              <div className="space-y-4">
                {candidates.map((candidate) => (
                  <div key={`${candidate.id}-flags`} className="rounded-xl border border-border p-4 bg-card/70">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="font-semibold text-sm truncate">{candidate.fileName}</div>
                      <span className="text-xs text-muted">{candidate.redFlags.length} flag(s)</span>
                    </div>

                    {candidate.redFlags.length ? (
                      <ul className="space-y-1">
                        {candidate.redFlags.map((flag, index) => (
                          <li key={`${candidate.id}-flag-${index}`} className="text-xs text-rose-600 flex items-start gap-2">
                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>{flag}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-green-600 flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3" /> No major red flags detected.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
