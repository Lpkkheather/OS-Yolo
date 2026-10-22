# OS-Yolo Dashboard

หน้าเว็บของระบบนับคน OS-Yolo (Next.js 16 · React 19 · Tailwind CSS 4 · Recharts · socket.io-client) deploy บน Vercel
ภาพรวมทั้งโปรเจกต์ การส่งข้อมูล และวิธีติดตั้ง: [README หลัก](../README.md)

## ข้อมูลมาจากไหน

| แหล่ง | ใช้กับ |
|---|---|
| Socket.IO ของ backend บน Pi (`NEXT_PUBLIC_API_URL` ตัด `/api`) | ภาพตรวจจับสด, ค่าสด, ข้อมูลทั้งหน้าทุก 3 วินาที |
| REST ของ backend (`NEXT_PUBLIC_API_URL`) | ตัวสำรองตอนเปิดหน้า |
| `app/stats/*` (route handlers บน Vercel → Supabase) | ข้อมูลย้อนหลังรายวัน, สถิติวันนี้ตอนบอร์ดปิด, บันทึก/อ่านการตั้งค่าการนับ |

## Environment variables

| ตัวแปร | ใช้ที่ | ตัวอย่าง |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | เบราว์เซอร์ (build time) | `https://<เครื่อง>.<tailnet>.ts.net/api` |
| `SUPABASE_URL` | server เท่านั้น | `https://<project>.supabase.co` |
| `SUPABASE_SECRET_KEY` | server เท่านั้น (ห้ามใช้ชื่อขึ้นต้น `NEXT_PUBLIC_`) | `sb_secret_...` |
| `SUPABASE_CAMERA` | ไม่บังคับ | `cam1` |

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `app/Dashboard.tsx` | หน้าหลัก: เลือกวัน, จัดการ์ด, รวมข้อมูลสด + Supabase |
| `app/stats/days/route.ts` | `GET /stats/days` ทุกวันที่มีข้อมูล |
| `app/stats/day/[date]/route.ts` | `GET /stats/day/<วันที่ \| today>` ทั้ง dashboard ของวันนั้น |
| `app/stats/zones/route.ts` | `GET` / `POST /stats/zones` การตั้งค่าการนับ |
| `lib/server/stats.ts` | อ่าน/เขียน Supabase และคำนวณสถิติ (ตรรกะเดียวกับ backend/src/routes) |
| `lib/hooks/useSocketSync.ts` | ต่อ Socket.IO รับ sync / live / frame |
| `lib/components/DetectionCard.tsx` | การ์ดภาพตรวจจับสด + ปุ่มตั้งค่าการนับ |
| `lib/components/ZoneEditor.tsx` | หน้าวาดเส้นเข้า/ออกและโซนบนภาพสด |
| `lib/components/DailySummaryTable.tsx` | ตารางสรุปรายวัน + ตัวเลือกวัน |

## รันในเครื่อง

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run dev   # ต้องมี backend รันอยู่
```

## Deploy

```bash
npx vercel@latest --prod
```
