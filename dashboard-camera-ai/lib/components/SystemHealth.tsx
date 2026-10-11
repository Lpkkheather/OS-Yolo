import type { MinuteRow } from "@/lib/types/api";

interface Props {
  row: MinuteRow | null;
}

export function SystemHealth({ row }: Props) {
  if (!row) {
    return (
      <div className="flex gap-4 flex-wrap text-xs text-gray-600 px-1">
        <span>FPS: —</span>
        <span>CPU: —</span>
        <span>Model: —</span>
        <span>Camera: —</span>
      </div>
    );
  }

  const fps = row.fps != null ? row.fps.toFixed(1) : "—";
  const temp = row.cpu_temp_c != null ? `${row.cpu_temp_c.toFixed(1)} °C` : "—";
  const tempColor =
    row.cpu_temp_c != null && row.cpu_temp_c > 75
      ? "text-red-400"
      : row.cpu_temp_c != null && row.cpu_temp_c > 65
        ? "text-yellow-400"
        : "text-gray-400";

  return (
    <div className="flex gap-5 flex-wrap text-xs px-1">
      <span className="text-gray-500">
        FPS:{" "}
        <span
          className={
            row.fps != null && row.fps < 8 ? "text-red-400" : "text-gray-300"
          }
        >
          {fps}
        </span>
      </span>
      <span className="text-gray-500">
        CPU: <span className={tempColor}>{temp}</span>
      </span>
      <span className="text-gray-500">
        Model: <span className="text-gray-300">{row.model || "—"}</span>
      </span>
      <span className="text-gray-500">
        Camera: <span className="text-gray-300">{row.camera || "—"}</span>
      </span>
    </div>
  );
}
