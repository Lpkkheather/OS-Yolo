// ============================================================
// routes/compare.js  GET /api/compare
// เทียบวันนี้ถึงเวลาล่าสุด กับ เมื่อวาน / สัปดาห์ก่อน / เฉลี่ย 7 วัน
// ============================================================
import { Router } from "express";
import { readDayCsv, getTodayStr, getDateStr } from "../csvReader.js";

const router = Router();

/**
 * นับวันก่อนหน้า n วัน
 * @param {number} n
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getDateStr(d);
}

/**
 * กรองแถวที่ time (HH:MM) <= cutoffTime แล้วรวม in/out
 * @param {import('../csvReader.js').MinuteRow[]} rows
 * @param {string} cutoffTime — "HH:MM"
 */
function sumUpTo(rows, cutoffTime) {
  let inSum = 0;
  let outSum = 0;

  for (const row of rows) {
    if (!row.time) continue;
    // เปรียบเทียบแค่ HH:MM
    const [h, m] = row.time.split("T")[1]?.split(":") ?? [];
    const rowTime = `${h}:${m}`;
    if (rowTime <= cutoffTime) {
      inSum += row.in ?? 0;
      outSum += row.out ?? 0;
    }
  }

  return { in: inSum, out: outSum };
}

/** เทียบยอดวันนี้กับวันอื่น (ถึงเวลาเดียวกัน) — ใช้ทั้ง GET /api/compare และ socket sync */
export function buildCompare() {
  const todayStr = getTodayStr();
  const todayRows = readDayCsv(todayStr);

  // หา cutoffTime จากแถวล่าสุดของวันนี้
  const lastRow =
    todayRows.length > 0 ? todayRows[todayRows.length - 1] : null;
  let cutoffTime = "23:59";
  if (lastRow?.time) {
    const [h, m] = lastRow.time.split("T")[1]?.split(":") ?? [];
    cutoffTime = `${h}:${m}`;
  }

  // ยอดวันนี้ถึง cutoff
  const todayStat = sumUpTo(todayRows, cutoffTime);

  // เมื่อวาน
  const yesterdayStat = sumUpTo(readDayCsv(daysAgo(1)), cutoffTime);

  // สัปดาห์ก่อน (7 วันที่แล้ว)
  const lastWeekStat = sumUpTo(readDayCsv(daysAgo(7)), cutoffTime);

  // เฉลี่ย 7 วันที่ผ่านมา (1-7 วันก่อน)
  let totalIn = 0;
  let totalOut = 0;
  let daysWithData = 0;

  for (let i = 1; i <= 7; i++) {
    const rows = readDayCsv(daysAgo(i));
    if (rows.length === 0) continue;
    const stat = sumUpTo(rows, cutoffTime);
    totalIn += stat.in;
    totalOut += stat.out;
    daysWithData++;
  }

  const avg7days =
    daysWithData > 0
      ? {
          in: Math.round(totalIn / daysWithData),
          out: Math.round(totalOut / daysWithData),
        }
      : { in: 0, out: 0 };

  return {
    date: todayStr,
    cutoffTime,
    today: todayStat,
    yesterday: yesterdayStat,
    lastWeek: lastWeekStat,
    avg7days,
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
