import type {
  StatusResponse,
  TodayResponse,
  CompareResponse,
  EventLogResponse,
  HistoryResponse,
  HealthResponse,
} from "@/lib/types/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    // Next.js cache: revalidate ทุก 60 วินาที
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const fetchStatus = () => apiFetch<StatusResponse>("/status");

export const fetchToday = () => apiFetch<TodayResponse>("/today");

export const fetchCompare = () => apiFetch<CompareResponse>("/compare");

export const fetchEvents = (date?: string) => {
  const q = date ? `?date=${date}` : "";
  return apiFetch<EventLogResponse>(`/events${q}`);
};

// export const fetchHistory = (date: string) =>
//   apiFetch<HistoryResponse>(`/history/${date}`);

export const fetchHealth = () => apiFetch<HealthResponse>("/health");

export const cameraPreviewUrl = () => `${BASE}/camera-preview`;
