-- ============================================================
-- OS-Yolo — Supabase schema (project ของ OS-Yolo เอง: อย่าใช้ project / ตารางร่วมกับโปรเจกต์อื่น)
-- รันครั้งเดียวใน Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- รันซ้ำได้ (if not exists / or replace)
--
-- เขียนโดย: YOLO_Pi (counting.py ทุกนาที + bash run.sh upload ย้อนหลัง)  อ่านโดย: backend (dataSource.js)
-- ทั้งสองฝั่งใช้ secret key (ข้าม RLS) — ไม่มี policy ให้ anon / publishable key อ่านหรือเขียนได้
-- ============================================================

-- 1 แถว = 1 นาทีของกล้อง 1 ตัว (คอลัมน์เดียวกับ YOLO_Pi/data/<วันที่>.csv)
-- "in" / "out" เป็นคำสงวนของ SQL → in_count / out_count (YOLO_Pi และ backend แปลงชื่อให้เอง)
create table if not exists public.minute_counts (
  camera          text        not null,
  time            timestamptz not null,           -- ต้นนาที เช่น 2026-10-21T14:05:00+07:00
  seconds         integer,                        -- นับไปกี่วินาทีของนาทีนั้น (< 60 = นาทีแรก / สุดท้าย)
  in_count        integer,                        -- คนข้ามเส้นเข้า (null = ไม่มีเส้นนับ)
  out_count       integer,                        -- คนข้ามเส้นออก
  in_zone_avg     real,                           -- คนในโซนเฉลี่ยของนาที
  in_zone_max     integer,                        -- คนในโซนสูงสุดของนาที
  visitors        integer,                        -- ผู้มาเยือนใหม่ในนาทีนี้
  in_today        integer,                        -- ยอดสะสมของวัน
  out_today       integer,
  visitors_today  integer,
  fps             real,
  cpu_temp_c      real,
  model           text,
  primary key (camera, time)                      -- ส่งนาทีเดิมซ้ำ = อัปเดตแถวเดิม (upsert) ไม่เกิดแถวซ้ำ
);

create index if not exists minute_counts_time_idx on public.minute_counts (time);

-- เปิด RLS และไม่สร้าง policy: เข้าถึงได้เฉพาะ secret key (service role) เท่านั้น
alter table public.minute_counts enable row level security;
revoke all on public.minute_counts from anon, authenticated;

-- สรุปรายวัน (วันตามเวลาไทย) — backend ใช้หาว่ามีข้อมูลวันไหนบ้าง (GET /api/history/list)
-- security_invoker: view ใช้สิทธิ์ของผู้เรียก → RLS ของ minute_counts มีผล (ไม่งั้น view จะเปิดข้อมูลให้ anon)
create or replace view public.minute_days
with (security_invoker = on) as
select
  (time at time zone 'Asia/Bangkok')::date as date,
  camera,
  count(*)            as minutes,
  sum(in_count)       as in_total,
  sum(out_count)      as out_total,
  sum(visitors)       as visitors_total,
  max(in_zone_max)    as max_in_zone
from public.minute_counts
group by 1, 2;

revoke all on public.minute_days from anon, authenticated;
