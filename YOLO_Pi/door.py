"""Finds the room's door in the camera picture by itself, to OFFER it on the dashboard as a starting line.

It never counts by itself: IN / OUT are counted only at a line set on the dashboard ("ตั้งค่าการนับ"), because a
guessed door can be wrong without anyone noticing (on the board it once grew into a box over the whole picture). The
door found here is sent with the live counts; the dashboard shows it and "ใช้ประตูที่ AI หาเจอ" turns it into a line
along the door's bottom edge that the user moves and saves.

The model is YOLOE (a YOLO that finds things named by words) with the words DOOR_WORDS + LOOKALIKE_WORDS built in:
models/yoloe_door.pt. It is made once on the Mac (python door.py build); the 572 MB text model it needs stays there.
"cabinet" is there to compete: with "door" alone the doors of steel cabinets scored higher than a real glass door
(tested on a picture of the room); now cabinets come out as "cabinet" and only the door words count.

Running: a background thread looks at DOOR_SAMPLES frames at the start and again every DOOR_RECHECK seconds; the
counting never waits for it. A door counts when it is found in at least 2 of the samples (or once with a score of
DOOR_SURE), so one wrong box (an oven, a cupboard) does not become the door. The last door found is kept in door.json:
after a restart it is offered at once while the new search runs, and a person standing in front of the door during a
search does not lose it.
"""

import json
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

from common import ROOT

DOOR_MODEL = ROOT / "models" / "yoloe_door.pt"
DOOR_FILE = ROOT / "door.json"
DOOR_WORDS = ["door", "sliding door", "glass door"]
LOOKALIKE_WORDS = ["cabinet"]  # not doors: only here so that they are not called "door"
DOOR_CONF = 0.15  # a glass sliding door scored 0.18-0.23; on the 200 test images doors from 0.16, an oven 0.11
DOOR_SURE = 0.35  # one sample at this score is enough
DOOR_SAMPLES, DOOR_SAMPLE_GAP = 5, 2.0  # frames per search, seconds between them (people move, the door does not)
DOOR_RECHECK = 600.0  # search again every 10 minutes: the camera may have been moved
SAME_DOOR = 0.3  # boxes overlapping this much (IoU) are the same door ...
INSIDE = 0.6  # ... and so is a box that lies this much inside another (a glass panel inside the whole sliding door)
MAX_DOOR = 0.45  # a "door" bigger than this share of the picture is a wall of cupboards / the whole room, not a door


def iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def same_door(a, b) -> bool:
    """Overlapping a lot, or one mostly inside the other (YOLOE often boxes one panel and the whole door)."""
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return iou(a, b) >= SAME_DOOR or (smaller > 0 and ix * iy / smaller >= INSIDE)


def door_boxes(r, names) -> list[tuple[list[float], float]]:
    """(box 0-1, score) of the boxes named with a door word (cabinets etc. are left out)."""
    return [(box, conf) for box, conf, cls in zip(r.boxes.xyxyn.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist())
            if names[int(cls)] in DOOR_WORDS]


def area(box) -> float:
    return (box[2] - box[0]) * (box[3] - box[1])


def pick_door(found: list[tuple[list[float], float, int]]) -> dict | None:
    """found = (box 0-1, score, sample number) of every door box of one search -> the door, or None.
    Boxes of the same door (in different samples, or a panel and the whole door) are grouped; the group seen in most
    samples (then highest scores) wins, and the door is all its boxes together: people walk through the open part."""
    groups = []
    found = [f for f in found if area(f[0]) <= MAX_DOOR]
    for box, conf, sample in sorted(found, key=lambda f: -f[1]):
        for g in groups:
            if any(same_door(b, box) for b in g["boxes"]):
                g["boxes"].append(box)
                g["confs"].append(conf)
                g["samples"].add(sample)
                break
        else:
            groups.append({"boxes": [box], "confs": [conf], "samples": {sample}})
    good = [g for g in groups if len(g["samples"]) >= 2 or max(g["confs"]) >= DOOR_SURE]
    if not good:
        return None
    best = max(good, key=lambda g: (len(g["samples"]), sum(g["confs"])))
    box = [round(min(b[0] for b in best["boxes"]), 4), round(min(b[1] for b in best["boxes"]), 4),
           round(max(b[2] for b in best["boxes"]), 4), round(max(b[3] for b in best["boxes"]), 4)]
    if area(box) > MAX_DOOR:  # the boxes together grew too big: keep the best single one
        box = [round(v, 4) for v in best["boxes"][0]]
    return {"box": box, "conf": round(max(best["confs"]), 2), "found": datetime.now().astimezone().isoformat(
        timespec="seconds")}


class DoorFinder:
    """Background search for the door; on_change(door) is called when a door is found or it moved."""

    def __init__(self, on_change, wanted=lambda: True):
        self.on_change = on_change
        self.wanted = wanted  # False = a line is set (on the dashboard): no need to search
        self.door = None
        self.frame = None
        self.lock = threading.Lock()
        try:
            self.door = json.loads(DOOR_FILE.read_text())
            if area(self.door["box"]) > MAX_DOOR:  # saved by an older version that let boxes grow too big
                self.door = None
            else:
                print(f"door: from the last search (score {self.door['conf']}), searching again")
        except (OSError, ValueError, KeyError, TypeError):
            self.door = None
        if self.door:
            on_change(self.door)
        if not DOOR_MODEL.is_file():
            print(f"door: no {DOOR_MODEL.name} - no door suggestion on the dashboard (bash run.sh send copies it)")
            return
        threading.Thread(target=self._run, daemon=True).start()

    def offer(self, frame) -> None:
        """The newest camera frame (called every frame: only keeps a reference)."""
        with self.lock:
            self.frame = frame

    def _latest(self):
        while True:
            with self.lock:
                frame, self.frame = self.frame, None
            if frame is not None:
                return frame
            time.sleep(0.2)

    def _run(self) -> None:
        try:
            from ultralytics import YOLOE
            model = YOLOE(str(DOOR_MODEL))
        except Exception as e:  # the counting goes on without IN / OUT
            print(f"WARNING: door search is off ({type(e).__name__}: {e})")
            return
        while True:
            if not self.wanted():
                time.sleep(DOOR_RECHECK)
                continue
            found = []
            for sample in range(DOOR_SAMPLES):
                r = model.predict(self._latest(), conf=DOOR_CONF, imgsz=640, verbose=False)[0]
                found += [(box, conf, sample) for box, conf in door_boxes(r, model.names)]
                time.sleep(DOOR_SAMPLE_GAP)
            door = pick_door(found)
            if door and (self.door is None or not same_door(door["box"], self.door["box"])):
                print(f"door: found at {door['box']} (score {door['conf']}) - offered on the dashboard as a starting line")
                self.door = door
                DOOR_FILE.write_text(json.dumps(door))
                self.on_change(door)
            elif door is None and self.door is None:
                print("door: not found - draw the line on the dashboard yourself "
                      f"(searching again in {DOOR_RECHECK / 60:.0f} min)")
            time.sleep(DOOR_RECHECK)


def build() -> None:
    """On the Mac: YOLOE + the words -> models/yoloe_door.pt (needs the CLIP text model: see README)."""
    from ultralytics import YOLOE
    model = YOLOE("yoloe-11s-seg.pt")
    words = DOOR_WORDS + LOOKALIKE_WORDS
    model.set_classes(words, model.get_text_pe(words))
    model.save(str(DOOR_MODEL))
    print(f"saved {DOOR_MODEL}")


def test(paths: list[str]) -> None:
    """Find the door in pictures: python door.py test photo.jpg ... -> door_<name>.jpg next to this file."""
    import cv2
    from ultralytics import YOLOE
    model = YOLOE(str(DOOR_MODEL))
    for path in paths:
        r = model.predict(path, conf=DOOR_CONF, imgsz=640, verbose=False)[0]
        out = ROOT / f"door_{Path(path).stem}.jpg"
        cv2.imwrite(str(out), r.plot(masks=False))
        # as if the camera showed this picture in 2 of the 5 frames of a search
        door = pick_door([(box, conf, frame) for frame in (0, 1) for box, conf in door_boxes(r, model.names)])
        print(f"{path}: door {door['box'] if door else 'not found'}" + (f" (score {door['conf']})" if door else "")
              + f" -> {out.name}")


if __name__ == "__main__":
    if sys.argv[1:2] == ["build"]:
        build()
    elif sys.argv[1:2] == ["test"] and sys.argv[2:]:
        test(sys.argv[2:])
    else:
        print("python door.py build              (Mac) make models/yoloe_door.pt\n"
              "python door.py test photo.jpg ... find the door in pictures")
