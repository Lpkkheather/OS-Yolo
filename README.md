# OS-Yolo — ระบบนับคนเข้า-ออกห้องด้วย YOLO บน Raspberry Pi

กล้อง USB ต่อกับ Raspberry Pi 5 ใช้โมเดล YOLO ที่เทรนเองตรวจจับและติดตามคน นับคนเข้า-ออกห้องและคนในห้องตอนนี้
ส่งข้อมูลรายนาทีขึ้น Supabase และแสดงผลบน Dashboard (Next.js บน Vercel) ทั้งภาพตรวจจับสด สถิติวันนี้ และข้อมูลย้อนหลังรายวัน

- Dashboard: https://os-yolo-dashboard.vercel.app
- ใช้งานจริง: เสียบไฟบอร์ดที่ต่อกล้องไว้ ทุกอย่างเปิดเองใน 1-2 นาที ไม่ต้องต่อจอหรือรันคำสั่ง
- โปรเจกต์รายวิชา (course project) · ต.ค. 2026

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [Dashboard ทำอะไรได้บ้าง](#2-dashboard-ทำอะไรได้บ้าง)
3. [ส่วนประกอบและโครงสร้างโฟลเดอร์](#3-ส่วนประกอบและโครงสร้างโฟลเดอร์)
4. [Tech Stack](#4-tech-stack)
5. [การส่งและจัดเก็บข้อมูล](#5-การส่งและจัดเก็บข้อมูล)
6. [ติดตั้งครั้งแรก](#6-ติดตั้งครั้งแรก)
7. [การใช้งานประจำวัน](#7-การใช้งานประจำวัน)
8. [อัปเดตโค้ด](#8-อัปเดตโค้ด)
9. [คำสั่งที่ใช้บ่อย](#9-คำสั่งที่ใช้บ่อย)
10. [ผลวัด (Metrics)](#10-ผลวัด-metrics)
11. [แก้ปัญหาเบื้องต้น](#11-แก้ปัญหาเบื้องต้น)
12. [ความปลอดภัย](#12-ความปลอดภัย)
13. [ข้อจำกัด](#13-ข้อจำกัด)

---

## 1. ภาพรวม

| ขั้น | เกิดอะไรขึ้น | อยู่ที่ไหน |
|---|---|---|
| ถ่ายภาพ | webcam ส่งภาพ 640×480 ประมาณ 30 เฟรม/วินาที | ห้อง |
| ตรวจจับ + นับ | YOLO (NCNN) หาคน → ByteTrack ให้ ID แต่ละคน → นับข้ามเส้นเข้า/ออก, คนในโซน, ผู้มาเยือน | Raspberry Pi 5 |
| ส่งต่อ | ค่าสด ภาพ และข้อมูลรายนาที ส่งผ่าน MQTT ให้ backend บนบอร์ดเดียวกัน · ข้อมูลรายนาทีส่งขึ้น Supabase ด้วย | Raspberry Pi 5 → Supabase |
| ให้บริการ | backend (Express + Socket.IO) เปิดพอร์ต 4000 · Tailscale Funnel ทำลิงก์ HTTPS ถึงพอร์ตนี้ | Raspberry Pi 5 |
| แสดงผล | Dashboard ต่อ Socket.IO กับ backend เพื่อรับข้อมูลสด และอ่าน Supabase ตรงสำหรับข้อมูลย้อนหลัง | Vercel + เบราว์เซอร์ |

ประมวลผลภาพทั้งหมดบนบอร์ด ไม่บันทึกวิดีโอ ส่งขึ้นคลาวด์เฉพาะตัวเลขรายนาที

## 2. Dashboard ทำอะไรได้บ้าง

**ดูการตรวจจับสด**
- ภาพที่โมเดลตีกรอบคนแล้ว ประมาณ 5 ภาพ/วินาที พร้อมป้าย LIVE
- จำนวนคนในภาพ, ความมั่นใจเฉลี่ย, FPS, ชื่อโมเดล

**สถิติวันนี้**
- คนในห้องตอนนี้ (ค่ากลางของ 2 วินาทีล่าสุด อัปเดตทุกวินาที)
- ยอดเข้า / ออก, ช่วงเวลาคนเข้าเยอะสุด, คนในห้องพร้อมกันสูงสุด
- กราฟเข้า/ออกรายชั่วโมง
- เทียบกับเมื่อวาน / สัปดาห์ก่อน / ค่าเฉลี่ย 7 วัน ณ เวลาเดียวกัน
- เหตุการณ์: ข้อมูลขาด (กล้องหยุดเกิน 2 นาที), FPS ต่ำต่อเนื่อง, คนเกินเกณฑ์, มีคนนอกเวลาทำการ

**ข้อมูลย้อนหลังรายวัน**
- ช่องเลือกวันที่มุมขวาบน: การ์ดทั้งหน้าเปลี่ยนเป็นข้อมูลของวันนั้น
- ตารางสรุปทุกวัน (เข้า, ออก, ผู้มาเยือน, คนสูงสุด, ชั่วโมงที่นับ) กดแถวเพื่อเปิดวันนั้น
- ดูได้แม้บอร์ดปิด เพราะอ่านจาก Supabase ตรง

**ตั้งค่าการนับ** (ปุ่มใต้ภาพกล้อง)
- วาดเส้นเข้า/ออก 2 คลิกบนภาพสด ลูกศรเขียว = ทิศ "เข้า" · ปุ่มสลับฝั่ง · ปุ่มยืดเส้นให้สุดขอบภาพ
- วาดโซนห้อง (ไม่บังคับ, ไม่วาด = ทั้งภาพ) · เลือกนับที่เท้าหรือที่กลางตัว
- ปุ่ม "AI เสนอเส้นที่ประตู" (YOLOE หาประตูให้) แล้วปรับเอง
- บันทึกลง Supabase บอร์ดใช้ค่าใหม่ภายใน 30 วินาที · ยังไม่ตั้งเส้น = ช่องเข้า/ออกแสดง "—" (ไม่เดา)

**สุขภาพระบบ:** FPS, อุณหภูมิ CPU ของบอร์ด, โมเดล, ชื่อกล้อง

## 3. ส่วนประกอบและโครงสร้างโฟลเดอร์

| ส่วน | อยู่ที่ไหน | หน้าที่ |
|---|---|---|
| ตัวนับคน | Pi · systemd `yolo-pi-counter` | ตรวจจับ ติดตาม นับ สรุปรายนาที ส่ง MQTT / Supabase |
| Mosquitto | Pi | MQTT broker ภายในบอร์ด |
| Backend | Pi · systemd `yolo-pi-backend` | REST API + Socket.IO พอร์ต 4000 |
| Tailscale Funnel | Pi | ลิงก์ HTTPS ถาวรถึงพอร์ต 4000 ใช้ได้ทุก WiFi |
| Supabase | คลาวด์ | PostgreSQL เก็บข้อมูลรายนาทีและการตั้งค่า |
| Dashboard | Vercel | หน้าเว็บ + route handlers `/stats/*` ที่อ่าน/เขียน Supabase |

```
OS-Yolo/
├── YOLO_Pi/               ตัวนับคน (Python) — รายละเอียดเต็ม: YOLO_Pi/README.md
│   ├── run.sh             คำสั่งทั้งหมด (setup, ทดสอบกล้อง, count, service, backend, send, upload)
│   ├── 3_camera.py        ตรวจจับ + ติดตาม + นับ + ส่งภาพ/ค่าสด
│   ├── counting.py        นับเส้น/โซน, บันทึกรายนาที, MQTT, Supabase, อ่านการตั้งค่าจาก dashboard
│   ├── door.py            AI หาประตู (YOLOE) เพื่อเสนอเส้นบน dashboard
│   ├── common.py          หา webcam, เลือกโมเดล, ตรวจภาพดำ
│   ├── models/            โมเดล .pt + NCNN (yolo26n, yolo11n, *_trained, yoloe_door.pt)
│   └── .env.example       SUPABASE_URL / SUPABASE_SECRET_KEY
├── backend/               Node.js (Express + Socket.IO + MQTT)
│   ├── src/index.js       เปิด server, CORS, Swagger
│   ├── src/socket.js      Socket.IO: sync / live / frame
│   ├── src/mqtt.js        รับ MQTT จากตัวนับ
│   ├── src/dataSource.js  อ่าน Supabase (หรือ CSV) มาพักในหน่วยความจำ
│   ├── src/routes/        today, status, compare, events, history, zones
│   └── .env.example
├── dashboard-camera-ai/   Next.js 16 (Vercel)
│   ├── app/Dashboard.tsx  หน้าหลัก
│   ├── app/stats/         route handlers: days, day/[date], zones
│   ├── lib/server/stats.ts อ่าน/เขียน Supabase ฝั่ง server
│   ├── lib/components/    การ์ดต่าง ๆ, ZoneEditor (ตั้งค่าการนับ)
│   └── lib/hooks/useSocketSync.ts  รับ Socket.IO
└── supabase/schema.sql    ตาราง minute_counts, view minute_days, ตาราง camera_settings
```

## 4. Tech Stack

| ด้าน | เทคโนโลยี | ใช้ทำอะไร |
|---|---|---|
| ฮาร์ดแวร์ | Raspberry Pi 5, USB webcam | ประมวลผล AI ที่หน้างาน |
| AI / Vision | Python, Ultralytics YOLO 8.4.160 (yolo26n / yolo11n ที่เทรนเอง), NCNN, ByteTrack, OpenCV | ตรวจจับและติดตามคน · NCNN ทำให้เร็วพอบน CPU ของ Pi |
| AI ช่วยตั้งค่า | YOLOE (open-vocabulary) + "door", "sliding door", "glass door" (+ "cabinet" เป็นคำแข่ง) | เสนอเส้นนับที่ประตู |
| Messaging | MQTT, Mosquitto, paho-mqtt 2.1, mqtt.js | ส่งข้อมูลจากตัวนับไป backend |
| Backend | Node.js ≥ 20, Express 4, Socket.IO 4.8, swagger-ui-express | REST API, push ข้อมูลสด, เอกสาร API ที่ `/api-docs` |
| Database | Supabase (PostgreSQL), PostgREST | ข้อมูลรายนาที, สรุปรายวัน, การตั้งค่ากล้อง · เปิด RLS |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts, socket.io-client, lucide-react | Dashboard + route handlers ฝั่ง server |
| Infra | Vercel, Tailscale (VPN + Funnel), systemd, GitHub | deploy เว็บ, ลิงก์ HTTPS ถึงบอร์ด, เปิด service ตอนบูต |

## 5. การส่งและจัดเก็บข้อมูล

### 5.1 ข้อมูลที่วิ่งในระบบ

| ข้อมูล | หน้าตา | ความถี่ |
|---|---|---|
| ภาพตรวจจับ | JPEG กว้าง 480 px (~10 KB) มีกรอบคน + เส้น/โซน | 5 ภาพ/วินาที |
| ค่าสด | JSON: คนในห้องตอนนี้, ยอดของวัน, คนในภาพ, ความมั่นใจ, FPS, โมเดล, `mode` (line/room), ประตูที่ AI เสนอ | ทุก 1 วินาที |
| ข้อมูลรายนาที | 1 แถว: เข้า, ออก, คนในห้องเฉลี่ย/สูงสุด, ผู้มาเยือน, ยอดสะสม, FPS, อุณหภูมิ CPU, โมเดล | ทุก 1 นาที |
| สถานะตัวนับ | `online` / `offline` | ตอนเริ่ม/หยุด/หลุด |
| ข้อมูลทั้งหน้า (sync) | today + hourlyBars, status, events 50 รายการล่าสุด, compare (~13.5 KB) | ทุก 3 วินาที |
| การตั้งค่าการนับ | `{"line": [[x,y],[x,y]] \| null, "zone": [[x,y],...] \| null, "anchor": "bottom" \| "center"}` (สัดส่วน 0-1) | เมื่อกดบันทึก |

### 5.2 ช่องทางและวิธีส่ง

**MQTT** (Mosquitto บน Pi, `mqtt://localhost:1883`)

| Topic | ข้อมูล | QoS / retained |
|---|---|---|
| `pi5/people/frame` | ภาพ JPEG | QoS 0 · ไม่ retained |
| `pi5/people/live` | ค่าสด (JSON) | QoS 0 · ไม่ retained |
| `pi5/people/count` | แถวรายนาที (JSON) | QoS 1 · retained |
| `pi5/status/people` | online / offline | QoS 1 · retained + Last Will |

**Socket.IO** (backend → เบราว์เซอร์, WebSocket ผ่าน HTTPS ของ Tailscale Funnel)

| Event | ข้อมูล | ส่งเมื่อ |
|---|---|---|
| `sync` | ข้อมูลทั้งหน้า | ทันทีที่ต่อ + ทุก 3 วินาที |
| `live` | `{ time, in_zone, detection }` | ทุกครั้งที่ Pi ส่งค่าสด (~1 วินาที) |
| `frame` | Buffer JPEG | ทุกภาพ (volatile: เบราว์เซอร์ที่รับไม่ทันจะข้ามภาพ ไม่เข้าคิว) + ภาพล่าสุดตอนต่อเข้ามา |

**REST API ของ backend** (`https://<funnel>/api`, เอกสาร: `/api-docs`)

| Endpoint | ให้อะไร |
|---|---|
| `GET /api/health` | `{ ok, time }` |
| `GET /api/today` | สถิติวันนี้ + hourlyBars + แถวรายนาที |
| `GET /api/status` | สถานะ MQTT + แถวล่าสุด |
| `GET /api/compare` | เทียบเมื่อวาน / สัปดาห์ก่อน / เฉลี่ย 7 วัน |
| `GET /api/events?date=YYYY-MM-DD` | เหตุการณ์ของวัน |
| `GET /api/history/list` · `GET /api/history/:date` | วันที่มีข้อมูล · ข้อมูลของวันนั้น |
| `GET /api/zones/config` · `/api/zones/preview` | zones.json · ภาพตัวอย่างโซน |

**Route handlers ของ Dashboard** (บน Vercel, อ่าน/เขียน Supabase ด้วย secret key ฝั่ง server)

| Route | ทำอะไร |
|---|---|
| `GET /stats/days` | ทุกวันที่มีข้อมูล (ตารางสรุป, ตัวเลือกวัน) |
| `GET /stats/day/<YYYY-MM-DD \| today>` | ทั้ง dashboard ของวันนั้น: สถิติ, กราฟ, เทียบวัน, เหตุการณ์ |
| `GET /stats/zones` · `POST /stats/zones` | อ่าน / บันทึกการตั้งค่าการนับ (ตรวจรูปแบบก่อนบันทึก) |

**Supabase REST จากบอร์ด:** ตัวนับ upsert แถวรายนาทีลง `minute_counts` ใน thread แยก (เน็ตหลุด = เก็บรอในหน่วยความจำได้ 1 วัน ส่งซ้ำทุก 60 วินาที, นาทีเดิมไม่เกิดแถวซ้ำ) และอ่าน `camera_settings` ทุก 30 วินาที

### 5.3 ข้อมูลเก็บอยู่ที่ไหน

| ที่เก็บ | เก็บอะไร | อายุ |
|---|---|---|
| การ์ด SD บน Pi | `YOLO_Pi/data/<วันที่>.csv` (รายนาที), `zones.json` (สำเนาการตั้งค่า), `door.json` (ประตูที่ AI หาเจอล่าสุด) | ถาวร · ส่งขึ้น Supabase ย้อนหลังได้ด้วย `bash run.sh upload` |
| Supabase | `minute_counts`, view `minute_days`, `camera_settings` | ถาวร · แหล่งข้อมูลหลักของกราฟและข้อมูลย้อนหลัง |
| หน่วยความจำ backend | 8 วันล่าสุดจาก Supabase, ค่าสด/ภาพล่าสุด | ชั่วคราว · วันนี้อ่านใหม่ทุก 20 วินาที (และ 3 วินาทีหลังมีนาทีใหม่), ทั้ง 8 วันทุก 10 นาที |
| Mosquitto | ข้อความ retained ล่าสุด (นาทีล่าสุด, สถานะ) | ชั่วคราว |
| เบราว์เซอร์ | ไม่เก็บ แสดงผลอย่างเดียว | - |
| วิดีโอ | ไม่บันทึกที่ไหนเลย | - |

### 5.4 Dashboard ดึงข้อมูลอย่างไร (ตอนเปิดหน้า)

1. โหลดหน้าเว็บจาก Vercel การ์ดขึ้นทันที (ยังไม่มีข้อมูลแสดง "—")
2. ต่อ Socket.IO กับ backend → ได้ `sync` และภาพล่าสุดทันที แล้วรับ `live` / `frame` / `sync` ต่อเนื่อง
3. เรียก REST `/api/today`, `/api/status`, `/api/compare` เป็นตัวสำรอง (หมดเวลา 10 วินาที)
4. เรียก `/stats/day/today` (Supabase ตรง) ใช้แทนถ้าบอร์ดปิด อ่านใหม่ทุก 60 วินาที
5. เรียก `/stats/days` สำหรับตารางสรุปและตัวเลือกวัน อ่านใหม่ทุก 5 นาที
6. เลือกวันย้อนหลัง → `/stats/day/<วันที่>`

### 5.5 Supabase schema

ไฟล์ `supabase/schema.sql` (รันซ้ำได้)
- `minute_counts` — PK `(camera, time)` · `in_count`, `out_count`, `in_zone_avg`, `in_zone_max`, `visitors`, `in_today`, `out_today`, `visitors_today`, `fps`, `cpu_temp_c`, `model`, `seconds`
- `minute_days` — view สรุปรายวันตามเวลาไทย (`security_invoker`)
- `camera_settings` — PK `camera` · `zones` (jsonb), `updated_at`
- ทุกตารางเปิด RLS ไม่มี policy และ revoke สิทธิ์ `anon` / `authenticated` → เข้าถึงได้เฉพาะ secret key

## 6. ติดตั้งครั้งแรก

### 6.1 Supabase
1. สร้าง project ใหม่ (แยกจากโปรเจกต์อื่น)
2. SQL Editor → วางทั้งไฟล์ `supabase/schema.sql` → Run
3. เก็บ **Project URL** และ **secret key** (`sb_secret_...`, Project Settings > API Keys) — publishable key ใช้ไม่ได้ (ตารางปิดสิทธิ์ไว้)

### 6.2 ไฟล์ตั้งค่า (ไม่ขึ้น GitHub)

| ไฟล์ / ที่ | ค่าที่ต้องใส่ |
|---|---|
| `YOLO_Pi/.env` (จาก `.env.example`) | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` |
| `backend/.env` (จาก `.env.example`) | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MQTT_BROKER_URL=mqtt://localhost:1883`, `FRONTEND_URL` (เพิ่มโดเมน Vercel ภายหลัง) |
| Vercel → Environment Variables (Production) | `NEXT_PUBLIC_API_URL=https://<funnel>/api`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` |

### 6.3 Raspberry Pi
บนบอร์ด (ครั้งเดียว, ต้องต่อเน็ต): เปิด SSH และติดตั้ง Tailscale
```bash
sudo systemctl enable --now ssh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up            # login บัญชีเดียวกับ Mac
tailscale ip -4              # จดเลข 100.x ไว้ (ไม่เปลี่ยนตาม WiFi)
```
บน Mac: ส่งโค้ด (`YOLO_Pi/` และ `backend/` ไปที่ `~/YOLO_Pi`, `~/backend` บนบอร์ด)
```bash
cd YOLO_Pi && bash run.sh send <user> <100.x ของบอร์ด>
```
บนบอร์ด:
```bash
cd ~/YOLO_Pi
bash run.sh setup                                    # Python .venv + แพ็กเกจ (นานหลายนาที)
bash run.sh 3 --no-show --seconds 30 --model yolo26n_trained --imgsz 320   # ทดสอบกล้อง: ต้องเห็น "source: <เลข>"
bash run.sh service install --model yolo26n_trained --imgsz 320            # ตัวนับเปิดเองตอนบูต
bash run.sh backend install                          # backend เปิดเองตอนบูต (ต้องมี Node.js ≥ 20)
curl localhost:4000/api/health
sudo tailscale funnel --bg 4000                      # ได้ https://<เครื่อง>.<tailnet>.ts.net
```
แนะนำ: ปิด key expiry ของเครื่องบอร์ดในหน้า admin ของ Tailscale (ค่าเริ่ม 180 วัน) ไม่งั้นลิงก์จะหยุดทำงาน

### 6.4 Dashboard บน Vercel
```bash
cd dashboard-camera-ai
npx vercel@latest                                    # สร้าง project (ชื่อตัวพิมพ์เล็ก)
npx vercel@latest env add NEXT_PUBLIC_API_URL production   # https://<funnel>/api
npx vercel@latest env add SUPABASE_URL production
npx vercel@latest env add SUPABASE_SECRET_KEY production
npx vercel@latest --prod
```
ถ้าเชื่อม GitHub แทน: Root Directory = `dashboard-camera-ai` และใส่ env ชุดเดียวกัน

### 6.5 อนุญาตโดเมนของ Dashboard
บนบอร์ด เพิ่มโดเมน Vercel ใน `~/backend/.env` แล้วรีสตาร์ท
```bash
# FRONTEND_URL=http://localhost:3000,https://os-yolo-dashboard.vercel.app
cd ~/YOLO_Pi && bash run.sh backend restart
```

## 7. การใช้งานประจำวัน

1. เสียบไฟบอร์ดที่ต่อ webcam (บอร์ดต้องรู้จัก WiFi ของที่นั้น หรือใช้ Hotspot มือถือตัวเดิม)
2. รอ 1-2 นาที: Tailscale, backend, ตัวนับเปิดเองทั้งหมด
3. เปิด Dashboard
4. **ห้องใหม่ / ย้ายกล้อง:** กด "ตั้งเส้นเข้า/ออก" ใต้ภาพกล้อง → วาดเส้นขวางทางเข้าประตู → "ยืดเส้นให้สุดขอบภาพ" → ให้ลูกศรเขียวชี้เข้าห้อง → เลือกจุดนับ (กล้องต่ำ/มีโต๊ะบัง = กลางตัว) → บันทึก

ตำแหน่งกล้องที่แนะนำ: สูงประมาณ 2 เมตร มองเฉียงลงเห็นประตูทั้งบานและพื้นหน้าประตู 2-3 เมตร

## 8. อัปเดตโค้ด

| แก้ส่วนไหน | ทำอะไร |
|---|---|
| `YOLO_Pi/` หรือ `backend/` | Mac: `cd YOLO_Pi && bash run.sh send <user> <100.x>` → บอร์ด: `cd ~/YOLO_Pi && bash run.sh backend restart && bash run.sh service restart` |
| แพ็กเกจของ backend เปลี่ยน | บอร์ด: `bash run.sh backend install` แทน restart |
| `dashboard-camera-ai/` | Mac: `cd dashboard-camera-ai && npx vercel@latest --prod` |
| `supabase/schema.sql` | รันส่วนที่เพิ่มใน SQL Editor |

## 9. คำสั่งที่ใช้บ่อย

รันใน `~/YOLO_Pi` บนบอร์ด (รายการเต็ม: `bash run.sh` หรือ `YOLO_Pi/README.md`)

| คำสั่ง | ทำอะไร |
|---|---|
| `bash run.sh service status \| logs \| restart \| stop \| start` | ตัวนับคน |
| `bash run.sh backend status \| logs \| restart \| install` | backend |
| `bash run.sh 3 --no-show --seconds 30` | ทดสอบกล้อง (หยุด service ก่อน: `bash run.sh service stop`) |
| `bash run.sh upload [YYYY-MM-DD]` | ส่งข้อมูลจาก CSV ขึ้น Supabase ย้อนหลัง |
| `bash run.sh 1` | วัดความแม่นของโมเดลกับภาพทดสอบ 200 รูป |
| `bash run.sh 4 --line x1,y1,x2,y2` | ตั้งเส้นบนบอร์ดโดยตรง (ปกติใช้ dashboard แทน) |
| `tailscale funnel status` | ดูลิงก์ HTTPS ของบอร์ด |

## 10. ผลวัด (Metrics)

ความแม่นของโมเดล (ภาพทดสอบ 200 รูป, 372 คน, วัดบน Mac):

| โมเดล | ขนาดภาพ | mAP50-95 (NCNN / .pt) | Accuracy | NCNN เทียบ .pt |
|---|---|---|---|---|
| yolo26n | 640 | 0.737 / 0.743 | 0.803 | PASS · กรอบตรงกัน 96.0% |
| yolo26n | 320 | 0.704 / 0.690 | 0.768 | PASS · 95.5% |
| yolo11n | 640 | 0.726 / 0.726 | 0.790 | PASS · 93.9% |
| yolo11n | 320 | 0.702 / 0.689 | 0.764 | PASS · 96.3% |

โมเดลที่เทรนเอง (COCO 399 รูป + เฟรม MOT17 240 เฟรม, 50 epoch, AdamW, ล็อก backbone):

| โมเดล | ภาพทั่วไป: F1 | มุมกล้องวงจรปิด: หาคนเจอ (จาก 3,394) |
|---|---|---|
| yolo26n | 0.890 | 572 (16.9%) |
| yolo26n_trained | 0.871 | 735 (21.7%) |
| yolo11n | 0.883 | 802 (23.6%) |
| yolo11n_trained | 0.873 | 1,198 (35.3%) |

การทำงานจริง:

| ทดสอบ | ผล |
|---|---|
| คลิปทดสอบการนับ 84 วินาที (8 คน) | เข้า 3/3 · ออก 3/3 · คนไม่ซ้ำ 8/8 · ผู้มาเยือน 6/6 |
| ความเร็วบน Pi 5 (yolo26n_trained 320) | 24-27 FPS |
| ข้อมูลที่ส่งให้เว็บทุก 3 วินาที | 711 KB → 13.5 KB |
| ภาพตรวจจับบนเว็บ | 1 → ~5 ภาพ/วินาที ไม่หน่วงสะสม |
| กรอบหลอก (ความมั่นใจ 0.22-0.28) | นับเฉพาะ ≥ 0.35 · คลิปทดสอบยังนับถูกเท่าเดิม |

รายละเอียดการวัดทั้งหมด: `YOLO_Pi/README.md`

## 11. แก้ปัญหาเบื้องต้น

| อาการ | สาเหตุที่พบบ่อย | แก้ |
|---|---|---|
| หน้าเว็บมีการ์ดแต่ไม่มีภาพ/ค่าสด | บอร์ดปิดหรือหลุดเน็ต | Mac: `tailscale status \| grep raspberrypi` ถ้า offline เช็กไฟ/WiFi ของบอร์ด · ข้อมูลย้อนหลังยังดูได้ |
| ช่องเข้า/ออกเป็น "—" | ยังไม่ได้ตั้งเส้น | กด "ตั้งเส้นเข้า/ออก" บน dashboard |
| คนในห้อง/ผู้มาเยือนเป็น 0 ทั้งที่เห็นคน | โซนไม่ตรงกับห้อง | ตั้งค่าการนับ → ล้างโซน (ใช้ทั้งภาพ) หรือวาดใหม่ |
| ตัวนับไม่เห็นกล้อง | webcam หลุด / service อื่นใช้กล้องอยู่ | เสียบใหม่ (ระบบรีสตาร์ทเองใน ~10 วินาที) · ทดสอบต้อง `bash run.sh service stop` ก่อน |
| เว็บดึงข้อมูลไม่ได้ (CORS) | โดเมน Vercel ไม่อยู่ใน `FRONTEND_URL` | แก้ `~/backend/.env` แล้ว `bash run.sh backend restart` |
| Supabase 401 / 42501 | ใส่ publishable key แทน secret key | ใช้ `sb_secret_...` |
| ปุ่มบันทึกการตั้งค่าขึ้น "บันทึกไม่ได้" | Vercel ไม่มี `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | เพิ่ม env แล้ว `npx vercel@latest --prod` |
| ลิงก์ Funnel ใช้ไม่ได้หลังผ่านไปหลายเดือน | Tailscale key หมดอายุ | login ใหม่บนบอร์ด และปิด key expiry |

## 12. ความปลอดภัย

- `.env` ทุกไฟล์อยู่ใน `.gitignore` · secret key อยู่แค่บนบอร์ดและฝั่ง server ของ Vercel ไม่ถูกส่งไปเบราว์เซอร์
- Supabase เปิด RLS ไม่มี policy ให้ key สาธารณะ
- backend รับคำขอเฉพาะโดเมนใน `FRONTEND_URL` (CORS)
- Tailscale Funnel เปิดสู่อินเทอร์เน็ตแค่พอร์ต 4000 ไม่เปิด SSH
- ไม่บันทึกวิดีโอ เก็บเฉพาะตัวเลขรายนาที
- หน้า "ตั้งค่าการนับ" ไม่มีระบบ login: ใครมีลิงก์ dashboard ก็แก้เส้นได้ (เหมาะกับงานในชั้นเรียน)

## 13. ข้อจำกัด

- ความแม่นขึ้นกับตำแหน่งกล้อง · คนเบียดกันหรือถูกบังตอนข้ามเส้นอาจนับพลาด
- กล้อง 1 ตัวต่อ 1 ห้อง · โมเดลขนาด nano ไม่เหมาะกับคนแน่นมาก
- AI หาประตูเป็นแค่ข้อเสนอ ประตูกระจก/ทางโล่งอาจหาไม่เจอ
- ข้อมูล MOT17 ที่ใช้เทรนเป็น CC BY-NC-SA 3.0: โมเดล `*_trained` ใช้เพื่อการศึกษาเท่านั้น
