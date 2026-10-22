// GET /stats/day/<YYYY-MM-DD | today> — ทั้ง dashboard ของวันนั้นจาก Supabase (ใช้ได้แม้ Pi ปิด)
import { connection } from "next/server";
import { buildDayStats, supabaseConfigured, todayStr } from "@/lib/server/stats";

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  await connection();
  const { date: raw } = await params;
  const date = raw === "today" ? todayStr() : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "รูปแบบวันที่ต้องเป็น YYYY-MM-DD หรือ today" }, { status: 400 });
  }
  if (!supabaseConfigured()) {
    return Response.json({ error: "ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY ใน Vercel" }, { status: 503 });
  }
  try {
    return Response.json(await buildDayStats(date));
  } catch (err) {
    console.error("[stats/day]", err);
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
