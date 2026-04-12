"use client";

import NavBar from "@/components/NavBar";
import UploadZone from "@/components/UploadZone";
import CreditPlansCard from "@/components/CreditPlansCard";
import { AlertTriangle, ArrowRight, BrainCog } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { addLocalHistory } from "@/utils/historyStore";
import { detectMissingCoreSections, getExampleResumeTextTemplate } from "@/utils/resumeQuality";
import { getCreditWallet, setCreditWallet, syncCreditWalletFromServer } from "@/utils/creditWallet";

function getReadableError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    const parts = [maybeError.message, maybeError.details, maybeError.hint, maybeError.code].filter(Boolean);
    if (parts.length) {
      return parts.join(" | ");
    }
  }

  return "Unknown Supabase insert error";
}

export default function UploadPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [creditOwnerId, setCreditOwnerId] = useState("guest");
  const [creditBalance, setCreditBalance] = useState(() => getCreditWallet("guest").balance);
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [premiumNotice, setPremiumNotice] = useState<string | null>(null);
  const [resumeStructureIssue, setResumeStructureIssue] = useState<{
    missingSections: string[];
    message: string;
  } | null>(null);

  const exampleResumeTextTemplate = getExampleResumeTextTemplate();

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
      } else {
        setCreditBalance(getCreditWallet(user.id).balance);
      }
      setAuthChecked(true);
    };

    verifyUser();
  }, [router]);

  const handleAnalyze = async () => {
    if (!file) {
      alert("Please upload a resume file first.");
      return;
    }

    setResumeStructureIssue(null);
    setPremiumNotice(null);
    setIsAnalyzing(true);
    try {
      // Lazy load to prevent hydration issues with pdfjs worker
      const { extractTextFromFile } = await import("@/utils/resumeParser");
      const text = await extractTextFromFile(file);

      if (text.length < 50) {
        throw new Error("Could not extract enough text from the document. Please ensure the PDF/DOCX has text, not just images.");
      }

      const missingCoreSections = detectMissingCoreSections(text);
      if (missingCoreSections.length > 0) {
        setResumeStructureIssue({
          missingSections: missingCoreSections,
          message:
            "Resume structure is incomplete. Please make your resume properly before analysis. Basic sections are mandatory for reliable ATS and quality checks.",
        });
        setIsAnalyzing(false);
        return;
      }

      sessionStorage.setItem("lastUploadedResumeText", text);
      sessionStorage.setItem("lastUploadedFileName", file.name);
      sessionStorage.setItem("lastJobDescription", jd);

      let accessToken: string | null = null;
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? null;
      }

      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({ resumeText: text, jobDescription: jd, premiumEnabled: true })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to analyze resume.");
      }

      const data = await response.json();

      let isHistorySaved = false;
      let historySaveReason = "";

      // Attempt to save to Supabase history first if configured and user is logged in.
      try {
        if (supabase) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { error: insertError } = await supabase.from('analyses').insert({
              user_id: user.id,
              file_name: file.name,
              job_description: jd,
              data: data
            });

            if (insertError) {
              historySaveReason = getReadableError(insertError);
            } else {
              isHistorySaved = true;
            }
          }
        }
      } catch (supeErr) {
        historySaveReason = getReadableError(supeErr);
      }

      // Keep local trend cache even when remote save succeeds.
      addLocalHistory({
        file_name: file.name,
        job_description: jd,
        data,
      }, creditOwnerId);

      if (!isHistorySaved) {
        if (historySaveReason) {
          console.warn(`Supabase history save skipped. Using local fallback. Reason: ${historySaveReason}`);
        }
      }

      if (typeof data?.remaining_credits === "number") {
        const syncedWallet = setCreditWallet(creditOwnerId, {
          ...getCreditWallet(creditOwnerId),
          balance: data.remaining_credits,
          updatedAt: new Date().toISOString(),
        });
        setCreditBalance(syncedWallet.balance);
      }

      if (data?.pro_unlocked === true) {
        setPremiumNotice(
          typeof data?.premium_message === "string" && data.premium_message.trim()
            ? data.premium_message
            : "Pro analysis unlocked for this run."
        );
      } else {
        setCreditBalance(getCreditWallet(creditOwnerId).balance);
        setPremiumNotice(
          typeof data?.premium_message === "string" && data.premium_message.trim()
            ? data.premium_message
            : "Credits exhausted: report generated in basic mode. Buy credits or upgrade to Pro for full analysis modules."
        );
      }

      sessionStorage.setItem("lastAnalysisResult", JSON.stringify(data));
      
      router.push("/analysis");
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "An unexpected error occurred.";
      alert(errMsg);
      setIsAnalyzing(false);
    }
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
    <main className="flex flex-col min-h-screen bg-background">
      <NavBar />

      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-24 mt-10">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-heading font-bold mb-4">Resume Lab</h1>
          <p className="text-muted text-lg">Upload resume + target JD to generate ATS simulation, recruiter-eye-path, rewrite intelligence, and offer-ready strategy outputs.</p>
        </div>

        <div className="glass-card p-4 border-primary-500/20 bg-primary-500/5 mb-8">
          <p className="text-sm text-foreground font-semibold mb-1">This run can unlock:</p>
          <p className="text-xs text-muted">Pro: ATS simulator, recruiter eye-path, variants, hidden red-flags. Premium: interview predictor, offer copilot, application pack, career graph, reachability, and skill ROI planner.</p>
        </div>

        <div className="space-y-8">
          <div className="glass-card p-6 md:p-8">
            <h2 className="text-xl font-heading font-bold mb-4">1. Upload Resume File</h2>
            <UploadZone
              onFileSelect={(selectedFile) => {
                setFile(selectedFile);
                setResumeStructureIssue(null);
              }}
              onClear={() => {
                setFile(null);
                setResumeStructureIssue(null);
              }}
            />
          </div>

          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-heading font-bold">2. Target Job Description <span className="text-sm font-normal text-muted">(Optional, but strongly recommended)</span></h2>
            </div>
            <textarea 
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the target job description here to receive an accurate ATS match and keyword gap analysis..."
              className="w-full min-h-[160px] p-4 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none transition-all resize-y text-sm text-foreground"
            />
          </div>

          <div id="premium-wallet">
            <CreditPlansCard
              ownerId={creditOwnerId}
              title="Credit Wallet (Free Tier)"
              subtitle="Free tier uses 1 credit per Pro analysis unlock. Pro/Premium subscriptions are unlimited."
              onWalletChange={(wallet) => setCreditBalance(wallet.balance)}
            />
          </div>

          <div className="glass-card p-4 border-primary-500/20 bg-primary-500/5">
            <p className="text-sm text-foreground">
              Current balance: <span className="font-semibold text-primary-600">{creditBalance} credits</span>
            </p>
            <p className="text-xs text-muted mt-1">
              Pro modules: ATS simulator, recruiter eye-path, variants, and hidden red-flags. Premium adds interview predictor, negotiation copilot, application pack, career graph, reachability score, and skill ROI planner.
            </p>
          </div>

          {resumeStructureIssue && (
            <div className="glass-card p-6 md:p-8 border-rose-500/30 bg-rose-500/5">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5" />
                <div>
                  <h3 className="text-lg font-heading font-bold text-rose-700">Resume needs proper structure</h3>
                  <p className="text-sm text-rose-700/90 mt-1">{resumeStructureIssue.message}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-semibold text-rose-700 mb-2">Missing basic sections:</p>
                <div className="flex flex-wrap gap-2">
                  {resumeStructureIssue.missingSections.map((section) => (
                    <span key={section} className="px-2 py-1 rounded-full text-xs bg-rose-500/15 text-rose-700 font-medium">
                      {section}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-semibold mb-2">Example text-format resume template</p>
                <pre className="text-xs text-muted whitespace-pre-wrap leading-relaxed max-h-72 overflow-auto">
{exampleResumeTextTemplate}
                </pre>
              </div>
            </div>
          )}

          {premiumNotice && (
            <div className="glass-card p-4 border-amber-500/30 bg-amber-500/10 text-amber-700 text-sm">
              {premiumNotice}
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleAnalyze}
              disabled={!file || isAnalyzing}
              className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/50 disabled:cursor-not-allowed text-white px-8 py-4 rounded-full font-medium transition-all shadow-lg shadow-primary-500/20"
            >
              {isAnalyzing ? (
                <>
                  <BrainCog className="w-5 h-5 animate-spin" /> Analyzing via Gemini...
                </>
              ) : (
                <>
                  Generate Strategic Report <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
