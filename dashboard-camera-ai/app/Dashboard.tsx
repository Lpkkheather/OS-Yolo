"use client";

import { Suspense, useEffect, useState } from "react";
import { TodayData, StatusResponse } from "@/lib/hooks/useSseToday";
import { useSocketSync } from "@/lib/hooks/useSocketSync";
import { StatusBar } from "@/lib/components/StatusBar";
import { PeopleStats } from "@/lib/components/PeopleStats";
import { HourlyChart } from "@/lib/components/HourlyChart";
import { DetectionCard } from "@/lib/components/DetectionCard";
import { CompareCard } from "@/lib/components/CompareCard";
import { LiveEventLog } from "@/lib/components/LiveEventLog";
import { SystemHealth } from "@/lib/components/SystemHealth";
import { DailySummaryTable, DayPicker, formatDay } from "@/lib/components/DailySummaryTable";
import {
  fetchToday,
  fetchStatus,
  fetchCompare,
  fetchDays,
  fetchDayStats,
  CompareResponse,
  DayStats,
  DaySummary,
} from "@/lib/api";

function CardShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[#1e1e1e] overflow-hidden">
      {title && (
        <div className="h-full px-4 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-sm font-medium text-gray-200">{title}</h3>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Dashboard() {

  const [serverToday, setServerToday] = useState<TodayData | null>(null);
  const [serverStatus, setServerStatus] = useState<StatusResponse | null>(null);
  const [serverCompare, setServerCompare] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // วันที่กำลังดู: null = วันนี้ (สดจาก Pi) · "YYYY-MM-DD" = วันที่ผ่านมา (ข้อมูลที่บันทึกไว้ใน Supabase)
  const [day, setDay] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState("");
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [daysFailed, setDaysFailed] = useState(false);
  // สถิติของวันจาก Supabase ผ่าน /stats (ไม่ผ่าน Pi) — key = วันที่โหลดมา ใช้เฉพาะเมื่อตรงกับวันที่กำลังดู
  const [cloud, setCloud] = useState<{ key: string; data: DayStats } | null>(null);

  // ข้อมูลทั้งหน้ามาจาก Socket.IO "sync" ทุก 3 วินาที; fetch ตอนเปิดหน้าเป็น fallback ถ้า socket ต่อไม่ได้
  const { data: sync, frame } = useSocketSync();

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([fetchToday(), fetchStatus(), fetchCompare()]).then(([todayRes, statusRes, compareRes]) => {
      if (mounted) {
        setServerToday(todayRes.status === "fulfilled" ? todayRes.value : null);
        setServerStatus(statusRes.status === "fulfilled" ? statusRes.value : null);
        setServerCompare(compareRes.status === "fulfilled" ? compareRes.value : null);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  // รายการวันที่บันทึกไว้ (ตาราง + ตัวเลือกวัน) — อ่านใหม่ทุก 5 นาที
  useEffect(() => {
    let mounted = true;
    const load = () => {
      setTodayDate(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }));
      fetchDays()
        .then((r) => mounted && (setDays(r.days), setDaysFailed(false)))
        .catch(() => mounted && setDaysFailed(true));
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  // สถิติของวันที่กำลังดูจาก Supabase — วันนี้: ใช้แทนตอน Pi ปิด (อ่านใหม่ทุกนาที) · วันก่อน: อ่านครั้งเดียว
  useEffect(() => {
    let mounted = true;
    const key = day ?? "today";
    const load = () => {
      fetchDayStats(key)
        .then((data) => mounted && setCloud({ key, data }))
        .catch(() => {});
    };
    load();
    const t = day === null ? setInterval(load, 60_000) : undefined;
    return () => { mounted = false; clearInterval(t); };
  }, [day]);

  const archived = day !== null;
  const stored = cloud?.key === (day ?? "today") ? cloud.data : null;

  // วันนี้: ค่าสดจาก Pi ก่อน แล้วค่อยใช้ข้อมูลที่บันทึกไว้ (Pi ปิด / หลุดเน็ต) · วันก่อน: ข้อมูลที่บันทึกไว้อย่างเดียว
  const today = archived ? stored?.today ?? null : sync?.today ?? serverToday ?? stored?.today ?? null;
  const status = sync?.status ?? serverStatus;
  const compare = archived ? stored?.compare ?? null : sync?.compare ?? serverCompare ?? stored?.compare ?? null;
  const events = archived ? stored?.events ?? null : sync?.events ?? stored?.events ?? null;
  const lastRow = archived ? stored?.today.lastRow ?? null : status?.lastRow ?? stored?.today.lastRow ?? null;
  const chartLoading = archived ? stored === null : loading && stored === null;

  const chart = (
    <CardShell title="เข้า / ออก รายชั่วโมง">
      {today ? (
        <HourlyChart bars={today.hourlyBars} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500 text-sm">
          {chartLoading ? "กำลังโหลด…" : "ไม่สามารถโหลดกราฟได้"}
        </div>
      )}
    </CardShell>
  );

  const summary = (
    <DailySummaryTable days={days} selected={day} today={todayDate} failed={daysFailed} onSelect={setDay} />
  );

  return (
    <div className="space-y-4 max-w-screen-2xl mx-auto">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex-1 min-w-[16rem]">
          <StatusBar />
        </div>
        <DayPicker value={day} days={days} today={todayDate} onChange={setDay} />
      </div>




      {archived ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] px-4 py-2 text-sm">
            <span className="text-gray-300">
              ข้อมูลที่บันทึกไว้ของ <span className="font-semibold text-white">{formatDay(day)}</span>
            </span>
            <button onClick={() => setDay(null)} className="text-xs text-blue-400 hover:text-blue-300">
              กลับไปดูวันนี้ →
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 min-h-[280px]">{chart}</div>
            <PeopleStats today={today} archived />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">{summary}</div>
            <CompareCard data={compare} archived />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">
              <DetectionCard frame={frame} detection={today?.detection} lastRow={lastRow} />
            </div>
            <Suspense>
              <PeopleStats today={today} />
            </Suspense>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 ">
            <div className="lg:col-span-2 min-h-[280px] border-custom">{chart}</div>
            <Suspense>
              <CompareCard data={compare} />
            </Suspense>
          </div>
        </>
      )}

      <LiveEventLog data={events} />

      {!archived && summary}

      <div className="rounded-xl bg-[#1a1a1a] border border-[#222] px-4 py-2.5">
        <SystemHealth row={lastRow} />
      </div>
    </div>
  );
}

// Re-export CardShell for other components if needed
export { CardShell };
