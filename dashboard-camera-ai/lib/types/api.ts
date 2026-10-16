// ============================================================
// Types ที่ตรงกับ response จาก Express backend ทุก endpoint
// ============================================================

// GET /api/status
export interface StatusResponse {
  mqttStatus: "online" | "offline" | "unknown";
  lastDataTime: string | null; // ISO string หรือ null
  lastRow: MinuteRow | null;
}

// GET /api/today
export interface TodayResponse {
  date: string; // YYYY-MM-DD
  inToday: number;
  outToday: number;
  visitorsToday: number;
  currentPeople: number; // max(0, inToday - outToday)
  peakHour: { hour: number; inCount: number } | null;
  maxInRoom: number;
  hourlyBars: HourlyBar[];
  minuteRows: MinuteRow[];
}

// GET /api/compare
export interface CompareResponse {
  date: string;
  cutoffTime: string; // "HH:MM"
  today: PeriodStat;
  yesterday: PeriodStat;
  lastWeek: PeriodStat;
  avg7days: PeriodStat;
}

export interface PeriodStat {
  in: number;
  out: number;
}

// GET /api/events?date=YYYY-MM-DD
export interface EventLogResponse {
  generated_at: string;
  timezone: string;
  levels: EventLevel[];
  total: number;
  events: LogEvent[];
}

// GET /api/history/:date
export interface HistoryResponse {
  date: string;
  inTotal: number;
  outTotal: number;
  visitorsTotal: number;
  hourlyBars: HourlyBar[];
  minuteRows: MinuteRow[];
  events: LogEvent[];
}

// GET /api/health
export interface HealthResponse {
  ok: boolean;
  time: string;
}

// ── Shared shapes ─────────────────────────────────────────

/** แถวรายนาทีจาก CSV */
export interface MinuteRow {
  time: string; // ISO 8601
  seconds: number;
  camera: string;
  in: number | null;
  out: number | null;
  in_zone_avg: number | null;
  in_zone_max: number | null;
  visitors: number | null;
  in_today: number | null;
  out_today: number | null;
  visitors_today: number | null;
  fps: number | null;
  cpu_temp_c: number | null;
  model: string;
}

export interface HourlyBar {
  hour: number; // 0-23
  in: number;
  out: number;
}

export type EventLevel = "info" | "ok" | "warn" | "error";
export type EventSource = "room" | "pi" | "system" | "board-01" | "board-02" | "board-03";

export interface LogEvent {
  id: string;
  ts: string; // ISO 8601
  level: EventLevel;
  source: EventSource;
  type: string;
  message: string;
  meta?: Record<string, string | number | boolean>;
}
