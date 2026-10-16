// ============================================================
// index.js — Express server สำหรับ YOLO Dashboard
// ============================================================
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import todayRouter from "./routes/today.js";
import statusRouter from "./routes/status.js";
import compareRouter from "./routes/compare.js";
import eventsRouter from "./routes/events.js";
import historyRouter from "./routes/history.js";
import zonesRouter from "./routes/zones.js";
import { startMqtt } from "./mqtt.js";
import { startSse } from "./sse.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 4000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Swagger/OpenAPI
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "YOLO People Counting Dashboard API",
      version: "1.0.0",
      description: "API สำหรับ Dashboard ติดตามจำนวนคนจาก YOLO_Pi (Raspberry Pi 5)",
    },
    servers: [{ url: `http://localhost:${PORT}` }],
  },
  apis: ["./src/swagger.js"],
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "YOLO Dashboard API Docs",
}));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Routes
app.use("/api/today", todayRouter);
app.use("/api/status", statusRouter);
app.use("/api/compare", compareRouter);
app.use("/api/events", eventsRouter);
app.use("/api/history", historyRouter);
app.use("/api/zones", zonesRouter);

// Start SSE endpoint
startSse(app);

// Start MQTT if configured
if (process.env.MQTT_BROKER_URL) {
  startMqtt(process.env.MQTT_BROKER_URL);
} else {
  console.log("[Server] MQTT_BROKER_URL ไม่ได้ตั้งค่า — ข้าม MQTT");
}

app.listen(PORT, () => {
  console.log(`[Server] รันที่ http://localhost:${PORT}`);
  console.log(`[Server] CORS: ${FRONTEND_URL}`);
  console.log(`[Server] SSE endpoint: http://localhost:${PORT}/api/stream/today`);
  console.log(`[Server] Swagger UI: http://localhost:${PORT}/api-docs`);
});