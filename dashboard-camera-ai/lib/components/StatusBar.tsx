// แถบด้านบนแสดงวันและเวลาปัจจุบันเท่านั้น
"use client";

import { useEffect, useState } from "react";

export function StatusBar() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const nowStr = now
    ? now.toLocaleString("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Bangkok",
      })
    : "--";

  return (
    <div className="flex items-center rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] px-4 py-2 text-sm">
      <span className="text-gray-300 font-mono">{nowStr}</span>
    </div>
  );
}
