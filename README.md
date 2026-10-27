# OS-Yolo — ระบบนับคนเข้า-ออกห้องด้วย YOLO บน Raspberry Pi

<p align="center">
  <img src="https://img.shields.io/badge/Raspberry_Pi_5-A22846?style=for-the-badge&logo=raspberrypi&logoColor=white" alt="Raspberry Pi 5">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Ultralytics_YOLO-111F68?style=for-the-badge&logo=ultralytics&logoColor=white" alt="Ultralytics YOLO">
  <img src="https://img.shields.io/badge/OpenCV-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white" alt="OpenCV">
  <img src="https://img.shields.io/badge/MQTT_%C2%B7_Mosquitto-3C5280?style=for-the-badge&logo=eclipsemosquitto&logoColor=white" alt="MQTT · Mosquitto">
  <img src="https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.IO">
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel">
  <img src="https://img.shields.io/badge/Tailscale-242424?style=for-the-badge&logo=tailscale&logoColor=white" alt="Tailscale">
</p>

กล้อง USB ต่อกับ Raspberry Pi 5 ใช้โมเดล YOLO ที่เทรนเองตรวจจับและติดตามคน นับคนเข้า-ออกห้องและคนในห้องตอนนี้
ส่งข้อมูลรายนาทีขึ้น Supabase และแสดงผลบน Dashboard (Next.js บน Vercel) ทั้งภาพตรวจจับสด สถิติวันนี้ และข้อมูลย้อนหลังรายวัน

- Dashboard: https://os-yolo-dashboard.vercel.app
- ใช้งานจริง: เสียบไฟบอร์ดที่ต่อกล้องไว้ ทุกอย่างเปิดเองใน 1-2 นาที ไม่ต้องต่อจอหรือรันคำสั่ง
- โปรเจกต์รายวิชา (Operating System project) · 29 ต.ค. 2026

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [Dashboard ทำอะไรได้บ้าง](#2-dashboard-ทำอะไรได้บ้าง)
3. [ส่วนประกอบและโครงสร้างโฟลเดอร์](#3-ส่วนประกอบและโครงสร้างโฟลเดอร์)
4. [Tech Stack](#4-tech-stack)
5. [Library และ Framework](#5-library-และ-framework)
6. [Workflow ทีละขั้น (รับเข้า / ส่งออก)](#6-workflow-ทีละขั้น-รับเข้า--ส่งออก)
7. [การส่งและจัดเก็บข้อมูล](#7-การส่งและจัดเก็บข้อมูล)
8. [ติดตั้งครั้งแรก](#8-ติดตั้งครั้งแรก)
9. [การใช้งานประจำวัน](#9-การใช้งานประจำวัน)
10. [อัปเดตโค้ด](#10-อัปเดตโค้ด)
11. [คำสั่งที่ใช้บ่อย](#11-คำสั่งที่ใช้บ่อย)
12. [ผลวัด (Metrics)](#12-ผลวัด-metrics)
13. [แก้ปัญหาเบื้องต้น](#13-แก้ปัญหาเบื้องต้น)
14. [ความปลอดภัย](#14-ความปลอดภัย)
15. [ข้อจำกัด](#15-ข้อจำกัด)

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
- คนในห้องตอนนี้ = ค่าที่มากกว่าระหว่าง เข้า − ออก ของวันนี้ กับ คนที่กล้องเห็นในโซนตอนนี้ (ค่ากลาง 2 วินาทีล่าสุด) อัปเดตทุกวินาที · ไม่วาดโซน = ทั้งภาพ
- เข้า = คนข้ามเส้นไปทางลูกศร + ตัวสำรอง: คนอยู่ในโซนฝั่ง IN นิ่ง 5 วินาทีมากกว่า เข้า − ออก (เส้นพลาด เช่น ID หลุดตรงประตู) → เพิ่มเข้าเท่าส่วนต่าง · ฝั่ง OUT ไม่นับ
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
- เลือกโมเดล (yolo26n / yolo11n, เทรนเอง หรือไม่, ขนาดภาพ 320 / 640) พร้อมดู FPS จริงของบอร์ด · เปลี่ยนโมเดลแล้วตัวนับเริ่มใหม่เอง ~1 นาที
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
| ฮาร์ดแวร์ | <img src="https://img.shields.io/badge/Raspberry_Pi-5-A22846?logo=raspberrypi&logoColor=white" alt="Raspberry Pi 5"> USB webcam | ประมวลผล AI ที่หน้างาน |
| AI / Vision | <img src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white" alt="Python"> <img src="https://img.shields.io/badge/Ultralytics-8.4.160-111F68?logo=ultralytics&logoColor=white" alt="Ultralytics 8.4.160"> <img src="https://img.shields.io/badge/OpenCV-5C3EE8?logo=opencv&logoColor=white" alt="OpenCV"> <img src="https://img.shields.io/badge/NCNN-4B5563" alt="NCNN"> <img src="https://img.shields.io/badge/ByteTrack-4B5563" alt="ByteTrack"><br>yolo26n / yolo11n ที่เทรนเอง | ตรวจจับและติดตามคน · NCNN ทำให้เร็วพอบน CPU ของ Pi |
| AI ช่วยตั้งค่า | <img src="https://img.shields.io/badge/YOLOE-open--vocabulary-111F68?logo=ultralytics&logoColor=white" alt="YOLOE open-vocabulary"><br>"door", "sliding door", "glass door" (+ "cabinet" เป็นคำแข่ง) | เสนอเส้นนับที่ประตู |
| Messaging | <img src="https://img.shields.io/badge/MQTT-660066?logo=mqtt&logoColor=white" alt="MQTT"> <img src="https://img.shields.io/badge/Mosquitto-3C5280?logo=eclipsemosquitto&logoColor=white" alt="Mosquitto"><br>paho-mqtt 2.1, mqtt.js | ส่งข้อมูลจากตัวนับไป backend |
| Backend | <img src="https://img.shields.io/badge/Node.js-%E2%89%A5_20-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js ≥ 20"> <img src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white" alt="Express 4"> <img src="https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socketdotio&logoColor=white" alt="Socket.IO 4.8"> <img src="https://img.shields.io/badge/Swagger-85EA2D?logo=swagger&logoColor=black" alt="Swagger"> | REST API, push ข้อมูลสด, เอกสาร API ที่ `/api-docs` |
| Database | <img src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white" alt="Supabase"> <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL"><br>PostgREST | ข้อมูลรายนาที, สรุปรายวัน, การตั้งค่ากล้อง · เปิด RLS |
| Frontend | <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js 16"> <img src="https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB" alt="React 19"> <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4"> <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"><br>Recharts, socket.io-client, lucide-react | Dashboard + route handlers ฝั่ง server |
| Infra | <img src="https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white" alt="Vercel"> <img src="https://img.shields.io/badge/Tailscale-VPN_%2B_Funnel-242424?logo=tailscale&logoColor=white" alt="Tailscale VPN + Funnel"> <img src="https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white" alt="GitHub"> <img src="https://img.shields.io/badge/systemd-4B5563" alt="systemd"> | deploy เว็บ, ลิงก์ HTTPS ถึงบอร์ด, เปิด service ตอนบูต |

## 5. Library และ Framework

**ตัวนับคนบน Raspberry Pi (Python)** — `YOLO_Pi/requirements.txt`

| Library | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| Ultralytics | 8.4.160 | โหลดโมเดล YOLO / YOLOE, ตรวจจับคน, ติดตาม ID (ByteTrack ในตัว), วาดกรอบ |
| NCNN | 1.0.20260526 | รันโมเดล YOLO ที่แปลงแล้วให้เร็วบน CPU ARM ของ Pi |
| PyTorch (CPU-only) | ติดตั้งโดย `bash run.sh setup` | ตัวรันของ Ultralytics และ YOLOE (ไม่ลง GPU library เพื่อประหยัดพื้นที่ SD) |
| lap | 0.5.13 | จับคู่กรอบกับ ID ใน ByteTrack |
| OpenCV · NumPy | มากับ Ultralytics | อ่านกล้อง, วาดเส้น/โซน, บีบ JPEG · คำนวณพิกัด |
| paho-mqtt | 2.1.0 | ส่ง MQTT |
| Python standard library | Python 3 | `urllib` (Supabase REST), `threading` / `queue` (ส่งข้อมูลเบื้องหลัง), `csv`, `json` |

**Backend (Node.js ≥ 20)** — `backend/package.json`

| Library | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| Express | ^4.18.2 | REST API `/api/*` |
| Socket.IO | ^4.8.4 | ส่งข้อมูลสด `sync` / `live` / `frame` |
| mqtt (MQTT.js) | ^5.3.4 | รับข้อความจากตัวนับ |
| cors | ^2.8.5 | อนุญาตเฉพาะโดเมนของ Dashboard |
| dotenv | ^16.4.5 | อ่าน `.env` |
| csv-parse | ^5.5.6 | อ่าน CSV (โหมดไม่ใช้ Supabase) |
| swagger-jsdoc · swagger-ui-express | ^6.3.0 · ^5.0.1 | เอกสาร API ที่ `/api-docs` |
| `fetch` (ในตัว Node.js) | - | เรียก Supabase REST |

**Dashboard** — `dashboard-camera-ai/package.json`

| Library / Framework | เวอร์ชัน | ใช้ทำอะไร |
|---|---|---|
| Next.js (App Router, Turbopack) | 16.4.0 | หน้าเว็บ + route handlers ฝั่ง server (`/stats/*`) |
| React · React DOM | 19.3.0 | UI แบบ component |
| TypeScript | ^5 | ชนิดข้อมูลของโค้ด |
| Tailwind CSS (+ @tailwindcss/turbopack, tw-animate-css) | ^4 | หน้าตาและสี |
| Recharts | ^3.10.1 | กราฟรายชั่วโมง |
| socket.io-client | ^4.8.4 | รับข้อมูลสดจาก backend |
| lucide-react | ^1.53.0 | ไอคอน |
| shadcn · @base-ui/react · class-variance-authority | ^4.21 · ^1.8 · ^0.7 | คอมโพเนนต์พื้นฐาน (Card) |
| ESLint · eslint-config-next | ^9 · 16.4.0 | ตรวจคุณภาพโค้ด |

**บริการและเครื่องมือ:** Mosquitto (MQTT broker) · Supabase (PostgreSQL + PostgREST) · Tailscale (VPN + Funnel) · Vercel + Vercel CLI · systemd · rsync + SSH (`bash run.sh send`) · Git / GitHub · Ultralytics บน Mac สำหรับเทรน/วัดผล/แปลง NCNN (ชุดข้อมูล COCO + MOT17)

## 6. Workflow ทีละขั้น (รับเข้า / ส่งออก)

### 6.1 ตัวนับคนบน Raspberry Pi (`YOLO_Pi`, service `yolo-pi-counter`)
ขั้น 2-6 ทำทุกเฟรม · ขั้น 7-11 ตามรอบเวลา · ขั้น 12-14 ทำเบื้องหลัง

| ขั้น (โค้ด) | ทำอะไร | รับเข้า | ส่งออก / ส่งไปที่ |
|---|---|---|---|
| 1. หากล้อง `common.default_source()` | หา USB webcam ตัวแรก | `/sys/class/video4linux` | หมายเลขกล้อง (เช่น 0) |
| 2. อ่านภาพ (Ultralytics stream) | อ่านภาพทีละเฟรม | กล้อง `/dev/videoN` | ภาพ 640×480 ~30 เฟรม/วินาที |
| 3. ตรวจจับ + ติดตาม `model.track()` | YOLO (NCNN) หาคน → ByteTrack ให้ ID ต่อเนื่อง | ภาพ 1 เฟรม · imgsz 320 · class person · conf ≥ 0.1 | กรอบ `[x1,y1,x2,y2]`, ความมั่นใจ, ID |
| 4. กรองกรอบหลอก | ทิ้งกรอบที่ไม่มั่นใจ | กรอบทั้งหมดของเฟรม | กรอบความมั่นใจ ≥ 0.35 |
| 5. เฝ้ากล้อง `PictureWatch` | เช็กว่ากล้องยังส่งภาพจริง | ภาพ + เวลา | ภาพดำ 10 วินาที → หยุด → systemd เปิดใหม่และหากล้องใหม่ |
| 6. นับ `AreaCounter.update()` | ใครข้ามเส้น (ทางลูกศร = เข้า), ใครอยู่ในโซน, ผู้มาเยือนใหม่ | ID + กรอบ, ขนาดภาพ, เวลา, การตั้งค่า (line, zone, anchor) | `{in, out, in_zone, in_room, visitors}` ของเฟรม |
| 7. สะสมรายนาที `MinuteLog.add()` | รวมผลทุกเฟรมของนาที · ตัวสำรอง: คนในโซนฝั่ง IN ที่เห็นนิ่ง 5 วินาที (≥ 80% ของเฟรม) มากกว่า เข้า − ออก → เพิ่มเข้าเท่าส่วนต่าง | ผลนับแต่ละเฟรม + ยอดของวันนี้ | ขึ้นนาทีใหม่ = แถวรายนาที 1 แถว |
| 8. บันทึก `MinuteLog.flush()` | เก็บนาทีที่จบ อัปเดตยอดสะสมของวัน | แถวรายนาที | `data/<วันที่>.csv` · MQTT `pi5/people/count` · คิว Supabase |
| 9. ส่งขึ้น Supabase `SupabaseOut` | ส่งแถวที่รออยู่ทั้งหมดในครั้งเดียว (thread แยก) | แถวจากคิว | HTTPS POST upsert `minute_counts` · ไม่สำเร็จ = เก็บรอ ลองใหม่ทุก 60 วินาที |
| 10. ค่าสด ทุก 1 วินาที `MinuteLog.live()` | สรุปสถานะตอนนี้ | ยอดสะสม, คนในโซน 2 วินาทีล่าสุด (ค่ากลาง), กรอบ, FPS | `{time, camera, in_zone, in_today, out_today, visitors_today, people, conf, fps, model, mode, door}` → `pi5/people/live` |
| 11. ภาพ ทุก 0.2 วินาที `frame_jpeg()` | วาดกรอบ + เส้น/โซน แล้วย่อภาพ | ภาพ + กรอบ + การตั้งค่า | JPEG 480 px คุณภาพ 60 (~10 KB) → `pi5/people/frame` |
| 12. อ่านการตั้งค่า ทุก 30 วินาที `SettingsSync` | ดูการแก้เส้น/โซนบนเว็บ | แถว `camera_settings` (HTTPS GET) | ใช้เส้น/โซนใหม่ทันที + สำเนา `zones.json` |
| 13. หาประตู ทุก 10 นาที `DoorFinder` | YOLOE หาประตู เฉพาะตอนยังไม่มีเส้น | 5 ภาพห่างกัน 2 วินาที | `{box, conf}` ใส่ในค่าสด + `door.json` |
| 14. สถานะ `MqttOut` | แจ้งว่าตัวนับทำงานไหม | การเริ่ม/หยุดโปรแกรม | `online` / `offline` → `pi5/status/people` (Last Will ถ้าหลุด) |

### 6.2 Backend บน Raspberry Pi (`backend/src`, service `yolo-pi-backend`)

| ขั้น (โค้ด) | ทำอะไร | รับเข้า | ส่งออก / ส่งไปที่ |
|---|---|---|---|
| 1. รับ MQTT `mqtt.js` | subscribe 4 topic เก็บค่าล่าสุด | `pi5/people/live`, `frame`, `count`, `pi5/status/people` | state `{live, status, frame, lastCount}` → socket.js · นาทีใหม่ = สั่งอ่าน Supabase ใหม่ |
| 2. แคชข้อมูล `dataSource.js` | โหลดข้อมูลรายนาทีมาพักในหน่วยความจำ | Supabase GET `minute_counts` (หน้าละ 1,000 แถว) | แถว 8 วันล่าสุด · วันนี้อ่านใหม่ทุก 20 วินาที และ 3 วินาทีหลังมีนาทีใหม่ |
| 3. คำนวณ `buildToday` / `buildCompare` / `buildEvents` / `buildStatus` | สรุปตัวเลขที่หน้าเว็บใช้ | แถวรายนาทีของวัน + ค่าสด | today `{inToday, outToday, visitorsToday, currentPeople, peakHour, maxInRoom, hourlyBars, lastRow}` · compare `{today, yesterday, lastWeek, avg7days}` · events `[{type, severity, time, message}]` · status `{mqttStatus, lastDataTime, lastRow}` |
| 4. ส่งข้อมูลสด `socket.js` | push ให้ทุกคนที่เปิดเว็บ | เบราว์เซอร์ที่ต่อเข้ามา + ค่าสด/ภาพจาก MQTT | `sync` ทุก 3 วินาที · `live` ทันที · `frame` แบบ volatile |
| 5. REST API `routes/*` | ตอบคำขอ HTTP | GET `/api/today`, `status`, `compare`, `events`, `history`, `zones`, `health` | JSON |
| 6. ตรวจสิทธิ์ `cors` | กันเว็บอื่นเรียก API | Origin ของคำขอ | อนุญาตเฉพาะ `FRONTEND_URL` |

### 6.3 Dashboard บน Vercel (`dashboard-camera-ai`)

| ขั้น (โค้ด) | ทำอะไร | รับเข้า | ส่งออก / ส่งไปที่ |
|---|---|---|---|
| 1. แสดงหน้า `Dashboard.tsx` | วาดการ์ดทุกใบทันที | - | หน้าเว็บ (ยังไม่มีข้อมูล = "—") |
| 2. รับข้อมูลสด `useSocketSync` | ต่อ Socket.IO (WebSocket ก่อน) | `sync` / `live` / `frame` | state ข้อมูลทั้งหน้า + ภาพ (blob URL ล้างภาพเก่าทุกครั้ง) |
| 3. ข้อมูลสำรอง `lib/api.ts` | เรียก REST ตอนเปิดหน้า | GET `/api/today`, `/api/status`, `/api/compare` | today, status, compare (หมดเวลา 10 วินาที) |
| 4. ข้อมูลจาก Supabase `/stats/day/[date]` | server ของ Vercel อ่าน Supabase แล้วคำนวณ | วันที่ (YYYY-MM-DD หรือ `today`) | `DayStats {date, today, compare, events}` |
| 5. รายการวัน `/stats/days` | สรุปทุกวันที่มีข้อมูล | view `minute_days` | `[{date, minutes, in, out, visitors, maxInRoom}]` |
| 6. ตั้งค่าการนับ `ZoneEditor` + `/stats/zones` | ผู้ใช้วาดเส้น/โซนบนภาพสดแล้วบันทึก | จุดที่คลิก (0-1), จุดนับ (เท้า/กลางตัว) | POST `{zones}` → ตรวจรูปแบบ → upsert `camera_settings` → คืน `{zones}` |
| 7. เลือกข้อมูลที่แสดง `Dashboard.tsx` | รวมทุกแหล่ง | ข้อมูลสด + Supabase | วันนี้: ข้อมูลสดก่อน ถ้าบอร์ดปิดใช้ Supabase · วันย้อนหลัง: Supabase |

## 7. การส่งและจัดเก็บข้อมูล

### 7.1 ข้อมูลที่วิ่งในระบบ

| ข้อมูล | หน้าตา | ความถี่ |
|---|---|---|
| ภาพตรวจจับ | JPEG กว้าง 480 px (~10 KB) มีกรอบคน + เส้น/โซน | 5 ภาพ/วินาที |
| ค่าสด | JSON: คนในห้องตอนนี้, ยอดของวัน, คนในภาพ, ความมั่นใจ, FPS, โมเดล, `mode` (line/room), ประตูที่ AI เสนอ | ทุก 1 วินาที |
| ข้อมูลรายนาที | 1 แถว: เข้า, ออก, คนในห้องเฉลี่ย/สูงสุด, ผู้มาเยือน, ยอดสะสม, FPS, อุณหภูมิ CPU, โมเดล | ทุก 1 นาที |
| สถานะตัวนับ | `online` / `offline` | ตอนเริ่ม/หยุด/หลุด |
| ข้อมูลทั้งหน้า (sync) | today + hourlyBars, status, events 50 รายการล่าสุด, compare (~13.5 KB) | ทุก 3 วินาที |
| การตั้งค่าการนับ | `{"line": [[x,y],[x,y]] \| null, "zone": [[x,y],...] \| null, "anchor": "bottom" \| "center"}` (สัดส่วน 0-1) | เมื่อกดบันทึก |

### 7.2 ช่องทางและวิธีส่ง

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

### 7.3 ข้อมูลเก็บอยู่ที่ไหน

| ที่เก็บ | เก็บอะไร | อายุ |
|---|---|---|
| การ์ด SD บน Pi | `YOLO_Pi/data/<วันที่>.csv` (รายนาที), `zones.json` (สำเนาการตั้งค่า), `door.json` (ประตูที่ AI หาเจอล่าสุด) | ถาวร · ส่งขึ้น Supabase ย้อนหลังได้ด้วย `bash run.sh upload` |
| Supabase | `minute_counts`, view `minute_days`, `camera_settings` | ถาวร · แหล่งข้อมูลหลักของกราฟและข้อมูลย้อนหลัง |
| หน่วยความจำ backend | 8 วันล่าสุดจาก Supabase, ค่าสด/ภาพล่าสุด | ชั่วคราว · วันนี้อ่านใหม่ทุก 20 วินาที (และ 3 วินาทีหลังมีนาทีใหม่), ทั้ง 8 วันทุก 10 นาที |
| Mosquitto | ข้อความ retained ล่าสุด (นาทีล่าสุด, สถานะ) | ชั่วคราว |
| เบราว์เซอร์ | ไม่เก็บ แสดงผลอย่างเดียว | - |
| วิดีโอ | ไม่บันทึกที่ไหนเลย | - |

### 7.4 Dashboard ดึงข้อมูลอย่างไร (ตอนเปิดหน้า)

1. โหลดหน้าเว็บจาก Vercel การ์ดขึ้นทันที (ยังไม่มีข้อมูลแสดง "—")
2. ต่อ Socket.IO กับ backend → ได้ `sync` และภาพล่าสุดทันที แล้วรับ `live` / `frame` / `sync` ต่อเนื่อง
3. เรียก REST `/api/today`, `/api/status`, `/api/compare` เป็นตัวสำรอง (หมดเวลา 10 วินาที)
4. เรียก `/stats/day/today` (Supabase ตรง) ใช้แทนถ้าบอร์ดปิด อ่านใหม่ทุก 60 วินาที
5. เรียก `/stats/days` สำหรับตารางสรุปและตัวเลือกวัน อ่านใหม่ทุก 5 นาที
6. เลือกวันย้อนหลัง → `/stats/day/<วันที่>`

### 7.5 Supabase schema

ไฟล์ `supabase/schema.sql` (รันซ้ำได้)
- `minute_counts` — PK `(camera, time)` · `in_count`, `out_count`, `in_zone_avg`, `in_zone_max`, `visitors`, `in_today`, `out_today`, `visitors_today`, `fps`, `cpu_temp_c`, `model`, `seconds`
- `minute_days` — view สรุปรายวันตามเวลาไทย (`security_invoker`)
- `camera_settings` — PK `camera` · `zones` (jsonb), `updated_at`
- ทุกตารางเปิด RLS ไม่มี policy และ revoke สิทธิ์ `anon` / `authenticated` → เข้าถึงได้เฉพาะ secret key

## 8. ติดตั้งครั้งแรก

### 8.1 Supabase
1. สร้าง project ใหม่ (แยกจากโปรเจกต์อื่น)
2. SQL Editor → วางทั้งไฟล์ `supabase/schema.sql` → Run
3. เก็บ **Project URL** และ **secret key** (`sb_secret_...`, Project Settings > API Keys) — publishable key ใช้ไม่ได้ (ตารางปิดสิทธิ์ไว้)

### 8.2 ไฟล์ตั้งค่า (ไม่ขึ้น GitHub)

| ไฟล์ / ที่ | ค่าที่ต้องใส่ |
|---|---|
| `YOLO_Pi/.env` (จาก `.env.example`) | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` |
| `backend/.env` (จาก `.env.example`) | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MQTT_BROKER_URL=mqtt://localhost:1883`, `FRONTEND_URL` (เพิ่มโดเมน Vercel ภายหลัง) |
| Vercel → Environment Variables (Production) | `NEXT_PUBLIC_API_URL=https://<funnel>/api`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` |

### 8.3 Raspberry Pi
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

### 8.4 Dashboard บน Vercel
```bash
cd dashboard-camera-ai
npx vercel@latest                                    # สร้าง project (ชื่อตัวพิมพ์เล็ก)
npx vercel@latest env add NEXT_PUBLIC_API_URL production   # https://<funnel>/api
npx vercel@latest env add SUPABASE_URL production
npx vercel@latest env add SUPABASE_SECRET_KEY production
npx vercel@latest --prod
```
ถ้าเชื่อม GitHub แทน: Root Directory = `dashboard-camera-ai` และใส่ env ชุดเดียวกัน

### 8.5 อนุญาตโดเมนของ Dashboard
บนบอร์ด เพิ่มโดเมน Vercel ใน `~/backend/.env` แล้วรีสตาร์ท
```bash
# FRONTEND_URL=http://localhost:3000,https://os-yolo-dashboard.vercel.app
cd ~/YOLO_Pi && bash run.sh backend restart
```

## 9. การใช้งานประจำวัน

1. เสียบไฟบอร์ดที่ต่อ webcam (บอร์ดต้องรู้จัก WiFi ของที่นั้น หรือใช้ Hotspot มือถือตัวเดิม)
2. รอ 1-2 นาที: Tailscale, backend, ตัวนับเปิดเองทั้งหมด
3. เปิด Dashboard
4. **ห้องใหม่ / ย้ายกล้อง:** กด "ตั้งเส้นเข้า/ออก" ใต้ภาพกล้อง → วาดเส้นขวางทางเข้าประตู → "ยืดเส้นให้สุดขอบภาพ" → ให้ลูกศรเขียวชี้เข้าห้อง → เลือกจุดนับ (กล้องต่ำ/มีโต๊ะบัง = กลางตัว) → บันทึก

ตำแหน่งกล้องที่แนะนำ: สูงประมาณ 2 เมตร มองเฉียงลงเห็นประตูทั้งบานและพื้นหน้าประตู 2-3 เมตร

## 10. อัปเดตโค้ด

| แก้ส่วนไหน | ทำอะไร |
|---|---|
| `YOLO_Pi/` หรือ `backend/` | Mac: `cd YOLO_Pi && bash run.sh send <user> <100.x>` → บอร์ด: `cd ~/YOLO_Pi && bash run.sh backend restart && bash run.sh service restart` |
| แพ็กเกจของ backend เปลี่ยน | บอร์ด: `bash run.sh backend install` แทน restart |
| `dashboard-camera-ai/` | Mac: `cd dashboard-camera-ai && npx vercel@latest --prod` |
| `supabase/schema.sql` | รันส่วนที่เพิ่มใน SQL Editor |

## 11. คำสั่งที่ใช้บ่อย

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

## 12. ผลวัด (Metrics)

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
| คลิปทดสอบการนับ 84 วินาที (8 คน) | เข้า 3/3 · ออก 3/3 · คนไม่ซ้ำ 8/8 · ผู้มาเยือน 6/6 (yolo26n 640, yolo26n_trained 320) · yolo11n_trained 320: เข้า 3/3 ออก 4/3 |
| ตัวสำรองเข้า 5 วินาที | ข้อมูลจำลอง 7 เคสผ่าน: 2 คนเข้าแต่เส้นนับได้ 1 → 2 · ID เปลี่ยนตอนนั่งไม่นับซ้ำ · เห็นแค่ 70% ของเฟรมไม่นับ · เดินออกแล้วไม่ถูกนับเข้าซ้ำ · ยังไม่ได้ทดสอบกับวิดีโอจริง |
| ความเร็วบน Pi 5 (yolo26n_trained 320) | 24-27 FPS |
| ข้อมูลที่ส่งให้เว็บทุก 3 วินาที | 711 KB → 13.5 KB |
| ภาพตรวจจับบนเว็บ | 1 → ~5 ภาพ/วินาที ไม่หน่วงสะสม |
| กรอบหลอก (ความมั่นใจ 0.22-0.28) | นับเฉพาะ ≥ 0.35 · คลิปทดสอบยังนับถูกเท่าเดิม |

รายละเอียดการวัดทั้งหมด: `YOLO_Pi/README.md`

## 13. แก้ปัญหาเบื้องต้น

| อาการ | สาเหตุที่พบบ่อย | แก้ |
|---|---|---|
| หน้าเว็บมีการ์ดแต่ไม่มีภาพ/ค่าสด | บอร์ดปิดหรือหลุดเน็ต | Mac: `tailscale status \| grep raspberrypi` ถ้า offline เช็กไฟ/WiFi ของบอร์ด · ข้อมูลย้อนหลังยังดูได้ |
| ช่องเข้า/ออกเป็น "—" | ยังไม่ได้ตั้งเส้น | กด "ตั้งเส้นเข้า/ออก" บน dashboard |
| คนในห้อง/ผู้มาเยือนเป็น 0 ทั้งที่เห็นคน | โซนไม่ตรงกับห้อง | ตั้งค่าการนับ → ล้างโซน (ใช้ทั้งภาพ) หรือวาดใหม่ |
| เข้า / คนในห้องค้างสูงกว่าจริง | คนออกทางที่ไม่ผ่านเส้น · กรอบผิดค้างนิ่งในโซนฝั่ง IN ≥ 5 วินาที (ตัวสำรองนับเข้า) | วาดเส้นให้ขวางทางออกทั้งหมด · วาดโซนให้คลุมแค่ห้อง |
| ตัวนับไม่เห็นกล้อง | webcam หลุด / service อื่นใช้กล้องอยู่ | เสียบใหม่ (ระบบรีสตาร์ทเองใน ~10 วินาที) · ทดสอบต้อง `bash run.sh service stop` ก่อน |
| เว็บดึงข้อมูลไม่ได้ (CORS) | โดเมน Vercel ไม่อยู่ใน `FRONTEND_URL` | แก้ `~/backend/.env` แล้ว `bash run.sh backend restart` |
| Supabase 401 / 42501 | ใส่ publishable key แทน secret key | ใช้ `sb_secret_...` |
| ปุ่มบันทึกการตั้งค่าขึ้น "บันทึกไม่ได้" | Vercel ไม่มี `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | เพิ่ม env แล้ว `npx vercel@latest --prod` |
| ลิงก์ Funnel ใช้ไม่ได้หลังผ่านไปหลายเดือน | Tailscale key หมดอายุ | login ใหม่บนบอร์ด และปิด key expiry |

## 14. ความปลอดภัย

- `.env` ทุกไฟล์อยู่ใน `.gitignore` · secret key อยู่แค่บนบอร์ดและฝั่ง server ของ Vercel ไม่ถูกส่งไปเบราว์เซอร์
- Supabase เปิด RLS ไม่มี policy ให้ key สาธารณะ
- backend รับคำขอเฉพาะโดเมนใน `FRONTEND_URL` (CORS)
- Tailscale Funnel เปิดสู่อินเทอร์เน็ตแค่พอร์ต 4000 ไม่เปิด SSH
- ไม่บันทึกวิดีโอ เก็บเฉพาะตัวเลขรายนาที
- หน้า "ตั้งค่าการนับ" ไม่มีระบบ login: ใครมีลิงก์ dashboard ก็แก้เส้นได้ (เหมาะกับงานในชั้นเรียน)

## 15. ข้อจำกัด

- ความแม่นขึ้นกับตำแหน่งกล้อง · คนเบียดกันหรือถูกบังตอนข้ามเส้นอาจนับพลาด
- กล้อง 1 ตัวต่อ 1 ห้อง · โมเดลขนาด nano ไม่เหมาะกับคนแน่นมาก
- AI หาประตูเป็นแค่ข้อเสนอ ประตูกระจก/ทางโล่งอาจหาไม่เจอ
- ข้อมูล MOT17 ที่ใช้เทรนเป็น CC BY-NC-SA 3.0: โมเดล `*_trained` ใช้เพื่อการศึกษาเท่านั้น
