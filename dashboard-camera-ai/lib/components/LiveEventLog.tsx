"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventItem } from "@/lib/api";
import formatDate from "@/lib/utils";

const LEVEL_LABEL: Record<string, string> = {
  info: "ข้อมูล",
  ok: "ปกติ",
  warn: "เตือน",
  error: "ผิดพลาด",
};

// data มาจาก Socket.IO "sync" (GET /api/events ของวันนี้) — อัปเดตพร้อมทั้งหน้า
export function LiveEventLog({ data }: { data: { date: string; events: EventItem[] } | null }) {
  const loading = data === null;

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
          {!loading && data.events.length === 0 && (
            <p className="text-gray-600 text-sm text-center pt-10">
              ไม่มีเหตุการณ์ในวันนี้
            </p>
          )}
          {data?.events.map((ev, i) => (
            <div
              key={`${ev.type}-${ev.time}-${i}`}
              className="flex gap-3 items-start text-sm border-b  pb-2 last:border-0 last:pb-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 leading-snug">{ev.message}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {formatDate(ev.time)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
