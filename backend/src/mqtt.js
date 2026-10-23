// ============================================================
// mqtt.js — จัดการ MQTT subscriber
// subscribe: pi5/status/people, pi5/people/count (ทุกนาที), pi5/people/live (ทุกวินาที)
// ถ้า MQTT_BROKER_URL ว่าง → ข้ามการเชื่อมต่อ
// ============================================================
import mqtt from "mqtt";
import { broadcastMqttUpdate, broadcastLiveUpdate } from "./sse.js";

/** @type {{ status: 'online'|'offline'|'unknown', lastCount: object|null, live: object|null, liveAt: number }} */
let state = {
  status: "unknown",
  lastCount: null,
  live: null, // ข้อความล่าสุดจาก pi5/people/live
  liveAt: 0, // เวลาที่ได้รับ (ms) — socket sync ใช้เช็กว่ายังสดอยู่ไหม
};

let client = null;
const liveListeners = []; // เรียกทุกครั้งที่ได้ pi5/people/live (socket.js ส่งต่อให้ dashboard ทันที)

/** ลงทะเบียนฟังก์ชันที่จะถูกเรียกเมื่อได้ค่าสดใหม่ */
export function onLive(fn) {
  liveListeners.push(fn);
}

/**
 * เริ่มต้น MQTT subscriber
 * @param {string} brokerUrl
 */
export function startMqtt(brokerUrl) {
  if (!brokerUrl) {
    console.log("[MQTT] MQTT_BROKER_URL ไม่ได้ตั้งค่า — ข้าม MQTT");
    return;
  }

  console.log(`[MQTT] เชื่อมต่อ ${brokerUrl} …`);

  client = mqtt.connect(brokerUrl, {
    connectTimeout: 5000,
    reconnectPeriod: 10000,
    clientId: `yolo-dashboard-${Math.random().toString(16).slice(2, 8)}`,
  });

  client.on("connect", () => {
    console.log("[MQTT] เชื่อมต่อสำเร็จ");
    client.subscribe(["pi5/status/people", "pi5/people/count", "pi5/people/live"], (err) => {
      if (err) console.error("[MQTT] subscribe error:", err.message);
    });
  });

  client.on("message", (topic, payload) => {
    const text = payload.toString();

    if (topic === "pi5/status/people") {
      state.status = text === "online" ? "online" : "offline";
    }

    if (topic === "pi5/people/count") {
      try {
        const data = JSON.parse(text);
        state.lastCount = data;
        // Broadcast real-time ไป SSE clients
        broadcastMqttUpdate(data);
      } catch {
        console.warn("[MQTT] parse error บน pi5/people/count:", text);
      }
    }

    // ค่าตอนนี้ (คนในโซน + ยอดวันนี้ถึงวินาทีนี้) — ไม่เก็บลง CSV แค่ส่งต่อให้ dashboard
    if (topic === "pi5/people/live") {
      try {
        state.live = JSON.parse(text);
        state.liveAt = Date.now();
        broadcastLiveUpdate(state.live);
        liveListeners.forEach((fn) => fn(state.live));
      } catch {
        console.warn("[MQTT] parse error บน pi5/people/live:", text);
      }
    }
  });

  client.on("error", (err) => {
    console.warn("[MQTT] error:", err.message);
    state.status = "unknown";
  });

  client.on("offline", () => {
    console.warn("[MQTT] broker ออฟไลน์");
    state.status = "unknown";
  });
}

/**
 * คืนสถานะ MQTT ปัจจุบัน
 * @returns {{ status: 'online'|'offline'|'unknown', lastCount: object|null, live: object|null, liveAt: number }}
 */
export function getMqttState() {
  return state;
}
