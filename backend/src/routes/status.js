// ============================================================
// routes/status.js  GET /api/status
// ส่งคืน: mqttStatus, เวลาข้อมูลล่าสุด, แถวล่าสุด
// ============================================================
import { Router } from "express";
import { readDayCsv, getTodayStr } from "../csvReader.js";
import { getMqttState } from "../mqtt.js";

const router = Router();

router.get("/", (req, res) => {
  try {
    const rows = readDayCsv(getTodayStr());
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const { status: mqttStatus } = getMqttState();

    res.json({
      mqttStatus,
      lastDataTime: lastRow?.time ?? null,
      lastRow,
    });
  } catch (err) {
    console.error("[status]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
