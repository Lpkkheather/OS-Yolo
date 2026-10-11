// ============================================================
// routes/history.js  GET /api/history
// ส่งคืน: รายการวันที่มีข้อมูล + ข้อมูลของวันที่เลือก
// ============================================================
import { Router } from "express";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { readDayCsv, getDateStr } from "../csvReader.js";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
// backend/src/routes -> backend/src -> backend
const BACKEND_DIR = resolve(__dirname, "..", "..");
const DATA_DIR = resolve(BACKEND_DIR, process.env.YOLO_DATA_DIR ?? "../YOLO_Pi/data");

/**
 * ดูวันที่มีไฟล์ CSV ใน data/
 * @returns {string[]} — YYYY-MM-DD sorted desc
 */
function listAvailableDates() {
  if (!existsSync(DATA_DIR)) return [];
  const files = readdirSync(DATA_DIR);
  return files
    .filter((f) => f.endsWith(".csv") && !f.startsWith("test_"))
    .map((f) => f.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => b.localeCompare(a));
}

export { listAvailableDates };

router.get("/list", (_req, res) => {
  try {
    res.json({ dates: listAvailableDates() });
  } catch (err) {
    console.error("[history/list]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:date", (req, res) => {
  try {
    const dateStr = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "รูปแบบวันที่ต้องเป็น YYYY-MM-DD" });
    }

    const rows = readDayCsv(dateStr);
    if (rows.length === 0) {
      return res.status(404).json({ error: "ไม่มีข้อมูลวันที่นี้" });
    }

    const lastRow = rows[rows.length - 1];
    const inToday = lastRow?.in_today ?? 0;
    const outToday = lastRow?.out_today ?? 0;
    const visitorsToday = lastRow?.visitors_today ?? 0;
    const currentPeople = Math.max(0, inToday - outToday);

    // Hourly bars
    const map = new Map();
    for (const row of rows) {
      if (!row.time) continue;
      const hour = new Date(row.time).getHours();
      const prev = map.get(hour) ?? { hour, in: 0, out: 0, visitors: 0 };
      prev.in += row.in ?? 0;
      prev.out += row.out ?? 0;
      prev.visitors += row.visitors ?? 0;
      map.set(hour, prev);
    }
    const hourlyBars = Array.from(map.values()).sort((a, b) => a.hour - b.hour);

    // Peak hour
    const peakHour =
      hourlyBars.length > 0
        ? hourlyBars.reduce((best, h) => (h.in > best.in ? h : best))
        : null;

    // Max in room
    const maxInRoom = rows.reduce((max, r) => {
      const v = r.in_zone_max ?? 0;
      return v > max ? v : max;
    }, 0);

    // Events
    const events = detectEvents(rows, dateStr);

    res.json({
      date: dateStr,
      inToday,
      outToday,
      visitorsToday,
      currentPeople,
      peakHour: peakHour
        ? { hour: peakHour.hour, inCount: peakHour.in }
        : null,
      maxInRoom,
      hourlyBars,
      minuteRows: rows,
      events,
    });
  } catch (err) {
    console.error("[history/:date]", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ตรวจจับเหตุการณ์ (copy จาก events.js เพื่อใช้แยกได้)
 */
function detectEvents(rows, dateStr) {
  const events = [];
  if (rows.length === 0) return events;

  const MAX_PEOPLE = parseInt(process.env.MAX_PEOPLE ?? "50", 10);
  const LOW_FPS_THRESHOLD = parseFloat(process.env.LOW_FPS_THRESHOLD ?? "8");
  const BIZ_START = parseInt(process.env.BUSINESS_HOURS_START ?? "8", 10);
  const BIZ_END = parseInt(process.env.BUSINESS_HOURS_END ?? "20", 10);

  // Camera offline
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].time);
    const curr = new Date(rows[i].time);
    const diffMin = (curr - prev) / 60000;
    if (diffMin > 2) {
      events.push({
        type: "camera_offline",
        severity: "warning",
        time: rows[i].time,
        message: `ข้อมูลขาด ${Math.round(diffMin)} นาที`,
        details: { gapMinutes: Math.round(diffMin) },
      });
    }
  }

  // Low FPS
  let lowFpsStreak = 0;
  for (const row of rows) {
    if (row.fps !== null && row.fps < LOW_FPS_THRESHOLD) {
      lowFpsStreak++;
      if (lowFpsStreak === 3) {
        events.push({
          type: "low_fps",
          severity: "warning",
          time: row.time,
          message: `FPS ต่ำกว่า ${LOW_FPS_THRESHOLD} ติดต่อกัน 3+ นาที`,
          details: { fps: row.fps, threshold: LOW_FPS_THRESHOLD },
        });
      }
    } else {
      lowFpsStreak = 0;
    }
  }

  // Overcrowd
  for (const row of rows) {
    const current = Math.max(0, (row.in_today ?? 0) - (row.out_today ?? 0));
    if (current > MAX_PEOPLE) {
      events.push({
        type: "overcrowd",
        severity: "critical",
        time: row.time,
        message: `คนในห้อง ${current} คน เกินเกณฑ์ ${MAX_PEOPLE}`,
        details: { currentPeople: current, maxPeople: MAX_PEOPLE },
      });
    }
  }

  // After hours
  for (const row of rows) {
    if (!row.time) continue;
    const hour = new Date(row.time).getHours();
    const inCount = row.in ?? 0;
    const outCount = row.out ?? 0;
    if ((hour < BIZ_START || hour >= BIZ_END) && (inCount > 0 || outCount > 0)) {
      events.push({
        type: "after_hours",
        severity: "info",
        time: row.time,
        message: `มีการเคลื่อนไหวเวลา ${hour}:00 นอกเวลาทำการ`,
        details: { hour, in: inCount, out: outCount },
      });
    }
  }

  return events.sort((a, b) => new Date(b.time) - new Date(a.time));
}

export default router;