// ============================================================
// routes/zones.js  GET /api/zones
// ส่งคืน: zones.json และ zones_preview.jpg
// ============================================================
import { Router } from "express";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
// backend/src/routes -> backend/src -> backend
const BACKEND_DIR = resolve(__dirname, "..", "..");
const ROOT_DIR = resolve(BACKEND_DIR, process.env.YOLO_ROOT_DIR ?? "../YOLO_Pi");

router.get("/config", (_req, res) => {
  try {
    const filePath = join(ROOT_DIR, "zones.json");
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "ไม่พบ zones.json" });
    }
    const content = readFileSync(filePath, "utf-8");
    res.json(JSON.parse(content));
  } catch (err) {
    console.error("[zones/config]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/preview", (_req, res) => {
  try {
    const filePath = join(ROOT_DIR, "zones_preview.jpg");
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "ไม่พบ zones_preview.jpg" });
    }
    res.sendFile(filePath);
  } catch (err) {
    console.error("[zones/preview]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;