// ============================================================
// mqtt.js — จัดการ MQTT subscriber
// subscribe: pi5/status/people, pi5/people/count
// ถ้า MQTT_BROKER_URL ว่าง → ข้ามการเชื่อมต่อ
// ============================================================
import mqtt from "mqtt";
import { broadcastMqttUpdate } from "./sse.js";

/** @type {{ status: 'online'|'offline'|'unknown', lastCount: object|null }} */
let state = {
  status: "unknown",
  lastCount: null,
};

let client = null;

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
    client.subscribe(["pi5/status/people", "pi5/people/count"], (err) => {
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
 * @returns {{ status: 'online'|'offline'|'unknown', lastCount: object|null }}
 */
export function getMqttState() {
  return state;
}
