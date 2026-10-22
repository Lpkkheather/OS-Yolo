"""Counting people in an area from tracked boxes: a LINE (people crossing it: in / out) and a ZONE (people inside it).

zones.json (made with 4_set_zones.py; points are 0-1 of the frame width / height, so any resolution works):
    {"camera": "cam1", "anchor": "bottom", "band": 0.02, "frame_size": [1280, 720],
     "line": [[0.50, 0.10], [0.50, 0.90]],                       # optional; IN = crossing towards the arrow side
     "zone": [[0.2, 0.3], [0.8, 0.3], [0.8, 0.9], [0.2, 0.9]]}    # optional; no zone = the whole frame
anchor "bottom" = the feet (bottom-centre of the box: camera looking at people from the side or from above at an
angle); "center" = the middle of the box (camera looking straight down).
band = a strip of +-2% of the frame height around the line: a person must leave it on the other side to be counted,
so someone standing on the line and swaying is not counted again and again.

Every minute one row goes to data/<date>.csv (live camera) or data/test_<clip>.csv (clip), and with MQTT the same
record is published (retained) to pi5/people/count. The service also reports online / offline on pi5/status/people.
Between the minutes, every second, pi5/people/live gets the counts right now (people in the zone, today's totals so
far) so the dashboard does not wait up to a minute; these are not stored (the minutes in the CSV are the history).
Every second pi5/people/frame also gets the picture with the model's boxes, line and zone (a small JPEG) for the
dashboard card "การตรวจจับของโมเดล" (3_camera.py --frames off = not sent).
With SUPABASE_URL + SUPABASE_SECRET_KEY in YOLO_Pi/.env each minute of the live camera is also stored in the Supabase
table minute_counts (supabase/schema.sql), so the dashboard can run anywhere and the history survives the SD card.
"""

from collections import deque
import csv
import json
from datetime import datetime, timedelta
from pathlib import Path
import queue
import threading
import time
import urllib.error
import urllib.request

import cv2
import numpy as np

from common import ROOT, cpu_temp, host

ZONES_FILE = ROOT / "zones.json"
DATA = ROOT / "data"
FIELDS = ["time", "seconds", "camera", "in", "out", "in_zone_avg", "in_zone_max", "visitors",
          "in_today", "out_today", "visitors_today", "fps", "cpu_temp_c", "model"]
LINE_BGR, ZONE_BGR, IN_BGR = (0, 215, 255), (255, 200, 0), (80, 200, 80)
FORGET_FRAMES = 300  # a track not seen for this many frames is forgotten (ByteTrack drops it after 30 anyway)
VISITOR_SECONDS = 1.0  # time inside the zone before a person counts as a visitor: filters false boxes and the
#                        short-lived ids of the tracker ("flicker"), same rule as unique_people_stable in 3_camera.py
MQTT_TOPIC, STATUS_TOPIC, LIVE_TOPIC = "pi5/people/count", "pi5/status/people", "pi5/people/live"
LIVE_SECONDS = 1.0  # how often the counts right now go to LIVE_TOPIC
LIVE_WINDOW = 2.0  # "people in the zone now" = median of the frames of the last N seconds: one missed or false box
#                     does not make the number jump, a real change shows after ~1 s
FRAME_TOPIC = "pi5/people/frame"
# the picture for the dashboard: 5 per second, 480 px wide (~10 KB each: about 50 KB/s, also through Tailscale Funnel)
FRAME_SECONDS, FRAME_WIDTH, FRAME_QUALITY = 0.2, 480, 60
#   JPEG (~30-60 KB); drawing + encoding it once a second costs the counting almost nothing
SUPABASE_TABLE = "minute_counts"
SUPABASE_RETRY = 60.0  # seconds between tries while Supabase cannot be reached
SUPABASE_KEEP = 1440  # minutes kept in memory while offline (1 day); older ones are still in data/*.csv
INT_FIELDS = ("seconds", "in", "out", "in_zone_max", "visitors", "in_today", "out_today", "visitors_today")
FLOAT_FIELDS = ("in_zone_avg", "fps", "cpu_temp_c")


def parse_points(text: str, name: str) -> list[list[float]]:
    """'x1,y1,x2,y2,...' (0-1 of the frame) -> [[x1, y1], [x2, y2], ...]"""
    values = [float(v) for v in text.replace(" ", "").split(",") if v]
    if len(values) % 2 or not all(0 <= v <= 1 for v in values):
        raise SystemExit(f"--{name}: give x,y pairs between 0 and 1 (fractions of the frame), e.g. 0.5,0.1,0.5,0.9")
    return [values[i:i + 2] for i in range(0, len(values), 2)]


def make_zones(path: Path | None = None, line: str | None = None, zone: str | None = None,
               anchor: str | None = None, camera: str | None = None) -> dict:
    """zones.json (if given) with --line / --zone / --anchor / --camera on top ("none" removes the line / zone)."""
    zones = json.loads(Path(path).read_text()) if path else {}
    for name, text in (("line", line), ("zone", zone)):
        if text:
            zones[name] = None if text.lower() == "none" else parse_points(text, name)
    if anchor:
        zones["anchor"] = anchor
    if camera:
        zones["camera"] = camera
    if zones.get("line") and len(zones["line"]) != 2:
        raise SystemExit("the line needs exactly 2 points")
    if zones.get("zone") and len(zones["zone"]) < 3:
        raise SystemExit("the zone needs at least 3 points")
    zones.setdefault("anchor", "bottom")
    zones.setdefault("camera", "cam1")
    zones.setdefault("band", 0.02)
    return zones


def to_pixels(points, w: int, h: int) -> np.ndarray:
    return np.array([[x * w, y * h] for x, y in points], dtype=np.float32)


def side(a, b, p) -> float:
    """> 0 on the IN (arrow) side of the line a->b, < 0 on the other side."""
    return float((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))


def crosses(p1, p2, a, b) -> bool:
    """True if the path p1->p2 crosses the line SEGMENT a-b (walking around its end does not count)."""
    return side(a, b, p1) * side(a, b, p2) < 0 and side(p1, p2, a) * side(p1, p2, b) < 0


def anchor_points(xyxy: np.ndarray, anchor: str) -> np.ndarray:
    x = (xyxy[:, 0] + xyxy[:, 2]) / 2
    y = xyxy[:, 3] if anchor == "bottom" else (xyxy[:, 1] + xyxy[:, 3]) / 2
    return np.stack([x, y], axis=1)


class AreaCounter:
    """Per frame: who crossed the line (each person at most once per direction) and who is inside the zone."""

    def __init__(self, zones: dict):
        self.zones = zones
        self.people = {}  # track id -> {"seen": frame, "point": last point clearly off the line, "side": +1/-1,
        #                  "counted": directions already counted, "zone_s": seconds in the zone, "visitor": counted}
        self.frame = 0
        self.last_t = None

    def update(self, ids: list[int], xyxy: np.ndarray, w: int, h: int, t: float) -> dict:
        """t = time of this frame in seconds (video time for a clip, clock for a live camera).
        Returns this frame's {"in": new IN crossings, "out": new OUT crossings, "in_zone": people in the zone now,
        "visitors": people who became visitors of the zone in this frame}."""
        self.frame += 1
        dt = 0.0 if self.last_t is None else min(max(t - self.last_t, 0.0), 0.5)  # a stall must not count as time
        self.last_t = t
        pts = anchor_points(xyxy, self.zones["anchor"]) if len(ids) else np.zeros((0, 2))
        out = {"in": 0, "out": 0, "in_zone": 0, "visitors": 0}
        line = to_pixels(self.zones["line"], w, h) if self.zones.get("line") else None
        zone = to_pixels(self.zones["zone"], w, h).reshape(-1, 1, 2) if self.zones.get("zone") else None
        for tid, p in zip(ids, pts):
            person = self.people.setdefault(tid, {"point": None, "side": 0, "counted": set(), "zone_s": 0.0,
                                                  "visitor": False})
            person["seen"] = self.frame
            if line is not None:
                a, b = line
                distance = side(a, b, p) / (np.hypot(*(b - a)) + 1e-9)  # pixels from the line, + = IN side
                if abs(distance) >= self.zones["band"] * h:  # clearly on one side
                    s = 1 if distance > 0 else -1
                    if person["side"] == -s and crosses(person["point"], p, a, b):
                        direction = "in" if s > 0 else "out"
                        if direction not in person["counted"]:
                            person["counted"].add(direction)
                            out[direction] += 1
                    person["point"], person["side"] = p, s
            inside = zone is None or cv2.pointPolygonTest(zone, (float(p[0]), float(p[1])), False) >= 0
            if inside:
                out["in_zone"] += 1
                person["zone_s"] += dt
                if not person["visitor"] and person["zone_s"] >= VISITOR_SECONDS:
                    person["visitor"] = True
                    out["visitors"] += 1
        if self.frame % 100 == 0:  # forget people who left long ago, so memory does not grow on a 24/7 run
            self.people = {t: v for t, v in self.people.items() if self.frame - v["seen"] < FORGET_FRAMES}
        return out


def draw_zones(img: np.ndarray, zones: dict) -> np.ndarray:
    """Zone (transparent fill) and line with an arrow to the IN side."""
    h, w = img.shape[:2]
    if zones.get("zone"):
        poly = to_pixels(zones["zone"], w, h).astype(np.int32)
        overlay = img.copy()
        cv2.fillPoly(overlay, [poly], ZONE_BGR)
        img = cv2.addWeighted(overlay, 0.18, img, 0.82, 0)
        cv2.polylines(img, [poly], True, ZONE_BGR, 2)
    if zones.get("line"):
        a, b = to_pixels(zones["line"], w, h)
        cv2.line(img, tuple(map(int, a)), tuple(map(int, b)), LINE_BGR, 3)
        mid, d = (a + b) / 2, b - a
        normal = np.array([-d[1], d[0]]) / (np.hypot(*d) + 1e-9)  # points to the IN side (side() > 0)
        tip = mid + normal * max(40, 0.08 * min(w, h))
        cv2.arrowedLine(img, tuple(map(int, mid)), tuple(map(int, tip)), IN_BGR, 3, tipLength=0.35)
        cv2.putText(img, "IN", tuple(map(int, tip + normal * 22 - [14, -8])), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    IN_BGR, 2)
    return img


def draw_counts(img: np.ndarray, labels: dict) -> np.ndarray:
    """Counters, e.g. {"IN": 3, "OUT": 1}, in a box in the top-right corner."""
    w = img.shape[1]
    text = "   ".join(f"{k} {v}" for k, v in labels.items())
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)
    cv2.rectangle(img, (w - tw - 20, 8), (w - 6, th + 26), (62, 77, 27), -1)
    cv2.putText(img, text, (w - tw - 12, th + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (245, 240, 232), 2)
    return img


class MinuteLog:
    """Adds up the counts of each minute; writes one CSV row per minute and publishes it with MQTT (optional).

    Live camera: minutes follow the clock; rows go to data/<YYYY-MM-DD>.csv; the *_today totals continue after a
    restart. Clip: minutes follow the video time from 0; rows go to data/test_<clip>.csv (never mixed with live data).
    time = start of the minute, seconds = how much of that minute was counted (< 60 for the first / last minute).
    """

    def __init__(self, zones: dict, model: str, clip: str | None, video_fps: float, mqtt=None, cloud=None):
        self.has_line = bool(zones.get("line"))
        self.camera, self.model, self.clip, self.video_fps, self.mqtt = zones["camera"], model, clip, video_fps, mqtt
        self.cloud = cloud  # SupabaseOut (live camera only)
        self.start = datetime.now().astimezone().replace(second=0, microsecond=0)
        self.bucket = self.day = None
        self.totals = {}
        self.acc = None
        self.recent = deque()  # (time, people in the zone) of the last LIVE_WINDOW seconds of frames
        DATA.mkdir(exist_ok=True)
        if clip is not None:
            (DATA / f"test_{clip}.csv").unlink(missing_ok=True)

    def now(self, frame_no: int) -> datetime:
        if self.clip is not None:  # video time
            return self.start + timedelta(seconds=frame_no / (self.video_fps or 15))
        return datetime.now().astimezone()

    def add(self, frame_no: int, counts: dict) -> dict | None:
        """Add one frame; returns the finished minute's row when a new minute starts."""
        t = self.now(frame_no)
        bucket = t.replace(second=0, microsecond=0)
        row = self.flush(bucket) if self.acc and bucket != self.bucket else None
        if not self.acc:
            self.bucket = bucket
            self.acc = {"from": t, "wall": time.time(), "frames": 0, "in": 0, "out": 0, "visitors": 0,
                        "zone_sum": 0, "zone_max": 0}
        a = self.acc
        a["frames"] += 1
        a["in"] += counts["in"]
        a["out"] += counts["out"]
        a["visitors"] += counts["visitors"]
        a["zone_sum"] += counts["in_zone"]
        a["zone_max"] = max(a["zone_max"], counts["in_zone"])
        self.recent.append((t.timestamp(), counts["in_zone"]))
        while self.recent[0][0] < t.timestamp() - LIVE_WINDOW:
            self.recent.popleft()
        return row

    def live(self, frame_no: int) -> dict:
        """The counts right now (call after add): people in the zone now (median of the last LIVE_WINDOW seconds),
        today's totals including the minute that is not finished yet. Same names as the minute rows."""
        if self.day != self.bucket.date():  # before the first row of the day: continue from today's file
            self.day = self.bucket.date()
            self.totals = self._saved_totals(self.day)
        a, line = self.acc, self.has_line
        in_zone = sorted(n for _, n in self.recent)[len(self.recent) // 2]
        return {"time": self.now(frame_no).isoformat(timespec="seconds"), "camera": self.camera, "in_zone": in_zone,
                "in_today": self.totals["in"] + a["in"] if line else None,
                "out_today": self.totals["out"] + a["out"] if line else None,
                "visitors_today": self.totals["visitors"] + a["visitors"]}

    def finish(self, frame_no: int) -> dict | None:
        """Write the last (partial) minute when the program stops."""
        return self.flush(self.now(frame_no)) if self.acc else None

    def _file(self, day) -> Path:
        return DATA / (f"test_{self.clip}.csv" if self.clip is not None else f"{day:%Y-%m-%d}.csv")

    def file(self) -> Path:
        """The CSV the minutes go to (today's, for a live camera)."""
        return self._file(self.day or datetime.now().date())

    def _saved_totals(self, day) -> dict:
        """Totals already in today's file (so a restart continues the day's count)."""
        path = self._file(day)
        totals = {"in": 0, "out": 0, "visitors": 0}
        if self.clip is None and path.is_file():
            with open(path, newline="") as f:
                for r in csv.DictReader(f):
                    for k in totals:
                        totals[k] += int(r.get(k) or 0)
        return totals

    def flush(self, end: datetime) -> dict:
        a, self.acc = self.acc, None
        if self.day != self.bucket.date():  # first row, or a new day
            self.day = self.bucket.date()
            self.totals = self._saved_totals(self.day)
        for k in self.totals:
            self.totals[k] += a[k]
        seconds = min(60.0, (end - a["from"]).total_seconds())
        wall = time.time() - a["wall"]
        temp = cpu_temp()
        line = self.has_line
        row = {"time": self.bucket.isoformat(), "seconds": round(seconds), "camera": self.camera,
               "in": a["in"] if line else None, "out": a["out"] if line else None,
               "in_zone_avg": round(a["zone_sum"] / a["frames"], 2), "in_zone_max": a["zone_max"],
               "visitors": a["visitors"], "in_today": self.totals["in"] if line else None,
               "out_today": self.totals["out"] if line else None, "visitors_today": self.totals["visitors"],
               "fps": round(a["frames"] / wall, 1) if wall > 0 else None,
               "cpu_temp_c": float(temp) if temp else None, "model": self.model}
        path = self._file(self.day)
        new = not path.is_file()
        with open(path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            if new:
                writer.writeheader()
            writer.writerow(row)
        if self.mqtt is not None:
            self.mqtt.publish(row)
        if self.cloud is not None:
            self.cloud.send(row)
        return row


class MqttOut:
    """Publishes each minute (retained) to pi5/people/count, and online / offline to pi5/status/people like the
    services of pi-mqtt-llm. If the broker is down the program keeps counting: minutes are queued and sent when
    it is back, and they are always in data/*.csv."""

    def __init__(self, broker: str, port: int = 1883, topic: str = MQTT_TOPIC, camera: str = "cam1"):
        import paho.mqtt.client as mqtt  # pip install paho-mqtt (in requirements.txt)

        self.topic, self.where, self.warned = topic, f"{broker}:{port}", False
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"{host()}-people-{camera}")
        self.client.will_set(STATUS_TOPIC, "offline", qos=1, retain=True)  # broker says "offline" if we die
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.connect_async(broker, port, keepalive=30)
        self.client.loop_start()
        print(f"MQTT: {self.where}  topic {topic} (retained, every minute) + {LIVE_TOPIC} (every {LIVE_SECONDS:g} s)"
              f" + {STATUS_TOPIC} online/offline")

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            print(f"MQTT: {self.where} refused the connection: {reason_code}", flush=True)
            return
        print(f"MQTT: connected to {self.where}", flush=True)
        self.warned = False
        client.publish(STATUS_TOPIC, "online", qos=1, retain=True)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        print(f"MQTT: lost {self.where} ({reason_code}) - retrying", flush=True)

    def publish(self, row: dict) -> None:
        info = self.client.publish(self.topic, json.dumps(row, ensure_ascii=False), qos=1, retain=True)
        if info.rc != 0 and not self.warned:
            print(f"MQTT: no broker at {self.where} yet - minutes wait in a queue (and are in data/*.csv)", flush=True)
            self.warned = True

    def publish_live(self, now: dict) -> None:
        """The counts right now (MinuteLog.live) to LIVE_TOPIC: QoS 0, not retained, not queued - an old "now" is
        useless, and a new dashboard gets one within a second anyway."""
        self.client.publish(LIVE_TOPIC, json.dumps(now, ensure_ascii=False), qos=0, retain=False)

    def publish_frame(self, jpeg: bytes) -> None:
        """The picture with the model's boxes (frame_jpeg) to FRAME_TOPIC: QoS 0, not retained, like the live counts."""
        self.client.publish(FRAME_TOPIC, jpeg, qos=0, retain=False)

    def close(self) -> None:
        """Say "offline" ourselves (the Last Will only fires when the connection drops unexpectedly)."""
        info = self.client.publish(STATUS_TOPIC, "offline", qos=1, retain=True)
        try:
            info.wait_for_publish(timeout=2)
        except (RuntimeError, ValueError):
            pass
        self.client.disconnect()
        self.client.loop_stop()


def frame_jpeg(picture: np.ndarray, width: int = FRAME_WIDTH, quality: int = FRAME_QUALITY) -> bytes:
    """The annotated picture made small for MQTT: at most `width` px wide, JPEG ('' if encoding fails)."""
    h, w = picture.shape[:2]
    if w > width:
        picture = cv2.resize(picture, (width, round(h * width / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", picture, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else b""


def csv_minute(r: dict) -> dict:
    """A row read back from data/*.csv (all text) -> the same values MinuteLog.flush wrote ('' = None)."""
    row = {k: r.get(k) or None for k in FIELDS}
    for k in INT_FIELDS:
        row[k] = int(float(row[k])) if row[k] is not None else None
    for k in FLOAT_FIELDS:
        row[k] = float(row[k]) if row[k] is not None else None
    return row


def supabase_row(row: dict) -> dict:
    """A minute row -> a row of the table minute_counts: "in" / "out" are SQL keywords there -> in_count / out_count."""
    out = {k: v for k, v in row.items() if k not in ("in", "out")}
    out["in_count"], out["out_count"] = row.get("in"), row.get("out")
    return out


def post_rows(url: str, key: str, rows: list[dict], timeout: float = 15) -> None:
    """Upsert rows into minute_counts (a minute that is already there is updated, never stored twice).
    The key goes in the apikey header; only the older JWT keys (eyJ...) also go in Authorization."""
    headers = {"apikey": key, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    request = urllib.request.Request(f"{url.rstrip('/')}/rest/v1/{SUPABASE_TABLE}?on_conflict=camera,time",
                                     data=json.dumps(rows).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        response.read()


class SupabaseOut:
    """Stores each minute in Supabase (table minute_counts, supabase/schema.sql). Runs in its own thread: a slow or
    missing internet never slows the counting. Minutes that could not be sent wait in memory and go with the next
    try; they are always in data/*.csv too (bash run.sh upload sends those)."""

    def __init__(self, url: str, key: str):
        self.url, self.key = url.rstrip("/"), key
        self.queue: queue.Queue = queue.Queue()
        self.thread = threading.Thread(target=self._run, name="supabase", daemon=True)
        self.thread.start()
        print(f"Supabase: {self.url}  table {SUPABASE_TABLE} (every minute)")

    def send(self, row: dict) -> None:
        self.queue.put(supabase_row(row))

    def _run(self) -> None:
        waiting, failing, stop = [], False, False
        while not stop:
            try:
                item = self.queue.get(timeout=SUPABASE_RETRY if waiting else None)
                while True:  # take every minute that is queued, send them together
                    if item is None:
                        stop = True
                    else:
                        waiting.append(item)
                    item = self.queue.get_nowait()
            except queue.Empty:
                pass
            if not waiting:
                continue
            del waiting[:-SUPABASE_KEEP]
            try:
                post_rows(self.url, self.key, waiting)
                if failing:
                    print(f"Supabase: sent again ({len(waiting)} minutes)", flush=True)
                waiting, failing = [], False
            except (OSError, ValueError) as e:  # URLError / HTTPError / timeout are OSErrors
                if not failing:
                    detail = e.read().decode(errors="replace")[:200] if isinstance(e, urllib.error.HTTPError) else ""
                    print(f"Supabase: cannot store minutes ({e} {detail}) - retrying every {SUPABASE_RETRY:g} s; "
                          "they are in data/*.csv too (bash run.sh upload)", flush=True)
                    failing = True

    def close(self, timeout: float = 10) -> None:
        """Send what is left (the last, partial minute) before the program ends."""
        self.queue.put(None)
        self.thread.join(timeout)
