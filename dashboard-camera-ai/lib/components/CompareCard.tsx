"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompareResponse } from "@/lib/api";

interface CompareStat {
  in: number;
  out: number;
}

interface CompareData {
  today: { in: number; out: number };
  yesterday: CompareStat;
  lastWeek: CompareStat;
  avg7days: CompareStat;
}

export function CompareCard() {
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/compare");
        if (!res.ok) throw new Error("Failed to fetch");
        const data: CompareResponse = await res.json();
        if (mounted) {
          setCompareData(data);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    fetchData();

    // Poll every 60 seconds
    const interval = setInterval(fetchData, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading || !compareData) {
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
    { label: "เมื่อวาน", stat: compareData.yesterday },
    { label: "สัปดาห์ก่อน", stat: compareData.lastWeek },
    { label: "เฉลี่ย 7 วัน", stat: compareData.avg7days },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-gray-200">
          เทียบกับวันอื่น
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 text-xs w-full text-gray-500 border-b border-[#2a2a2a] pb-2">
          <span />
          <span className="text-center">เข้า</span>
          <span className="text-center">ออก</span>
        </div>

        <div className="grid grid-cols-3 text-sm text-gray-200 w-full mt-4">
          <span className="text-gray-300 font-medium">วันนี้</span>
          <span className="text-center text-blue-400 font-semibold">
            {compareData.today.in}
          </span>
          <span className="text-center text-purple-400 font-semibold">
            {compareData.today.out}
          </span>
        </div>

        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-3 text-md text-gray-400 mt-4"
          >
            <span>{r.label}</span>
            <span className="text-center">{r.stat.in}</span>
            <span className="text-center">{r.stat.out}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
