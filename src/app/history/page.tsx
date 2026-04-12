"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { FileText, ArrowRight, Trash2 } from "lucide-react";
import { getLocalHistory, clearLocalHistory } from "@/utils/historyStore";

type AnalysisHistoryItem = {
  id: string;
  file_name: string;
  job_description: string | null;
  data: {
    overall_score?: number;
  };
  created_at: string;
};

function mergeHistory(remoteItems: AnalysisHistoryItem[], localItems: AnalysisHistoryItem[]): AnalysisHistoryItem[] {
  const combined = [...remoteItems, ...localItems];
  const unique = new Map<string, AnalysisHistoryItem>();

  for (const item of combined) {
    const key = `${item.file_name}-${item.created_at}`;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  return Array.from(unique.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>(
    () => (!supabase ? (getLocalHistory("guest") as AnalysisHistoryItem[]) : [])
  );
  const [historyOwnerId, setHistoryOwnerId] = useState("guest");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient) {
      return;
    }

    const fetchHistory = async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      setHistoryOwnerId(user.id);
      const localHistory = getLocalHistory(user.id) as AnalysisHistoryItem[];

      const { data, error } = await supabaseClient
        .from('analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        setHistoryWarning("Cloud history fetch failed. Showing locally saved history.");
        setAnalyses(localHistory);
        setLoading(false);
        return;
      }

      const remoteHistory = (data ?? []) as AnalysisHistoryItem[];
      setAnalyses(mergeHistory(remoteHistory, localHistory));
      setLoading(false);
    };

    fetchHistory();
  }, [router]);

  const handleClearHistory = async () => {
    if (loading || analyses.length === 0 || isClearing) {
      return;
    }

    const shouldClear = window.confirm("Clear all history entries? This action cannot be undone.");
    if (!shouldClear) {
      return;
    }

    setIsClearing(true);
    setHistoryWarning(null);
    setHistoryNotice(null);

    clearLocalHistory(historyOwnerId);

    let cloudCleared = true;

    try {
      if (supabase) {
        const supabaseClient = supabase;
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();

        if (user) {
          const { error } = await supabaseClient.from("analyses").delete().eq("user_id", user.id);
          if (error) {
            cloudCleared = false;
            setHistoryWarning("Local history cleared, but cloud history could not be cleared.");
          }
        }
      }
    } catch {
      cloudCleared = false;
      setHistoryWarning("Local history cleared, but cloud history could not be cleared.");
    }

    setAnalyses([]);
    setHistoryNotice(cloudCleared ? "History cleared successfully." : "Local history cleared.");
    setIsClearing(false);
  };

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-24 mt-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-8">
          <h1 className="text-3xl font-heading font-bold">Report Archive</h1>
          <button
            onClick={handleClearHistory}
            disabled={loading || analyses.length === 0 || isClearing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4" /> {isClearing ? "Clearing..." : "Clear History"}
          </button>
        </div>
        
        {loading ? (
          <p className="text-muted">Loading history...</p>
        ) : !supabase ? (
          analyses.length === 0 ? (
            <div className="glass-card p-8 border-rose-500/20 text-rose-500">
              Supabase is not configured and local history is empty.
            </div>
          ) : null
        ) : analyses.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No reports yet. Run your first Resume Lab analysis to build your archive.</p>
            <button onClick={() => router.push("/upload")} className="mt-4 text-primary-500 font-medium">
              Start first report &rarr;
            </button>
          </div>
        ) : (
          <>
            {historyNotice && (
              <div className="glass-card p-4 border-green-500/30 text-green-600 mb-6">
                {historyNotice}
              </div>
            )}

            {historyWarning && (
              <div className="glass-card p-4 border-amber-500/30 text-amber-600 mb-6">
                {historyWarning}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {analyses.map(item => (
                <div key={item.id} className="glass-card p-6 flex flex-col hover:-translate-y-1 transition-transform cursor-pointer"
                  onClick={() => {
                    sessionStorage.setItem("lastAnalysisResult", JSON.stringify(item.data));
                    router.push("/analysis");
                  }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold font-heading truncate flex-1 pr-4" title={item.file_name}>{item.file_name}</h3>
                    <span className="text-primary-500 font-bold bg-primary-500/10 px-2 py-1 rounded text-sm shrink-0">
                      {item.data?.overall_score || 0}%
                    </span>
                  </div>
                  <div className="text-sm text-muted mb-4 flex-1 line-clamp-2">
                    Target Role: {item.job_description ? "Custom Job Description" : "General Resume Lab Analysis"}
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted border-t border-border pt-4 mt-auto">
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1 text-primary-500 font-medium">Open Report <ArrowRight className="w-3 h-3"/></span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
