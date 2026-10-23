// ============================================================
// sse.js — Server-Sent Events สำหรับ real-time updates
// รับจาก MQTT (pi5/people/count ทุกนาที, pi5/people/live ทุกวินาที) แล้ว broadcast ให้ clients
// CSV เขียนโดย YOLO_Pi เอง (data/<วันที่>.csv) — backend ไม่เขียนซ้ำ ไม่งั้นแต่ละนาทีจะมี 2 แถว
// ============================================================
import { buildToday } from "./routes/today.js";

const clients = new Set();
let lastLive = null;

/** เริ่มต้น SSE endpoint */
export function startSse(app) {
  app.get("/api/stream/today", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // Prevent Cloudflare/proxy timeouts
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    clients.add(res);
    console.log("[SSE] Client connected, total:", clients.size);

    // ส่งข้อมูลทั้งวันจาก CSV ก่อนเสมอ (client ใหม่ต้องมีกราฟ/ยอดครบ ไม่ใช่แค่ข้อความ MQTT ล่าสุด)
    // แล้วตามด้วยค่าตอนนี้ล่าสุด ถ้ามี
    sendToday(res);
    if (lastLive) res.write(`data: ${JSON.stringify(lastLive)}\n\n`);

    // Heartbeat every 15 seconds to prevent proxy/timeouts (Cloudflare free tier ~30-100s idle timeout)
    const heartbeatInterval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeatInterval);
        return;
      }
      // Send heartbeat as comment (valid SSE, ignored by EventSource)
      res.write(": heartbeat\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeatInterval);
      clients.delete(res);
      console.log("[SSE] Client disconnected, total:", clients.size);
    });
  });
}

/** สร้าง payload ข้อมูลวันนี้ (ครบเหมือน GET /api/today: กราฟรายชั่วโมง, peak hour, แถวทั้งหมด) */
function buildTodayPayload() {
  return {
    type: "TODAY_UPDATE",
    payload: {
      ...buildToday(),
      timestamp: new Date().toISOString(),
    },
  };
}

function sendToday(res) {
  res.write(`data: ${JSON.stringify(buildTodayPayload())}\n\n`);
}

/** เรียกเมื่อได้ข้อมูลใหม่จาก MQTT */
export function broadcastMqttUpdate(mqttData) {
  const payload = {
    type: "MQTT_UPDATE",
    payload: {
      ...mqttData,
      timestamp: new Date().toISOString(),
    },
  };
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => res.write(msg));
}

/** เรียกทุกวินาทีจาก MQTT pi5/people/live — คนในโซนตอนนี้ + ยอดวันนี้ถึงวินาทีนี้ */
export function broadcastLiveUpdate(liveData) {
  const payload = {
    type: "LIVE_UPDATE",
    payload: {
      ...liveData,
      timestamp: new Date().toISOString(),
    },
  };
  lastLive = payload;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => res.write(msg));
}

/** เรียกเมื่อ CSV อัปเดต (fallback) */
export function broadcastCsvUpdate() {
  const msg = `data: ${JSON.stringify(buildTodayPayload())}\n\n`;
  clients.forEach((res) => res.write(msg));
}