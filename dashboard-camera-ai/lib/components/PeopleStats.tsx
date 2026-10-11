// ============================================================
// PeopleStats — ตัวเลขหลัก: คนในห้อง, เข้า/ออกวันนี้, peak, สูงสุด
// Client Component — รับ props `today` จาก parent (real-time via SSE)
// ============================================================
"use client";

interface PeopleStatsProps {
  today: any;
}

export function PeopleStats({ today }: PeopleStatsProps) {
  if (!today) {
    return (
      <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 text-red-400 text-sm">
        ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบการเชื่อมต่อ backend
      </div>
    );
  }

  const cards = [
    {
      label: "เข้าวันนี้",
      value: today.inToday ?? 0,
      sub: "ยอดสะสม",
      color: "text-blue-400",
    },
    {
      label: "ออกวันนี้",
      value: today.outToday ?? 0,
      sub: "ยอดสะสม",
      color: "text-purple-400",
    },
    {
      label: "ช่วงคนเยอะสุด",
      value: today.peakHour
        ? `${String(today.peakHour.hour).padStart(2, "0")}:00 น.`
        : "—",
      sub: today.peakHour ? `${today.peakHour.inCount} คนเข้า` : "ยังไม่มีข้อมูล",
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
      {/* ตัวเลขหลัก — คนในห้องตอนนี้ */}
      <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 flex flex-col items-center text-center">
        <span className="text-gray-400 text-sm mb-1">คนในห้องตอนนี้</span>
        <div className="flex items-baseline gap-2">
          <span className="text-gray-500 text-2xl">ประมาณ</span>
          <span className="text-7xl font-bold text-white leading-none">
            {today.currentPeople}
          </span>
          <span className="text-gray-400 text-xl">คน</span>
        </div>
      </div>

      {/* การ์ดย่อย 4 ใบ */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] px-4 py-4">
            <p className="text-gray-400 text-xs mb-1">{c.label}</p>
            <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}