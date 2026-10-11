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


const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function AreaChart({
  // occ = MOCK_STATIC,
}) {



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
