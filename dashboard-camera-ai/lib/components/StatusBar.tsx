// ============================================================
// StatusBar — แถบสถานะบนสุด: วันที่ เวลาข้อมูลล่าสุด สถานะเชื่อมต่อ
// รับ props จาก parent (real-time via Socket.IO "sync")
// ============================================================
"use client";

import { useEffect, useState } from "react";
import type { StatusResponse } from "@/lib/types/api";

type ConnectionLevel = "online" | "stale" | "offline" | "unknown";

function getLevel(data: StatusResponse | null): ConnectionLevel {
  if (!data) return "unknown";
  if (data.mqttStatus === "offline") return "offline";
  if (data.mqttStatus === "online") {
    if (!data.lastDataTime) return "stale";
    const ageMin = (Date.now() - new Date(data.lastDataTime).getTime()) / 60000;
    if (ageMin > 5) return "stale";
    return "online";
  }

  if (!data.lastDataTime) return "unknown";
  const ageMin = (Date.now() - new Date(data.lastDataTime).getTime()) / 60000;
  if (ageMin > 10) return "offline";
  if (ageMin > 3) return "stale";
  return "online";
}

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

interface StatusBarProps {
  status: StatusResponse | null;
  today: unknown;
}

export function StatusBar({ status }: StatusBarProps) {
  const [level, setLevel] = useState<ConnectionLevel>("unknown");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLevel(getLevel(status));
  }, [status]);

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

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] px-4 py-2 text-sm">
      <span className="text-gray-300 font-mono">{nowStr}</span>

      <div className="flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${DOT[level]}`} />
        <span className="text-gray-300">{LABEL[level]}</span>
      </div>
    </div>
  );
}
