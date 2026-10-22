// ============================================================
// routes/history.js  GET /api/history
// ส่งคืน: รายการวันที่มีข้อมูล + ข้อมูลของวันที่เลือก
// ============================================================
import { Router } from "express";
import { listDates, readDayAsync } from "../dataSource.js";
import { buildHourlyBars, findPeakHour } from "./today.js";
import { detectEvents } from "./events.js";

const router = Router();

router.get("/list", async (_req, res) => {
  try {
    res.json({ dates: await listDates() });
  } catch (err) {
    console.error("[history/list]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:date", async (req, res) => {
  try {
    const dateStr = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "รูปแบบวันที่ต้องเป็น YYYY-MM-DD" });
    }

    const rows = await readDayAsync(dateStr);
    if (rows.length === 0) {
      return res.status(404).json({ error: "ไม่มีข้อมูลวันที่นี้" });
    }

    const lastRow = rows[rows.length - 1];
    const inToday = lastRow?.in_today ?? 0;
    const outToday = lastRow?.out_today ?? 0;
    const visitorsToday = lastRow?.visitors_today ?? 0;
    const currentPeople = Math.max(0, inToday - outToday);

    const hourlyBars = buildHourlyBars(rows);

    // Peak hour
    const peakHour = findPeakHour(hourlyBars);

    // Max in room
    const maxInRoom = rows.reduce((max, r) => {
      const v = r.in_zone_max ?? 0;
      return v > max ? v : max;
    }, 0);

    const events = detectEvents(rows, dateStr).sort((a, b) => new Date(b.time) - new Date(a.time));

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

export default router;
