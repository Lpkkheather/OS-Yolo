import { TodayData, StatusResponse } from "@/lib/hooks/useSseToday";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const fetchStatus = () => apiFetch<StatusResponse>("/status");
export const fetchToday = () => apiFetch<TodayData>("/today");
export const fetchCompare = () => apiFetch<any>("/compare");
export const fetchEvents = (date?: string) => {
  const q = date ? `?date=${date}` : "";
  return apiFetch<any>(`/events${q}`);
};
export const fetchHealth = () => apiFetch<any>("/health");
export const cameraPreviewUrl = () => `${BASE}/camera-preview`;

// Re-export types for consumers
export type { TodayData, StatusResponse } from "@/lib/hooks/useSseToday";