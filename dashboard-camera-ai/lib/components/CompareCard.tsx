"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompareResponse, CompareStat } from "@/lib/api";

// stat = null → วันนั้นไม่มีข้อมูล: แสดง "—" (0 จะดูเหมือนวันนั้นไม่มีคนเลย)
const show = (stat: CompareStat | null, key: "in" | "out") => stat?.[key] ?? "—";

// data มาจาก Socket.IO "sync" (GET /api/compare) — อัปเดตพร้อมทั้งหน้า; ก่อน socket ต่อได้ใช้ค่าจาก fetch ตอนเปิดหน้า
// archived = ดูวันที่ผ่านมาแล้ว: "วันนี้ / เมื่อวาน" เทียบจากวันที่เลือก
export function CompareCard({ data: compareData, archived = false }: { data: CompareResponse | null; archived?: boolean }) {
  if (!compareData) {
    return (
      <Card className="bg-[#1e1e1e] border-[#2a2a2a]">
        <CardHeader>
          <CardTitle className="font-bold text-gray-200">
            เทียบกับวันอื่น
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-[#2a2a2a] rounded w-1/4" />
            <div className="grid grid-cols-3 h-8 bg-[#2a2a2a] rounded" />
            <div className="grid grid-cols-3 h-8 bg-[#2a2a2a] rounded" />
            <div className="grid grid-cols-3 h-8 bg-[#2a2a2a] rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const rows = [
    { label: archived ? "วันก่อนหน้า" : "เมื่อวาน", stat: compareData.yesterday },
    { label: archived ? "7 วันก่อนหน้า" : "สัปดาห์ก่อน", stat: compareData.lastWeek },
    { label: "เฉลี่ย 7 วัน", stat: compareData.avg7days },
  ];

  return (
    <Card className="bg-[#1e1e1e] border-[#2a2a2a]">
      <CardHeader>
        <CardTitle className="font-bold text-gray-200">
          เทียบกับวันอื่น
        </CardTitle>
        <p className="text-xs text-gray-500">
          ถึงเวลา {compareData.cutoffTime} ของแต่ละวัน
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 text-xs w-full text-gray-500 border-b border-[#2a2a2a] pb-2">
          <span />
          <span className="text-center">เข้า</span>
          <span className="text-center">ออก</span>
        </div>

        <div className="grid grid-cols-3 text-sm text-gray-200 w-full mt-4">
          <span className="text-gray-300 font-medium">{archived ? "วันที่เลือก" : "วันนี้"}</span>
          <span className="text-center text-blue-400 font-semibold">
            {show(compareData.today, "in")}
          </span>
          <span className="text-center text-purple-400 font-semibold">
            {show(compareData.today, "out")}
          </span>
        </div>

        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-3 text-md text-gray-400 mt-4"
          >
            <span>{r.label}</span>
            <span className="text-center">{show(r.stat, "in")}</span>
            <span className="text-center">{show(r.stat, "out")}</span>
          </div>
        ))}

        {compareData.daysWithData === 0 && (
          <p className="text-xs text-gray-500 mt-4">
            ยังไม่มีข้อมูลของ 7 วันก่อน — ช่องเทียบจะมีตัวเลขเมื่อตัวนับเก็บข้อมูลไว้แล้วอย่างน้อย 1 วัน
          </p>
        )}
      </CardContent>
    </Card>
  );
}
