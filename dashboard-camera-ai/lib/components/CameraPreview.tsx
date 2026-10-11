// ============================================================
// CameraPreview — รูปนิ่ง zones_preview.jpg (เบลอคนแล้ว + เส้นโซน)
// ============================================================
"use client";

import { useState } from "react";
import { cameraPreviewUrl } from "@/lib/api";

export function CameraPreview() {
  const [error, setError] = useState(false);
  const src = cameraPreviewUrl();

  return (
    <div className="rounded-xl bg-[#1e1e1e]  overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <h3 className="text-sm font-medium text-gray-200">ภาพอ้างอิงมุมกล้อง</h3>
        <p className="text-xs text-gray-500 mt-0.5">zones_preview.jpg — คนถูกเบลอแล้ว</p>
      </div>
      <div className="p-3">
        {error ? (
          <div className="flex h-40 items-center justify-center text-gray-600 text-sm">
            ยังไม่มีรูปอ้างอิง (รัน{" "}
            <code className="mx-1 font-mono text-xs bg-[#2a2a2a] px-1 rounded">
              bash run.sh 4
            </code>{" "}
            บน Pi ก่อน)
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="มุมกล้องพร้อมเส้นและโซน"
            className="w-full rounded object-contain max-h-56"
            onError={() => setError(true)}
          />
        )}
      </div>
    </div>
  );
}
