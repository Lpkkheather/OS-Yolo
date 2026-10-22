# YOLO_Pi — ตรวจจับ + นับคน บน Raspberry Pi 5 + กล้อง Pi

โฟลเดอร์นี้ **แยกขาดจาก `~/Documents/YOLO`** — copy ทั้งโฟลเดอร์ไป Pi แล้วใช้ได้เลย
เทรนโมเดลทำใน `~/Documents/YOLO` บน Mac (Pi ช้าเกินจะเทรน) · ที่นี่ **ทดสอบ + ใช้งาน** โมเดลที่เสร็จแล้ว
ทุกขั้นรันบน Mac ได้ → **ทดสอบบน Mac ก่อน แล้วค่อยรันซ้ำบน Pi** (ผลของแต่ละเครื่องแยกโฟลเดอร์กัน)

## ขั้นตอน

| คำสั่ง | ขั้น | ทำอะไร | ผล |
|---|---|---|---|
| `bash run.sh import` | รับโมเดลที่เทรนเอง | บน Mac: ดึง `~/Documents/YOLO/models/*_trained.pt` + ชุด test ล่าสุด แล้วแปลงเป็น NCNN | `models/<ชื่อ>_trained_*_ncnn_model/` |
| `bash run.sh send` | ย้ายไป Pi | บน Mac: ถามชื่อผู้ใช้ + IP ของ Pi แล้ว copy โฟลเดอร์ | `~/YOLO_Pi` บน Pi |
| `bash run.sh github "แก้อะไร"` | ขึ้น GitHub | บน Mac: copy โฟลเดอร์นี้ขึ้น branch `YoLo_Detect` ของ `Lpkkheather/OS-Yolo` (ไม่แตะ `main`) — ไม่ส่งคลิปที่อัดเอง, ผลรัน (`results/`, `metrics/`), `.venv`, `PLAN.md`, ตัวสคริปต์ `push_to_github.sh` เอง (ดู `.gitignore`) — ใช้ได้เฉพาะบนเครื่องผู้พัฒนา | `YOLO_Pi/` ใน repo |
| `bash run.sh setup` | เตรียม Pi | ครั้งแรกบน Pi: `.venv` + ไลบรารี | `.venv/` |
| `bash run.sh 0` | 0 แปลงโมเดล | `.pt` → NCNN ขนาด 640 และ 320 (ทำแล้ว) | `models/*_ncnn_model/` |
| `bash run.sh 1` | 1 **Eval ภาพ** | ภาพ test 200 รูปที่มี Label: ความแม่น + NCNN เทียบ .pt | `metrics/<เครื่อง>/summary.md`, `results/<เครื่อง>/` |
| `bash run.sh 2 --seconds 30 --name corridor` | 2 **อัดคลิป** | อัดวิดีโอจากกล้อง (Pi camera / webcam) ไว้ทดสอบซ้ำ | `clips/corridor.mp4` |
| `bash run.sh 3 --source clips/corridor.mp4 --true-count 4` | 3 **ทดสอบกับคลิป** | รันโมเดล + บันทึกผลทุกเฟรม · 4 = คนที่คุณนับเองในคลิป | `metrics/<เครื่อง>/camera/` |
| `bash run.sh 3` | 3 **กล้องสด** | ตรวจจับ + ติดตามคนสด + บันทึกผล (กด q ปิด) | `metrics/<เครื่อง>/camera/` |
| `bash run.sh 4` | 4 **ตั้งเส้น / โซน** | ภาพจากกล้อง → คลิกวาดเส้นนับ เข้า/ออก และโซน | `zones.json` |
| `bash run.sh 3 --zones` | 3 **ดูการนับ** | กล้องสด + เส้น โซน ตัวนับ บนภาพ | `data/<วันที่>.csv` |
| `bash run.sh count` | **นับจริง** | ไม่เปิดหน้าต่าง · บันทึกทุก 1 นาที + ส่ง MQTT (+ Supabase ถ้าตั้งไว้) | `data/<วันที่>.csv`, `pi5/people/count`, ตาราง `minute_counts` |
| `bash run.sh upload` | ส่งย้อนหลัง | ส่ง `data/<วันที่>.csv` ขึ้น Supabase (วันก่อนตั้ง Supabase / ช่วงเน็ตหลุด) · ส่งซ้ำได้ไม่เกิดแถวซ้ำ | ตาราง `minute_counts` |
| `bash run.sh service install` | **นับเองตอนเปิดเครื่อง** | systemd: เริ่มตอนบูต + รีสตาร์ทเองถ้าล่ม (เฉพาะ Pi) | `bash run.sh service logs` |

เพิ่มเติม: `bash run.sh 1 --quick` (50 รูป ~1 นาทีบน Pi) · `bash run.sh 3 --no-show --seconds 60` (ผ่าน SSH ไม่มีจอ)
· `--imgsz 320` (เร็วกว่า) · `--model yolo11n` · `--save-video` (บันทึกวิดีโอที่มีกรอบ — คนในภาพต้องยินยอม)
· `bash run.sh service status | logs | stop | start | restart | uninstall`

## ทดสอบยังไงว่าโมเดลถูก — 3 ชั้น

| ชั้น | ขั้น | วัดอะไร | ผ่านเมื่อ |
|---|---|---|---|
| 1. เทียบ Label | `run.sh 1` → `accuracy.csv`, `iou.csv`, `counting_mae.csv` | Precision, Recall, F1, Accuracy, mAP, IoU, MAE | NCNN ≈ .pt |
| 2. NCNN เทียบ .pt ตรงๆ | `run.sh 1` → `agreement.csv` | กรอบตรงกันกี่ %, IoU ระหว่างกัน, นับเท่ากันกี่ % ของภาพ | **PASS** = mAP ต่าง ≤ 0.02, IoU ≥ 0.95, กรอบตรงกัน ≥ 90% |
| 3. วิดีโอจริง | `run.sh 2` + `run.sh 3 --true-count N` (+ `--zones --true-in A --true-out B`) | FPS, ความนิ่งของการติดตาม, นับคน / เข้า / ออก ผิดกี่คน | FPS ≥ 10, นับผิดน้อย, flicker น้อย |

แล้วรันชั้น 1–3 **ซ้ำบน Pi** → ตัวเลขควรใกล้กับบน Mac (ยกเว้นความเร็ว)

ภาพผลของชั้น 1 (`results/<เครื่อง>/<model>_<size>_ncnn/`): 🟩 ถูก (`person 0.87 IoU 0.91`) · 🟥 `FP` กรอบผิด ·
🟨 `LOW 0.23` โมเดลเห็นคนนี้แต่มั่นใจไม่ถึง 0.40 (กล้องสดยังใช้กรอบนี้ตามคนได้) · 🟧 `MISSED` ไม่เห็นเลย ·
สาเหตุรายคน: `metrics/<เครื่อง>/per_person/*.csv` (คอลัมน์ `why`) · สรุป: `missed.csv` — รายละเอียดใน README ของ `~/Documents/YOLO`
หัวข้อ "คนที่พลาด"

## นับคนในพื้นที่ (เส้น + โซน)

### ตั้งบน dashboard (วิธีหลัก) — ไม่มีโซนล็อกไว้ในโค้ด
- ปุ่ม **"ตั้งค่าการนับ"** บนการ์ดกล้อง → คลิก 2 จุด = เส้นเข้า/ออก (ลูกศรเขียว = เข้า, "สลับฝั่งเข้า" กลับทิศ),
  คลิกมุม = โซนห้อง (ไม่วาด = ทั้งภาพ), เลือกจุดที่ใช้นับ (เท้า / กลางตัว) → **บันทึก** = Supabase `camera_settings`
  → ตัวนับอ่านทุก 30 วินาทีแล้วใช้ทันที (ไม่ต้อง ssh / รีสตาร์ท) + เก็บสำเนาใน `zones.json` เผื่อเปิดเครื่องตอนไม่มีเน็ต
- **ยังไม่ได้ตั้งเส้น** = ไม่นับเข้า/ออก (in / out ว่าง, dashboard แสดง "—") ไม่มีการเดา · คนในห้อง / visitors นับทั้งภาพ
- **AI แค่เสนอ**: `door.py` ให้ YOLOE (`models/yoloe_door.pt` = YOLOE-11s + "door", "sliding door", "glass door" และ
  "cabinet" เป็นคำแข่ง — ไม่งั้นบานตู้เหล็กได้คะแนนเกินประตูกระจกจริง) หาประตูตอนยังไม่มีเส้น → หน้าตั้งค่าแสดงกรอบประ
  + ปุ่ม "AI เสนอเส้นที่ประตู" (เส้นที่ขอบล่างประตู) ให้ขยับเองก่อนบันทึก · กรอบที่ใหญ่เกิน 45% ของภาพไม่ใช่ประตู
- กรอบคนที่คะแนน < 0.35 ไม่นับเป็นคน (ตัวติดตามยังใช้กรอบ 0.1+ ตามคนที่ถูกบัง แต่กรอบพวกนั้นเกาะเก้าอี้ได้)
- ทดสอบ AI กับรูป: `.venv/bin/python door.py test รูป.jpg` → `door_รูป.jpg` · สร้างโมเดลใหม่บน Mac: `python door.py build`
  (ต้องมี CLIP: `pip install git+https://github.com/ultralytics/CLIP.git` — ดาวน์โหลดตัวแปลข้อความ 572 MB ครั้งเดียว)

### วาดเอง (`bash run.sh 4` → `zones.json`)

| | นับอะไร | กติกา |
|---|---|---|
| **เส้น** (line) | คนเดินข้ามเส้น: ไปทางลูกศรเขียว = **IN**, สวนทาง = **OUT** | นับคนละ 1 ครั้งต่อทิศ · ต้องออกพ้นแถบ ±2% ของความสูงภาพก่อน (ยืนบนเส้น/โยกไปมา ไม่นับซ้ำ) · เดินอ้อมปลายเส้นไม่นับ |
| **โซน** (zone) | คนในโซนตอนนี้ (เฉลี่ย / สูงสุดต่อนาที) + **visitors** = คนที่เข้ามาอยู่ในโซน | visitor = อยู่ในโซนรวม ≥ 1 วินาที นับคนละครั้ง (กรองกรอบผิดและ ID ที่โผล่แป๊บเดียว) → เอารายนาทีมารวมเป็นรายชั่วโมง/วันได้ · ไม่ได้กำหนดโซน = ทั้งภาพ |

- จุดที่ใช้นับ = **เท้า** (กลางขอบล่างของกรอบ — จุดเหลืองบนภาพ) เหมาะกับกล้องติดสูงมองเฉียง ·
  กล้องมองตรงลงพื้นให้ใช้ `center` (กด `a` ในหน้าต่าง หรือ `--anchor center`)
- **ตั้งเส้น/โซน** มีจอหรือ VNC: `bash run.sh 4` → กด `l` คลิก 2 จุด = เส้น · `z` คลิกมุม = โซน · `f` สลับฝั่ง IN ·
  `u` ย้อน · `c` ล้าง · `s` หรือ Enter บันทึก · `q` หรือ Esc ออก (คลิกที่ภาพก่อนกดปุ่ม · แป้นพิมพ์ไทยก็ใช้ได้ ·
  หน้าต่างย่อภาพให้ไม่เกิน 1280×720)
- **ผ่าน SSH (ไม่มีจอ)**: `bash run.sh 4` → ได้ `zones_preview.jpg` (มีตาราง 0–1, คนในภาพถูกทำเป็นโมเสก) → ดูภาพแล้วสั่ง
  `bash run.sh 4 --line 0.5,0.3,0.5,0.95 --zone 0.5,0.3,1,0.3,1,1,0.5,1` (ตัวเลข = สัดส่วน 0–1 ของภาพ, `none` = ลบ)
- ใช้ `--size` เดียวกันตอนตั้งโซนและตอนนับ (ค่าเริ่ม 1280x720) — ถ้าสัดส่วนภาพต่างกัน โปรแกรมจะเตือน

### ข้อมูลที่ได้ — ทุก 1 นาที

`data/<วันที่>.csv` (1 แถวต่อนาที) และ MQTT topic `pi5/people/count` (retained, QoS 1) ข้อมูลเดียวกัน:

```json
{"time": "2026-09-25T14:05:00+07:00", "seconds": 60, "camera": "cam1", "in": 12, "out": 9,
 "in_zone_avg": 3.4, "in_zone_max": 6, "visitors": 15, "in_today": 240, "out_today": 221,
 "visitors_today": 310, "fps": 14.8, "cpu_temp_c": 68.2, "model": "yolo26n_640"}
```

| ฟิลด์ | ความหมาย |
|---|---|
| `time` | เริ่มต้นนาทีนั้น (เวลาไทย) |
| `seconds` | นับจริงกี่วินาทีในนาทีนั้น (60 = เต็ม · น้อยกว่า = นาทีแรก/สุดท้ายของรอบ) |
| `camera` | ชื่อกล้อง (`zones.json` → `camera`, เผื่อมีหลายตัว) |
| `in` / `out` | คนข้ามเส้นเข้า / ออก ในนาทีนั้น (ว่าง / `null` = ไม่มีเส้น) |
| `in_zone_avg` / `in_zone_max` | คนในโซน เฉลี่ย / สูงสุด ในนาทีนั้น |
| `visitors` | คนที่เข้ามาในโซนเป็นครั้งแรกในนาทีนั้น |
| `in_today` / `out_today` / `visitors_today` | ยอดสะสมของวัน (รีสตาร์ทแล้วนับต่อจากไฟล์ของวันนั้น) |
| `fps`, `cpu_temp_c`, `model` | สุขภาพระบบ — ใช้ดูว่าข้อมูลช่วงไหนเชื่อถือได้ |

- `pi5/status/people` = `online` / `offline` (retained + Last Will) แบบเดียวกับ service อื่นใน `pi-mqtt-llm`
- ทุก 1 วินาที: `pi5/people/live` = คนในโซนตอนนี้ + ยอดวันนี้ถึงวินาทีนี้ + ผลการตรวจจับ (`people` คนในภาพ, `conf`
  ความมั่นใจเฉลี่ย, `fps`, `model`) · ทุก 0.2 วินาที: `pi5/people/frame` = ภาพ JPEG (กว้าง 480 px) ที่โมเดลวาดกรอบ เส้น และโซนแล้ว
  → การ์ด "การตรวจจับของโมเดล" บน dashboard · ไม่ส่งภาพ: `bash run.sh count --frames off` (หรือ `service install --frames off`)
- broker ล่ม / ยังไม่เปิด: โปรแกรม **นับต่อ** · ข้อมูลรอในคิวแล้วส่งเมื่อ broker กลับมา · และอยู่ใน CSV เสมอ
- หลังรีสตาร์ท อาจมี 2 แถวที่ `time` เดียวกัน (นาทีที่ถูกตัด) → `in` / `out` / `visitors` เอามาบวกกัน
- ดูข้อมูลบน Pi: `tail -f data/$(date +%F).csv` · `mosquitto_sub -h localhost -t pi5/people/count -t pi5/people/live -t pi5/status/people -v`
  (ไม่ใช้ `pi5/people/#`: จะได้ภาพ JPEG ของ `pi5/people/frame` เป็นตัวอักษรขยะเต็มจอ)
- คลิปทดสอบ: แถวไปที่ `data/test_<คลิป>.csv` (นาที = เวลาในวิดีโอ) ไม่ปนกับข้อมูลจริง
  และไม่ขึ้น dashboard (กราฟ / ตารางเทียบใช้เฉพาะ `data/<วันที่>.csv` หรือ Supabase) → ทดสอบ dashboard ด้วยกล้องสด

### Supabase — เก็บข้อมูลรายนาทีบนคลาวด์ (ไม่บังคับ)

ทำให้ backend / dashboard ไม่ต้องรันบน Pi และประวัติไม่หายถ้า SD card เสีย · ไม่ตั้ง = ทำงานแบบเดิม (CSV + MQTT)
**ใช้ Supabase project ของ OS-Yolo เอง** — อย่าใช้ project / key ร่วมกับโปรเจกต์อื่น

1. supabase.com → **New project** (เช่น `os-yolo`, region Singapore)
2. SQL Editor → วางไฟล์ `../supabase/schema.sql` ทั้งไฟล์ → Run (สร้างตาราง `minute_counts`)
3. `cp .env.example .env` แล้วใส่ `SUPABASE_URL` (Project Settings > Data API) และ `SUPABASE_SECRET_KEY`
   (Project Settings > API Keys > secret) — `.env` ไม่ขึ้น GitHub · `bash run.sh send` copy ไป Pi ให้ด้วย
4. บน Pi: `bash run.sh upload` (ส่งวันที่นับไว้แล้ว) → `bash run.sh service restart` (นาทีใหม่ขึ้น Supabase เอง)

- เน็ตหลุด: นับต่อ · นาทีที่ส่งไม่ได้รอในหน่วยความจำแล้วส่งเมื่อกลับมา (สูงสุด 1 วัน) · อยู่ใน CSV เสมอ → `bash run.sh upload`
- คลิปไม่ถูกส่ง · ปิดเฉพาะรอบ: `--supabase off`
- secret key เข้าถึงข้อมูลได้ทั้งหมด: ใส่แค่ใน `YOLO_Pi/.env` และ `backend/.env` ห้ามใส่ใน dashboard (`NEXT_PUBLIC_*`)

## ผลบน Mac (ทำแล้ว ✅)

**ชั้น 1–2** (ภาพ test 200 รูป, 372 คน — `metrics/Natchapons-MacBook-Pro/summary.md`):

| โมเดล | ขนาด | mAP50-95 NCNN / .pt | Accuracy NCNN | NCNN เทียบ .pt | ms/ภาพ NCNN (Mac) |
|---|---|---|---|---|---|
| yolo26n | 640 | 0.737 / 0.743 | 0.803 | **PASS** — กรอบตรงกัน 96.0%, IoU 0.981 | 14.5 |
| yolo26n | 320 | 0.704 / 0.690 | 0.768 | **PASS** — 95.5%, IoU 0.977 | 5.2 |
| yolo11n | 640 | 0.726 / 0.726 | 0.790 | **PASS** — 93.9%, IoU 0.979 | 15.5 |
| yolo11n | 320 | 0.702 / 0.689 | 0.764 | **PASS** — 96.3%, IoU 0.975 | 5.2 |

**ชั้น 3** (คลิปทดสอบ `clips/_selftest.mp4` — ภาพ test 8 ฉาก มีคนรวม 11 คน):

| โมเดล | นับได้ | ผิด | FPS (Mac) |
|---|---|---|---|
| yolo26n 640 | 8 คน | −3 (โมเดลไม่เจอคนในฉาก 4, 6, 8) | 57 |
| yolo26n 320 | 7 คน | −4 | 151 |

ตรวจแล้ว: จำนวนที่นับ = จำนวนคนที่ตรวจเจอในแต่ละฉากพอดี → ส่วนติดตาม/นับถูก ที่หายคือโมเดลตรวจไม่เจอ (Recall ~0.84)

**การนับเส้น/โซน** (คลิปทดสอบ `clips/_counttest.mp4` 84 วินาที, 8 คนเดินผ่านตามเวลาที่กำหนด, yolo26n 640 NCNN):

| ตรวจ | นับได้ | ค่าจริง |
|---|---|---|
| ข้ามเส้นเข้า (IN) / ออก (OUT) | 3 / 3 | 3 / 3 ✅ |
| คนยืนบนเส้นแล้วเดินกลับ · คนเดินอ้อมปลายเส้น | ไม่นับ | ไม่นับ ✅ |
| 2 คนเดินสวนกันจนบังกันตรงเส้น | ID ไม่สลับ นับถูกทั้งคู่ | ✅ |
| คนไม่ซ้ำทั้งคลิป | 8 | 8 ✅ |
| แยกรายนาที | นาที 1: เข้า 2 ออก 3 · นาที 2 (24 วิ): เข้า 1 | ✅ |
| visitors ของโซน | 6 | 6 ✅ (คนที่ยืนชิดขอบโซน เท้าล้ำเข้าไป 0.8 วินาที ไม่ถูกนับ — ต้องอยู่ในโซน ≥ 1 วินาที) |

รันซ้ำเองได้: `bash run.sh 3 --source clips/_counttest.mp4 --zones clips/_counttest_zones.json --true-in 3 --true-out 3 --true-count 8`

**คลิปกล้องวงจรปิดจริง** (MOTChallenge, อยู่ใน `~/Documents/YOLO/videos/cctv/`) — จำนวนคนไม่ซ้ำที่นับได้ (ID ที่อยู่ ≥ 1 วินาที):

| คลิป | คนทั้งหมด | เห็นชัด ≥ 1 วิ | yolo26n 640 | yolo26n 320 | yolo11n 640 |
|---|---|---|---|---|---|
| MOT17-04 ถนน มุมสูง | 88 | 64 | 69 | 31 | 88 |
| MOT17-02 ลาน | 74 | 51 | 39 | 25 | 50 |
| MOT17-09 ถนน มุมต่ำ | 27 | 23 | 37 | 25 | 40 |
| MOT20-01 สถานี คนแน่น | 80 | 61 | 52 | 18 | 60 |
| MOT20-03 คนแน่นมาก | 724 | 651 | 369 | 68 | 548 |

- **320 ไม่เหมาะกับกล้องมุมสูง** คนเล็กเกิน นับขาดมาก ยกเว้นคลิปกล้องต่ำ
- yolo11n 640 นับใกล้ค่าจริงกว่า yolo26n 640 ใน 4 จาก 5 คลิป (ตรงกับที่ yolo11n หาคนตัวเล็กเจอมากกว่าในชุด cctv) → เลือกรุ่นด้วยคลิปจุดจริง
- ยอด "คนไม่ซ้ำ" มีทั้งนับขาด (หาไม่เจอ) และนับเกิน (ID ขาดแล้วได้ใหม่ เช่น MOT17-09 ที่คนเดินใกล้กล้องบังกันเอง) ซึ่งหักล้างกันได้
  → เก็บสถิติด้วยการนับข้ามเส้น (`in` / `out`) และความหนาแน่นในโซน ดีกว่ายอดคนไม่ซ้ำ
- คนแน่นมาก (MOT20-03) เกินความสามารถของโมเดลเล็กขนาด nano
- รันซ้ำ: `bash run.sh 3 --source ~/Documents/YOLO/videos/cctv/MOT17-04.mp4 --model yolo26n --true-count 88` ·
  วิดีโอผลของ yolo26n 640 ดูได้ที่ `results/<เครื่อง>/camera/*_MOT17-04_yolo26n_640.mp4`

ทดสอบเพิ่มแล้ว: หยุดแบบ `systemctl stop` → นาทีสุดท้าย + summary ยังถูกบันทึก · ไม่มี broker / ไม่มี paho-mqtt → แจ้งเตือนแล้วนับต่อ ·
รีสตาร์ท → ยอดของวันนับต่อ · ข้ามเที่ยงคืน → แยกไฟล์ถูกวัน · ข้อความ MQTT (online → รายนาที retained → offline) ถูกต้อง
**ยังไม่ได้ทดสอบ:** broker จริง (บนเครื่องที่ทดสอบเปิดพอร์ตไม่ได้) และ systemd (มีเฉพาะบน Pi) → ทดสอบตามหัวข้อด้านล่าง

### ทดสอบ MQTT กับ broker จริงบน Mac (3 terminal)

```bash
/opt/homebrew/sbin/mosquitto
```

```bash
mosquitto_sub -t pi5/people/count -t pi5/people/live -t pi5/status/people -v
```

```bash
cd ~/Documents/YOLO_Pi && ~/Downloads/Lab07/.venv/bin/pip install paho-mqtt==2.1.0 && bash run.sh 3 --source clips/_counttest.mp4 --zones clips/_counttest_zones.json --mqtt --no-show
```

terminal ที่ 2 ต้องเห็น `pi5/status/people online` → `pi5/people/count {...}` 2 ข้อความ → `offline`

## ผลของแต่ละรอบกล้อง/คลิป (`metrics/<เครื่อง>/camera/`)

```
camera/
├── runs.csv                     ← 1 แถวต่อ 1 รอบ: เทียบโมเดล/ขนาดบนคลิปเดียวกัน
└── <วันเวลา>_<คลิป>_<model>_<size>/
    ├── summary.md               FPS, ms/เฟรม, คนต่อเฟรม, คนไม่ซ้ำ, flicker, อุณหภูมิ CPU, นับผิดกี่คน, เข้า/ออก/โซน
    └── frames.csv               1 แถวต่อเฟรม: จำนวนคน, ID, ความมั่นใจ, ms, อุณหภูมิ, เข้า/ออก/ในโซน
                                 (ไม่เขียนตอน bash run.sh count — รันทั้งวันไฟล์จะใหญ่เกิน)
```

| ค่า | ความหมาย |
|---|---|
| `unique_people_stable` | คนที่อยู่ในภาพ ≥ 1 วินาที = ค่าประมาณจำนวนคนจริง |
| `flicker_tracks` | ID ที่โผล่สั้นๆ แล้วหาย (กรอบผิด / ID ขาด) — ยิ่งน้อยยิ่งนิ่ง |
| `count_error_stable` | นับได้ − ที่คุณนับเอง (`--true-count`) · 0 = ถูก |
| `line_in` / `line_out` / `error_in` / `error_out` | ข้ามเส้นเข้า/ออก และผิดกี่คน (`--true-in` / `--true-out`) |
| `FPS`, `ms_per_frame_p95` | เร็วพอไหม / กระตุกไหม |

**ข้อจำกัด:** กล้องสดไม่มี Label → วัด accuracy ไม่ได้ (ใช้ชั้น 1 แทน) · ByteTrack ติดตามจากตำแหน่ง
ถ้าคนหนึ่งออก แล้วอีกคนเข้ามาตรงจุดเดิมภายใน ~2 วินาที อาจได้ ID เดิม (นับขาด) · ถ้า ID ขาดตอนคนถูกบังนาน
คนเดียวอาจถูกนับเป็น visitor 2 ครั้ง หรือข้ามเส้นไม่ถูกนับ (ถ้า ID ใหม่เกิดหลังเส้นแล้ว)

## โครงสร้าง

```
YOLO_Pi/
├── run.sh · send_to_pi.sh · .gitignore · requirements.txt  (+ push_to_github.sh เฉพาะเครื่องผู้พัฒนา)
├── .env.example  แม่แบบของ .env (Supabase URL + secret key — .env ไม่ขึ้น GitHub)
├── common.py · counting.py (นับเส้น/โซน, บันทึกรายนาที, MQTT, Supabase)
├── 0_export_ncnn.py · 1_eval.py · 2_record_clip.py · 3_camera.py · 4_set_zones.py · 5_upload_supabase.py
├── zones.json    สำเนาเส้น/โซนจาก dashboard (หรือวาดด้วย bash run.sh 4) · ไม่มี = ทั้งภาพ ไม่นับเข้า/ออก
├── door.py · door.json   AI หาประตูเพื่อเสนอเส้นบน dashboard (YOLOE) · ประตูที่หาเจอล่าสุด
├── data/         <วันที่>.csv = ข้อมูลนับรายนาที · test_<คลิป>.csv = จากคลิปทดสอบ
├── models/       yolo26n.pt · yolo11n.pt · <model>_<640|320>_ncnn_model/ (ใช้บน Pi) · yoloe_door.pt (หาประตู)
├── test_data/    ภาพ test 200 รูป + Label (จาก COCO)
├── clips/        คลิปที่อัด (+ _selftest.mp4, _counttest.mp4 + _counttest_zones.json)
├── results/<เครื่อง>/   ภาพผลทีละรูป (NCNN) · camera/*.mp4 (ถ้าใช้ --save-video)
├── metrics/<เครื่อง>/   summary.md + accuracy / iou / counting_mae / speed / missed / agreement.csv ·
│                       per_image/ · per_person/ (พลาดเพราะอะไร รายคน) · camera/
└── logs/         บันทึกหน้าจอของขั้น 0, 1, import, upload
```

## หมายเหตุ

- กล้องเลือกเอง (ขั้น 2–4 และ service): เสียบ **USB webcam** อยู่ → ใช้ webcam (หาเลข `/dev/video` ให้เอง: บน Pi 5
  มักไม่ใช่ 0 เพราะอุปกรณ์วิดีโอของ Pi เองมาก่อน) · ไม่มี webcam → กล้อง Pi ผ่าน **Picamera2** (เช็กด้วย `rpicam-hello -t 3000`)
  · บน Mac → webcam 0 · ไม่ต้องใส่ `--source` ตอน `service install`: หาใหม่ทุกครั้งที่เริ่ม (ย้ายช่อง USB ได้)
- webcam หลุด / ถอดสาย: ได้ภาพดำ 10 วินาที → ตัวนับหยุด → systemd เริ่มใหม่ใน 10 วินาทีแล้วหากล้องใหม่ (เสียบกลับเมื่อไหร่ก็นับต่อ)
  · ดูว่า Pi เห็น webcam ไหม: `ls -l /dev/v4l/by-id/`
  · กล้องใช้ได้ทีละโปรแกรม: ถ้า service นับอยู่ ให้ `bash run.sh service stop` ก่อนรันขั้น 2–4
- `bash run.sh send` ไม่ copy `results/` และ `data/` ของ Mac ไป Pi และไม่ทับไฟล์ที่ใหม่กว่าบน Pi (เช่น `zones.json` ที่ตั้งบน Pi)
- PDPA: เก็บแค่ตัวเลข · ภาพที่บันทึกมีแค่ `zones_preview.jpg` (คนเป็นโมเสก) และวิดีโอเมื่อสั่ง `--save-video` (ต้องได้รับความยินยอม)
- จำนวนคนต่อเฟรม (`people`) นับเฉพาะคนที่ tracker ยืนยันแล้ว — ตอนยังไม่มี track, Ultralytics ส่งกรอบดิบ (score ≥ 0.1)
  มาด้วย ซึ่งรอบก่อนหน้านี้ถูกนับรวม (ค่า people_per_frame ของรอบเก่าใน runs.csv จึงอาจสูงกว่าเล็กน้อย)
- อุณหภูมิ CPU > 80 °C Pi 5 จะลดความเร็วเอง → ใส่พัดลม/ฮีตซิงก์
- ถ้ามี **AI Camera (IMX500)** หรือ **AI HAT+ (Hailo)** แปลงโมเดลอีกแบบได้เร็วกว่า NCNN มาก
- เทรนใหม่ใน `~/Documents/YOLO` → `bash run.sh import` → `bash run.sh 1` (หรือ `bash run.sh 1 --models yolo26n_trained`)
  → `bash run.sh 3 --model yolo26n_trained` · ทุก `.pt` ใน `models/` ใช้ชื่อไฟล์เป็นชื่อโมเดลได้เลย

## โมเดลที่เทรนเอง (`*_trained`) — เทรน 10 ต.ค. 2026

เทรนต่อจากน้ำหนัก COCO ด้วย 639 รูป: COCO 399 รูป (คนทุกขนาด) + เฟรมกล้องแบบถนน/ห้าง 240 เฟรมจาก MOT17-05/10/11/13
(ล็อก backbone, AdamW LR 0.0001, 50 epoch) · วัดกับชุดที่โมเดลไม่เคยเห็น — คลิป CCTV ที่ใช้วัดเป็นคนละสถานที่กับที่ใช้เทรน

| โมเดล | ภาพทั่วไป 200 รูป (NCNN 640): F1 · เจอคน · กรอบผิด | มุมกล้องวงจรปิด 100 เฟรม 3,394 คน (.pt 640): เจอคน |
|---|---|---|
| `yolo26n` | 0.890 · 317 · 23 | 572 (16.9%) |
| `yolo26n_trained` | 0.871 · 311 · 31 | 735 (21.7%) |
| `yolo11n` | 0.883 · 312 · 23 | 802 (23.6%) |
| `yolo11n_trained` | 0.873 · 315 · 35 | 1,198 (35.3%) |

- มุมกว้าง คนตัวเล็ก/เดินเป็นกลุ่ม → โมเดลที่เทรนเองเจอคนมากกว่าชัดเจน (`yolo11n_trained` ดีสุด)
- กล้องใกล้ประตู คนตัวใหญ่ → ใกล้เคียงกัน โมเดลก่อนเทรนตีกรอบผิดน้อยกว่าเล็กน้อย
- เลือกใช้: `bash run.sh count --model yolo11n_trained` (ค่าเริ่มต้นคือ `yolo26n`) · ตัดสินด้วยคลิปจากจุดติดตั้งจริง:
  `bash run.sh 3 --source clips/site.mp4 --zones --model <ชื่อ> --true-in N --true-out M`
- รายละเอียด ข้อมูล และผลทุกรอบ: README ของโปรเจกต์เทรน (`~/Documents/YOLO`, หัวข้อ "เทรนรอบ 2")
- ข้อมูล MOTChallenge (MOT17) เป็น CC BY-NC-SA 3.0: ใช้เพื่อการศึกษา/วิจัย ห้ามเชิงพาณิชย์ — โมเดล `*_trained` จึงใช้ได้ในขอบเขตเดียวกัน
  (A. Milan et al., *MOT16: A Benchmark for Multi-Object Tracking*, arXiv:1603.00831)
