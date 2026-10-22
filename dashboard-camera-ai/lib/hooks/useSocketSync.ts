"use client";

// ============================================================
// useSocketSync — รับข้อมูลทั้ง dashboard จาก backend ผ่าน Socket.IO
// backend ส่ง event "sync" ทันทีที่ต่อได้ แล้วส่งซ้ำทุก SOCKET_SYNC_SECONDS วินาที (backend/.env)
// และส่ง "live" (คนในห้องตอนนี้ + ผลการตรวจจับ) ทันทีทุกครั้งที่ Pi ส่งค่าสด
// และ "frame" (ภาพที่โมเดลวาดกรอบแล้ว ~5 ภาพ/วินาที) สำหรับการ์ด "การตรวจจับของโมเดล"
// socket.io ต่อใหม่เองเมื่อหลุด และส่ง sync รอบใหม่ให้ทันทีที่ต่อกลับมา
// ============================================================
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { CompareResponse, EventItem } from "@/lib/api";
import type { Detection, StatusResponse, TodayData } from "@/lib/hooks/useSseToday";

// Socket.IO ต่อตรงไป backend (ไม่ผ่าน rewrite /api ของ Next.js)
const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

export interface SyncData {
  today: TodayData;
  status: StatusResponse;
  events: { date: string; events: EventItem[] };
  compare: CompareResponse;
  timestamp: string;
}

/** ภาพล่าสุดจาก "frame": blob: URL ของ JPEG + เวลาที่ได้รับ (ms) */
export interface Frame {
  url: string;
  at: number;
}

export function useSocketSync() {
  const [data, setData] = useState<SyncData | null>(null);
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);

  useEffect(() => {
    // WebSocket ตั้งแต่แรก (ข้ามรอบ HTTP polling ที่หน่วงกว่า) — ต่อไม่ได้ค่อยถอยไปใช้ polling
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"], tryAllTransports: true });
    let frameUrl: string | null = null;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("sync", (d: SyncData) => setData(d));
    // "คนในห้องตอนนี้" + ผลการตรวจจับ มาทันทีทุกครั้งที่ Pi ส่งค่าสด (~1 วินาที) ไม่ต้องรอรอบ sync
    socket.on("live", (live: { time: string; in_zone: number; detection?: Detection }) =>
      setData((prev) =>
        prev
          ? {
              ...prev,
              today: {
                ...prev.today,
                currentPeople: live.in_zone,
                liveTime: live.time,
                detection: live.detection ?? prev.today.detection,
              },
            }
          : prev,
      ),
    );
    // ภาพ JPEG → blob: URL ให้ <img>; คืนหน่วยความจำของภาพก่อนหน้า (ไม่งั้นสะสม ~5 ภาพ/วินาที)
    socket.on("frame", (jpeg: ArrayBuffer) => {
      const url = URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" }));
      if (frameUrl) URL.revokeObjectURL(frameUrl);
      frameUrl = url;
      setFrame({ url, at: Date.now() });
    });
    return () => {
      socket.disconnect();
      if (frameUrl) URL.revokeObjectURL(frameUrl);
    };
  }, []);

  return { data, connected, frame };
}
