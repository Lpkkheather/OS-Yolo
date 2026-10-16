import { StatusResponse, MinuteRow } from "@/lib/hooks/useSseToday";

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

export interface CompareStat {
  in: number;
  out: number;
}

export interface CompareResponse {
  date: string;
  cutoffTime: string;
  today: CompareStat;
  yesterday: CompareStat;
  lastWeek: CompareStat;
  avg7days: CompareStat;
}

export interface CompareStat {
  in: number;
  out: number;
}

export interface EventItem {
  type: "camera_offline" | "low_fps" | "overcrowd" | "after_hours";
  severity: "info" | "warning" | "critical";
  time: string;
  message: string;
  details: Record<string, unknown>;
}

export interface LogEvent {
  type: "camera_offline" | "low_fps" | "overcrowd" | "after_hours";
  severity: "info" | "warning" | "critical";
  time: string;
  message: string;
  details: Record<string, unknown>;
  id?: string;
  level: "info" | "warning" | "critical";
  ts: string;
}

export interface EventLogResponse {
  date: string;
  events: LogEvent[];
  generated_at: string;
  timezone: string;
  levels: Record<string, number>;
  total: number;
}

export interface HealthResponse {
  ok: boolean;
  time: string;
}

export interface HistoryListResponse {
  dates: string[];
}

export interface HistoryDayResponse {
  date: string;
  inToday: number;
  outToday: number;
  visitorsToday: number;
  currentPeople: number;
  peakHour: { hour: number; inCount: number } | null;
  maxInRoom: number;
  hourlyBars: { hour: number; in: number; out: number; visitors?: number }[];
  minuteRows: MinuteRow[];
  events: Array<{
    type: "camera_offline" | "low_fps" | "overcrowd" | "after_hours";
    severity: "info" | "warning" | "critical";
    time: string;
    message: string;
    details: Record<string, unknown>;
  }>;
}

export interface ZonesConfig {
  line?: { x1: number; y1: number; x2: number; y2: number; in_side: "left" | "right" };
  zone?: { points: { x: number; y: number }[] };
  camera?: string;
  size?: { width: number; height: number };
  anchor?: "feet" | "center";
}

export interface HourlyBar {
  hour: number;
  in: number;
  out: number;
  visitors?: number;
}

export const fetchStatus = () => apiFetch<StatusResponse>("/status");
export const fetchToday = () => apiFetch<{ date: string; inToday: number; outToday: number; visitorsToday: number; currentPeople: number; peakHour: { hour: number; inCount: number } | null; maxInRoom: number; hourlyBars: { hour: number; in: number; out: number }[]; minuteRows: MinuteRow[]; lastRow: MinuteRow | null }>("/today");
export const fetchCompare = () => apiFetch<CompareResponse>("/compare");
export const fetchEvents = (date?: string) => {
  const q = date ? `?date=${date}` : "";
  return apiFetch<EventLogResponse>(`/events${q}`);
};
export const fetchHistoryList = () => apiFetch<HistoryListResponse>("/history/list");
export const fetchHistoryDay = (date: string) => apiFetch<HistoryDayResponse>(`/history/${date}`);
export const fetchZonesConfig = () => apiFetch<ZonesConfig>("/zones/config");
export const getZonesPreviewUrl = () => `${BASE}/zones/preview`;
export const fetchHealth = () => apiFetch<HealthResponse>("/health");
export const cameraPreviewUrl = () => `${BASE}/camera-preview`;

export interface CompareResponse {
  date: string;
  cutoffTime: string;
  today: CompareStat;
  yesterday: CompareStat;
  lastWeek: CompareStat;
  avg7days: CompareStat;
}

export interface EventItem {
  type: "camera_offline" | "low_fps" | "overcrowd" | "after_hours";
  severity: "info" | "warning" | "critical";
  time: string;
  message: string;
  details: Record<string, unknown>;
}

export interface LogEvent {
  type: "camera_offline" | "low_fps" | "overcrowd" | "after_hours";
  severity: "info" | "warning" | "critical";
  time: string;
  message: string;
  details: Record<string, unknown>;
  id?: string;
  level: "info" | "warning" | "critical";
  ts: string;
}

export interface EventLogResponse {
  date: string;
  events: LogEvent[];
  generated_at: string;
  timezone: string;
  levels: Record<string, number>;
  total: number;
}

export interface HealthResponse {
  ok: boolean;
  time: string;
}

export interface HistoryListResponse {
  dates: string[];
}

export interface HistoryDayResponse {
  date: string;
  inToday: number;
  outToday: number;
  visitorsToday: number;
  currentPeople: number;
  peakHour: { hour: number; inCount: number } | null;
  maxInRoom: number;
  hourlyBars: { hour: number; in: number; out: number; visitors?: number }[];
  minuteRows: MinuteRow[];
  events: Array<{
    type: "camera_offline" | "low_fps" | "overcrowd" | "after_hours";
    severity: "info" | "warning" | "critical";
    time: string;
    message: string;
    details: Record<string, unknown>;
  }>;
}

export interface ZonesConfig {
  line?: { x1: number; y1: number; x2: number; y2: number; in_side: "left" | "right" };
  zone?: { points: { x: number; y: number }[] };
  camera?: string;
  size?: { width: number; height: number };
  anchor?: "feet" | "center";
}

export interface HourlyBar {
  hour: number;
  in: number;
  out: number;
  visitors?: number;
}

// Re-export types for consumers
export type { TodayData, StatusResponse, MinuteRow } from "@/lib/hooks/useSseToday";