// ============================================================
// ZoneEditor — ตั้งค่าการนับบน dashboard: วาดเส้นเข้า/ออก (2 คลิก) และโซนห้อง (คลิกมุม) บนภาพกล้องสด
// บันทึก = Supabase camera_settings (POST /stats/zones) → ตัวนับบน Pi ใช้ภายใน 30 วินาที ไม่ต้อง ssh
// จุดเก็บเป็นสัดส่วน 0-1 ของภาพ (เหมือน YOLO_Pi/zones.json) · ไม่มีเส้น = ไม่นับเข้า/ออก ("—") · ไม่มีโซน = ทั้งภาพ
// ประตูที่ AI หาเจอแค่ "เสนอ" เป็นเส้นเริ่มต้น (กรอบประ) ให้ขยับเองก่อนบันทึก — ตัวนับไม่เดาเอง
// ============================================================
"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Check,
  Eraser,
  Footprints,
  Hexagon,
  MoveDiagonal,
  PenLine,
  PersonStanding,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  fetchCountSettings,
  saveCountSettings,
  type CountSettings,
} from "@/lib/api";
import type { Detection } from "@/lib/hooks/useSseToday";
import type { Frame } from "@/lib/hooks/useSocketSync";
import { Button } from "@/components/ui/button";
import { cn } from "../utils";

type Pt = number[];
type Tool = "line" | "zone";

interface Props {
  frame: Frame | null;
  detection: Detection | null | undefined;
  onClose: () => void;
}

/** ปุ่มเครื่องมือ: ไอคอน + ข้อความ ขนาดกดง่าย */
function ToolButton({
  icon,
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "ai" | "danger";
}) {
  const color = {
    default: "border-[#3a3a3a] bg-[#242424] text-gray-100 hover:bg-[#2e2e2e]",
    ai: "border-green-600/60 bg-green-600/10 text-green-200 hover:bg-green-600/20",
    danger: "border-red-500/40 bg-transparent text-red-300 hover:bg-red-500/10",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${color}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** แท็บขั้นตอน (เส้น / โซน) หรือตัวเลือกจุดนับ: เลือกอยู่ = กรอบฟ้า */
function Choice({
  active,
  icon,
  title,
  note,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  note: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-auto flex-1 justify-start gap-3 rounded-lg border p-5 text-left whitespace-normal transition-colors",
        active
          ? "border-blue-500 bg-blue-500/15 hover:bg-blue-500/20 dark:border-blue-500 dark:bg-blue-500/15 dark:hover:bg-blue-500/20"
          : "border-[#333] bg-[#202020] hover:bg-[#282828] dark:border-[#333] dark:bg-[#202020] dark:hover:bg-[#282828]",
      )}
    >
      <span className={active ? "text-blue-300" : "text-gray-400"}>{icon}</span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-medium",
            active ? "text-white" : "text-gray-200",
          )}
        >
          {title}
        </span>
        <span className="block text-xs text-gray-400">{note}</span>
      </span>
    </Button>
  );
}

/** ยืดเส้น a→b ให้ไปชนขอบภาพทั้งสองด้าน (ทิศเดิม → ฝั่ง "เข้า" ไม่เปลี่ยน): ไม่มีใครเดินอ้อมปลายเส้นได้ */
function extendToEdges([a, b]: Pt[]): Pt[] {
  const d = [b[0] - a[0], b[1] - a[1]];
  let lo = -Infinity;
  let hi = Infinity;
  for (const k of [0, 1]) {
    if (Math.abs(d[k]) < 1e-9) continue;
    const t0 = (0 - a[k]) / d[k];
    const t1 = (1 - a[k]) / d[k];
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  const at = (t: number) =>
    [0, 1].map(
      (k) =>
        Math.round(Math.min(1, Math.max(0, a[k] + t * d[k])) * 1000) / 1000,
    );
  return [at(lo), at(hi)];
}

export function ZoneEditor({ frame, detection, onClose }: Props) {
  const [size, setSize] = useState({ w: 16, h: 9 }); // ขนาดภาพที่แสดง (px) สำหรับคำนวณลูกศรให้ตั้งฉากจริง
  const [tool, setTool] = useState<Tool>("line");
  const [line, setLine] = useState<Pt[]>([]);
  const [zone, setZone] = useState<Pt[]>([]);
  const [anchor, setAnchor] = useState<CountSettings["anchor"]>("bottom");
  const [state, setState] = useState<
    "loading" | "ready" | "saving" | "saved" | "error"
  >("loading");
  const [dirty, setDirty] = useState(false); // มีการแก้ที่ยังไม่ได้บันทึก
  const edit = () => {
    setDirty(true);
    setState("ready");
  };

  useEffect(() => {
    let mounted = true;
    fetchCountSettings()
      .then(({ zones }) => {
        if (!mounted) return;
        setLine(zones?.line ?? []);
        setZone(zones?.zone ?? []);
        setAnchor(zones?.anchor ?? "bottom");
        setState("ready");
      })
      .catch(() => mounted && setState("error"));
    return () => {
      mounted = false;
    };
  }, []);

  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    const p = [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ].map((v) => Math.round(v * 1000) / 1000);
    if (tool === "line")
      setLine((l) => (l.length >= 2 ? [p] : [...l, p])); // คลิกที่ 3 = เริ่มเส้นใหม่
    else setZone((z) => [...z, p]);
    edit();
  };

  // ประตูที่ AI หาเจอ → เส้นที่ขอบล่างประตู, ลูกศรชี้ลง (เข้าหากล้อง) = เข้า
  const door = detection?.door?.box;
  const useDoor = () => {
    if (!door) return;
    setLine([
      [door[0], door[3]],
      [door[2], door[3]],
    ]);
    setTool("line");
    edit();
  };

  const save = async (settings: CountSettings) => {
    setState("saving");
    try {
      await saveCountSettings(settings);
      setLine(settings.line ?? []);
      setZone(settings.zone ?? []);
      setDirty(false);
      setState("saved");
    } catch {
      setState("error");
    }
  };

  // ลูกศรฝั่ง "เข้า": ตั้งฉากกับเส้นไปทาง side() > 0 แบบเดียวกับ draw_zones ใน YOLO_Pi/counting.py
  let arrow: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (line.length === 2) {
    const [a, b] = line.map(([x, y]) => [x * size.w, y * size.h]);
    const d = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(d[0], d[1]) || 1;
    const n = [-d[1] / len, d[0] / len];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const reach = Math.max(30, 0.1 * Math.min(size.w, size.h));
    arrow = {
      x1: mid[0] / size.w,
      y1: mid[1] / size.h,
      x2: (mid[0] + n[0] * reach) / size.w,
      y2: (mid[1] + n[1] * reach) / size.h,
    };
  }

  const status = {
    loading: "กำลังโหลดค่าที่ตั้งไว้…",
    ready: dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : "",
    saving: "กำลังบันทึก…",
    saved: "บันทึกแล้ว · ตัวนับบน Raspberry Pi จะใช้ค่านี้ภายใน 30 วินาที",
    error:
      "บันทึกหรือโหลดไม่ได้ (ต้องตั้ง SUPABASE_URL / SUPABASE_SECRET_KEY บน Vercel)",
  }[state];
  const busy = state === "saving" || state === "loading";
  const canSave =
    !busy && line.length !== 1 && !(zone.length > 0 && zone.length < 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-full overflow-auto rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-100">
            ตั้งค่าการนับ
          </h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* ขั้นตอน: 1 เส้น (จำเป็นสำหรับเข้า/ออก) · 2 โซน (ไม่บังคับ) */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Choice
            active={tool === "line"}
            onClick={() => setTool("line")}
            icon={<PenLine size={20} />}
            title="1. เส้นเข้า/ออก"
            note={
              line.length === 2 ? (
                <span className="text-green-400">ตั้งแล้ว ✓</span>
              ) : (
                "ยังไม่มีเส้น · เข้า/ออก = —"
              )
            }
          />
          <Choice
            active={tool === "zone"}
            onClick={() => setTool("zone")}
            icon={<Hexagon size={20} />}
            title="2. โซนห้อง (ไม่บังคับ)"
            note={
              zone.length >= 3 ? (
                <span className="text-green-400">{zone.length} มุม ✓</span>
              ) : (
                "ไม่วาด = ทั้งภาพคือห้อง"
              )
            }
          />
        </div>

        <p className="rounded-lg bg-[#202020] px-3 py-2 text-sm text-gray-300">
          {tool === "line"
            ? "คลิกบนภาพ 2 จุด ขวางทางที่คนเดินผ่านประตู · คนเดินไปทางลูกศรเขียว = เข้า"
            : "คลิกมุมของพื้นที่ในห้องทีละจุด (อย่างน้อย 3 จุด) · คนนอกโซนไม่นับเป็นคนในห้อง"}
        </p>

        {/* ปุ่มของขั้นที่เลือก */}
        <div className="flex flex-wrap gap-2">
          {tool === "line" ? (
            <>
              <ToolButton
                icon={<ArrowLeftRight size={16} />}
                disabled={line.length !== 2}
                onClick={() => {
                  setLine(([a, b]) => [b, a]);
                  edit();
                }}
              >
                สลับฝั่งเข้า
              </ToolButton>
              <ToolButton
                icon={<MoveDiagonal size={16} />}
                disabled={line.length !== 2}
                onClick={() => {
                  setLine(extendToEdges);
                  edit();
                }}
              >
                ยืดเส้นให้สุดขอบภาพ
              </ToolButton>
              {door && (
                <ToolButton
                  tone="ai"
                  icon={<Sparkles size={16} />}
                  onClick={useDoor}
                >
                  AI เสนอเส้นที่ประตู ({detection?.door?.conf.toFixed(2)})
                </ToolButton>
              )}
              <ToolButton
                tone="danger"
                icon={<Eraser size={16} />}
                disabled={line.length === 0}
                onClick={() => {
                  setLine([]);
                  edit();
                }}
              >
                ล้างเส้น
              </ToolButton>
            </>
          ) : (
            <ToolButton
              tone="danger"
              icon={<Eraser size={16} />}
              disabled={zone.length === 0}
              onClick={() => {
                setZone([]);
                edit();
              }}
            >
              ล้างโซน (ใช้ทั้งภาพ)
            </ToolButton>
          )}
        </div>

        <div
          onClick={click}
          className="relative w-full cursor-crosshair select-none overflow-hidden rounded-lg bg-[#111]"
        >
          {frame ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: URL ของภาพสดจาก socket
            <img
              src={frame.url}
              alt="ภาพจากกล้องสำหรับวาดเส้นและโซน"
              className="block w-full h-auto"
              draggable={false}
              onLoad={(e) =>
                setSize({
                  w: e.currentTarget.clientWidth,
                  h: e.currentTarget.clientHeight,
                })
              }
            />
          ) : (
            <div className="aspect-video flex items-center justify-center text-sm text-gray-400">
              ยังไม่มีภาพจากกล้อง — วาดได้ แต่จะไม่เห็นห้อง
            </div>
          )}
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {door && (
              <rect
                x={door[0]}
                y={door[1]}
                width={door[2] - door[0]}
                height={door[3] - door[1]}
                fill="none"
                stroke="#50c850"
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {zone.length > 0 && (
              <polygon
                points={zone.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="rgba(0,200,255,0.15)"
                stroke="#00c8ff"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {line.length > 0 && (
              <polyline
                points={line.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="#ffd700"
                strokeWidth={4}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {arrow && (
              <line
                x1={arrow.x1}
                y1={arrow.y1}
                x2={arrow.x2}
                y2={arrow.y2}
                stroke="#50c850"
                strokeWidth={4}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {/* จุดที่คลิก + หัวลูกศร "เข้า" เป็น HTML (วงกลมใน SVG ที่ยืดตามภาพจะเบี้ยว) */}
          {[...line, ...zone].map(([x, y], i) => (
            <span
              key={i}
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black bg-white"
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            />
          ))}
          {arrow && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-green-600 px-1.5 text-xs font-semibold text-white"
              style={{ left: `${arrow.x2 * 100}%`, top: `${arrow.y2 * 100}%` }}
            >
              เข้า
            </span>
          )}
        </div>

        {/* จุดของคนที่ใช้นับ */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-200">จุดของคนที่ใช้นับ</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice
              active={anchor === "bottom"}
              onClick={() => {
                setAnchor("bottom");
                edit();
              }}
              icon={<Footprints size={20} />}
              title="นับที่เท้า"
              note="กล้องติดสูง มองเฉียงลง เห็นเท้า"
            />
            <Choice
              active={anchor === "center"}
              onClick={() => {
                setAnchor("center");
                edit();
              }}
              icon={<PersonStanding size={20} />}
              title="นับที่กลางตัว"
              note="กล้องต่ำ / มีโต๊ะหรือเก้าอี้บังขา"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2a2a2a] pt-4">
          <p
            className={`text-sm ${
              state === "error"
                ? "text-red-400"
                : state === "saved"
                  ? "text-green-400"
                  : dirty
                    ? "text-yellow-400"
                    : "text-gray-400"
            }`}
          >
            {status ||
              (line.length === 2
                ? "นับเข้า/ออกที่เส้นนี้"
                : "ยังไม่มีเส้น = ไม่นับเข้า/ออก (—) · นับเฉพาะคนในห้อง")}
          </p>
          <div className="flex gap-2">
            <ToolButton
              tone="danger"
              icon={<Trash2 size={16} />}
              disabled={busy || (line.length === 0 && zone.length === 0)}
              onClick={() => {
                setLine([]);
                setZone([]);
                edit();
              }}
            >
              ล้างทั้งหมด
            </ToolButton>

            <Button
              disabled={!canSave}
              onClick={() =>
                save({
                  line: line.length === 2 ? line : null,
                  zone: zone.length >= 3 ? zone : null,
                  anchor,
                })
              }
              className="bg-blue-600 p-5 text-white hover:bg-blue-500 "
            >
              {state === "saved" && !dirty ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {state === "saving" ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
