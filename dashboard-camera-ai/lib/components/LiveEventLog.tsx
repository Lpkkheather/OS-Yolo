// ============================================================
// LiveEventLog — รายการเหตุการณ์ ดึงจาก GET /api/events
// Client Component — refresh ทุก 60 วินาที
// ============================================================
"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useState, useCallback } from "react";
import { fetchEvents } from "@/lib/api";
import formatDate from "@/lib/utils";

const LEVEL_LABEL: Record<string, string> = {
  info: "ข้อมูล",
  ok: "ปกติ",
  warn: "เตือน",
  error: "ผิดพลาด",
};

interface LogEvent {
  type: "camera_offline" | "low_fps" | "overcrowd" | "after_hours";
  severity: "info" | "warning" | "critical";
  time: string;
  message: string;
  details: Record<string, unknown>;
  id?: string;
  level: "info" | "warning" | "critical";
  ts: string;
}

interface EventLogResponse {
  date: string;
  events: LogEvent[];
  generated_at: string;
  timezone: string;
  levels: Record<string, number>;
  total: number;
}

export function LiveEventLog({ date }: { date?: string }) {
  const [resp, setResp] = useState<EventLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchEvents(date);
      setResp(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>เหตุการณ์</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 overflow-y-auto p-4 space-y-2">
          {loading && (
            <p className="text-gray-500 text-sm text-center pt-10">
              กำลังโหลด…
            </p>
          )}
          {err && (
            <p className="text-red-400 text-sm text-center pt-10">{err}</p>
          )}
          {!loading && !err && resp?.events.length === 0 && (
            <p className="text-gray-600 text-sm text-center pt-10">
              ไม่มีเหตุการณ์วันนี้
            </p>
          )}
          {resp?.events.map((ev: LogEvent, i) => (
            <div
              key={ev.id ?? `time-${i}`}
              className="flex gap-3 items-start text-sm border-b  pb-2 last:border-0 last:pb-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 leading-snug">{ev.message}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {formatDate(ev.ts)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
