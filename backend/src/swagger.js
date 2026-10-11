/**
 * @openapi
 * openapi: 3.0.3
 * info:
 *   title: YOLO People Counting Dashboard API
 *   version: 1.0.0
 *   description: |
 *     API สำหรับ Dashboard ติดตามจำนวนคนจาก YOLO_Pi (Raspberry Pi 5)
 *     - รับข้อมูลจาก CSV (ไฟล์ที่ YOLO_Pi เขียนทุกนาที)
 *     - รับ MQTT real-time จาก `pi5/people/count` → Broadcast ผ่าน SSE
 *   contact:
 *     name: YOLO_Pi Project
 * servers:
 *   - url: http://localhost:4000
 *     description: Development server
 * tags:
 *   - name: Today
 *     description: ข้อมูลสรุปวันนี้
 *   - name: Status
 *     description: สถานะการเชื่อมต่อ MQTT + แถวข้อมูลล่าสุด
 *   - name: Compare
 *     description: เปรียบเทียบวันนี้กับวันอื่นๆ
 *   - name: Events
 *     description: เหตุการณ์ผิดปกติ (offline, low FPS, overcrowd, after-hours)
 *   - name: History
 *     description: ข้อมูลย้อนหลังรายวัน
 *   - name: Zones
 *     description: โซน/เส้นนับ + ภาพอ้างอิง
 *   - name: Stream
 *     description: Server-Sent Events (real-time)
 *   - name: Health
 *     description: Health check
 * components:
 *   schemas:
 *     MinuteRow:
 *       type: object
 *       properties:
 *         time:
 *           type: string
 *           format: date-time
 *           example: "2026-10-11T14:30:00+07:00"
 *         seconds:
 *           type: integer
 *           example: 60
 *         camera:
 *           type: string
 *           example: "cam1"
 *         in:
 *           type: integer
 *           nullable: true
 *           example: 2
 *         out:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         in_zone_avg:
 *           type: number
 *           nullable: true
 *           example: 1.5
 *         in_zone_max:
 *           type: integer
 *           nullable: true
 *           example: 3
 *         visitors:
 *           type: integer
 *           nullable: true
 *           example: 2
 *         in_today:
 *           type: integer
 *           nullable: true
 *           example: 25
 *         out_today:
 *           type: integer
 *           nullable: true
 *           example: 18
 *         visitors_today:
 *           type: integer
 *           nullable: true
 *           example: 35
 *         fps:
 *           type: number
 *           nullable: true
 *           example: 15.2
 *         cpu_temp_c:
 *           type: number
 *           nullable: true
 *           example: 58.5
 *         model:
 *           type: string
 *           example: "yolo26n_640"
 *     HourlyBar:
 *       type: object
 *       properties:
 *         hour:
 *           type: integer
 *           example: 14
 *         in:
 *           type: integer
 *           example: 5
 *         out:
 *           type: integer
 *           example: 3
 *         visitors:
 *           type: integer
 *           example: 4
 *     TodayResponse:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           example: "2026-10-11"
 *         inToday:
 *           type: integer
 *           example: 25
 *         outToday:
 *           type: integer
 *           example: 18
 *         visitorsToday:
 *           type: integer
 *           example: 35
 *         currentPeople:
 *           type: integer
 *           example: 7
 *         peakHour:
 *           type: object
 *           nullable: true
 *           properties:
 *             hour:
 *               type: integer
 *               example: 14
 *             inCount:
 *               type: integer
 *               example: 8
 *         maxInRoom:
 *           type: integer
 *           example: 12
 *         hourlyBars:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/HourlyBar'
 *         minuteRows:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MinuteRow'
 *     StatusResponse:
 *       type: object
 *       properties:
 *         mqttStatus:
 *           type: string
 *           enum: [online, offline, unknown]
 *           example: "online"
 *         lastDataTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastRow:
 *           $ref: '#/components/schemas/MinuteRow'
 *           nullable: true
 *     CompareResponse:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           example: "2026-10-11"
 *         cutoffTime:
 *           type: string
 *           example: "14:32"
 *         today:
 *           type: object
 *           properties:
 *             in:
 *               type: integer
 *             out:
 *               type: integer
 *         yesterday:
 *           type: object
 *           properties:
 *             in:
 *               type: integer
 *             out:
 *               type: integer
 *         lastWeek:
 *           type: object
 *           properties:
 *             in:
 *               type: integer
 *             out:
 *               type: integer
 *         avg7days:
 *           type: object
 *           properties:
 *             in:
 *               type: integer
 *             out:
 *               type: integer
 *     EventItem:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [camera_offline, low_fps, overcrowd, after_hours]
 *         severity:
 *           type: string
 *           enum: [info, warning, critical]
 *         time:
 *           type: string
 *           format: date-time
 *         message:
 *           type: string
 *         details:
 *           type: object
 *     EventsResponse:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *         events:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EventItem'
 *     HistoryDayResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/TodayResponse'
 *         - type: object
 *           properties:
 *             events:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EventItem'
 *     ZonesConfig:
 *       type: object
 *       properties:
 *         line:
 *           type: object
 *           properties:
 *             x1: {type: number}
 *             y1: {type: number}
 *             x2: {type: number}
 *             y2: {type: number}
 *             in_side: {type: string, enum: [left, right]}
 *         zone:
 *           type: object
 *           properties:
 *             points:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   x: {type: number}
 *                   y: {type: number}
 *         camera: {type: string}
 *         size:
 *           type: object
 *           properties:
 *             width: {type: number}
 *             height: {type: number}
 *         anchor: {type: string, enum: [feet, center]}
 *     HealthResponse:
 *       type: object
 *       properties:
 *         ok: {type: boolean, example: true}
 *         time: {type: string, format: date-time}
 *     SseMessage:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [TODAY_UPDATE, MQTT_UPDATE]
 *         payload:
 *           oneOf:
 *             - $ref: '#/components/schemas/TodayResponse'
 *             - $ref: '#/components/schemas/MinuteRow'
 *   responses:
 *     NotFound:
 *       description: ไม่พบข้อมูล
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               error:
 *                 type: string
 *                 example: "ไม่พบข้อมูลวันที่นี้"
 *     ServerError:
 *       description: Server error
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               error:
 *                 type: string
 * paths:
 *   /api/health:
 *     get:
 *       tags: [Health]
 *       summary: Health check
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/HealthResponse'
 *   /api/today:
 *     get:
 *       tags: [Today]
 *       summary: ข้อมูลสรุปวันนี้ (จาก CSV)
 *       description: |
 *         อ่านจาก `YOLO_Pi/data/YYYY-MM-DD.csv` คำนวณ:
 *         - currentPeople = in_today - out_today
 *         - hourlyBars = รวม in/out รายชั่วโมง
 *         - peakHour = ชั่วโมงที่ in มากที่สุด
 *         - maxInRoom = in_zone_max สูงสุดของวัน
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/TodayResponse'
 *         '500':
 *           $ref: '#/components/responses/ServerError'
 *   /api/status:
 *     get:
 *       tags: [Status]
 *       summary: สถานะ MQTT + แถวข้อมูลล่าสุด
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/StatusResponse'
 *         '500':
 *           $ref: '#/components/responses/ServerError'
 *   /api/compare:
 *     get:
 *       tags: [Compare]
 *       summary: เปรียบเทียบวันนี้กับวันอื่น (จนถึง cutoffTime)
 *       description: |
 *         cutoffTime = เวลาของแถวล่าสุดวันนี้
 *         เปรียบเทียบกับ: เมื่อวาน, 7 วันที่แล้ว, เฉลี่ย 7 วัน
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/CompareResponse'
 *         '500':
 *           $ref: '#/components/responses/ServerError'
 *   /api/events:
 *     get:
 *       tags: [Events]
 *       summary: เหตุการณ์ผิดปกติวันนี้
 *       parameters:
 *         - name: date
 *           in: query
 *           schema:
 *             type: string
 *             format: date
 *           description: วันที่ (YYYY-MM-DD) default = วันนี้
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/EventsResponse'
 *         '500':
 *           $ref: '#/components/responses/ServerError'
 *   /api/history/list:
 *     get:
 *       tags: [History]
 *       summary: รายการวันที่มีข้อมูล
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   dates:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: date
 *   /api/history/{date}:
 *     get:
 *       tags: [History]
 *       summary: ข้อมูลรายวัน + เหตุการณ์
 *       parameters:
 *         - name: date
 *           in: path
 *           required: true
 *           schema:
 *             type: string
 *             format: date
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/HistoryDayResponse'
 *         '404':
 *           $ref: '#/components/responses/NotFound'
 *         '500':
 *           $ref: '#/components/responses/ServerError'
 *   /api/zones/config:
 *     get:
 *       tags: [Zones]
 *       summary: zones.json (เส้นนับ + โซน)
 *       responses:
 *         '200':
 *           description: OK
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/ZonesConfig'
 *         '404':
 *           $ref: '#/components/responses/NotFound'
 *   /api/zones/preview:
 *     get:
 *       tags: [Zones]
 *       summary: zones_preview.jpg (ภาพอ้างอิงมุมกล้อง)
 *       responses:
 *         '200':
 *           description: Image file
 *           content:
 *             image/jpeg: {}
 *         '404':
 *           $ref: '#/components/responses/NotFound'
 *   /api/stream/today:
 *     get:
 *       tags: [Stream]
 *       summary: Server-Sent Events (real-time updates)
 *       description: |
 *         เชื่อมต่อค้างไว้ รับ event แบบ real-time:
 *         - `TODAY_UPDATE` - ข้อมูลวันนี้อัปเดต (จาก CSV polling หรือ MQTT)
 *         - `MQTT_UPDATE` - ข้อมูลจาก MQTT `pi5/people/count` โดยตรง
 *       responses:
 *         '200':
 *           description: Event stream
 *           content:
 *             text/event-stream:
 *               schema:
 *                 $ref: '#/components/schemas/SseMessage'
 *         '500':
 *           $ref: '#/components/responses/ServerError'
 */