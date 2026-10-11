// ============================================================
// StatusBar — แถบสถานะบนสุด: วันที่ เวลาข้อมูลล่าสุด สถานะเชื่อมต่อ
// รับ props จาก parent (real-time via SSE)
// ============================================================
"use client";

import { useEffect, useState } from "react";
import type { StatusResponse } from "@/lib/hooks/useSseToday";

type ConnectionLevel = "online" | "stale" | "offline" | "unknown";

const DOT: Record<ConnectionLevel, string> = {
  online: "bg-green-500",
  stale: "bg-yellow-400",
  offline: "bg-red-500",
  unknown: "bg-gray-500",
};

const LABEL: Record<ConnectionLevel, string> = {
  online: "เชื่อมต่อแล้ว",
  stale: "ข้อมูลล่าช้า",
  offline: "ออฟไลน์",
  unknown: "ไม่ทราบสถานะ",
};

/** คำนวณระดับสถานะจาก mqttStatus + อายุข้อมูลล่าสุด */
function getLevel(data: StatusResponse | null): ConnectionLevel {
  if (!data) return "unknown";
  if (data.mqttStatus === "offline") return "offline";
  if (data.mqttStatus === "online") {
    if (!data.lastDataTime) return "stale";
    const ageMin = (Date.now() - new Date(data.lastDataTime).getTime()) / 60000;
    if (ageMin > 5) return "stale";
    return "online";
  }
  // mqttStatus === 'unknown' — ดูจากอายุข้อมูลแทน
  if (!data.lastDataTime) return "unknown";
  const ageMin = (Date.now() - new Date(data.lastDataTime).getTime()) / 60000;
  if (ageMin > 10) return "offline";
  if (ageMin > 3) return "stale";
  return "online";
}

interface StatusBarProps {
  status: StatusResponse | null;
  today: import("@/lib/hooks/useSseToday").TodayData | null | undefined; // for camera/model info
}

export function StatusBar({ status, today }: StatusBarProps) {
  const [now, setNow] = useState<Date | null>(null);

  // Derive level from status (no need for separate state)
  const level = getLevel(status);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const nowStr = now
    ? now.toLocaleString("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Bangkok",
      })
    : "--";

  // Use today data for camera/model if status doesn't have it
  const camera = status?.lastRow?.camera ?? today?.minuteRows?.[0]?.camera ?? "—";
  const model = status?.lastRow?.model ?? today?.minuteRows?.[0]?.model ?? "—";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] px-4 py-2 text-sm">
      {/* นาฬิกาปัจจุบัน */}
      <span className="text-gray-300 font-mono">{nowStr}</span>

      <div className="flex items-center gap-4">
        {/* ชื่อกล้อง / โมเดล */}
        <span className="text-gray-500 text-xs">
          {camera} · {model}
        </span>

        {/* สถานะการเชื่อมต่อ */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${DOT[level]}`} />
          <span className="text-gray-300">{LABEL[level]}</span>
        </div>
      </div>
    </div>
  );
}