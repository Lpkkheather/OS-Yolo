// GET /stats/zones — การตั้งค่าการนับปัจจุบัน · POST { zones } — บันทึกเส้น/โซนที่วาดบน dashboard
// เก็บใน Supabase camera_settings → ตัวนับบน Pi อ่านทุก 30 วินาทีแล้วใช้ทันที (ไม่ต้องรีสตาร์ท / ssh)
import { connection } from "next/server";
import { cleanZones, getCountSettings, saveCountSettings, supabaseConfigured } from "@/lib/server/stats";

const NOT_SET = { error: "ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Vercel" };

export async function GET() {
  await connection();
  if (!supabaseConfigured()) return Response.json(NOT_SET, { status: 503 });
  try {
    return Response.json(await getCountSettings());
  } catch (err) {
    console.error("[stats/zones]", err);
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!supabaseConfigured()) return Response.json(NOT_SET, { status: 503 });
  try {
    const body = (await request.json().catch(() => null)) as { zones?: unknown } | null;
    const zones = cleanZones(body?.zones);
    await saveCountSettings(zones);
    return Response.json({ zones });
  } catch (err) {
    console.error("[stats/zones]", err);
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
