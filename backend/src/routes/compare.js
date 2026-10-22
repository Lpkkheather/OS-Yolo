// ============================================================
// routes/compare.js  GET /api/compare
// เทียบวันนี้ถึงเวลาล่าสุด กับ เมื่อวาน / สัปดาห์ก่อน / เฉลี่ย 7 วัน
// วันที่ไม่มีข้อมูล = null (dashboard แสดง "—") ไม่ใช่ 0 ซึ่งดูเหมือนวันนั้นไม่มีคนเลย
// ============================================================
import { Router } from "express";
import { getTodayStr, getDateStr, bangkokHHMM } from "../csvReader.js";
import { readDay } from "../dataSource.js";

const router = Router();

/**
 * วันที่ (YYYY-MM-DD ตามเวลาไทย) ของ n วันก่อน — ประเทศไทยไม่มี daylight saving: 1 วัน = 24 ชั่วโมงพอดี
 * @param {number} n
 */
function daysAgo(n) {
  return getDateStr(new Date(Date.now() - n * 86_400_000));
}

/**
 * รวม in/out ของแถวที่เวลา (HH:MM ตามเวลาไทย) <= cutoffTime
 * @param {import('../csvReader.js').MinuteRow[]} rows
 * @param {string} cutoffTime — "HH:MM"
 * @returns {{ in: number, out: number } | null} — null = วันนั้นไม่มีข้อมูล
 */
function sumUpTo(rows, cutoffTime) {
  if (rows.length === 0) return null;
  let inSum = 0;
  let outSum = 0;

  for (const row of rows) {
    if (!row.time) continue;
    if (bangkokHHMM(row.time) <= cutoffTime) {
      inSum += row.in ?? 0;
      outSum += row.out ?? 0;
    }
  }

  return { in: inSum, out: outSum };
}

/** เทียบยอดวันนี้กับวันอื่น (ถึงเวลาเดียวกัน) — ใช้ทั้ง GET /api/compare และ socket sync */
export function buildCompare() {
  const todayStr = getTodayStr();
  const todayRows = readDay(todayStr);

  // หา cutoffTime จากแถวล่าสุดของวันนี้
  const lastRow =
    todayRows.length > 0 ? todayRows[todayRows.length - 1] : null;
  const cutoffTime = lastRow?.time ? bangkokHHMM(lastRow.time) : "23:59";

  // เฉลี่ย 7 วันที่ผ่านมา (1-7 วันก่อน) — เฉพาะวันที่มีข้อมูล
  const pastDays = [];
  for (let i = 1; i <= 7; i++) pastDays.push(sumUpTo(readDay(daysAgo(i)), cutoffTime));
  const withData = pastDays.filter(Boolean);
  const avg7days =
    withData.length > 0
      ? {
          in: Math.round(withData.reduce((s, d) => s + d.in, 0) / withData.length),
          out: Math.round(withData.reduce((s, d) => s + d.out, 0) / withData.length),
        }
      : null;

  return {
    date: todayStr,
    cutoffTime,
    today: sumUpTo(todayRows, cutoffTime),
    yesterday: pastDays[0],
    lastWeek: pastDays[6],
    avg7days,
    daysWithData: withData.length,
  };
}

router.get("/", (req, res) => {
  try {
    res.json(buildCompare());
  } catch (err) {
    console.error("[compare]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
