"use client";

import { useEffect, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export interface TodayData {
  date: string;
  inToday: number;
  outToday: number;
  visitorsToday: number;
  currentPeople: number;
  peakHour: { hour: number; inCount: number } | null;
  maxInRoom: number;
  hourlyBars: { hour: number; in: number; out: number }[];
  minuteRows: any[];
  lastRow: any;
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

export interface SseMessage {
  type: "TODAY_UPDATE" | "MQTT_UPDATE";
  payload: TodayData | MqttData;
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
        if (msg.type === "TODAY_UPDATE" || msg.type === "MQTT_UPDATE") {
          setData(msg.payload as TodayData);
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