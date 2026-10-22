// ============================================================
// DetectionCard — การ์ด "การตรวจจับของโมเดล": ภาพจากกล้องที่โมเดลบน Pi วาดกรอบรอบคน เส้นนับ และโซนแล้ว
// ภาพมาจาก Socket.IO "frame" (~5 ภาพ/วินาที), ตัวเลขมาจาก "live" (คนในภาพ, ความมั่นใจ, FPS, โมเดล)
// ============================================================
"use client";

import { useEffect, useState } from "react";
import type { Detection, MinuteRow } from "@/lib/hooks/useSseToday";
import type { Frame } from "@/lib/hooks/useSocketSync";

// ภาพเก่ากว่านี้ = ตัวนับหยุดส่งแล้ว → ป้าย LIVE เปลี่ยนเป็นเวลาของภาพล่าสุด
const FRAME_MAX_AGE_MS = 5_000;

interface Props {
  frame: Frame | null;
  detection: Detection | null | undefined;
  /** แถวรายนาทีล่าสุด: FPS / โมเดล ใช้แทนตอนยังไม่มีค่าสด */
  lastRow: MinuteRow | null;
}

export function DetectionCard({ frame, detection, lastRow }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = frame !== null && (now === null || now - frame.at < FRAME_MAX_AGE_MS);
  const fps = detection?.fps ?? lastRow?.fps ?? null;
  const model = detection?.model ?? lastRow?.model ?? null;

  const stats = [
    { label: "ตรวจพบในภาพ", value: detection?.people != null ? `${detection.people} คน` : "—" },
    { label: "ความมั่นใจเฉลี่ย", value: detection?.conf != null ? detection.conf.toFixed(2) : "—" },
    { label: "ความเร็ว", value: fps != null ? `${fps.toFixed(1)} FPS` : "—" },
    // yolo26n_640 → yolo26n · 640
    { label: "โมเดล", value: model ? model.replace(/_(\d+)$/, " · $1") : "—" },
  ];

  return (
    <div className="h-full rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] overflow-hidden flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#2a2a2a]">
        <h3 className="text-sm font-medium text-gray-200">การตรวจจับของโมเดล</h3>
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
            // eslint-disable-next-line @next/next/no-img-element -- blob: URL ของภาพจาก socket (next/image ใช้ไม่ได้)
            <img
              src={frame.url}
              alt="ภาพจากกล้องพร้อมกรอบที่โมเดลตรวจจับคน เส้นนับ และโซน"
              className={`h-full w-full object-contain ${live ? "" : "opacity-60"}`}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm text-gray-300">ยังไม่มีภาพจากกล้อง</p>
              <p className="text-xs text-gray-400">ภาพจะขึ้นเมื่อตัวนับบน Raspberry Pi เริ่มทำงาน</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-[#161616] border border-[#2a2a2a] px-3 py-2.5">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
