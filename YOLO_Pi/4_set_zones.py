"""Step 4 — draw the counting LINE and ZONE on the camera picture -> zones.json (used by 3_camera.py --zones and by
the counting service: bash run.sh count / bash run.sh service install).

    python 4_set_zones.py                          # window: one frame from the camera, draw with the mouse
    python 4_set_zones.py --source clips/site.mp4  # draw on the first frame of a clip (or on a .jpg)
    python 4_set_zones.py --no-show                # no window (SSH): saves zones_preview.jpg with a 0-1 grid
    python 4_set_zones.py --line 0.5,0.1,0.5,0.9 --zone 0.2,0.3,0.8,0.3,0.8,0.95,0.2,0.95     # set by numbers

In the window:  l = draw the LINE (2 clicks)    z = draw the ZONE (click its corners)    f = flip the IN side
                a = anchor feet / centre    u = undo a point    c = clear    s / Enter = save    q / Esc = quit
                (click the picture first so the window gets the keys; the Thai keyboard works too;
                 a big camera picture is shown at most 1280x720 — the points are fractions, so nothing changes)
LINE: people walking across it are counted IN (towards the green arrow) or OUT.
ZONE: people inside it are counted (how many now, new visitors); no zone = the whole picture.
Points are saved as fractions 0-1 of the picture, so they fit any resolution with the same shape (16:9).
A picture is saved only when there is no window (zones_preview.jpg), and people in it are pixelated (PDPA).
"""

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

from common import MODEL_NAMES, PERSON, default_source, open_webcam, picamera_frames, pick_model
from counting import LINE_BGR, ZONE_BGR, ZONES_FILE, draw_zones, make_zones, to_pixels

WINDOW = "YOLO_Pi zones: l line | z zone | f flip IN | a anchor | u undo | c clear | s save | q quit"
FONT = cv2.FONT_HERSHEY_SIMPLEX


def grab_frame(source: str, size: str) -> np.ndarray:
    """One picture from the Pi camera / webcam / clip / image file."""
    if source == "picamera":
        width, height = map(int, size.lower().split("x"))
        frames = picamera_frames(width, height)
        try:
            for _ in range(15):  # let the automatic exposure settle
                frame = next(frames)
        except RuntimeError as e:
            raise SystemExit(f"Pi camera: {e}\nbusy? the counting service uses it -> bash run.sh service stop")
        finally:
            frames.close()
        return frame.copy()
    if Path(source).suffix.lower() in (".jpg", ".jpeg", ".png"):
        frame = cv2.imread(source)
    elif source.isdigit():  # webcam: give up with a clear message instead of hanging
        cap = open_webcam(int(source),
                          hint="or draw on a clip / picture instead: bash run.sh 4 --source clips/<name>.mp4")
        frame = None
        for _ in range(15):  # a webcam's first frames are dark
            ok, f = cap.read()
            frame = f if ok else frame
        cap.release()
    else:
        cap = cv2.VideoCapture(source)
        frame = cap.read()[1]
        cap.release()
    if frame is None:
        raise SystemExit(f"cannot read a picture from '{source}'")
    return frame


def pixelate_people(img: np.ndarray) -> int:
    """Pixelate (in place) every person the model finds, before a picture is saved (PDPA). Returns how many."""
    from ultralytics import YOLO

    model = YOLO(pick_model(MODEL_NAMES[0]), task="detect")
    boxes = model.predict(img, classes=[PERSON], conf=0.2, verbose=False)[0].boxes.xyxy.int().tolist()
    for x1, y1, x2, y2 in boxes:
        roi = img[max(0, y1):y2, max(0, x1):x2]
        if roi.size:
            h, w = roi.shape[:2]
            small = cv2.resize(roi, (6, max(1, round(6 * h / w))), interpolation=cv2.INTER_AREA)
            roi[:] = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    return len(boxes)


def outlined(img, text, xy, scale=0.5):
    cv2.putText(img, text, xy, FONT, scale, (0, 0, 0), 3)
    cv2.putText(img, text, xy, FONT, scale, (255, 255, 255), 1)


def draw_grid(img: np.ndarray) -> None:
    """Lines every 0.1 of the width / height, to read the numbers for --line / --zone."""
    h, w = img.shape[:2]
    grid = img.copy()
    for i in range(1, 10):
        x, y = round(i * w / 10), round(i * h / 10)
        cv2.line(grid, (x, 0), (x, h), (255, 255, 255), 1)
        cv2.line(grid, (0, y), (w, y), (255, 255, 255), 1)
    cv2.addWeighted(grid, 0.45, img, 0.55, 0, dst=img)
    for i in range(1, 10):
        outlined(img, f"{i / 10:.1f}", (round(i * w / 10) + 3, 16))
        outlined(img, f"{i / 10:.1f}", (3, round(i * h / 10) - 4))


MAX_VIEW = (1280, 720)  # the window is at most this big (a 1920x1080 webcam picture is larger than a laptop screen)
# the same keys typed with the Thai keyboard (Kedmanee), so the window works whatever keyboard is active
THAI_KEYS = {"ส": "l", "ผ": "z", "ด": "f", "ฟ": "a", "ี": "u", "แ": "c", "ห": "s", "ๆ": "q"}
KEYS = {13: "s", 10: "s", 27: "q"}  # Enter = save, Esc = quit


class Editor:
    """What the mouse and keys do in the window (kept apart from the window itself so it can be tested).
    Points are kept as fractions 0-1, so the picture can be shown smaller than the camera frame."""

    def __init__(self, frame: np.ndarray, zones: dict):
        self.zones = zones
        fh, fw = frame.shape[:2]
        scale = min(1.0, MAX_VIEW[0] / fw, MAX_VIEW[1] / fh)
        self.frame = cv2.resize(frame, (round(fw * scale), round(fh * scale))) if scale < 1 else frame
        self.h, self.w = self.frame.shape[:2]  # size of the picture in the window (clicks come in these pixels)
        self.shapes = {name: [list(p) for p in zones.get(name) or []] for name in ("line", "zone")}
        self.mode = "line"
        self.message = "l = line (2 clicks), z = zone (click the corners), then s = save"

    def click(self, x: int, y: int) -> None:
        points = self.shapes[self.mode]
        if self.mode == "line" and len(points) == 2:
            points.clear()  # a 3rd click starts a new line
        points.append([round(min(max(x / self.w, 0.0), 1.0), 3), round(min(max(y / self.h, 0.0), 1.0), 3)])

    def key_code(self, code: int) -> str | None:
        """A key code from cv2.waitKeyEx (-1 = no key): English or Thai keyboard, Enter, Esc."""
        if code < 0:
            return None
        k = KEYS.get(code) or (chr(code).lower() if code < 0x110000 else "")
        return self.key(THAI_KEYS.get(k, k))

    def key(self, k: str) -> str | None:
        """Returns "save" or "quit" when the window should close."""
        if k in ("l", "z"):
            self.mode = "line" if k == "l" else "zone"
        elif k == "f" and len(self.shapes["line"]) == 2:
            self.shapes["line"].reverse()  # swap the two ends -> the IN arrow points to the other side
        elif k == "a":
            self.zones["anchor"] = "center" if self.zones["anchor"] == "bottom" else "bottom"
        elif k == "u" and self.shapes[self.mode]:
            self.shapes[self.mode].pop()
        elif k == "c":
            self.shapes[self.mode].clear()
        elif k == "s":
            self.message = self.problem()
            if not self.message:
                return "save"
        elif k in ("q", "\x1b"):
            return "quit"
        return None

    def problem(self) -> str:
        line, zone = self.shapes["line"], self.shapes["zone"]
        if len(line) == 1:
            return "the line needs 2 points (or c = clear it)"
        if 0 < len(zone) < 3:
            return "the zone needs at least 3 corners (or c = clear it)"
        if not line and not zone:
            return "draw a line (l) and / or a zone (z) first"
        return ""

    def result(self) -> dict:
        line, zone = self.shapes["line"], self.shapes["zone"]
        return {**self.zones, "line": line if len(line) == 2 else None, "zone": zone if len(zone) >= 3 else None}

    def render(self) -> np.ndarray:
        view = draw_zones(self.frame.copy(), self.result())
        for name, color in (("line", LINE_BGR), ("zone", ZONE_BGR)):
            points = to_pixels(self.shapes[name], self.w, self.h).astype(np.int32) if self.shapes[name] else []
            for p in points:
                cv2.circle(view, (int(p[0]), int(p[1])), 6, color, -1)
            if name == "zone" and len(points) == 2:
                cv2.line(view, tuple(map(int, points[0])), tuple(map(int, points[1])), color, 2)
        cv2.rectangle(view, (0, self.h - 58), (self.w, self.h), (0, 0, 0), -1)
        cv2.putText(view, f"drawing: {self.mode.upper()}   anchor: {self.zones['anchor']}   "
                          "l line | z zone | f flip IN | a anchor | u undo | c clear | s save | q quit",
                    (10, self.h - 34), FONT, 0.55, (255, 255, 255), 1)
        cv2.putText(view, self.message, (10, self.h - 10), FONT, 0.55, (80, 200, 255), 1)
        return view


def window_closed() -> bool:
    """True once the window was closed with the mouse (some systems raise an error for a closed window)."""
    try:
        return cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) < 1
    except cv2.error:
        return True


def draw_window(frame: np.ndarray, zones: dict) -> dict | None:
    editor = Editor(frame, zones)
    print("window open - if you do not see it, it is behind other windows (Mac: click the Python icon in the Dock)\n"
          "click the picture first, then use the keys\n"
          "  l = line (2 clicks)   z = zone (click the corners)   f = flip IN   a = anchor   u = undo   c = clear\n"
          "  s or Enter = save     q or Esc = quit   (the Thai keyboard works too)", flush=True)
    cv2.namedWindow(WINDOW, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(WINDOW, lambda event, x, y, *_: editor.click(x, y) if event == cv2.EVENT_LBUTTONDOWN else None)
    action, shown = None, 0
    while action is None:
        cv2.imshow(WINDOW, editor.render())
        if shown == 0 and hasattr(cv2, "WND_PROP_TOPMOST"):
            try:
                cv2.setWindowProperty(WINDOW, cv2.WND_PROP_TOPMOST, 1)  # bring it in front of the terminal
            except cv2.error:
                pass
        action = editor.key_code(cv2.waitKeyEx(30))
        shown += 1
        if action is None and shown > 10 and window_closed():  # closed with the mouse
            action = "quit"
    cv2.destroyAllWindows()
    cv2.waitKey(1)  # macOS: let the window really close
    return editor.result() if action == "save" else None


def save(path: Path, zones: dict, w: int, h: int) -> None:
    if not zones.get("line") and not zones.get("zone"):
        raise SystemExit("nothing to save: give --line and / or --zone (or draw them in the window)")
    out = {"camera": zones["camera"], "anchor": zones["anchor"], "band": zones["band"], "frame_size": [w, h],
           "line": zones.get("line"), "zone": zones.get("zone")}
    path.write_text("{\n" + ",\n".join(f'  "{k}": {json.dumps(v)}' for k, v in out.items()) + "\n}\n")
    print(f"saved {path}: line {out['line']}  zone {out['zone']}  anchor {out['anchor']}  camera {out['camera']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=None, help="picamera | webcam index (0) | video file | image (.jpg / .png)")
    ap.add_argument("--size", default="1280x720", help="Pi camera capture size WxH - the same as in 3_camera.py")
    ap.add_argument("--file", default=str(ZONES_FILE), help="where to save (default zones.json)")
    ap.add_argument("--line", help="x1,y1,x2,y2 as fractions 0-1 of the picture (no window); none = remove")
    ap.add_argument("--zone", help="x1,y1,x2,y2,x3,y3,... fractions 0-1 (no window); none = remove")
    ap.add_argument("--anchor", choices=("bottom", "center"), help="bottom = feet (default), center = middle of body")
    ap.add_argument("--camera", help="name of this camera in the data (default cam1)")
    ap.add_argument("--no-show", action="store_true", help="no window: save zones_preview.jpg to look at instead")
    args = ap.parse_args()

    source = args.source or default_source()
    frame = grab_frame(source, args.size)
    h, w = frame.shape[:2]
    path = Path(args.file)
    zones = make_zones(path if path.is_file() else None, args.line, args.zone, args.anchor, args.camera)
    by_numbers = any(v is not None for v in (args.line, args.zone, args.anchor, args.camera))
    no_display = sys.platform.startswith("linux") and not os.environ.get("DISPLAY", os.environ.get("WAYLAND_DISPLAY"))
    if not (args.no_show or by_numbers or no_display):
        zones = draw_window(frame, zones)
        if zones is None:
            print("closed without saving")
        else:
            save(path, zones, w, h)
        return

    if by_numbers:
        save(path, zones, w, h)
    preview = frame.copy()
    people = pixelate_people(preview)
    preview = draw_zones(preview, zones)
    draw_grid(preview)
    preview_file = path.with_name(f"{path.stem}_preview.jpg")  # zones.json -> zones_preview.jpg
    cv2.imwrite(str(preview_file), preview)
    print(f"picture {w}x{h} from {source} -> {preview_file} ({people} people pixelated, grid = fractions 0-1)\n"
          f"open it (VS Code / scp) and give the points, e.g.\n"
          f"  bash run.sh 4 --line 0.5,0.1,0.5,0.9 --zone 0.2,0.3,0.8,0.3,0.8,0.95,0.2,0.95\n"
          f"(line = 2 points x,y; IN is the side of the green arrow - swap the 2 points to flip it)")


if __name__ == "__main__":
    main()
