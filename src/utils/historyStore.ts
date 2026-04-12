const LOCAL_HISTORY_PREFIX = "resume_analysis_history";

export type HistoryRecord = {
  id: string;
  file_name: string;
  job_description: string;
  data: unknown;
  created_at: string;
  source: "local";
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeOwnerId(ownerId: string | null | undefined): string {
  if (!ownerId || !ownerId.trim()) {
    return "guest";
  }

  return ownerId.trim().toLowerCase();
}

function storageKey(ownerId: string | null | undefined): string {
  return `${LOCAL_HISTORY_PREFIX}:${normalizeOwnerId(ownerId)}`;
}

export function getLocalHistory(ownerId: string | null | undefined = "guest"): HistoryRecord[] {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey(ownerId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as HistoryRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

export function addLocalHistory(
  record: Omit<HistoryRecord, "id" | "created_at" | "source">,
  ownerId: string | null | undefined = "guest"
): void {
  if (!isBrowser()) {
    return;
  }

  const existing = getLocalHistory(ownerId);
  const nextItem: HistoryRecord = {
    id: `local-${Date.now()}`,
    created_at: new Date().toISOString(),
    source: "local",
    ...record,
  };

  const next = [nextItem, ...existing].slice(0, 50);
  window.localStorage.setItem(storageKey(ownerId), JSON.stringify(next));
}

export function clearLocalHistory(ownerId: string | null | undefined = "guest"): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(storageKey(ownerId));
}
