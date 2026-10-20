// ============================================================
// routes/events.js  GET /api/events
// ส่งคืน: เหตุการณ์จากข้อมูลรายนาที (offline, low FPS, overcrowd, after-hours)
// ============================================================
import { Router } from "express";
import { readDayCsv, getTodayStr, getDateStr } from "../csvReader.js";

const router = Router();

// Config จาก env
const MAX_PEOPLE = parseInt(process.env.MAX_PEOPLE ?? "50", 10);
const LOW_FPS_THRESHOLD = parseFloat(process.env.LOW_FPS_THRESHOLD ?? "8");
const BIZ_START = parseInt(process.env.BUSINESS_HOURS_START ?? "8", 10);
const BIZ_END = parseInt(process.env.BUSINESS_HOURS_END ?? "20", 10);

/**
 * ตรวจสอบเหตุการณ์จาก rows ของวันเดียว
 * @param {import('../csvReader.js').MinuteRow[]} rows
 * @param {string} dateStr
 * @returns {object[]}
 */
function detectEvents(rows, dateStr) {
  const events = [];

  if (rows.length === 0) return events;

  // 1. Camera offline / ข้อมูลขาด (gap > 2 นาที)
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].time);
    const curr = new Date(rows[i].time);
    const diffMin = (curr - prev) / 60000;
    if (diffMin > 2) {
      events.push({
        type: "camera_offline",
        severity: "warning",
        time: rows[i].time,
        message: `ข้อมูลขาด ${Math.round(diffMin)} นาที (${rows[i - 1].time} → ${rows[i].time})`,
        details: { gapMinutes: Math.round(diffMin) },
      });
    }
  }

  // 2. FPS ต่ำ (ติดต่อกัน >= 3 นาที)
  let lowFpsStreak = 0;
  for (const row of rows) {
    if (row.fps !== null && row.fps < LOW_FPS_THRESHOLD) {
      lowFpsStreak++;
      if (lowFpsStreak === 3) {
        events.push({
          type: "low_fps",
          severity: "warning",
          time: row.time,
          message: `FPS ต่ำกว่า ${LOW_FPS_THRESHOLD} ติดต่อกัน 3+ นาที (FPS: ${row.fps})`,
          details: { fps: row.fps, threshold: LOW_FPS_THRESHOLD },
        });
      }
    } else {
      lowFpsStreak = 0;
    }
  }

  // 3. คนเกินที่กำหนด (currentPeople = in_today - out_today > MAX_PEOPLE)
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

  // 4. เข้า/นอกเวลาทำการ (before BIZ_START or after BIZ_END)
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
        message: `มีการเคลื่อนไหวเวลา ${hour}:00 นอกเวลาทำการ (${BIZ_START}:00-${BIZ_END}:00) — in: ${inCount}, out: ${outCount}`,
        details: { hour, in: inCount, out: outCount, bizStart: BIZ_START, bizEnd: BIZ_END },
      });
    }
  }

  return events;
}

/** เหตุการณ์ของวันที่กำหนด — ใช้ทั้ง GET /api/events และ socket sync */
export function buildEvents(dateStr = getTodayStr()) {
  const events = detectEvents(readDayCsv(dateStr), dateStr);

  // เรียงตามเวลาใหม่สุดก่อน
  events.sort((a, b) => new Date(b.time) - new Date(a.time));

  return { date: dateStr, events };
}

router.get("/", (req, res) => {
  try {
    res.json(buildEvents(req.query.date ?? getTodayStr()));
  } catch (err) {
    console.error("[events]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;