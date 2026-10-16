// ============================================================
// csvReader.js — อ่านและ parse ไฟล์ CSV จาก YOLO_Pi/data/
// ============================================================
import { parse } from "csv-parse/sync";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// backend/src -> backend
const BACKEND_DIR = resolve(__dirname, "..");
// YOLO_DATA_DIR is relative to backend/ (e.g., ../YOLO_Pi/data)
const DATA_DIR = resolve(BACKEND_DIR, process.env.YOLO_DATA_DIR ?? "../YOLO_Pi/data");

/**
 * แปลงค่าจาก string เป็น number หรือ null
 * @param {string} v
 */
function toNum(v) {
  if (v === "" || v === undefined || v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * แปลง string เป็น int หรือ null
 * @param {string} v
 */
function toInt(v) {
  if (v === "" || v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

/**
 * อ่านไฟล์ CSV ของวันที่กำหนด แล้วคืนเป็น array of objects
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {import('./types.js').MinuteRow[]}
 */
export function readDayCsv(dateStr) {
  const filePath = join(DATA_DIR, `${dateStr}.csv`);
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, "utf-8");
    // ใช้ relax_column_count: true เพื่อรองรับทั้ง 14 และ 27 columns
    // header row จะกำหนด column names, แถวที่มี columns มากกว่า header จะถูก ignore
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_column_count_less: true,
    });

    return records.map((r) => ({
      time: r.time ?? "",
      seconds: toInt(r.seconds) ?? 60,
      camera: r.camera ?? "",
      in: toInt(r.in),
      out: toInt(r.out),
      in_zone_avg: toNum(r.in_zone_avg),
      in_zone_max: toInt(r.in_zone_max),
      visitors: toInt(r.visitors),
      in_today: toInt(r.in_today),
      out_today: toInt(r.out_today),
      visitors_today: toInt(r.visitors_today),
      fps: toNum(r.fps),
      cpu_temp_c: toNum(r.cpu_temp_c),
      model: r.model ?? "",
    }));
  } catch (err) {
    console.error(`[csvReader] ไม่สามารถอ่านไฟล์ ${filePath}:`, err.message);
    return [];
  }
}

/**
 * วันที่วันนี้ใน timezone Asia/Bangkok รูปแบบ YYYY-MM-DD
 */
export function getTodayStr() {
  return getDateStr(new Date());
}

/**
 * แปลง Date เป็น YYYY-MM-DD ใน Asia/Bangkok
 * @param {Date} date
 */
export function getDateStr(date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/**
 * คืน path ของ DATA_DIR (สำหรับ debug)
 */
export function getDataDir() {
  return DATA_DIR;
}
