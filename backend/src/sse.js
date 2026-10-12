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
    
    // Header ถ้าไฟล์ใหม่ - รองรับ 27 fields จาก MQTT
    if (isNew) {
      const header = "time,seconds,camera,in,out,in_zone_avg,in_zone_max,visitors,in_today,out_today,visitors_today,fps,cpu_temp_c,model,track_id,class_id,confidence,x,y,w,h,in_zone,zone_id,zone_name,line_crossed,line_side,direction\n";
      writeFileSync(filePath, header);
    }
    
    // Escape ค่า
    const escape = (v) => v === null || v === undefined ? "" : String(v);
    
    // เขียนครบ 27 fields (ใช้ optional chaining ป้องกัน undefined)
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
      escape(mqttData.track_id),
      escape(mqttData.class_id),
      escape(mqttData.confidence),
      escape(mqttData.x),
      escape(mqttData.y),
      escape(mqttData.w),
      escape(mqttData.h),
      escape(mqttData.in_zone),
      escape(mqttData.zone_id),
      escape(mqttData.zone_name),
      escape(mqttData.line_crossed),
      escape(mqttData.line_side),
      escape(mqttData.direction),
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
    // Prevent Cloudflare/proxy timeouts
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    clients.add(res);
    console.log("[SSE] Client connected, total:", clients.size);

    // ส่งข้อมูลล่าสุดทันที
    if (lastPayload) {
      res.write(`data: ${JSON.stringify(lastPayload)}\n\n`);
    } else {
      sendToday(res);
    }

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