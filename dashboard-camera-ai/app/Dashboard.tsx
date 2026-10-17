"use client";

import { Suspense, useEffect, useState } from "react";
import { useSseToday, TodayData, StatusResponse } from "@/lib/hooks/useSseToday";
import { StatusBar } from "@/lib/components/StatusBar";
import { PeopleStats } from "@/lib/components/PeopleStats";
import { HourlyChart } from "@/lib/components/HourlyChart";
import { CompareCard } from "@/lib/components/CompareCard";
import { LiveEventLog } from "@/lib/components/LiveEventLog";
import { SystemHealth } from "@/lib/components/SystemHealth";
import { fetchToday, fetchStatus } from "@/lib/api";

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
  const [loading, setLoading] = useState(true);

  const { data: sseData } = useSseToday();
  const today = sseData ?? serverToday;
  const status = serverStatus;

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([fetchToday(), fetchStatus()]).then(([todayRes, statusRes]) => {
      if (mounted) {
        setServerToday(todayRes.status === "fulfilled" ? todayRes.value : null);
        setServerStatus(statusRes.status === "fulfilled" ? statusRes.value : null);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <StatusBar status={null} today={undefined} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <StatusBar status={status} today={today} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Suspense>
          <PeopleStats today={today} />
        </Suspense>

        <div className="lg:col-span-2 min-h-[280px]"> 
          <CardShell title="เข้า / ออก รายชั่วโมง">
          
            {today ? (
              <HourlyChart bars={today.hourlyBars} />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500 text-sm">
                ไม่สามารถโหลดกราฟได้
              </div>
            )}
          </CardShell>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lg:col-span-1">
          <LiveEventLog />
        </div>
        <Suspense>
          <CompareCard />
        </Suspense>
      </div>

      <div className="rounded-xl bg-[#1a1a1a] border border-[#222] px-4 py-2.5">
        <SystemHealth row={status?.lastRow ?? null} />
      </div>
    </div>
  );
}
export { CardShell };