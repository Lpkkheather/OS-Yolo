"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface HourlyBarData {
  hour: number;
  in: number;
  out: number;
  visitors?: number;
}

interface Props {
  bars: HourlyBarData[];
}

export function HourlyChart({ bars }: Props) {
  // Handle both array and object (in case API returns object)
  const barArray: HourlyBarData[] = Array.isArray(bars)
    ? bars
    : bars
      ? Object.values(bars)
      : [];
  // backend ส่งเฉพาะชั่วโมงที่มีข้อมูล → เติมชั่วโมงที่ขาด (Pi ปิด / เน็ตหลุด) ให้แกน X ต่อเนื่อง
  // ชั่วโมงที่ขาด = null (ไม่มีแท่ง) ไม่ใช่ 0 ซึ่งดูเหมือนชั่วโมงนั้นไม่มีคน
  const byHour = new Map(barArray.map((b) => [b.hour, b]));
  const hours = barArray.map((b) => b.hour);
  const data = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
    const b = byHour.get(h);
    data.push({
      hour: `${String(h).padStart(2, "0")}:00`,
      เข้า: b?.in ?? null,
      ออก: b?.out ?? null,
    });
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500 text-sm">
        ยังไม่มีข้อมูลวันนี้
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="#333" />
          <XAxis
            dataKey="hour"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255, 255, 255, 0.06)" }}
            filterNull={false}
            formatter={(value) => value ?? "ไม่มีข้อมูล"}
            contentStyle={{
              background: "#1e1e1e",
              border: "1px solid #333",
              borderRadius: 8,
              color: "#e5e7eb",
            }}
          />
          <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
          <Bar dataKey="เข้า" fill="#2a78d6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="ออก" fill="#a855f7" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
