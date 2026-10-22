// ============================================================
// DailySummaryTable — สรุปทุกวันที่บันทึกไว้ใน Supabase (GET /stats/days) + ตัวเลือกวันด้านบนของ dashboard
// กดแถว / เลือกวัน = ทั้ง dashboard เปลี่ยนเป็นของวันนั้น (ดูได้แม้ Raspberry Pi ปิดอยู่)
// ============================================================
"use client";

import type { DaySummary } from "@/lib/api";

/** 2026-10-21 → "อ. 21 ต.ค. 2569" */
export function formatDay(date: string) {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

const hoursText = (minutes: number) => `${(minutes / 60).toFixed(1)} ชม.`;

interface PickerProps {
  /** null = วันนี้ (สด) */
  value: string | null;
  days: DaySummary[] | null;
  today: string;
  onChange: (date: string | null) => void;
}

export function DayPicker({ value, days, today, onChange }: PickerProps) {
  const past = (days ?? []).filter((d) => d.date !== today);
  return (
    <select
      aria-label="เลือกวันที่จะดู"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-500"
    >
      <option value="">วันนี้ (สด)</option>
      {past.map((d) => (
        <option key={d.date} value={d.date}>
          {formatDay(d.date)}
        </option>
      ))}
    </select>
  );
}

interface TableProps {
  days: DaySummary[] | null;
  /** วันที่กำลังดู (null = วันนี้) */
  selected: string | null;
  today: string;
  /** โหลดไม่ได้ (เช่น ยังไม่ได้ตั้งค่า Supabase บน Vercel) */
  failed: boolean;
  onSelect: (date: string | null) => void;
}

export function DailySummaryTable({ days, selected, today, failed, onSelect }: TableProps) {
  return (
    <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <h3 className="text-sm font-medium text-gray-200">สรุปรายวัน (ข้อมูลที่บันทึกไว้)</h3>
        <p className="text-xs text-gray-500 mt-0.5">กดวันที่เพื่อดู dashboard ของวันนั้น</p>
      </div>

      {days === null || days.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">
          {failed ? "โหลดข้อมูลย้อนหลังไม่ได้" : days === null ? "กำลังโหลด…" : "ยังไม่มีข้อมูลที่บันทึกไว้"}
        </p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#1e1e1e] text-xs text-gray-500">
              <tr className="border-b border-[#2a2a2a]">
                <th className="px-4 py-2 text-left font-normal">วันที่</th>
                <th className="px-2 py-2 text-right font-normal">เข้า</th>
                <th className="px-2 py-2 text-right font-normal">ออก</th>
                <th className="px-2 py-2 text-right font-normal">ผู้มาเยือน</th>
                <th className="px-2 py-2 text-right font-normal">คนสูงสุด</th>
                <th className="px-4 py-2 text-right font-normal">เวลาที่นับ</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const isToday = d.date === today;
                const active = isToday ? selected === null : selected === d.date;
                return (
                  <tr
                    key={d.date}
                    onClick={() => onSelect(isToday ? null : d.date)}
                    className={`cursor-pointer border-b border-[#242424] last:border-0 hover:bg-[#262626] ${active ? "bg-[#262626]" : ""}`}
                  >
                    <td className="px-4 py-2 text-gray-200">
                      {formatDay(d.date)}
                      {isToday && <span className="ml-2 text-xs text-gray-500">วันนี้</span>}
                    </td>
                    <td className="px-2 py-2 text-right text-blue-400">{d.in}</td>
                    <td className="px-2 py-2 text-right text-purple-400">{d.out}</td>
                    <td className="px-2 py-2 text-right text-gray-300">{d.visitors}</td>
                    <td className="px-2 py-2 text-right text-orange-400">{d.maxInRoom}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{hoursText(d.minutes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
