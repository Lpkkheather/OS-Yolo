// ============================================================
// socket.js — Socket.IO: ส่งข้อมูลทั้ง dashboard ให้ทุก client ทุก SOCKET_SYNC_SECONDS วินาที
// event "sync": { today, status, events, compare, timestamp }
//   today   = เหมือน GET /api/today + ค่าสดล่าสุดจาก MQTT pi5/people/live (คนตอนนี้, ยอดวันนี้ถึงวินาทีนี้)
//   status  = GET /api/status, events = GET /api/events (วันนี้), compare = GET /api/compare
// ส่งทันทีตอน client ต่อเข้ามา แล้วส่งซ้ำทุกรอบ (เฉพาะตอนมี client)
// event "live": { time, in_zone } — ส่งทันทีทุกครั้งที่ Pi ส่งค่าสด (~ทุก 1 วินาที) ให้ "คนในห้องตอนนี้" ไม่ต้องรอรอบ sync
//
// "คนในห้องตอนนี้" (currentPeople) = คนที่กล้องเห็นในโซนตอนนี้ (Pi ส่ง median ของ 2 วินาทีล่าสุด)
// ไม่ใช่ เข้า − ออก: ค่านั้นเปลี่ยนเฉพาะตอนมีคนข้ามเส้น และถ้านับพลาดครั้งเดียวจะผิดไปทั้งวัน
// ตัวนับแจ้ง offline หรือไม่ส่งค่าสดเกิน 10 วินาที → currentPeople = null (dashboard แสดง "—" แทนตัวเลขเก่า)
// ============================================================
import { Server } from "socket.io";
import { buildToday } from "./routes/today.js";
import { buildStatus } from "./routes/status.js";
import { buildEvents } from "./routes/events.js";
import { buildCompare } from "./routes/compare.js";
import { getMqttState, onLive } from "./mqtt.js";

// ค่าสดเก่ากว่านี้ = ตัวนับหยุดไปแล้ว → คนตอนนี้ = null, ยอดอื่นใช้ค่าจาก CSV
const LIVE_MAX_AGE_MS = 10_000;

/** ใส่ค่าสดลงในข้อมูลวันนี้ */
function applyLive(today, live) {
  return {
    ...today,
    inToday: live.in_today ?? today.inToday,
    outToday: live.out_today ?? today.outToday,
    visitorsToday: live.visitors_today ?? today.visitorsToday,
    currentPeople: live.in_zone,
    maxInRoom: Math.max(today.maxInRoom, live.in_zone ?? 0),
    liveTime: live.time,
  };
}

function buildSync() {
  const { live, liveAt, status } = getMqttState();
  const today = buildToday();
  return {
    today:
      live && status !== "offline" && Date.now() - liveAt < LIVE_MAX_AGE_MS
        ? applyLive(today, live)
        : { ...today, currentPeople: null, liveTime: null },
    status: buildStatus(),
    events: buildEvents(),
    compare: buildCompare(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * เริ่ม Socket.IO บน http server เดียวกับ Express
 * @param {import('http').Server} httpServer
 * @param {string} origin — URL ของ dashboard (CORS)
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
    socket.on("disconnect", () => {
      console.log("[Socket] Client disconnected, total:", io.engine.clientsCount);
    });
  });

  setInterval(() => {
    if (io.engine.clientsCount > 0) send(io);
  }, seconds * 1000);

  onLive((live) => io.emit("live", { time: live.time, in_zone: live.in_zone }));

  return io;
}
