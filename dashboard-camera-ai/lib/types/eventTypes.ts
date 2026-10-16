export type EventLevel = "info" | "ok" | "warn" | "error";

export type EventSource =
  | "room"
  | "pi"
  | "system"
  | "board-01"
  | "board-02"
  | "board-03";

export interface LogEvent {
  id: string;
  ts: string; // ISO 8601 เช่น "2026-10-09T09:29:41+07:00"
  level: EventLevel;
  source: EventSource;
  type: string;
  message: string;
  meta?: Record<string, string | number | boolean>;
}

export interface EventLogResponse {
  generated_at: string;
  timezone: string;
  levels: EventLevel[];
  total: number;
  events: LogEvent[];
}