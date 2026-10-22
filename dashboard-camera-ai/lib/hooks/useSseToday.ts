"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export interface MinuteRow {
  time: string;
  seconds: number;
  camera: string;
  in: number;
  out: number;
  in_zone_avg: number;
  in_zone_max: number;
  visitors: number;
  in_today: number;
  out_today: number;
  visitors_today: number;
  fps: number;
  cpu_temp_c: number | null;
  model: string;
}

export interface TodayData {
  date: string;
  inToday: number;
  outToday: number;
  visitorsToday: number;
  /** คนที่กล้องเห็นในโซนตอนนี้ (socket) — null = ตัวนับไม่ได้ส่งค่าสดมาเกิน 10 วินาที */
  currentPeople: number | null;
  peakHour: { hour: number; inCount: number } | null;
  maxInRoom: number;
  hourlyBars: { hour: number; in: number; out: number }[];
  minuteRows: MinuteRow[];
  lastRow: MinuteRow | null;
  /** เวลาของค่าสดล่าสุดจาก Pi (ISO) */
  liveTime?: string | null;
  /** ผลการตรวจจับตอนนี้ของโมเดล (socket) — null = ตัวนับไม่ได้ส่งค่าสด */
  detection?: Detection | null;
}

/** ผลการตรวจจับตอนนี้ของโมเดลบน Pi (MQTT pi5/people/live) — null ในแต่ละช่อง = ตัวนับรุ่นเก่าที่ยังไม่ส่งค่านั้น */
export interface Detection {
  /** คนที่โมเดลเห็นในภาพตอนนี้ */
  people: number | null;
  /** ความมั่นใจเฉลี่ยของกรอบในภาพตอนนี้ (0-1) — null = ไม่มีคนในภาพ */
  conf: number | null;
  fps: number | null;
  /** เช่น yolo26n_640 */
  model: string | null;
}

export interface StatusResponse {
  mqttStatus: "online" | "offline" | "unknown";
  lastDataTime: string | null;
  lastRow: MinuteRow | null;
}

export interface MqttData {
  time: string;
  seconds: number;
  camera: string;
  in: number;
  out: number;
  in_zone_avg: number;
  in_zone_max: number;
  visitors: number;
  in_today: number;
  out_today: number;
  visitors_today: number;
  fps: number;
  cpu_temp_c: number | null;
  model: string;
}

/** ค่าตอนนี้จาก MQTT pi5/people/live (ทุกวินาที, ไม่ได้เก็บลง CSV). in/out เป็น null เมื่อไม่มีเส้นนับ */
export interface LiveData {
  time: string;
  camera: string;
  in_zone: number;
  in_today: number | null;
  out_today: number | null;
  visitors_today: number;
}

export interface SseMessage {
  type: "TODAY_UPDATE" | "MQTT_UPDATE" | "LIVE_UPDATE";
  payload: TodayData | MqttData | LiveData;
}

/** Merge LiveData into TodayData: เฉพาะตัวเลข "ตอนนี้" — กราฟ/แถวรายนาทีมาจาก MQTT_UPDATE ทุกนาที */
function mergeLiveIntoToday(base: TodayData, live: LiveData): TodayData {
  const inToday = live.in_today ?? base.inToday;
  const outToday = live.out_today ?? base.outToday;
  return {
    ...base,
    inToday,
    outToday,
    visitorsToday: live.visitors_today ?? base.visitorsToday,
    // มีเส้นนับ → เข้า − ออก; ไม่มีเส้น → คนที่เห็นในโซนตอนนี้
    currentPeople: live.in_today == null ? live.in_zone : Math.max(0, inToday - outToday),
    maxInRoom: Math.max(base.maxInRoom, live.in_zone ?? 0),
  };
}

/** Merge MqttData into TodayData */
function mergeMqttIntoToday(existing: TodayData | undefined, mqtt: MqttData): TodayData {
  const base = existing ?? {
    date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }),
    inToday: 0,
    outToday: 0,
    visitorsToday: 0,
    currentPeople: 0,
    peakHour: null,
    maxInRoom: 0,
    hourlyBars: [],
    minuteRows: [],
    lastRow: null,
  };

  const newMinuteRow: MinuteRow = {
    time: mqtt.time,
    seconds: mqtt.seconds,
    camera: mqtt.camera,
    in: mqtt.in,
    out: mqtt.out,
    in_zone_avg: mqtt.in_zone_avg,
    in_zone_max: mqtt.in_zone_max,
    visitors: mqtt.visitors,
    in_today: mqtt.in_today,
    out_today: mqtt.out_today,
    visitors_today: mqtt.visitors_today,
    fps: mqtt.fps,
    cpu_temp_c: mqtt.cpu_temp_c,
    model: mqtt.model,
  };

  // Update hourly bars
  const hour = new Date(mqtt.time).getHours();
  const hourlyMap = new Map(base.hourlyBars.map(b => [b.hour, { ...b }]));
  const existingHour = hourlyMap.get(hour) ?? { hour, in: 0, out: 0 };
  existingHour.in += mqtt.in ?? 0;
  existingHour.out += mqtt.out ?? 0;
  hourlyMap.set(hour, existingHour);
  const hourlyBars = Array.from(hourlyMap.values()).sort((a, b) => a.hour - b.hour);

  // Peak hour
  const peakHour = hourlyBars.length > 0
    ? hourlyBars.reduce((best, h) => (h.in > best.in ? h : best))
    : null;

  // Max in room
  const maxInRoom = Math.max(base.maxInRoom, mqtt.in_zone_max ?? 0);

  // Minute rows (keep last 100)
  const minuteRows = [newMinuteRow, ...base.minuteRows].slice(0, 100);

  return {
    ...base,
    date: base.date,
    inToday: mqtt.in_today ?? base.inToday,
    outToday: mqtt.out_today ?? base.outToday,
    visitorsToday: mqtt.visitors_today ?? base.visitorsToday,
    // ไม่มีเส้นนับ (in_today = null) → คงค่าคนตอนนี้จาก LIVE_UPDATE ไว้ ไม่รีเซ็ตเป็น 0 ทุกนาที
    currentPeople: mqtt.in_today == null
      ? base.currentPeople
      : Math.max(0, mqtt.in_today - (mqtt.out_today ?? base.outToday)),
    peakHour: peakHour ? { hour: peakHour.hour, inCount: peakHour.in } : null,
    maxInRoom,
    hourlyBars,
    minuteRows,
    lastRow: newMinuteRow,
  };
}

export function useSseToday(initialData?: TodayData) {
  const [data, setData] = useState<TodayData | undefined>(initialData);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<MessageEvent | null>(null);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/stream/today`);

    es.onopen = () => {
      console.log("[SSE] Connected");
      setConnected(true);
    };

    es.onmessage = (event) => {
      setLastEvent(event);
      try {
        const msg: SseMessage = JSON.parse(event.data);
        console.log("[SSE] Received:", msg.type);

        if (msg.type === "TODAY_UPDATE") {
          setData(msg.payload as TodayData);
        } else if (msg.type === "MQTT_UPDATE") {
          setData(prev => mergeMqttIntoToday(prev, msg.payload as MqttData));
        } else if (msg.type === "LIVE_UPDATE") {
          // backend ส่ง TODAY_UPDATE ก่อนเสมอ → prev มีแล้ว
          setData(prev => (prev ? mergeLiveIntoToday(prev, msg.payload as LiveData) : prev));
        }
      } catch (e) {
        console.warn("[SSE] Parse error:", e);
      }
    };

    es.onerror = (err) => {
      console.warn("[SSE] Error:", err);
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return { data, connected, lastEvent };
}