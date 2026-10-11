// ============================================================
// sse.js — Server-Sent Events สำหรับ real-time updates
// รับจาก MQTT (pi5/people/count) แล้ว broadcast ให้ clients
// และเขียนลง CSV เพื่อให้ /api/events, /api/compare ใช้ได้
// ============================================================
import { readDayCsv, getTodayStr } from "./csvReader.js";
import { writeFileSync, existsSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, "..");
const DATA_DIR = resolve(BACKEND_DIR, process.env.YOLO_DATA_DIR ?? "../YOLO_Pi/data");

const clients = new Set();
let lastPayload = null;

function getCsvPath() {
  return join(DATA_DIR, `${getTodayStr()}.csv`);
}

/** เขียนแถวข้อมูลลง CSV (append) */
function appendToCsv(mqttData) {
  try {
    const filePath = getCsvPath();
    const isNew = !existsSync(filePath);
    
    // Header ถ้าไฟล์ใหม่
    if (isNew) {
      const header = "time,seconds,camera,in,out,in_zone_avg,in_zone_max,visitors,in_today,out_today,visitors_today,fps,cpu_temp_c,model\n";
      writeFileSync(filePath, header);
    }
    
    // Escape ค่า
    const escape = (v) => v === null || v === undefined ? "" : String(v);
    
    const row = [
      escape(mqttData.time),
      escape(mqttData.seconds),
      escape(mqttData.camera),
      escape(mqttData.in),
      escape(mqttData.out),
      escape(mqttData.in_zone_avg),
      escape(mqttData.in_zone_max),
      escape(mqttData.visitors),
      escape(mqttData.in_today),
      escape(mqttData.out_today),
      escape(mqttData.visitors_today),
      escape(mqttData.fps),
      escape(mqttData.cpu_temp_c),
      escape(mqttData.model),
    ].join(",") + "\n";
    
    appendFileSync(filePath, row);
    console.log("[CSV] Appended row:", mqttData.in_today, "in,", mqttData.out_today, "out");
  } catch (err) {
    console.error("[CSV] Write error:", err.message);
  }
}

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
  // 1. เขียนลง CSV ก่อน (เพื่อให้ /api/events, /api/compare ใช้ได้)
  appendToCsv(mqttData);
  
  // 2. Broadcast SSE
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