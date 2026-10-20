"use client";

// ============================================================
// useSocketSync — รับข้อมูลทั้ง dashboard จาก backend ผ่าน Socket.IO
// backend ส่ง event "sync" ทันทีที่ต่อได้ แล้วส่งซ้ำทุก SOCKET_SYNC_SECONDS วินาที (backend/.env)
// และส่ง "live" (คนในห้องตอนนี้) ทันทีทุกครั้งที่ Pi ส่งค่าสด
// socket.io ต่อใหม่เองเมื่อหลุด และส่ง sync รอบใหม่ให้ทันทีที่ต่อกลับมา
// ============================================================
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { CompareResponse, EventItem } from "@/lib/api";
import type { StatusResponse, TodayData } from "@/lib/hooks/useSseToday";

// Socket.IO ต่อตรงไป backend (ไม่ผ่าน rewrite /api ของ Next.js)
const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

export interface SyncData {
  today: TodayData;
  status: StatusResponse;
  events: { date: string; events: EventItem[] };
  compare: CompareResponse;
  timestamp: string;
}

export function useSocketSync() {
  const [data, setData] = useState<SyncData | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("sync", (d: SyncData) => setData(d));
    // "คนในห้องตอนนี้" มาทันทีทุกครั้งที่ Pi ส่งค่าสด (~1 วินาที) ไม่ต้องรอรอบ sync
    socket.on("live", (live: { time: string; in_zone: number }) =>
      setData((prev) =>
        prev ? { ...prev, today: { ...prev.today, currentPeople: live.in_zone, liveTime: live.time } } : prev,
      ),
    );
    return () => {
      socket.disconnect();
    };
  }, []);

  return { data, connected };
}
