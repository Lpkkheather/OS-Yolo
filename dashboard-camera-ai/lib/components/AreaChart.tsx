"use client";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
// import { MOCK_STATIC, OccupancyData } from "../mockdata/areadata";

const data = [
  { time: "00:00", today: 10, yesterday: 8 },
  { time: "04:00", today: 8, yesterday: 6 },
  { time: "08:00", today: 25, yesterday: 20 },
  { time: "12:00", today: 40, yesterday: 35 },
  { time: "16:00", today: 50, yesterday: 45 },
  { time: "20:00", today: 30, yesterday: 28 },
  { time: "23:59", today: 15, yesterday: 12 },
];

export default function AreaChart() {
  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="2 7" vertical={false} />
          <XAxis dataKey="time" interval={7} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Area
            dataKey="today"
            name="วันนี้"
            type="monotone"
            stroke="#2a78d6"
            fill="#2a78d6"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
          <Area
            dataKey="yesterday"
            name="เมื่อวาน"
            type="monotone"
            stroke="#82ca9d"
            fill="#82ca9d"
            fillOpacity={0.15}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}