// ============================================================
// mqtt.js — จัดการ MQTT subscriber
// subscribe: pi5/status/people, pi5/people/count (ทุกนาที), pi5/people/live (ทุกวินาที),
//            pi5/people/frame (ทุกวินาที: ภาพ JPEG ที่โมเดลวาดกรอบแล้ว → การ์ด "การตรวจจับของโมเดล")
// ถ้า MQTT_BROKER_URL ว่าง → ข้ามการเชื่อมต่อ
// ============================================================
import mqtt from "mqtt";
import { broadcastMqttUpdate, broadcastLiveUpdate } from "./sse.js";
import { refreshSoon } from "./dataSource.js";

/** @type {{ status: 'online'|'offline'|'unknown', lastCount: object|null, live: object|null, liveAt: number, frame: Buffer|null, frameAt: number }} */
let state = {
  status: "unknown",
  lastCount: null,
  live: null, // ข้อความล่าสุดจาก pi5/people/live
  liveAt: 0, // เวลาที่ได้รับ (ms) — socket sync ใช้เช็กว่ายังสดอยู่ไหม
  frame: null, // ภาพล่าสุดจาก pi5/people/frame (Buffer JPEG) — client ที่เพิ่งต่อเข้ามาได้ภาพทันที
  frameAt: 0,
};

let client = null;
const liveListeners = []; // เรียกทุกครั้งที่ได้ pi5/people/live (socket.js ส่งต่อให้ dashboard ทันที)
let failing = false; // log ปัญหาการเชื่อมต่อครั้งเดียวต่อรอบที่หลุด ไม่ใช่ทุก 10 วินาทีที่ลองใหม่

/**
 * ข้อความ error ที่อ่านรู้เรื่อง — ต่อ "localhost" ไม่ได้ Node รวม error ของ IPv6 + IPv4 ไว้ใน AggregateError
 * ที่ message ว่าง (log เดิมขึ้นแค่ "[MQTT] error:") → ใช้ message ของ error ข้างใน เช่น "connect ECONNREFUSED 127.0.0.1:1883"
 * @param {Error & { errors?: Error[], code?: string }} err
 */
function describeError(err) {
  return err.message || err.errors?.map((e) => e.message).join(", ") || err.code || String(err);
}

const frameListeners = []; // เรียกทุกครั้งที่ได้ภาพใหม่ (socket.js ส่งต่อให้ dashboard)

/** ลงทะเบียนฟังก์ชันที่จะถูกเรียกเมื่อได้ค่าสดใหม่ */
export function onLive(fn) {
  liveListeners.push(fn);
}

/** ลงทะเบียนฟังก์ชันที่จะถูกเรียกเมื่อได้ภาพใหม่ (Buffer JPEG) */
export function onFrame(fn) {
  frameListeners.push(fn);
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
    failing = false;
    console.log("[MQTT] เชื่อมต่อสำเร็จ");
    client.subscribe(["pi5/status/people", "pi5/people/count", "pi5/people/live", "pi5/people/frame"], (err) => {
      if (err) console.error("[MQTT] subscribe error:", err.message);
    });
  });

  client.on("message", (topic, payload) => {
    // ภาพเป็น binary: ไม่ต้องแปลงเป็นข้อความ
    if (topic === "pi5/people/frame") {
      if (payload.length === 0) return;
      state.frame = payload;
      state.frameAt = Date.now();
      frameListeners.forEach((fn) => fn(payload));
      return;
    }

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
        // Supabase: นาทีใหม่อยู่ในตารางแล้ว → อ่านวันนี้ใหม่ ไม่ต้องรอรอบ refresh (CSV อ่านไฟล์ใหม่เองอยู่แล้ว)
        refreshSoon();
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
    if (!failing) {
      console.warn(`[MQTT] ต่อ broker ไม่ได้: ${describeError(err)} — ลองใหม่ทุก 10 วินาที (เช็ก MQTT_BROKER_URL ใน backend/.env)`);
    }
    failing = true;
    state.status = "unknown";
  });

  client.on("offline", () => {
    if (!failing) console.warn("[MQTT] broker ออฟไลน์ — ลองใหม่ทุก 10 วินาที");
    failing = true;
    state.status = "unknown";
  });
}

/**
 * คืนสถานะ MQTT ปัจจุบัน
 * @returns {{ status: 'online'|'offline'|'unknown', lastCount: object|null, live: object|null, liveAt: number, frame: Buffer|null, frameAt: number }}
 */
export function getMqttState() {
  return state;
}
