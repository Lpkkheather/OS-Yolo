import { StatusResponse, MinuteRow, TodayData } from "@/lib/hooks/useSseToday";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate: 60 },
    // Pi ปิด / หลุดเน็ต → ไม่ค้างเป็นนาที
    signal: AbortSignal.timeout(10_000),
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

/** null = วันนั้นไม่มีข้อมูล (dashboard แสดง "—") */
export interface CompareResponse {
  date: string;
  cutoffTime: string;
  today: CompareStat | null;
  yesterday: CompareStat | null;
  lastWeek: CompareStat | null;
  avg7days: CompareStat | null;
  /** จำนวนวันใน 7 วันก่อนที่มีข้อมูล (ใช้หาร avg7days) */
  daysWithData: number;
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

/** สรุปหนึ่งวันในตารางย้อนหลัง (GET /stats/days) */
export interface DaySummary {
  date: string;
  /** จำนวนนาทีที่ตัวนับทำงาน */
  minutes: number;
  in: number;
  out: number;
  visitors: number;
  maxInRoom: number;
}

/** ทั้ง dashboard ของวันหนึ่งจาก Supabase (GET /stats/day/<วันที่ | today>) — ใช้ได้แม้ Pi ปิด */
export interface DayStats {
  date: string;
  today: TodayData;
  compare: CompareResponse;
  events: { date: string; events: EventItem[] };
}

// /stats/* = route handlers ของ dashboard เอง (app/stats) อ่าน Supabase ตรง ไม่ผ่าน backend บน Pi
async function statsFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/stats${path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`stats ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

/** การตั้งค่าการนับที่วาดบน dashboard (รูปแบบเดียวกับ YOLO_Pi/zones.json, จุด = สัดส่วน 0-1 ของภาพ) */
export interface CountSettings {
  /** เส้นนับเข้า/ออก 2 จุด — เดินไปทางลูกศร = เข้า · null = ใช้ประตูที่ AI หาเอง */
  line: number[][] | null;
  /** โซนห้อง (มุม >= 3 จุด) · null = ทั้งภาพ */
  zone: number[][] | null;
  /** จุดของคนที่ใช้นับ: bottom = เท้า, center = กลางตัว */
  anchor: "bottom" | "center";
}

export const fetchCountSettings = () =>
  statsFetch<{ zones: CountSettings | null; updatedAt: string | null }>("/zones");

export async function saveCountSettings(zones: CountSettings): Promise<void> {
  const res = await fetch("/stats/zones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zones }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`stats /zones → ${res.status}`);
}

export const fetchDays = () => statsFetch<{ days: DaySummary[] }>("/days");
export const fetchDayStats = (date: string) => statsFetch<DayStats>(`/day/${date}`);

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

// Re-export types for consumers
export type { TodayData, StatusResponse, MinuteRow } from "@/lib/hooks/useSseToday";