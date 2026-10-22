// ============================================================
// dataSource.js — แถวรายนาทีของแต่ละวัน สำหรับ today / compare / status / events / history
//   DATA_SOURCE=csv       อ่าน YOLO_Pi/data/<วันที่>.csv (backend ต้องรันบนเครื่องเดียวกับตัวนับ)
//   DATA_SOURCE=supabase  อ่านตาราง minute_counts (supabase/schema.sql) ที่ YOLO_Pi เขียนทุกนาที → รัน backend ที่ไหนก็ได้
//   ไม่ตั้ง = supabase ถ้ามี SUPABASE_URL ไม่งั้น csv
//
// Supabase: socket sync เรียก build* ทุก 3 วินาที → readDay() อ่านจาก cache ในหน่วยความจำ (sync เหมือน CSV)
//   ไม่ query ทุกรอบ: โหลด 8 วันล่าสุด (วันนี้ + 7 วันก่อนที่ compare ใช้) ตอนเริ่ม · วันนี้ทุก SUPABASE_REFRESH_SECONDS
//   และหลัง Pi ส่งนาทีใหม่ทาง MQTT (refreshSoon) · ทั้ง 8 วันทุก 10 นาที (ข้ามวัน + ข้อมูลที่ส่งย้อนหลังด้วย run.sh upload)
// ============================================================
import { existsSync } from "fs";
import { readDayCsv, listCsvDates, getDataDir, getTodayStr, getDateStr } from "./csvReader.js";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
const CAMERA = process.env.SUPABASE_CAMERA ?? ""; // ว่าง = ทุกกล้อง (Pi ตัวเดียว)
export const DATA_SOURCE = process.env.DATA_SOURCE || (SUPABASE_URL ? "supabase" : "csv");
const REFRESH_SECONDS = Number(process.env.SUPABASE_REFRESH_SECONDS ?? 20);
const CACHE_DAYS = 8;
const FULL_REFRESH_MS = 10 * 60_000;
const PAGE = 1000; // Supabase ส่งได้สูงสุด 1000 แถวต่อ request (1 วัน = สูงสุด 1440 นาที)
const DAY_MS = 86_400_000;

const days = new Map(); // "YYYY-MM-DD" -> MinuteRow[] เฉพาะ CACHE_DAYS วันล่าสุด
let failing = false;
let soonTimer = null;

const daysAgo = (n) => getDateStr(new Date(Date.now() - n * DAY_MS));
const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

const BANGKOK_DATE_TIME = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * แถวของ minute_counts → MinuteRow แบบเดียวกับ csvReader
 * Supabase ส่ง time เป็น UTC → แปลงกลับเป็นเวลาไทย +07:00 แบบที่ Pi เขียนใน CSV (dashboard ได้ข้อมูลหน้าตาเดิม)
 */
function toMinuteRow(r) {
  return {
    time: `${BANGKOK_DATE_TIME.format(new Date(r.time)).replace(" ", "T")}+07:00`,
    seconds: r.seconds ?? 60,
    camera: r.camera ?? "",
    in: r.in_count,
    out: r.out_count,
    in_zone_avg: r.in_zone_avg,
    in_zone_max: r.in_zone_max,
    visitors: r.visitors,
    in_today: r.in_today,
    out_today: r.out_today,
    visitors_today: r.visitors_today,
    fps: r.fps,
    cpu_temp_c: r.cpu_temp_c,
    model: r.model ?? "",
  };
}

/** GET จาก Supabase REST — secret key ใส่ใน header apikey (key แบบ JWT รุ่นเก่า eyJ... ใส่ Authorization ด้วย) */
async function supabaseGet(table, params) {
  const headers = { apikey: SUPABASE_KEY };
  if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${table} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * แถวของวัน from..to (YYYY-MM-DD เวลาไทย รวมทั้งสองวัน) เรียงตามเวลา
 * @returns {Promise<Map<string, object[]>>} วันที่ -> MinuteRow[] (วันที่ไม่มีข้อมูล = [])
 */
async function fetchDays(from, to) {
  const byDay = new Map();
  for (let d = from; d <= to; d = nextDay(d)) byDay.set(d, []);
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams([
      ["select", "*"],
      ["time", `gte.${from}T00:00:00+07:00`],
      ["time", `lt.${nextDay(to)}T00:00:00+07:00`],
      ["order", "time.asc,camera.asc"],
      ["limit", String(PAGE)],
      ["offset", String(offset)],
    ]);
    if (CAMERA) params.append("camera", `eq.${CAMERA}`);
    const page = await supabaseGet("minute_counts", params);
    for (const r of page) {
      const row = toMinuteRow(r);
      byDay.get(row.time.slice(0, 10))?.push(row);
    }
    if (page.length < PAGE) return byDay;
  }
}

/** อ่านวัน from..วันนี้ ใหม่จาก Supabase ใส่ cache — อ่านไม่ได้ = ใช้ cache เดิมต่อ แล้วลองใหม่รอบหน้า */
async function refresh(from) {
  try {
    for (const [d, rows] of await fetchDays(from, getTodayStr())) days.set(d, rows);
    const oldest = daysAgo(CACHE_DAYS - 1);
    for (const d of days.keys()) if (d < oldest) days.delete(d);
    if (failing) console.log("[Supabase] อ่านได้แล้ว");
    failing = false;
  } catch (err) {
    if (!failing) console.warn(`[Supabase] อ่านไม่ได้ (${err.message}) — ใช้ข้อมูลเดิมแล้วลองใหม่รอบหน้า`);
    failing = true;
  }
}

/** เริ่มแหล่งข้อมูล (เรียกครั้งเดียวก่อน server เปิด) + log ว่าอ่านจากไหน */
export async function startDataSource() {
  if (DATA_SOURCE !== "supabase") {
    // กราฟรายชั่วโมง / ตารางเทียบ อ่านจาก CSV ในโฟลเดอร์นี้เท่านั้น (MQTT ให้แค่ค่าสด) → path ผิด = กราฟว่าง
    const dataDir = getDataDir();
    if (existsSync(dataDir)) {
      console.log(`[Server] ข้อมูล: CSV ${dataDir}`);
    } else {
      console.warn(`[Server] ⚠️  ไม่มีโฟลเดอร์ CSV ${dataDir} — กราฟและตารางเทียบจะว่าง: แก้ YOLO_DATA_DIR ใน backend/.env`);
    }
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("[Server] ⚠️  DATA_SOURCE=supabase แต่ไม่มี SUPABASE_URL / SUPABASE_SECRET_KEY ใน backend/.env — กราฟและตารางเทียบจะว่าง");
    return;
  }
  await refresh(daysAgo(CACHE_DAYS - 1));
  const rows = [...days.values()].reduce((n, r) => n + r.length, 0);
  console.log(
    `[Server] ข้อมูล: Supabase ${SUPABASE_URL} (minute_counts${CAMERA ? `, camera ${CAMERA}` : ""}) — ` +
      `${rows} นาทีใน ${CACHE_DAYS} วันล่าสุด, อ่านวันนี้ใหม่ทุก ${REFRESH_SECONDS} วินาที`,
  );
  setInterval(() => refresh(getTodayStr()), REFRESH_SECONDS * 1000);
  setInterval(() => refresh(daysAgo(CACHE_DAYS - 1)), FULL_REFRESH_MS);
}

/** Pi ส่งนาทีใหม่ทาง MQTT (pi5/people/count) → อ่านวันนี้ใหม่ในอีก 3 วินาที (Pi เขียน Supabase พร้อมกับส่ง MQTT) */
export function refreshSoon() {
  if (DATA_SOURCE !== "supabase" || !SUPABASE_URL || soonTimer) return;
  soonTimer = setTimeout(() => {
    soonTimer = null;
    refresh(getTodayStr());
  }, 3000);
}

/**
 * แถวรายนาทีของวัน (sync) — today / compare / status / events / socket sync ทุก 3 วินาที
 * @param {string} date — YYYY-MM-DD
 * @returns {import('./csvReader.js').MinuteRow[]}
 */
export function readDay(date) {
  if (DATA_SOURCE !== "supabase") return readDayCsv(date);
  return days.get(date)?.slice() ?? [];
}

/** เหมือน readDay แต่ได้ทุกวัน (วันที่เก่ากว่า cache อ่านจาก Supabase ตอนนั้น) — GET /api/history/:date, /api/events?date= */
export async function readDayAsync(date) {
  if (DATA_SOURCE !== "supabase" || days.has(date)) return readDay(date);
  return (await fetchDays(date, date)).get(date) ?? [];
}

/** วันที่มีข้อมูล ใหม่สุดก่อน — GET /api/history/list */
export async function listDates() {
  if (DATA_SOURCE !== "supabase") return listCsvDates();
  const params = new URLSearchParams([
    ["select", "date"],
    ["order", "date.desc"],
  ]);
  if (CAMERA) params.append("camera", `eq.${CAMERA}`);
  const rows = await supabaseGet("minute_days", params);
  return [...new Set(rows.map((r) => r.date))];
}
