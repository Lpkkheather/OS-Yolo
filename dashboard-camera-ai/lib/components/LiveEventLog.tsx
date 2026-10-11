// ============================================================
// LiveEventLog — รายการเหตุการณ์ ดึงจาก GET /api/events
// Client Component — refresh ทุก 60 วินาที
// ============================================================
"use client";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useState, useCallback } from "react";
import type { LogEvent, EventLogResponse } from "@/lib/types/api";
import { fetchEvents } from "@/lib/api";
import formatDate from "@/lib/utils";

const LEVEL_COLOR: Record<string, string> = {
  info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  ok: "bg-green-500/20 text-green-300 border-green-500/30",
  warn: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  error: "bg-red-500/20 text-red-300 border-red-500/30",
};

const LEVEL_LABEL: Record<string, string> = {
  info: "ข้อมูล",
  ok: "ปกติ",
  warn: "เตือน",
  error: "ผิดพลาด",
};

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>เหตุการณ์</CardTitle>
        <CardDescription>
          {resp && (
            <span className="text-xs text-gray-500">{resp.total} รายการ</span>
          )}
        </CardDescription>
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
          {resp?.events.map((ev: LogEvent,i) => (
            <div 
              key={ev.id ?? `time-${i}`}
              className="flex gap-3 items-start text-sm border-b border-[#2a2a2a] pb-2 last:border-0 last:pb-0"
            >
              <span
                className={`shrink-0 text-xs px-1.5 py-0.5 rounded border font-medium ${
                  LEVEL_COLOR[ev.level] ?? "bg-gray-500/20 text-gray-300"
                }`}
              >
                {LEVEL_LABEL[ev.level] ?? ev.level}
              </span>
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
