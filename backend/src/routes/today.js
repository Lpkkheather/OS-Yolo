// ============================================================
// routes/today.js  GET /api/today
// ส่งคืน: สถิติวันนี้, กราฟรายชั่วโมง, peak hour, แถวทั้งหมด
// ============================================================
import { Router } from "express";
import { getTodayStr, bangkokHour } from "../csvReader.js";
import { readDay } from "../dataSource.js";

const router = Router();

/**
 * จัดกลุ่ม minute rows เป็น hourly bars (ชั่วโมงตามเวลาไทย) — ใช้ทั้งวันนี้และ GET /api/history/:date
 * @param {import('../csvReader.js').MinuteRow[]} rows
 * @returns {{ hour: number, in: number, out: number, visitors: number }[]}
 */
export function buildHourlyBars(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!row.time) continue;
    const hour = bangkokHour(row.time);
    const prev = map.get(hour) ?? { hour, in: 0, out: 0, visitors: 0 };
    prev.in += row.in ?? 0;
    prev.out += row.out ?? 0;
    prev.visitors += row.visitors ?? 0;
    map.set(hour, prev);
  }

  // เรียงตามชั่วโมง 0-23
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

/**
 * ชั่วโมงที่เข้ามากสุด — ยังไม่มีใครเข้า (หรือไม่มีเส้นนับ: in เป็น null ทั้งวัน) = null
 * ไม่งั้นการ์ด "ช่วงคนเยอะสุด" จะขึ้นชั่วโมงแรกของวันกับ "0 คนเข้า"
 * @param {{ hour: number, in: number }[]} hourlyBars
 */
export function findPeakHour(hourlyBars) {
  return hourlyBars.reduce((best, h) => (h.in > (best?.in ?? 0) ? h : best), null);
}

/** สถิติวันนี้ทั้งหมด (CSV หรือ Supabase: dataSource.js) — ใช้ทั้ง GET /api/today, SSE (TODAY_UPDATE) และ socket sync */
export function buildToday() {
  const rows = readDay(getTodayStr());
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;

  const inToday = lastRow?.in_today ?? 0;
  const outToday = lastRow?.out_today ?? 0;
  const visitorsToday = lastRow?.visitors_today ?? 0;
  const currentPeople = Math.max(0, inToday - outToday);

  const hourlyBars = buildHourlyBars(rows);

  // ชั่วโมงที่เข้ามากสุด
  const peakHour = findPeakHour(hourlyBars);

  // คนในห้องสูงสุดของวัน (ใช้ in_zone_max เป็น proxy)
  const maxInRoom = rows.reduce((max, r) => {
    const v = r.in_zone_max ?? 0;
    return v > max ? v : max;
  }, 0);

  return {
    date: getTodayStr(),
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
    lastRow,
  };
}

router.get("/", (req, res) => {
  try {
    res.json(buildToday());
  } catch (err) {
    console.error("[today]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
