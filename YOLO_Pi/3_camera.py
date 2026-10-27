"""Step 3 — run a model on the camera (live) or a recorded clip: detect + track people, RECORD how well it did, and
(with --zones) COUNT the people in the area.

Sources: a USB webcam if one is plugged in (found by itself, also on a Pi), else the Pi camera, else webcam 0;
a clip from 2_record_clip.py, rtsp:// or tcp://.
Every run is logged (numbers only, no pictures unless --save-video):
    metrics/<machine>/camera/<run>/frames.csv   one row per frame: people, confidence, ms, CPU temp (not with
                                                --no-frame-log, which the 24/7 service uses)
    metrics/<machine>/camera/<run>/summary.md   FPS, latency, people per frame, unique people, track stability
    metrics/<machine>/camera/runs.csv           one row per run -> compare models / sizes on the same clip
Counting (--zones = zones.json from 4_set_zones.py, or --line / --zone):
    data/<date>.csv          one row per minute: in / out across the line, people in the zone, new visitors
    data/test_<clip>.csv     the same for a clip (minutes of video time), never mixed with the live data
    MQTT pi5/people/count    the same row every minute (with --mqtt), online / offline on pi5/status/people
    MQTT pi5/people/live     every second: people in the zone now + today's totals so far (not stored)
                             + people in the frame, their mean score, fps and model (dashboard "การตรวจจับของโมเดล")
    MQTT pi5/people/frame    5 times a second: the picture with the model's boxes, line and zone (--frames off = none)
    Supabase minute_counts   the same row every minute (live camera, when YOLO_Pi/.env has the Supabase settings)
A live camera has no labels, so detection accuracy is measured by 1_eval.py. For a clip, count yourself and pass
--true-count (different people) or --true-in / --true-out (line crossings): the summary shows the error.

Usage:
    python 3_camera.py                                        # live, window (q = quit)
    python 3_camera.py --no-show --seconds 60                 # live 60 s without a window (over SSH)
    python 3_camera.py --source clips/corridor.mp4 --true-count 4
    python 3_camera.py --source clips/corridor.mp4 --zones --true-in 3 --true-out 1
    python 3_camera.py --zones                                # live counting with a window (line, zone, counters)
    python 3_camera.py --zones --mqtt --no-show --no-frame-log --every 0      # = bash run.sh count (the service)
Frames are only displayed; video is saved only with --save-video (people must agree: PDPA).
"""

import argparse
import csv
import json
import os
import signal
import time
from collections import Counter, deque
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

from common import (METRICS, MODEL_NAMES, PERSON, RESULTS, ROOT, WEBCAM_HINT, PictureWatch, cpu_temp,
                    default_source, host, load_env, ncnn_model, picamera_frames, pick_model, write_csv)
from counting import (COUNT_CONF, FRAME_SECONDS, HOLD_CONF, LINE_BGR, LIVE_SECONDS, ZONES_FILE, AreaCounter, MinuteLog,
                      MqttOut, SettingsSync, SupabaseOut, anchor_points, draw_counts, draw_zones, frame_jpeg,
                      make_zones, settings_zones)
from door import DoorFinder

GOLD_BGR = (76, 168, 201)
TRACK_CONF = 0.1  # Ultralytics' tracking default: low-score boxes keep tracks of partly hidden people alive
STABLE_SECONDS = 1.0  # a person tracked for less than this is counted as a "flicker" (unstable or false detection)


def clip_fps(source: str) -> float:
    """Frame rate stored in a video file (0 for a live camera / stream)."""
    if not Path(source).is_file():
        return 0.0
    cap = cv2.VideoCapture(source)
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    cap.release()
    return fps


def clip_frames(source: str) -> int:
    """Number of frames in a video file (0 for a live camera / stream)."""
    if not Path(source).is_file():
        return 0
    cap = cv2.VideoCapture(source)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    return n


class RunStats:
    """Running totals for summary.md. Nothing grows with the length of the run, so the service can run for months."""

    def __init__(self):
        self.frames = self.with_people = self.people_sum = self.people_max = 0
        self.conf_sum = 0.0
        self.warmup, self.ms = [], deque(maxlen=10_000)  # latency of the first 5 frames / of the latest frames
        self.temp_max = None
        self.tracks = {}  # track id -> [frames seen, last frame]
        self.lengths = Counter()  # tracks that are gone: frames seen -> how many tracks
        self.counts = Counter()  # in / out / visitors over the whole run
        self.zone_sum = self.zone_max = 0

    def add(self, ids: list[int], conf: list[float], ms: float, temp: str, counts: dict | None) -> None:
        self.frames += 1
        n = len(ids)
        self.with_people += n > 0
        self.people_sum += n
        self.people_max = max(self.people_max, n)
        self.conf_sum += sum(conf) / n if n else 0.0
        (self.ms if self.frames > 5 else self.warmup).append(ms)
        if temp:
            self.temp_max = max(self.temp_max or 0.0, float(temp))
        for tid in ids:
            seen = self.tracks.setdefault(tid, [0, 0])
            seen[0] += 1
            seen[1] = self.frames
        if self.frames % 300 == 0:
            self._retire(lambda last: self.frames - last > 300)
        if counts:
            self.counts.update({k: counts[k] for k in ("in", "out", "visitors")})
            self.zone_sum += counts["in_zone"]
            self.zone_max = max(self.zone_max, counts["in_zone"])

    def _retire(self, gone) -> None:
        for tid in [t for t, (_, last) in self.tracks.items() if gone(last)]:
            self.lengths[self.tracks.pop(tid)[0]] += 1

    def unique_so_far(self) -> int:
        return len(self.tracks) + sum(self.lengths.values())

    def unique_people(self, stable_frames: int) -> tuple[int, int]:
        """(all tracks, tracks seen for at least stable_frames frames)"""
        self._retire(lambda last: True)
        return sum(self.lengths.values()), sum(c for n, c in self.lengths.items() if n >= stable_frames)


def summarize(args, weights: Path, source: str, stats: RunStats, elapsed: float, zones: dict | None,
              minutes: MinuteLog | None) -> dict:
    n = stats.frames
    fps = n / elapsed if elapsed else 0.0
    # "stable" = seen for >= 1 s of VIDEO time: a clip's own frame rate, or the live processing rate for a camera
    video_fps = clip_fps(source) or fps
    ms = sorted(stats.ms or stats.warmup)
    total, stable = stats.unique_people(max(1, round(STABLE_SECONDS * video_fps)))
    s = {
        "source": source, "model": weights.name, "imgsz": args.imgsz, "conf": args.conf,
        "frames": n, "video_fps": round(video_fps, 1), "seconds": round(elapsed, 1), "FPS": round(fps, 1),
        "ms_per_frame_median": round(ms[len(ms) // 2], 1) if ms else "",
        "ms_per_frame_p95": round(ms[int(0.95 * (len(ms) - 1))], 1) if ms else "",
        "frames_with_people_%": round(100 * stats.with_people / n, 1),
        "people_per_frame_avg": round(stats.people_sum / n, 2),
        "people_per_frame_max": stats.people_max,
        "mean_confidence": round(stats.conf_sum / stats.with_people, 3) if stats.with_people else "",
        "unique_people_all_tracks": total,
        "unique_people_stable": stable,
        "flicker_tracks": total - stable,
        "cpu_temp_max_C": stats.temp_max or "",
    }
    clip_total = clip_frames(source)
    whole = not clip_total or n >= clip_total - 1  # live camera, or the clip was played to the end
    if clip_total:
        s["clip_done_%"] = round(100 * min(n, clip_total) / clip_total, 1)
    # the true counts describe the whole clip: comparing them with a clip stopped early (q / Ctrl+C) is meaningless
    if args.true_count is not None and whole:
        s["true_count"] = args.true_count
        s["count_error_stable"] = stable - args.true_count
        s["count_error_all_tracks"] = total - args.true_count
    if zones:
        line = bool(zones.get("line"))
        s |= {"line_in": stats.counts["in"] if line else "", "line_out": stats.counts["out"] if line else "",
              "zone_avg": round(stats.zone_sum / n, 2), "zone_max": stats.zone_max,
              "visitors": stats.counts["visitors"], "minutes_file": str(minutes.file().relative_to(ROOT))}
        for d in ("in", "out"):
            true = getattr(args, f"true_{d}")
            if true is not None and line and whole:
                s[f"true_{d}"], s[f"error_{d}"] = true, stats.counts[d] - true
    return s


MEANING = {
    "video_fps": "เฟรมเรตของคลิป (กล้องสด = เท่ากับ FPS ที่ประมวลผลได้)",
    "FPS": "ภาพต่อวินาทีที่ประมวลผลได้จริง (≥ 10 พอสำหรับนับคนเดินผ่าน)",
    "ms_per_frame_median": "เวลาประมวลผลต่อเฟรม (ค่ากลาง)",
    "ms_per_frame_p95": "95% ของเฟรมเสร็จภายในเวลานี้ (ดูว่ามีกระตุกไหม)",
    "frames_with_people_%": "กี่ % ของเฟรมที่เจอคนอย่างน้อย 1 คน",
    "people_per_frame_avg": "จำนวนคนเฉลี่ยต่อเฟรม",
    "mean_confidence": "ความมั่นใจเฉลี่ยของกรอบคน (ต่ำ = ภาพยาก/มืด/ไกล)",
    "unique_people_all_tracks": "จำนวน ID ทั้งหมดที่ ByteTrack สร้าง",
    "unique_people_stable": f"ID ที่อยู่ในภาพ ≥ {STABLE_SECONDS:.0f} วินาที = ค่าประมาณจำนวนคนจริง",
    "flicker_tracks": "ID ที่โผล่สั้นๆ แล้วหาย (กรอบผิด หรือ ID ขาดแล้วเริ่มใหม่) — ยิ่งน้อยยิ่งนิ่ง",
    "cpu_temp_max_C": "อุณหภูมิ CPU สูงสุด (Pi 5: > 80 °C จะลดความเร็วเอง)",
    "clip_done_%": "กี่ % ของคลิปที่ประมวลผล (หยุดก่อนจบ = ไม่เทียบกับจำนวนจริง เพราะจำนวนจริงเป็นของทั้งคลิป)",
    "true_count": "จำนวนคนจริงในคลิป (คุณนับเอง)",
    "count_error_stable": "unique_people_stable − true_count (0 = นับถูก)",
    "count_error_all_tracks": "unique_people_all_tracks − true_count",
    "line_in": "คนที่เดินข้ามเส้นไปทางลูกศร IN (คนละครั้ง) + ตัวสำรอง: คนอยู่ฝั่ง IN ในโซนนิ่ง 5 วินาที "
               "ที่เส้นพลาดไป (ID หลุดตรงประตู / อยู่ในห้องก่อนตั้งเส้น)",
    "line_out": "คนที่เดินข้ามเส้นสวนทางลูกศร (คนละครั้ง)",
    "zone_avg": "จำนวนคนในโซนเฉลี่ยต่อเฟรม (ไม่ได้กำหนดโซน = ทั้งภาพ)",
    "zone_max": "จำนวนคนในโซนมากที่สุดในเฟรมเดียว",
    "visitors": "คนที่เข้ามาอยู่ในโซน (นับคนละครั้ง)",
    "minutes_file": "ไฟล์ข้อมูลรายนาทีของรอบนี้",
    "true_in": "จำนวนคนข้ามเส้นเข้าที่คุณนับเอง", "error_in": "line_in − true_in (0 = นับถูก)",
    "true_out": "จำนวนคนข้ามเส้นออกที่คุณนับเอง", "error_out": "line_out − true_out (0 = นับถูก)",
}


def write_run(run_dir: Path, summary: dict) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    lines = [f"# Camera run {run_dir.name} ({host()})", "", "| ค่า | ผล | ความหมาย |", "|---|---|---|"]
    lines += [f"| {k} | {v} | {MEANING.get(k, '')} |" for k, v in summary.items()]
    (run_dir / "summary.md").write_text("\n".join(lines) + "\n")

    runs_csv = run_dir.parent / "runs.csv"
    rows = []
    if runs_csv.is_file():
        with open(runs_csv, newline="") as f:
            rows = list(csv.DictReader(f))
    rows.append({"run": run_dir.name, **summary})
    write_csv(runs_csv, rows)


def show_minute(row: dict) -> None:
    line = "" if row["in"] is None else \
        f"  in {row['in']}  out {row['out']} (today {row['in_today']}/{row['out_today']})"
    print(f"{row['time'][11:16]}{line}  in zone avg {row['in_zone_avg']} max {row['in_zone_max']}  "
          f"visitors {row['visitors']} (today {row['visitors_today']})  fps {row['fps']}"
          + (f"  CPU {row['cpu_temp_c']} °C" if row["cpu_temp_c"] else ""), flush=True)


def stop(signum, frame):
    raise KeyboardInterrupt  # systemctl stop -> end like Ctrl+C: the last minute and the summary are still saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=None, help="picamera | webcam index (0) | video file | rtsp:// or tcp:// URL")
    ap.add_argument("--model", default="yolo26n", help=f"{' / '.join(MODEL_NAMES)} (NCNN) or a path to a model")
    ap.add_argument("--imgsz", type=int, default=640, help="320 = faster, 640 = finds smaller / farther people")
    ap.add_argument("--conf", type=float, default=TRACK_CONF,
                    help="lowest detection score passed to the tracker (keep 0.1: ByteTrack starts tracks only >= 0.25 "
                         "and uses the 0.1-0.25 boxes to follow partly hidden people)")
    ap.add_argument("--size", default="1280x720", help="Pi camera capture size WxH (same as in 4_set_zones.py)")
    ap.add_argument("--seconds", type=float, default=0, help="stop after N seconds (0 = until q / end of clip)")
    ap.add_argument("--true-count", type=int, default=None, help="different people really in the clip (you count)")
    ap.add_argument("--save-video", action="store_true", help="also save the annotated video")
    ap.add_argument("--every", type=float, default=5.0, help="print a status line every N seconds (0 = never)")
    ap.add_argument("--no-show", action="store_true", help="do not open a window")
    ap.add_argument("--no-frame-log", action="store_true", help="no frames.csv (for the 24/7 service)")
    count = ap.add_argument_group("counting (line / zone)")
    count.add_argument("--zones", nargs="?", const=str(ZONES_FILE), default=None,
                       help="count with zones.json from 4_set_zones.py (or another file); auto = nothing drawn yet: the "
                            "whole picture is the room, IN / OUT wait for a line set on the dashboard")
    count.add_argument("--door", choices=("on", "off"), default="on",
                       help="with no line: look for the door (door.py) to offer it on the dashboard as a starting line")
    count.add_argument("--count-conf", type=float, default=COUNT_CONF,
                       help="lowest box score counted as a person (the tracker still follows weaker boxes)")
    count.add_argument("--line", help="x1,y1,x2,y2 as fractions 0-1 of the frame (overrides zones.json; none = off)")
    count.add_argument("--zone", help="x1,y1,x2,y2,x3,y3,... fractions 0-1 (overrides zones.json; none = off)")
    count.add_argument("--anchor", choices=("bottom", "center"), help="point of the person box that is counted")
    count.add_argument("--camera", help="camera name in the data (default: from zones.json, else cam1)")
    count.add_argument("--true-in", type=int, default=None, help="line crossings IN you counted in the clip")
    count.add_argument("--true-out", type=int, default=None, help="line crossings OUT you counted in the clip")
    count.add_argument("--mqtt", nargs="?", const="localhost", default=None,
                       help="publish every minute to this MQTT broker (default localhost; off = no MQTT)")
    count.add_argument("--mqtt-port", type=int, default=1883)
    count.add_argument("--mqtt-topic", default="pi5/people/count")
    count.add_argument("--frames", choices=("on", "off"), default="on",
                       help="with --mqtt: send the picture with the boxes to pi5/people/frame 5 times a second "
                            "(dashboard card; off = a little less CPU)")
    count.add_argument("--supabase", choices=("on", "off"), default="on",
                       help="store every minute in Supabase when YOLO_Pi/.env has SUPABASE_URL + SUPABASE_SECRET_KEY "
                            "(live camera only, never a clip)")
    args = ap.parse_args()

    saved = json.loads(Path(args.zones).read_text()) if args.zones and Path(args.zones).is_file() else {}
    if saved.get("model") in MODEL_NAMES and ncnn_model(saved["model"], saved.get("imgsz")).exists():
        args.model, args.imgsz = saved["model"], saved["imgsz"]  # chosen on the dashboard (button "ตั้งค่าการนับ")
    weights = pick_model(args.model, args.imgsz)
    source = args.source or default_source()
    source_name = Path(source).stem if Path(source).exists() else source.replace("/", "_").replace(":", "")
    model_label = args.model if args.model in MODEL_NAMES else weights.stem
    run_name = f"{time.strftime('%Y%m%d_%H%M%S')}_{source_name}_{model_label}_{args.imgsz}"
    run_dir = METRICS / host() / "camera" / run_name
    print(f"model: {weights.name}   source: {source}   imgsz: {args.imgsz}   log: {run_dir}")

    zones = None
    if args.zones or args.line or args.zone:
        auto = args.zones == "auto"
        if args.zones and not auto and not Path(args.zones).is_file():
            raise SystemExit(f"{args.zones} not found - draw the line / zone first (bash run.sh 4) or use --zones auto")
        zones = make_zones(None if auto else args.zones, args.line, args.zone, args.anchor, args.camera)
        door_search = args.door == "on"  # a starting line to offer on the dashboard while no line is set
        print(f"counting: line {'on' if zones.get('line') else 'off (IN / OUT wait for a line set on the dashboard)'}"
              + f", zone {'on' if zones.get('zone') else 'off (= whole picture)'}, anchor {zones['anchor']}, "
              f"camera {zones['camera']}")
    mqtt = None
    if args.mqtt and args.mqtt.lower() not in ("off", "no", "none"):
        if zones is None:
            raise SystemExit("--mqtt sends the minute counts: add --zones (or --line / --zone)")
        try:
            mqtt = MqttOut(args.mqtt, args.mqtt_port, args.mqtt_topic, zones["camera"])
        except Exception as e:  # e.g. paho-mqtt not installed: keep counting, the minutes are still in data/*.csv
            print(f"WARNING: MQTT is off ({type(e).__name__}: {e}) - counting continues into data/*.csv"
                  + ("\n         install it: bash run.sh setup" if isinstance(e, ImportError) else ""))
    cloud = None
    env = load_env()
    if zones and args.supabase == "on" and env.get("SUPABASE_URL") and env.get("SUPABASE_SECRET_KEY"):
        if Path(source).is_file():  # a clip's minutes are video time, not real days: they stay in data/test_*.csv
            print("Supabase: off for a clip (only the live camera's minutes are stored)")
        else:
            cloud = SupabaseOut(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])

    door_finder = (DoorFinder(lambda door: zones.__setitem__("door", door), wanted=lambda: not zones.get("line"))
                   if zones and door_search else None)
    model = YOLO(weights, task="detect")
    track = dict(classes=[PERSON], conf=args.conf, imgsz=args.imgsz, tracker="bytetrack.yaml", verbose=False)
    if source == "picamera":
        width, height = map(int, args.size.lower().split("x"))
        results = (model.track(frame, persist=True, **track)[0] for frame in picamera_frames(width, height))
    else:
        results = model.track(source=int(source) if source.isdigit() else source, stream=True, **track)

    stats = RunStats()
    counter = AreaCounter(zones) if zones else None
    if counter and env.get("SUPABASE_URL") and env.get("SUPABASE_SECRET_KEY") and not Path(source).is_file():
        def use_settings(saved: dict) -> None:
            """Line / zone drawn on the dashboard: used from the next frame, kept in zones.json for a restart offline."""
            new = settings_zones(saved)
            zones["line"], zones["zone"] = new["line"], new["zone"]
            if new["anchor"]:
                zones["anchor"] = new["anchor"]
            counter.people.clear()  # sides of the old line mean nothing for the new one
            if new["model"]:
                zones["model"], zones["imgsz"] = new["model"], new["imgsz"]
            ZONES_FILE.write_text(json.dumps({k: zones.get(k) for k in ("camera", "anchor", "band", "line", "zone",
                                                                         "model", "imgsz")}, indent=2))
            print(f"settings from the dashboard: line {'on' if zones['line'] else 'off (IN / OUT not counted)'}, "
                  f"zone {'on' if zones['zone'] else 'off (= whole picture)'}", flush=True)
            if new["model"] and (new["model"], new["imgsz"]) != (args.model, args.imgsz):
                print(f"model from the dashboard: {new['model']} {new['imgsz']} - restarting to load it", flush=True)
                os.kill(os.getpid(), signal.SIGTERM)  # ends like systemctl stop; systemd (Restart=always) starts again
        SettingsSync(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"], zones["camera"], use_settings)
    model_name = weights.name.replace("_ncnn_model", "")
    minutes = MinuteLog(zones, model_name, source_name if Path(source).is_file() else None,
                        clip_fps(source), mqtt, cloud) if zones else None
    frame_file = frame_log = writer = None
    if not args.no_frame_log:
        run_dir.mkdir(parents=True, exist_ok=True)
        frame_file = open(run_dir / "frames.csv", "w", newline="")
        fields = ["frame", "time_s", "people", "tracked_ids", "mean_conf", "min_conf", "ms", "cpu_temp_C"]
        fields += ["in", "out", "in_zone", "in_room", "visitors"] if zones else []
        frame_log = csv.DictWriter(frame_file, fieldnames=fields)
        frame_log.writeheader()
    signal.signal(signal.SIGTERM, stop)
    start = last = time.time()
    last_live = last_frame = 0.0
    live_frames = 0  # stats.frames at the last live message: fps right now = frames since then / seconds since then
    send_frames = mqtt is not None and args.frames == "on"
    watch = PictureWatch() if source.isdigit() else None  # webcam unplugged -> stop, systemd restarts + finds it
    confirmed = set()  # track ids that scored >= --count-conf at least once
    try:
        for r in results:
            # only tracked boxes are people: when ByteTrack has no track yet, Ultralytics returns the raw boxes
            # (score >= 0.1, not confirmed) without ids -> they are not counted
            tracked = r.boxes is not None and r.boxes.id is not None
            if tracked:  # people = boxes scored >= --count-conf, or >= HOLD_CONF once their track was confirmed
                all_ids = r.boxes.id.int().tolist()
                confirmed.update(i for i, c in zip(all_ids, r.boxes.conf.tolist()) if c >= args.count_conf)
                held = r.boxes.conf.new_tensor([i in confirmed for i in all_ids]).bool()
                r = r[(r.boxes.conf >= args.count_conf) | (held & (r.boxes.conf >= HOLD_CONF))]
                if len(confirmed) > 1000:  # 24/7: keep only the tracks of this frame
                    confirmed &= set(all_ids)
            ids = r.boxes.id.int().tolist() if tracked else []
            conf = r.boxes.conf.tolist() if tracked else []
            xyxy = r.boxes.xyxy.cpu().numpy() if tracked else np.zeros((0, 4))
            now = time.time()
            if watch:
                watch.check(r.orig_img, now)
            if door_finder:
                door_finder.offer(r.orig_img)
            temp = cpu_temp() if stats.frames % 30 == 0 else ""
            ms = r.speed["preprocess"] + r.speed["inference"] + r.speed["postprocess"]
            counts = None
            if zones:
                h, w = r.orig_shape
                if stats.frames == 0 and zones.get("frame_size"):
                    zw, zh = zones["frame_size"]
                    if abs(zw / zh - w / h) > 0.02:
                        print(f"WARNING: zones.json was drawn on a {zw}x{zh} picture but the frames are {w}x{h}: "
                              "a different shape moves the line / zone -> same --size, or draw again (bash run.sh 4)")
                counts = counter.update(ids, xyxy, w, h, minutes.now(stats.frames).timestamp())
                row = minutes.add(stats.frames, counts)
                if row:
                    show_minute(row)
                if mqtt is not None and now - last_live >= LIVE_SECONDS:
                    fps = (stats.frames - live_frames) / (now - last_live) if last_live else stats.frames / (now - start)
                    mqtt.publish_live(minutes.live(stats.frames) | {
                        "people": len(ids), "conf": round(sum(conf) / len(conf), 2) if conf else None,
                        "fps": round(fps, 1), "model": model_name,
                        # line = IN / OUT at the line set on the dashboard, room = no line yet (in / out "-")
                        "mode": "line" if zones.get("line") else "room",
                        "door": zones.get("door")})  # found by door.py: offered as a starting line
                    last_live, live_frames = now, stats.frames
            stats.add(ids, conf, ms, temp, counts)
            if frame_log:
                frame_log.writerow({"frame": stats.frames, "time_s": round(now - start, 2), "people": len(ids),
                                    "tracked_ids": " ".join(map(str, ids)),
                                    "mean_conf": round(sum(conf) / len(conf), 3) if conf else 0.0,
                                    "min_conf": round(min(conf), 3) if conf else "", "ms": round(ms, 1),
                                    "cpu_temp_C": temp, **(counts or {})})

            if args.every and now - last >= args.every:
                counted = ""
                if zones:
                    counted = f"  in {stats.counts['in']} out {stats.counts['out']}" if zones.get("line") else ""
                    counted += f"  in zone {counts['in_zone']}  visitors {stats.counts['visitors']}"
                print(f"{time.strftime('%H:%M:%S')}  frame {stats.frames}  people in frame: {len(ids)}  "
                      f"unique so far: {stats.unique_so_far()}{counted}  fps: {stats.frames / (now - start):.1f}"
                      + (f"  CPU {stats.temp_max} °C" if stats.temp_max else ""), flush=True)
                last = now

            frame_due = send_frames and now - last_frame >= FRAME_SECONDS
            if not args.no_show or args.save_video or frame_due:
                picture = r.plot(img=draw_zones(r.orig_img.copy(), zones) if zones else None)
                if frame_due:  # the dashboard gets the clean picture: boxes + line / zone, its own numbers
                    mqtt.publish_frame(frame_jpeg(picture))
                    last_frame = now
                text = f"people: {len(ids)}   unique: {stats.unique_so_far()}"
                (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.9, 2)
                cv2.rectangle(picture, (4, 6), (tw + 18, th + 24), (62, 77, 27), -1)
                cv2.putText(picture, text, (10, th + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.9, GOLD_BGR, 2)
                if zones:
                    for x, y in anchor_points(xyxy, zones["anchor"]):  # the point of each person that is counted
                        cv2.circle(picture, (int(x), int(y)), 8, (0, 0, 0), -1)
                        cv2.circle(picture, (int(x), int(y)), 6, LINE_BGR, -1)
                    labels = {"IN": stats.counts["in"], "OUT": stats.counts["out"]} if zones.get("line") else {}
                    draw_counts(picture, labels | {"zone": counts["in_zone"], "visitors": stats.counts["visitors"]})
                if args.save_video:
                    if writer is None:
                        out = RESULTS / host() / "camera" / f"{run_name}.mp4"
                        out.parent.mkdir(parents=True, exist_ok=True)
                        writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"mp4v"), clip_fps(source) or 15,
                                                 (picture.shape[1], picture.shape[0]))
                    writer.write(picture)
                if not args.no_show:
                    cv2.imshow("YOLO_Pi person detection (q = quit)", picture)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
            if args.seconds and now - start >= args.seconds:
                break
    except KeyboardInterrupt:
        pass
    except (ConnectionError, RuntimeError) as e:
        hint = ("Pi camera: check the ribbon cable and test it with 'rpicam-hello'; if it is busy, another program "
                "uses it (the counting service? bash run.sh service stop)" if source == "picamera" else
                f"webcam: {WEBCAM_HINT}" if source.isdigit() else "check the file path / stream URL")
        raise SystemExit(f"cannot read source '{source}': {e}\n{hint}")
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        if minutes is not None and stats.frames:
            row = minutes.finish(stats.frames)
            if row:
                show_minute(row)
        if mqtt is not None:
            mqtt.close()
        if cloud is not None:
            cloud.close()
        if frame_file is not None:
            frame_file.close()
        if writer is not None:
            writer.release()
        if not args.no_show:
            cv2.destroyAllWindows()

    if not stats.frames:
        raise SystemExit("no frames were processed")
    summary = summarize(args, weights, source, stats, time.time() - start, zones, minutes)
    write_run(run_dir, summary)
    print(f"\ndone: {summary['frames']} frames in {summary['seconds']} s ({summary['FPS']} fps)  |  "
          f"unique people: {summary['unique_people_stable']} stable + {summary['flicker_tracks']} flicker"
          + (f"  |  true count {args.true_count} -> error {summary['count_error_stable']:+d}"
             if "count_error_stable" in summary else ""))
    if summary.get("clip_done_%", 100) < 100 and any(v is not None for v in (args.true_count, args.true_in,
                                                                            args.true_out)):
        print(f"stopped at {summary['clip_done_%']}% of the clip: the true counts are for the whole clip, "
              "so no error is computed - let it play to the end")
    if zones:
        print("counted: " + (f"in {summary['line_in']}  out {summary['line_out']}  " if zones.get("line") else "")
              + f"visitors {summary['visitors']}  in zone avg {summary['zone_avg']} max {summary['zone_max']}"
              + "".join(f"  |  true {d} {summary[f'true_{d}']} -> error {summary[f'error_{d}']:+d}"
                        for d in ("in", "out") if f"true_{d}" in summary)
              + f"\nminutes -> {summary['minutes_file']}")
    print(f"log -> {run_dir}/summary.md   (all runs: {run_dir.parent / 'runs.csv'})")


if __name__ == "__main__":
    main()
