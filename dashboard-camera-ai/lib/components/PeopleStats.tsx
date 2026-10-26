"use client";

import type { TodayData } from "@/lib/hooks/useSseToday";

interface PeopleStatsProps {
  today: TodayData | null;
  /** วันที่ผ่านมาแล้ว (ข้อมูลที่บันทึกไว้): ไม่มี "คนในห้องตอนนี้" → การ์ดใหญ่แสดงผู้มาเยือนทั้งวันแทน */
  archived?: boolean;
}

export function PeopleStats({ today, archived = false }: PeopleStatsProps) {
  if (!today) {
    return (
      <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 text-red-400 text-sm">
        ยังไม่มีข้อมูลให้แสดง
      </div>
    );
  }

  // ตัวนับยังไม่เห็นประตู → ยังไม่ได้นับเข้า/ออก: "—" (ไม่ใช่ 0 ที่ดูเหมือนไม่มีใครเข้า)
  const noDoor = !archived && today.detection?.mode === "room";

  const cards = [
    {
      label: archived ? "เข้าทั้งวัน" : "เข้าวันนี้",
      value: noDoor ? "—" : today.inToday ?? 0,
      sub: "ยอดสะสม",
      color: "text-blue-400",
    },
    {
      label: archived ? "ออกทั้งวัน" : "ออกวันนี้",
      value: noDoor ? "—" : today.outToday ?? 0,
      sub: "ยอดสะสม",
      color: "text-purple-400",
    },
    {
      label: "ช่วงคนเยอะสุด",
      value: today.peakHour
        ? `${String(today.peakHour.hour).padStart(2, "0")}:00 น.`
        : "—",
      sub: today.peakHour
        ? `${today.peakHour.inCount} คนเข้า`
        : "ยังไม่มีข้อมูล",
      color: "text-yellow-400",
    },
    {
      label: "คนสูงสุดในวัน",
      value: today.maxInRoom,
      sub: "คนในห้องพร้อมกัน",
      color: "text-orange-400",
    },
  ];

  return (
    <div className="space-y-4">
      {/* ตัวเลขหลัก — คนในห้องตอนนี้ (วันที่ผ่านมาแล้ว: ผู้มาเยือนทั้งวัน) */}
      {archived ? (
        <div className="rounded-xl bg-linear-to-t from-neutral-900 to-slate-600 border border-[#2a2a2a] p-6 flex flex-col items-center text-center">
          <span className="text-gray-400 text-sm mb-1">ผู้มาเยือนทั้งวัน</span>
          <div className="flex items-baseline gap-2">
            <span className="text-7xl font-bold text-white leading-none">{today.visitorsToday ?? 0}</span>
            <span className="text-gray-400 text-xl">คน</span>
          </div>
          <span className="text-gray-500 text-xs mt-2">
            {today.lastRow
              ? `บันทึกถึง ${today.lastRow.time.slice(11, 16)} น.`
              : "ไม่มีข้อมูลที่บันทึกไว้ในวันนี้"}
          </span>
        </div>
      ) : (
      <div className="rounded-xl bg-linear-to-t from-gray-700 to-zinc-900 border border-[#2a2a2a] p-6 flex flex-col items-center text-center">
        <span className="text-gray-400 text-sm mb-1">คนในห้องตอนนี้</span>
        <div className="flex items-baseline gap-2">
          <span className="text-gray-500 text-2xl">ประมาณ</span>
          <span className="text-7xl font-bold text-white leading-none">
            {today.currentPeople ?? "—"}
          </span>
          <span className="text-gray-400 text-xl">คน</span>
        </div>
        <span className="text-gray-500 text-xs mt-2">
          {today.liveTime
            ? `อัปเดต ${new Date(today.liveTime).toLocaleTimeString("th-TH", { hour12: false })}`
            : "ตัวนับไม่ได้ส่งข้อมูลสด"}
        </span>
      </div>
      )}

      <div className="grid grid-cols-2 gap-3 p-4 rounded-xl  border-custom ">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl bg-[#161616] border border-[#2a2a2a]  px-4 py-4"
          >
            <p className="text-gray-400 text-xs mb-1">{c.label}</p>
            <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
