// ============================================================
// DetectionCard — การ์ด "การตรวจจับของโมเดล": ภาพจากกล้องที่โมเดลบน Pi วาดกรอบรอบคน เส้นนับ และโซนแล้ว
// ภาพมาจาก Socket.IO "frame" (~5 ภาพ/วินาที), ตัวเลขมาจาก "live" (คนในภาพ, ความมั่นใจ, FPS, โมเดล)
// ============================================================
"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { Detection, MinuteRow } from "@/lib/hooks/useSseToday";
import type { Frame } from "@/lib/hooks/useSocketSync";
import { ZoneEditor } from "@/lib/components/ZoneEditor";
import { Button } from "@/components/ui/button";
import { cn } from "../utils";

const FRAME_MAX_AGE_MS = 5_000;

interface Props {
  frame: Frame | null;
  detection: Detection | null | undefined;
  lastRow: MinuteRow | null;
}

export function DetectionCard({ frame, detection, lastRow }: Props) {
  const [now, setNow] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live =
    frame !== null && (now === null || now - frame.at < FRAME_MAX_AGE_MS);
  const fps = detection?.fps ?? lastRow?.fps ?? null;
  const model = detection?.model ?? lastRow?.model ?? null;

  const noLine = detection?.mode === "room";
  // วิธีนับเข้า/ออก (ตัวนับรุ่นเก่าไม่ส่ง mode → ไม่แสดง)
  const countMode =
    detection?.mode === "line"
      ? "นับเข้า/ออกที่เส้นที่ตั้งไว้ ✓"
      : detection?.mode === "room"
        ? "ยังไม่ได้ตั้งเส้นเข้า/ออก (เข้า/ออก = —)"
        : null;

  const stats = [
    {
      label: "ตรวจพบในภาพ",
      value: detection?.people != null ? `${detection.people} คน` : "—",
    },
    {
      label: "ความมั่นใจเฉลี่ย",
      value: detection?.conf != null ? detection.conf.toFixed(2) : "—",
    },
    { label: "ความเร็ว", value: fps != null ? `${fps.toFixed(1)} FPS` : "—" },
    { label: "โมเดล", value: model ? model.replace(/_(\d+)$/, " · $1") : "—" },
  ];

  return (
    <div className="h-full rounded-xl bg-[#1e1e1e] border border-custom overflow-hidden flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#2a2a2a]">
        <h3 className="text-sm font-medium text-gray-200">
          การตรวจจับของโมเดล
        </h3>
        {live ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 font-semibold tracking-wide text-red-300">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              LIVE
            </span>
            <span className="text-gray-400">~5 ภาพ/วินาที</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">
            {frame
              ? `ภาพล่าสุด ${new Date(frame.at).toLocaleTimeString("th-TH", { hour12: false, timeZone: "Asia/Bangkok" })}`
              : "ไม่มีภาพ"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="relative w-full aspect-video overflow-hidden rounded-lg bg-[#161616]">
          {frame ? (
            <img
              src={frame.url}
              alt="ภาพจากกล้องพร้อมกรอบที่โมเดลตรวจจับคน เส้นนับ และโซน"
              className={`h-full w-full object-contain ${live ? "" : "opacity-60"}`}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm text-gray-300">ยังไม่มีภาพจากกล้อง</p>
              <p className="text-xs text-gray-400">
                ภาพจะขึ้นเมื่อตัวนับบน Raspberry Pi เริ่มทำงาน
              </p>
            </div>
          )}
        </div>

        {/* สถานะการนับเข้า/ออก + ปุ่มตั้งค่า (ยังไม่มีเส้น = ปุ่มสีฟ้าเด่น ชวนให้ตั้ง) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2">
          <p
            className={`text-sm ${noLine ? "text-yellow-400" : countMode ? "text-green-400" : "text-gray-400"}`}
          >
            {countMode ?? "เส้นเข้า/ออกและโซนห้อง ตั้งได้จากหน้านี้"}
          </p>

          <Button
            onClick={() => setEditing(true)}
            variant={noLine ? "default" : "outline"}
            className={
              cn(
              noLine
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "border-[#3a3a3a] bg-[#242424] text-gray-100 hover:bg-[#2e2e2e] hover:text-gray-100",
                "rounded-2xl"
              )
            }
          >
            {" "}
            <SlidersHorizontal size={16} />
            {noLine ? "ตั้งเส้นเข้า/ออก" : "ตั้งค่าการนับ"}
          </Button>
          
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg bg-[#161616] border shadow-[inset_4px_-50px_44px_-22px_rgba(147,_51,_234,_0.15)] border-[#2a2a2a]  px-3 py-2.5"
            >
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-white">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <ZoneEditor
          frame={frame}
          detection={detection}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
