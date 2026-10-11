// ============================================================
// sse.js — Server-Sent Events สำหรับ real-time updates
// รับจาก MQTT (pi5/people/count) แล้ว broadcast ให้ clients
// ============================================================
import { readDayCsv, getTodayStr } from "./csvReader.js";

const clients = new Set();
let lastPayload = null;

/** เริ่มต้น SSE endpoint */
export function startSse(app) {
  app.get("/api/stream/today", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    clients.add(res);
    console.log("[SSE] Client connected, total:", clients.size);

    // ส่งข้อมูลล่าสุดทันที
    if (lastPayload) {
      res.write(`data: ${JSON.stringify(lastPayload)}\n\n`);
    } else {
      sendToday(res);
    }

    req.on("close", () => {
      clients.delete(res);
      console.log("[SSE] Client disconnected, total:", clients.size);
    });
  });
}

/** สร้าง payload ข้อมูลวันนี้ */
function buildTodayPayload() {
  const rows = readDayCsv(getTodayStr());
  const lastRow = rows[rows.length - 1] ?? null;
  return {
    type: "TODAY_UPDATE",
    payload: {
      date: getTodayStr(),
      inToday: lastRow?.in_today ?? 0,
      outToday: lastRow?.out_today ?? 0,
      visitorsToday: lastRow?.visitors_today ?? 0,
      currentPeople: Math.max(0, (lastRow?.in_today ?? 0) - (lastRow?.out_today ?? 0)),
      lastRow,
      timestamp: new Date().toISOString(),
    },
  };
}

function sendToday(res) {
  const payload = buildTodayPayload();
  lastPayload = payload;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
  lastPayload = payload;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => res.write(msg));
}

/** เรียกเมื่อ CSV อัปเดต (fallback) */
export function broadcastCsvUpdate() {
  const payload = buildTodayPayload();
  lastPayload = payload;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => res.write(msg));
}