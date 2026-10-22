// ============================================================
// routes/status.js  GET /api/status
// ส่งคืน: mqttStatus, เวลาข้อมูลล่าสุด, แถวล่าสุด
// ============================================================
import { Router } from "express";
import { getTodayStr } from "../csvReader.js";
import { readDay } from "../dataSource.js";
import { getMqttState } from "../mqtt.js";

const router = Router();

/** สถานะตอนนี้ — ใช้ทั้ง GET /api/status และ socket sync */
export function buildStatus() {
  const rows = readDay(getTodayStr());
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
  const { status: mqttStatus } = getMqttState();

  return {
    mqttStatus,
    lastDataTime: lastRow?.time ?? null,
    lastRow,
  };
}

router.get("/", (req, res) => {
  try {
    res.json(buildStatus());
  } catch (err) {
    console.error("[status]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
