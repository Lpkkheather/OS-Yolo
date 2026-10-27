// ============================================================
// socket.js — Socket.IO: ส่งข้อมูลทั้ง dashboard ให้ทุก client ทุก SOCKET_SYNC_SECONDS วินาที
// event "sync": { today, status, events, compare, timestamp }
//   today   = เหมือน GET /api/today + ค่าสดล่าสุดจาก MQTT pi5/people/live (คนตอนนี้, ยอดวันนี้ถึงวินาทีนี้)
//   status  = GET /api/status, events = GET /api/events (วันนี้), compare = GET /api/compare
// ส่งทันทีตอน client ต่อเข้ามา แล้วส่งซ้ำทุกรอบ (เฉพาะตอนมี client)
// event "live": { time, in_zone, detection } — ส่งทันทีทุกครั้งที่ Pi ส่งค่าสด (~ทุก 1 วินาที) ให้ "คนในห้องตอนนี้" ไม่ต้องรอรอบ sync
//   detection = { people, conf, fps, model, mode, door }: คนที่โมเดลเห็นในภาพตอนนี้ ความมั่นใจเฉลี่ย ความเร็ว ชื่อโมเดล
//     mode = วิธีนับเข้า/ออก: "line" (เส้นที่ตั้งบน dashboard) / "room" (ยังไม่ได้ตั้งเส้น: เข้า/ออก = "—")
//     door = { box: [x1, y1, x2, y2] 0-1, conf } ประตูที่ AI หาเจอ — แค่เสนอเป็นเส้นเริ่มต้นในหน้า "ตั้งค่าการนับ"
// event "frame": Buffer JPEG — ภาพที่โมเดลวาดกรอบแล้ว (~5 ภาพ/วินาที, MQTT pi5/people/frame) + ภาพล่าสุดตอน client ต่อเข้ามา
//   ส่งแบบ volatile: client ที่เน็ตช้ารับไม่ทัน = ทิ้งภาพนั้น ไม่เข้าคิว (ไม่งั้นภาพเก่าสะสม หน่วงขึ้นเรื่อยๆ)
//
// "คนในห้องตอนนี้" (currentPeople) = ค่าที่มากกว่าระหว่าง เข้า − ออก ของวันนี้ (มีเส้น) กับ คนที่กล้องเห็นในโซนตอนนี้
//   (median 2 วินาทีล่าสุด): คนที่อยู่ในห้องก่อนเริ่มนับ / ไม่ได้เดินผ่านเส้น ก็ยังนับ · ไม่ได้วาดโซน = ทั้งภาพ
//   (คนฝั่ง "ออก" ที่อยู่ในภาพก็นับด้วย → วาดโซนห้องให้ตรง) · เข้า − ออก เริ่ม 0 ใหม่ทุกวัน
// ตัวนับแจ้ง offline หรือไม่ส่งค่าสดเกิน 10 วินาที → currentPeople = null (dashboard แสดง "—" แทนตัวเลขเก่า)
// ============================================================
import { Server } from "socket.io";
import { buildToday } from "./routes/today.js";
import { buildStatus } from "./routes/status.js";
import { buildEvents } from "./routes/events.js";
import { buildCompare } from "./routes/compare.js";
import { getMqttState, onFrame, onLive } from "./mqtt.js";

// ค่าสดเก่ากว่านี้ = ตัวนับหยุดไปแล้ว → คนตอนนี้ = null, ยอดอื่นใช้ค่าจาก CSV
const LIVE_MAX_AGE_MS = 10_000;
// เหตุการณ์ล่าสุดที่ส่งไปกับ sync (ทั้งวันอาจเป็นหลักร้อย: "นอกเวลาทำการ" เกิดได้ทุกนาที) — GET /api/events ยังได้ครบ
const SYNC_EVENTS = 50;

/** ผลการตรวจจับตอนนี้ของโมเดล (ตัวนับรุ่นเก่าที่ยังไม่ส่งค่าเหล่านี้ → null) */
function detectionOf(live) {
  return {
    people: live.people ?? null,
    conf: live.conf ?? null,
    fps: live.fps ?? null,
    model: live.model ?? null,
    mode: live.mode ?? null,
    door: live.door ?? null,
  };
}

/** คนในห้องตอนนี้ = max(เข้า − ออก, คนที่เห็นในโซน) · ไม่มีเส้น (in_today = null) = คนที่เห็นในโซน */
function currentOf(live) {
  const net = live.in_today != null ? live.in_today - (live.out_today ?? 0) : 0;
  return live.in_zone == null ? Math.max(0, net) : Math.max(net, live.in_zone);
}

/** ใส่ค่าสดลงในข้อมูลวันนี้ */
function applyLive(today, live) {
  return {
    ...today,
    inToday: live.in_today ?? today.inToday,
    outToday: live.out_today ?? today.outToday,
    visitorsToday: live.visitors_today ?? today.visitorsToday,
    currentPeople: currentOf(live),
    maxInRoom: Math.max(today.maxInRoom, currentOf(live) ?? 0),
    liveTime: live.time,
    detection: detectionOf(live),
  };
}

// sync ไปทุก client ทุก 3 วินาที (หลัง deploy วิ่งออกจากเน็ตของ Pi) → ส่งเฉพาะที่ dashboard ใช้:
// ไม่ส่ง today.minuteRows (ทั้งวัน ~300 KB, dashboard ใช้แค่ hourlyBars / lastRow) และเหตุการณ์แค่ SYNC_EVENTS รายการล่าสุด
function buildSync() {
  const { live, liveAt, status } = getMqttState();
  const today = buildToday(); // object ใหม่ทุกครั้ง: ลบ field ได้เลย
  delete today.minuteRows;
  const events = buildEvents();
  return {
    today:
      live && status !== "offline" && Date.now() - liveAt < LIVE_MAX_AGE_MS
        ? applyLive(today, live)
        : { ...today, currentPeople: null, liveTime: null, detection: null },
    status: buildStatus(),
    events: { ...events, events: events.events.slice(0, SYNC_EVENTS) },
    compare: buildCompare(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * เริ่ม Socket.IO บน http server เดียวกับ Express
 * @param {import('http').Server} httpServer
 * @param {string[]} origin — URL ของ dashboard (CORS)
 * @param {number} seconds — ส่ง sync ทุกกี่วินาที
 */
export function startSocket(httpServer, origin, seconds) {
  const io = new Server(httpServer, { cors: { origin } });

  const send = (target) => {
    try {
      target.emit("sync", buildSync());
    } catch (err) {
      console.error("[Socket] sync error:", err.message);
    }
  };

  io.on("connection", (socket) => {
    console.log("[Socket] Client connected, total:", io.engine.clientsCount);
    send(socket);
    const { frame, frameAt } = getMqttState();
    if (frame && Date.now() - frameAt < LIVE_MAX_AGE_MS) socket.emit("frame", frame);
    socket.on("disconnect", () => {
      console.log("[Socket] Client disconnected, total:", io.engine.clientsCount);
    });
  });

  setInterval(() => {
    if (io.engine.clientsCount > 0) send(io);
  }, seconds * 1000);

  // ชื่อ in_zone คงไว้ให้ dashboard ที่ deploy แล้วใช้ได้เลย แต่ค่าคือ "คนในห้องตอนนี้" (currentOf)
  onLive((live) => io.emit("live", { time: live.time, in_zone: currentOf(live), detection: detectionOf(live) }));
  onFrame((jpeg) => io.volatile.emit("frame", jpeg));

  return io;
}
