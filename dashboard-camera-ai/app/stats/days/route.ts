// GET /stats/days — ทุกวันที่มีข้อมูลใน Supabase (ใหม่สุดก่อน) สำหรับตาราง / ตัวเลือกวันย้อนหลัง
import { connection } from "next/server";
import { listDays, supabaseConfigured } from "@/lib/server/stats";

export async function GET() {
  await connection(); // อ่านใหม่ทุกครั้ง ไม่ prerender ตอน build
  if (!supabaseConfigured()) {
    return Response.json({ error: "ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Vercel" }, { status: 503 });
  }
  try {
    return Response.json({ days: await listDays() });
  } catch (err) {
    console.error("[stats/days]", err);
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
