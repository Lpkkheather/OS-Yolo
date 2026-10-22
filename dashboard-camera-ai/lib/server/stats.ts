// ============================================================
// lib/server/stats.ts — อ่านสถิติรายวันจาก Supabase ตรงจาก Vercel (ไม่ผ่าน backend บน Pi)
// ใช้ตอน Pi ปิด / หลุดเน็ต และหน้าดูย้อนหลังรายวัน — ข้อมูลเดียวกับที่ Pi เขียนลง minute_counts ทุกนาที
// เฉพาะ server (route handlers ใน app/stats): SUPABASE_SECRET_KEY ห้ามขึ้นต้นด้วย NEXT_PUBLIC_
// การคำนวณเหมือน backend/src/routes (today, history, compare, events) — แก้ฝั่งหนึ่งให้แก้อีกฝั่งด้วย
// ============================================================
import type { MinuteRow, TodayData } from "@/lib/hooks/useSseToday";
import type { CompareResponse, CompareStat, DayStats, DaySummary, EventItem } from "@/lib/api";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
const CAMERA = process.env.SUPABASE_CAMERA ?? ""; // ว่าง = ทุกกล้อง (Pi ตัวเดียว)
const PAGE = 1000; // Supabase ส่งได้สูงสุด 1000 แถวต่อ request (1 วัน = สูงสุด 1440 นาที)
const DAY_MS = 86_400_000;

// เกณฑ์ของเหตุการณ์ — ค่าเดียวกับ backend/.env
const MAX_PEOPLE = Number(process.env.MAX_PEOPLE ?? 50);
const LOW_FPS_THRESHOLD = Number(process.env.LOW_FPS_THRESHOLD ?? 8);
const BIZ_START = Number(process.env.BUSINESS_HOURS_START ?? 8);
const BIZ_END = Number(process.env.BUSINESS_HOURS_END ?? 20);

export const supabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

const BANGKOK_DATE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" });
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

/** วันนี้ตามเวลาไทย YYYY-MM-DD */
export const todayStr = () => BANGKOK_DATE.format(new Date());
/** ประเทศไทยไม่มี daylight saving: 1 วัน = 24 ชั่วโมงพอดี */
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// time ของ MinuteRow เป็นเวลาไทยเสมอ (toMinuteRow) เช่น 2026-10-21T14:05:00+07:00
const hourOf = (time: string) => Number(time.slice(11, 13));
const hhmmOf = (time: string) => time.slice(11, 16);

interface SupabaseRow {
  camera: string | null;
  time: string;
  seconds: number | null;
  in_count: number | null;
  out_count: number | null;
  in_zone_avg: number | null;
  in_zone_max: number | null;
  visitors: number | null;
  in_today: number | null;
  out_today: number | null;
  visitors_today: number | null;
  fps: number | null;
  cpu_temp_c: number | null;
  model: string | null;
}

/** แถวของ minute_counts → MinuteRow แบบที่ backend ส่ง (Supabase ส่ง time เป็น UTC → แปลงเป็นเวลาไทย +07:00) */
function toMinuteRow(r: SupabaseRow): MinuteRow {
  return {
    time: `${BANGKOK_DATE_TIME.format(new Date(r.time)).replace(" ", "T")}+07:00`,
    seconds: r.seconds ?? 60,
    camera: r.camera ?? "",
    // in / out เป็น null ได้ (ไม่มีเส้นนับ) — type เดิมของ dashboard เป็น number ทุกที่ใช้ ?? 0 อยู่แล้ว
    in: r.in_count as number,
    out: r.out_count as number,
    in_zone_avg: r.in_zone_avg as number,
    in_zone_max: r.in_zone_max as number,
    visitors: r.visitors as number,
    in_today: r.in_today as number,
    out_today: r.out_today as number,
    visitors_today: r.visitors_today as number,
    fps: r.fps as number,
    cpu_temp_c: r.cpu_temp_c,
    model: r.model ?? "",
  };
}

/** GET จาก Supabase REST — secret key ใส่ใน header apikey (key แบบ JWT รุ่นเก่า eyJ... ใส่ Authorization ด้วย) */
async function supabaseGet<T>(table: string, params: URLSearchParams): Promise<T> {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY };
  if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${table} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** แถวของวัน from..to (เวลาไทย รวมทั้งสองวัน) เรียงตามเวลา → วันที่ -> MinuteRow[] (วันที่ไม่มีข้อมูล = []) */
async function fetchDays(from: string, to: string): Promise<Map<string, MinuteRow[]>> {
  const byDay = new Map<string, MinuteRow[]>();
  for (let d = from; d <= to; d = addDays(d, 1)) byDay.set(d, []);
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams([
      ["select", "*"],
      ["time", `gte.${from}T00:00:00+07:00`],
      ["time", `lt.${addDays(to, 1)}T00:00:00+07:00`],
      ["order", "time.asc,camera.asc"],
      ["limit", String(PAGE)],
      ["offset", String(offset)],
    ]);
    if (CAMERA) params.append("camera", `eq.${CAMERA}`);
    const page = await supabaseGet<SupabaseRow[]>("minute_counts", params);
    for (const r of page) {
      const row = toMinuteRow(r);
      byDay.get(row.time.slice(0, 10))?.push(row);
    }
    if (page.length < PAGE) return byDay;
  }
}

/** ทุกวันที่มีข้อมูล ใหม่สุดก่อน (view minute_days ใน supabase/schema.sql) — กล้องหลายตัวรวมเป็นวันเดียว */
export async function listDays(): Promise<DaySummary[]> {
  const params = new URLSearchParams([
    ["select", "date,minutes,in_total,out_total,visitors_total,max_in_zone"],
    ["order", "date.desc"],
  ]);
  if (CAMERA) params.append("camera", `eq.${CAMERA}`);
  const rows = await supabaseGet<
    { date: string; minutes: number; in_total: number | null; out_total: number | null; visitors_total: number | null; max_in_zone: number | null }[]
  >("minute_days", params);

  const byDate = new Map<string, DaySummary>();
  for (const r of rows) {
    const d = byDate.get(r.date) ?? { date: r.date, minutes: 0, in: 0, out: 0, visitors: 0, maxInRoom: 0 };
    d.minutes += r.minutes ?? 0;
    d.in += r.in_total ?? 0;
    d.out += r.out_total ?? 0;
    d.visitors += r.visitors_total ?? 0;
    d.maxInRoom = Math.max(d.maxInRoom, r.max_in_zone ?? 0);
    byDate.set(r.date, d);
  }
  return [...byDate.values()];
}

/** minute rows → hourly bars (ชั่วโมงตามเวลาไทย) — เหมือน buildHourlyBars ใน backend/src/routes/today.js */
function buildHourlyBars(rows: MinuteRow[]) {
  const map = new Map<number, { hour: number; in: number; out: number; visitors: number }>();
  for (const row of rows) {
    const hour = hourOf(row.time);
    const prev = map.get(hour) ?? { hour, in: 0, out: 0, visitors: 0 };
    prev.in += row.in ?? 0;
    prev.out += row.out ?? 0;
    prev.visitors += row.visitors ?? 0;
    map.set(hour, prev);
  }
  return [...map.values()].sort((a, b) => a.hour - b.hour);
}

/** ชั่วโมงที่เข้ามากสุด — ยังไม่มีใครเข้า (หรือไม่มีเส้นนับ) = null */
function findPeakHour(bars: { hour: number; in: number }[]) {
  return bars.reduce<{ hour: number; in: number } | null>((best, h) => (h.in > (best?.in ?? 0) ? h : best), null);
}

/** รวม in/out ของแถวที่เวลา <= cutoff (HH:MM) — null = วันนั้นไม่มีข้อมูล (เหมือน compare.js) */
function sumUpTo(rows: MinuteRow[], cutoff: string): CompareStat | null {
  if (rows.length === 0) return null;
  let inSum = 0;
  let outSum = 0;
  for (const row of rows) {
    if (hhmmOf(row.time) <= cutoff) {
      inSum += row.in ?? 0;
      outSum += row.out ?? 0;
    }
  }
  return { in: inSum, out: outSum };
}

/** เหตุการณ์จากแถวรายนาทีของวัน — เหมือน detectEvents ใน backend/src/routes/events.js */
function detectEvents(rows: MinuteRow[]): EventItem[] {
  const events: EventItem[] = [];

  // ข้อมูลขาด (gap > 2 นาที)
  for (let i = 1; i < rows.length; i++) {
    const gap = (Date.parse(rows[i].time) - Date.parse(rows[i - 1].time)) / 60_000;
    if (gap > 2) {
      events.push({
        type: "camera_offline",
        severity: "warning",
        time: rows[i].time,
        message: `ข้อมูลขาด ${Math.round(gap)} นาที (${rows[i - 1].time} → ${rows[i].time})`,
        details: { gapMinutes: Math.round(gap) },
      });
    }
  }

  // FPS ต่ำติดต่อกัน >= 3 นาที
  let lowFpsStreak = 0;
  for (const row of rows) {
    if (row.fps != null && row.fps < LOW_FPS_THRESHOLD) {
      if (++lowFpsStreak === 3) {
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

  // คนเกินที่กำหนด
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

  // มีคนเข้า/ออกนอกเวลาทำการ
  for (const row of rows) {
    const hour = hourOf(row.time);
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

  return events.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

/** ทั้ง dashboard ของวันหนึ่ง: สถิติ + กราฟ + เทียบวันก่อน (ถึงเวลาเดียวกัน) + เหตุการณ์ */
export async function buildDayStats(date: string): Promise<DayStats> {
  // วันที่เลือก + 7 วันก่อน (ช่องเทียบ) ใน query เดียว
  const byDay = await fetchDays(addDays(date, -7), date);
  const rows = byDay.get(date) ?? [];
  const lastRow = rows.at(-1) ?? null;

  const hourlyBars = buildHourlyBars(rows);
  const peak = findPeakHour(hourlyBars);
  const today: TodayData = {
    date,
    inToday: lastRow?.in_today ?? 0,
    outToday: lastRow?.out_today ?? 0,
    visitorsToday: lastRow?.visitors_today ?? 0,
    currentPeople: null, // ค่าสดมาจาก Pi เท่านั้น
    peakHour: peak ? { hour: peak.hour, inCount: peak.in } : null,
    maxInRoom: rows.reduce((max, r) => Math.max(max, r.in_zone_max ?? 0), 0),
    hourlyBars,
    minuteRows: [], // ทั้งวัน ~300 KB: การ์ดใช้แค่ hourlyBars / lastRow
    lastRow,
    liveTime: null,
    detection: null,
  };

  const cutoffTime = lastRow ? hhmmOf(lastRow.time) : "23:59";
  const pastDays = [1, 2, 3, 4, 5, 6, 7].map((n) => sumUpTo(byDay.get(addDays(date, -n)) ?? [], cutoffTime));
  const withData = pastDays.filter((d): d is CompareStat => d !== null);
  const compare: CompareResponse = {
    date,
    cutoffTime,
    today: sumUpTo(rows, cutoffTime),
    yesterday: pastDays[0],
    lastWeek: pastDays[6],
    avg7days:
      withData.length > 0
        ? {
            in: Math.round(withData.reduce((s, d) => s + d.in, 0) / withData.length),
            out: Math.round(withData.reduce((s, d) => s + d.out, 0) / withData.length),
          }
        : null,
    daysWithData: withData.length,
  };

  return { date, today, compare, events: { date, events: detectEvents(rows) } };
}
