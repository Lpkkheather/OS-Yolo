"""Shared paths, settings and evaluation helpers for YOLO_Pi.

YOLO_Pi is standalone: copy this whole folder to the Raspberry Pi 5 and run it there.
Training happens in ~/Documents/YOLO on the Mac; this folder runs and evaluates the finished models.
"""

import csv
import os
import socket
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"
TEST_DATA = ROOT / "test_data"  # 200 test images + Ground Truth labels (COCO val2017, person only)
RESULTS = ROOT / "results"  # result images, one folder per machine
METRICS = ROOT / "metrics"  # numbers, one folder per machine
CLIPS = ROOT / "clips"
# every .pt in models/: yolo26n, yolo11n (pretrained) + <name>_trained after "bash run.sh import"
MODEL_NAMES = tuple(sorted((p.stem for p in MODELS.glob("*.pt")), key=lambda n: (not n.startswith("yolo26"), n)))
SIZES = (640, 320)  # input image size: 640 finds smaller / farther people, 320 is about 4x less work

PERSON = 0  # "person" is class 0 in COCO
CONF = 0.40  # confidence threshold for drawing and counting people
LOW_CONF = 0.10  # lowest score looked at: a person found only between 0.10 and 0.40 is "LOW" (seen but unsure);
#                  3_camera.py passes these boxes to the tracker to follow people who are partly hidden
IOU_MATCH = 0.5  # a model box is correct (TP) when its IoU with a label box is >= 0.5
SMALL, MEDIUM = 32**2, 96**2  # COCO person-size bins, in image pixels

GOLD, GREEN, RED, ORANGE, YELLOW = (201, 168, 76), (39, 174, 96), (231, 76, 60), (230, 126, 34), (241, 196, 15)
BG, TEXT = (27, 77, 62), (245, 240, 232)
PANEL_H, TITLE_H, MIN_LABEL_W = 640, 40, 60


def pt_model(name: str) -> Path:
    return MODELS / f"{name}.pt"  # PyTorch model (slow on the Pi, kept as the reference)


def ncnn_model(name: str, imgsz: int = 640) -> Path:
    """NCNN model for the Pi, exported for one input size: model.ncnn.param (layers) + model.ncnn.bin (weights).
    The folder name must end in _ncnn_model for Ultralytics to recognise it."""
    return MODELS / f"{name}_{imgsz}_ncnn_model"


def pick_model(name: str, imgsz: int = 640) -> Path:
    """A model name (yolo26n, yolo11n_trained, ...) -> its NCNN folder for this size if exported, else the .pt;
    or a path to any model."""
    if name in MODEL_NAMES:
        ncnn = ncnn_model(name, imgsz)
        return ncnn if ncnn.exists() else pt_model(name)
    path = Path(name)
    if not path.exists():
        raise SystemExit(f"model not found: {path}")
    return path


def host() -> str:
    return socket.gethostname().split(".")[0]


def load_env() -> dict[str, str]:
    """Settings in YOLO_Pi/.env (KEY=VALUE lines, # = comment), e.g. SUPABASE_URL + SUPABASE_SECRET_KEY.
    The file stays on this machine (.gitignore: never on GitHub). A variable set in the shell wins over the file."""
    path = ROOT / ".env"
    values = {}
    if path.is_file():
        for line in path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                values[key.strip()] = value.strip().strip("\"'")
    return values | {k: v for k, v in os.environ.items() if k in values or k.startswith("SUPABASE_")}


def cpu_temp() -> str:
    """CPU temperature in °C on a Raspberry Pi ('' elsewhere) — the Pi 5 slows itself down when hot."""
    zone = Path("/sys/class/thermal/thermal_zone0/temp")
    return f"{int(zone.read_text()) / 1000:.1f}" if zone.is_file() else ""


def data_yaml() -> Path:
    """data.yaml for test_data with this machine's absolute path, so the folder works wherever it is copied."""
    import ultralytics

    names = yaml.safe_load((Path(ultralytics.__file__).parent / "cfg/datasets/coco.yaml").read_text())["names"]
    path = Path(tempfile.gettempdir()) / "yolo_pi_test_data.yaml"
    path.write_text(yaml.safe_dump({"path": str(TEST_DATA), "train": "images", "val": "images", "names": names},
                                   sort_keys=False))
    return path


def has_picamera() -> bool:
    try:
        import picamera2  # noqa: F401  (only installed on the Raspberry Pi)
        return True
    except ImportError:
        return False


def picamera_frames(width: int, height: int, timeout: float = 10.0):
    """Frames from the Raspberry Pi camera. 'RGB888' is stored as B,G,R — the order OpenCV / Ultralytics expect.
    No frame for `timeout` s (e.g. the USB camera reset itself) -> RuntimeError instead of waiting forever, so the
    counting service stops and systemd starts it again."""
    from picamera2 import Picamera2

    cam = Picamera2()
    cam.configure(cam.create_video_configuration(main={"size": (width, height), "format": "RGB888"}))
    cam.start()
    try:
        while True:
            try:
                yield cam.capture_array(wait=timeout)
            except TimeoutError:
                raise RuntimeError(f"no frame from the camera for {timeout:.0f} s (unplugged or reset?)") from None
    finally:
        # close() stops the camera too and releases it for the next program. Not stop() first: after a reset the
        # camera thread is dead and stop() would wait for it forever.
        cam.close()


VIDEO4LINUX = Path("/sys/class/video4linux")  # Linux: one entry per /dev/video<N>
# what to check when a webcam cannot be read: macOS asks for permission; on Linux (the Pi) it is the cable / number
WEBCAM_HINT = ("allow camera access for this app (macOS: System Settings > Privacy & Security > Camera), then reopen "
               "the app" if sys.platform == "darwin" else
               "check the USB cable; 'ls -l /dev/v4l/by-id/' lists the webcams (the number after 'video' = --source)")


def usb_webcam_index(devices: Path = VIDEO4LINUX) -> int | None:
    """The /dev/video<N> number of the first USB webcam (Linux); None if none is plugged in, or not Linux.
    Not simply 0: on a Pi 5 the Pi's own video devices (camera port, image processor) come first, so a webcam is often
    /dev/video8 or higher. A webcam = a device on the USB bus with index 0 (its picture; index 1 = its metadata)."""
    found = []
    for dev in devices.glob("video*"):
        try:
            usb = ((dev / "device" / "subsystem").resolve().name == "usb"
                   or "/usb" in str((dev / "device").resolve()))
            if usb and (dev / "index").read_text().strip() == "0":
                found.append(int(dev.name.removeprefix("video")))
        except (OSError, ValueError):
            continue
    return min(found) if found else None


def default_source() -> str:
    """The camera when --source is not given: a USB webcam if one is plugged in, else the Pi camera on the ribbon
    cable (a Raspberry Pi with picamera2), else webcam 0 (the Mac's own camera). Looked up at every start, so the
    service finds the webcam again after it was unplugged or moved to another USB port (= another number)."""
    usb = usb_webcam_index()
    if usb is not None:
        return str(usb)
    return "picamera" if has_picamera() else "0"


class PictureWatch:
    """A live webcam that stops sending pictures (unplugged, USB reset): Ultralytics then hands out black frames and
    keeps reopening the same /dev/video number, which a replugged webcam may no longer have. After `seconds` of only
    black frames -> RuntimeError, like picamera_frames: the counting stops, systemd starts it again and
    default_source() finds the webcam afresh."""

    def __init__(self, seconds: float = 10.0):
        self.seconds = seconds
        self.last = time.time()  # last frame with a picture

    def check(self, picture: np.ndarray, now: float) -> None:
        if picture.any():  # a real picture is never all zeros, even in the dark (sensor noise)
            self.last = now
        elif now - self.last >= self.seconds:
            raise RuntimeError(f"no picture from the webcam for {self.seconds:.0f} s (unplugged or reset?)")


def open_webcam(index: int, seconds: float = 10.0, hint: str = ""):
    """cv2.VideoCapture for a webcam, but give up after `seconds` instead of waiting forever: on a Mac opening the
    camera hangs while another program still uses it or while macOS is still asking for camera permission."""
    import threading

    import cv2

    box = {}

    def work():
        cap = cv2.VideoCapture(index)
        box["cap"], box["ok"] = cap, cap.isOpened() and cap.read()[0]

    thread = threading.Thread(target=work, daemon=True)
    thread.start()
    thread.join(seconds)
    if thread.is_alive():
        raise SystemExit(
            f"webcam {index} did not answer within {seconds:.0f} s. Usually:\n"
            "  - another program still uses the camera: a window of bash run.sh 3 / 4 left open in another terminal\n"
            "    tab (close it: Esc or q, or Ctrl+C in that tab), the counting service (bash run.sh service stop),\n"
            "    or a video-call app"
            + ("\n  - macOS is asking for camera permission: allow it in System Settings > Privacy & Security > Camera"
               if sys.platform == "darwin" else "")
            + (f"\n  - {hint}" if hint else ""))
    if not box["ok"]:
        box["cap"].release()
        raise SystemExit(f"cannot read webcam {index}: {WEBCAM_HINT}")
    return box["cap"]


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(dict.fromkeys(k for r in rows for k in r)), restval="")
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------- evaluation (same rules as ~/Documents/YOLO)

def load_test(limit: int = 0) -> list[tuple[Path, np.ndarray]]:
    """(image, person label boxes as xyxy pixels) for the test images, in file-name order."""
    items = []
    for img in sorted((TEST_DATA / "images").glob("*.jpg")):
        w, h = Image.open(img).size
        boxes = []
        label = TEST_DATA / "labels" / f"{img.stem}.txt"
        if label.is_file():
            for line in label.read_text().splitlines():
                c, x, y, bw, bh = map(float, line.split())
                if int(c) == PERSON:
                    boxes.append([(x - bw / 2) * w, (y - bh / 2) * h, (x + bw / 2) * w, (y + bh / 2) * h])
        items.append((img, np.array(boxes, dtype=float).reshape(-1, 4)))
    return items[:limit] if limit else items


def box_iou(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """IoU = overlap area / union area, for every pair of xyxy boxes in a (N) and b (M)."""
    tl = np.maximum(a[:, None, :2], b[None, :, :2])
    br = np.minimum(a[:, None, 2:], b[None, :, 2:])
    inter = np.clip(br - tl, 0, None).prod(2)
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    return inter / (area_a[:, None] + area_b[None] - inter + 1e-9)


def match(boxes: np.ndarray, conf: np.ndarray, gt: np.ndarray):
    """Greedily match model boxes (high confidence first) to label boxes at IoU >= 0.5.
    Returns TP flag per model box, per label box the confidence that found it (0 = missed),
    and per model box its IoU with the matched label box (for a FP: best IoU with any)."""
    tp = np.zeros(len(boxes), bool)
    gt_conf = np.zeros(len(gt))
    pred_iou = np.zeros(len(boxes))
    if len(boxes) and len(gt):
        ious = box_iou(boxes, gt)
        pred_iou = ious.max(1)
        for i in range(len(boxes)):
            j = int(np.argmax(np.where(gt_conf > 0, -1.0, ious[i])))
            if ious[i, j] >= IOU_MATCH and gt_conf[j] == 0:
                tp[i], gt_conf[j], pred_iou[i] = True, conf[i], ious[i, j]
    return tp, gt_conf, pred_iou


def draw(img_path: Path, title: str, marks) -> Image.Image:
    """Image resized to 640 px high with a title bar; marks = [(xyxy box, color, text)]."""
    img = Image.open(img_path).convert("RGB")
    s = PANEL_H / img.height
    out = Image.new("RGB", (round(img.width * s), PANEL_H + TITLE_H), BG)
    out.paste(img.resize((round(img.width * s), PANEL_H)), (0, TITLE_H))
    dr = ImageDraw.Draw(out)
    font = ImageFont.load_default(size=20)
    dr.text((8, 10), title, fill=TEXT, font=ImageFont.load_default(size=18))
    for (x1, y1, x2, y2), color, text in marks:
        x1, y1, x2, y2 = x1 * s, y1 * s + TITLE_H, x2 * s, y2 * s + TITLE_H
        small = x2 - x1 < MIN_LABEL_W
        dr.rectangle([x1, y1, x2, y2], outline=color, width=2 if small else 4)
        if small:
            continue
        tw, th = dr.textbbox((0, 0), text, font=font)[2:]
        ty = y1 - th - 6 if y1 - th - 6 > TITLE_H else y1 + 2
        dr.rectangle([x1, ty, x1 + tw + 8, ty + th + 6], fill=color)
        dark = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2] > 160  # black text on light tags (yellow)
        dr.text((x1 + 4, ty + 2), text, fill=(0, 0, 0) if dark else (255, 255, 255), font=font)
    return out


def covered_by_others(gt: np.ndarray) -> np.ndarray:
    """Per label box: the share of its area covered by the other label boxes (people overlapping / hiding others)."""
    out = np.zeros(len(gt))
    for i, (x1, y1, x2, y2) in enumerate(gt):
        mask = np.zeros((int(np.ceil(y2 - y1)) + 1, int(np.ceil(x2 - x1)) + 1), bool)
        for j, (a1, b1, a2, b2) in enumerate(gt):
            if j != i:
                mask[max(0, int(b1 - y1)):max(0, int(np.ceil(b2 - y1))),
                     max(0, int(a1 - x1)):max(0, int(np.ceil(a2 - x1)))] = True
        out[i] = mask.mean()
    return out


def person_rows(img: Path, gt: np.ndarray, gt_conf: np.ndarray) -> list[dict]:
    """One row per label box: found (score >= CONF) / low (seen only with LOW_CONF..CONF) / missed (not seen),
    and simple reasons why a person is hard to see: small, cut by the image edge, overlapping other people."""
    w, h = Image.open(img).size
    rows = []
    for n, ((x1, y1, x2, y2), c, cover) in enumerate(zip(gt, gt_conf, covered_by_others(gt)), 1):
        area = (x2 - x1) * (y2 - y1)
        size = "small" if area < SMALL else "medium" if area < MEDIUM else "large"
        edge = x1 <= 2 or y1 <= 2 or x2 >= w - 2 or y2 >= h - 2
        result = "found" if c >= CONF else "low" if c > 0 else "missed"
        why = ""
        if result != "found":
            hints = (["small (< 32x32 px)"] if size == "small" else []) + (["cut by the image edge"] if edge else []) \
                + ([f"{cover:.0%} covered by other people"] if cover >= 0.3 else [])
            hints = hints or ["no simple reason: only a part visible / pose / light / blur? (look at the image)"]
            why = "; ".join(([f"seen at {c:.2f}, below {CONF:.2f}"] if result == "low" else []) + hints)
        rows.append({"image": img.name, "person": n, "result": result, "conf": round(float(c), 3) if c else "",
                     "width_px": round(x2 - x1), "height_px": round(y2 - y1), "size": size, "at_edge": int(edge),
                     "covered_by_others_%": round(100 * cover), "why": why})
    return rows


def missed_summary(people: list[dict], found_at: dict, fp_at: dict) -> dict:
    """Why people are missed: seen with a low score or not at all, what a lower threshold would give (people
    found / wrong boxes at 0.25 and 0.10), and how often missed vs found people are small / cut by the image edge /
    overlapping other people."""
    missed = [p for p in people if p["result"] != "found"]
    found = [p for p in people if p["result"] == "found"]

    def share(rows, test):
        return round(100 * sum(map(test, rows)) / len(rows)) if rows else ""

    small, edge, overlap = (lambda p: p["size"] == "small"), (lambda p: p["at_edge"]), \
        (lambda p: p["covered_by_others_%"] >= 30)
    return {
        "FN": len(missed), "seen_low": sum(p["result"] == "low" for p in people),
        "not_seen": sum(p["result"] == "missed" for p in people),
        "recall_at_0.25": round(found_at[0.25] / len(people), 3), "FP_at_0.25": fp_at[0.25],
        "recall_at_0.10": round(found_at[LOW_CONF] / len(people), 3), "FP_at_0.10": fp_at[LOW_CONF],
        "missed_small_%": share(missed, small), "found_small_%": share(found, small),
        "missed_edge_%": share(missed, edge), "found_edge_%": share(found, edge),
        "missed_overlap_%": share(missed, overlap), "found_overlap_%": share(found, overlap),
    }


def evaluate(model, imgsz: int, image_dir: Path | None, limit: int = 0) -> tuple[dict, list[dict], list[dict], list]:
    """Run a model over the test images; boxes count at confidence >= CONF. Returns metrics grouped by what they
    measure (accuracy / iou / counting / speed / missed), one row per image, one row per labelled person
    (found / low / missed + why) and the boxes >= CONF per image (for agreement()).
    If image_dir is given, also saves one result image per test image (green = correct with IoU, red = wrong box,
    yellow LOW = the person was seen only with a score of 0.10-0.40, orange MISSED = not seen at all)."""
    items = load_test(limit)
    if image_dir is not None:
        image_dir.mkdir(parents=True, exist_ok=True)
    rows, people, tp_iou, latency, preds = [], [], [], [], []
    size_found = {"small": [0, 0], "medium": [0, 0], "large": [0, 0]}
    found_at, fp_at = {0.25: 0, LOW_CONF: 0}, {0.25: 0, LOW_CONF: 0}  # what a lower threshold would give
    for k, (img, gt) in enumerate(items, 1):
        r = model.predict(img, conf=LOW_CONF, imgsz=imgsz, classes=[PERSON], verbose=False)[0]
        latency.append(r.speed["preprocess"] + r.speed["inference"] + r.speed["postprocess"])
        all_conf = r.boxes.conf.cpu().numpy()
        all_boxes = r.boxes.xyxy.cpu().numpy()
        order = all_conf.argsort()[::-1]
        all_conf, all_boxes = all_conf[order], all_boxes[order]
        # matching is greedy from the highest score down, so the boxes >= CONF get exactly the same result as
        # when only they are predicted; the lower boxes can only take people that are still unmatched
        all_tp, gt_conf, all_iou = match(all_boxes, all_conf, gt)
        for th in fp_at:
            found_at[th] += int((gt_conf >= th).sum())
            fp_at[th] += int((~all_tp[all_conf >= th]).sum())
        shown = all_conf >= CONF
        boxes, conf, tp, iou = all_boxes[shown], all_conf[shown], all_tp[shown], all_iou[shown]
        preds.append((boxes, conf))
        low = (gt_conf > 0) & (gt_conf < CONF)
        n_tp, n_fp, n_fn, n_low = int(tp.sum()), int((~tp).sum()), int((gt_conf < CONF).sum()), int(low.sum())
        tp_iou.extend(iou[tp].tolist())
        for (x1, y1, x2, y2), hit in zip(gt, gt_conf):
            area = (x2 - x1) * (y2 - y1)
            size = "small" if area < SMALL else "medium" if area < MEDIUM else "large"
            size_found[size][0] += int(hit >= CONF)
            size_found[size][1] += 1
        mean_iou = float(iou[tp].mean()) if n_tp else 0.0
        if image_dir is not None:
            marks = [(b, GREEN, f"person {c:.2f} IoU {u:.2f}") if t else (b, RED, f"FP {c:.2f} IoU {u:.2f}")
                     for b, c, t, u in zip(boxes, conf, tp, iou)]
            marks += [(b, YELLOW, f"LOW {c:.2f}") for b, c, lo in zip(gt, gt_conf, low) if lo]
            marks += [(b, ORANGE, "MISSED") for b, c in zip(gt, gt_conf) if c == 0]
            title = f"label {len(gt)} | TP {n_tp} FP {n_fp} LOW {n_low} MISSED {n_fn - n_low} | IoU {mean_iou:.2f}"
            draw(img, title, marks).save(image_dir / f"{k:03d}_{img.stem}.jpg", quality=90)
        rows.append({"image": img.name, "label_persons": len(gt), "predicted": len(boxes), "tp": n_tp, "fp": n_fp,
                     "missed": n_fn, "seen_low": n_low, "count_error": len(boxes) - len(gt),
                     "mean_iou": round(mean_iou, 3)})
        people += person_rows(img, gt, gt_conf)

    TP, FP, FN = (sum(r[key] for r in rows) for key in ("tp", "fp", "missed"))
    p = TP / (TP + FP) if TP + FP else 0.0
    rc = TP / (TP + FN) if TP + FN else 0.0
    ious = np.array(tp_iou)
    err = np.array([row["count_error"] for row in rows])
    ms = float(np.median(latency[5:] or latency))  # first 5 images are warm-up

    def size_recall(size):
        found, total = size_found[size]
        return f"{found / total:.3f}" if total else ""

    groups = {
        "accuracy": {
            "images": len(items), "people": TP + FN, "TP": TP, "FP": FP, "FN": FN, "precision": round(p, 3),
            "recall": round(rc, 3), "F1": round(2 * p * rc / (p + rc), 3) if p + rc else 0.0,
            "accuracy": round(TP / (TP + FP + FN), 3), "false_alarms_per_image": round(FP / len(items), 3),
            "recall_small": size_recall("small"), "recall_medium": size_recall("medium"),
            "recall_large": size_recall("large"),
        },
        "iou": {
            "correct_boxes": len(ious), "mean_IoU": round(float(ious.mean()), 3) if len(ious) else "",
            "median_IoU": round(float(np.median(ious)), 3) if len(ious) else "",
            "IoU>=0.75_%": round(float((ious >= 0.75).mean() * 100), 1) if len(ious) else "",
            "IoU>=0.90_%": round(float((ious >= 0.90).mean() * 100), 1) if len(ious) else "",
        },
        "counting": {
            "people_in_labels": int(sum(r["label_persons"] for r in rows)),
            "people_counted": int(sum(r["predicted"] for r in rows)),
            "MAE": round(float(np.abs(err).mean()), 3), "RMSE": round(float(np.sqrt((err ** 2).mean())), 3),
            "exact_count_%": round(float((err == 0).mean() * 100), 1),
        },
        "speed": {"ms_per_image": round(ms, 1), "FPS": round(1000 / ms, 1), "cpu_temp_C": cpu_temp()},
        "missed": missed_summary(people, found_at, fp_at),
    }
    return groups, rows, people, preds


def agreement(preds_ncnn: list, preds_pt: list) -> dict:
    """Did the conversion change the model? Compares the NCNN boxes with the original .pt boxes on the same
    images (no Ground Truth needed): a correct conversion gives nearly the same boxes (IoU close to 1)."""
    same = total = same_count = 0
    ious = []
    for (b_ncnn, c_ncnn), (b_pt, _) in zip(preds_ncnn, preds_pt):
        tp, _, iou = match(b_ncnn, c_ncnn, b_pt)  # the .pt boxes play the role of the labels
        same += int(tp.sum())
        total += max(len(b_ncnn), len(b_pt))
        same_count += int(len(b_ncnn) == len(b_pt))
        ious.extend(iou[tp].tolist())
    ious = np.array(ious)
    return {
        "same_boxes_%": round(100 * same / total, 1) if total else 100.0,
        "mean_IoU_vs_pt": round(float(ious.mean()), 3) if len(ious) else "",
        "IoU>=0.95_%": round(float((ious >= 0.95).mean() * 100), 1) if len(ious) else "",
        "same_count_images_%": round(100 * same_count / len(preds_ncnn), 1),
    }


METRIC_FILES = {"accuracy": "accuracy.csv", "iou": "iou.csv", "counting": "counting_mae.csv", "speed": "speed.csv",
                "missed": "missed.csv", "agreement": "agreement.csv"}
METRIC_INFO = {
    "accuracy": ("Accuracy — ตรวจเจอคนถูกแค่ไหน", [
        ("TP / FP / FN", "ถูก (IoU ≥ 0.5) / กรอบผิด = แจ้งเตือนผิด / คนที่พลาด", "มาก / น้อย / น้อย"),
        ("precision", "TP ÷ (TP + FP) — กรอบที่ทาย ถูกกี่ส่วน", "สูง"),
        ("recall", "TP ÷ (TP + FN) — คนจริง เจอกี่ส่วน", "สูง"),
        ("F1", "สมดุลระหว่าง precision กับ recall", "สูง"),
        ("accuracy", "TP ÷ (TP + FP + FN) — นับทุกความผิดพลาด", "สูง"),
        ("recall_small / medium / large", "recall แยกขนาดคน: < 32² / 32²–96² / > 96² พิกเซล", "สูง"),
        ("mAP50 / mAP50-95", "ความแม่นเฉลี่ยทุกระดับ conf (mAP50-95 = ตัววัดหลักของ COCO)", "สูง")]),
    "iou": ("IoU — กรอบตรงกับกรอบ Label แค่ไหน (เฉพาะกรอบที่ถูก)", [
        ("mean / median IoU", "พื้นที่ซ้อนกัน ÷ พื้นที่รวม (0 = ไม่ซ้อน, 1 = ตรงเป๊ะ)", "สูง"),
        ("IoU>=0.75_% / IoU>=0.90_%", "กี่ % ของกรอบที่ถูก ที่ตรงแน่น / เกือบเป๊ะ", "สูง")]),
    "counting": ("MAE — นับจำนวนคนผิดกี่คน", [
        ("MAE", "นับผิดเฉลี่ยกี่คนต่อภาพ", "น้อย"),
        ("RMSE", "เหมือน MAE แต่ลงโทษภาพที่นับผิดเยอะหนักกว่า", "น้อย"),
        ("exact_count_%", "กี่ % ของภาพที่นับได้ตรงเป๊ะ", "สูง")]),
    "speed": ("Speed — เร็วแค่ไหนบนเครื่องนี้", [
        ("ms_per_image / FPS", "เวลาต่อภาพ (ไม่นับ 5 ภาพแรก) / ภาพต่อวินาที", "น้อย / สูง"),
        ("cpu_temp_C", "อุณหภูมิ CPU ของ Pi หลังรัน (> 80 °C = Pi 5 ลดความเร็วเอง)", "ต่ำ")]),
    "missed": ("Missed — คนที่พลาด พลาดเพราะอะไร (รายคน: `per_person/<model>_<size>_<format>.csv`)", [
        ("FN", "คนจริงที่ไม่มีกรอบ ≥ 0.40 (= FN ในตาราง Accuracy) = seen_low + not_seen", "น้อย"),
        ("seen_low", "โมเดลเห็น แต่มั่นใจแค่ 0.10–0.40 → ภาพผลเขียน LOW (สีเหลือง) · กล้องสด: tracker ยังใช้กรอบพวกนี้", "—"),
        ("not_seen", "ไม่มีกรอบเลยแม้ที่ 0.10 → ภาพผลเขียน MISSED (สีส้ม)", "น้อย"),
        ("recall_at_0.25 / FP_at_0.25", "ถ้าลดเกณฑ์เป็น 0.25: เจอคนกี่ส่วน / กรอบผิดกี่กรอบ (เทียบ recall และ FP ที่ 0.40)", "—"),
        ("recall_at_0.10 / FP_at_0.10", "เหมือนกันที่ 0.10 (ต่ำสุดที่ tracker ใช้)", "—"),
        ("missed_small_% / found_small_%", "กี่ % ของคนที่พลาด / ที่เจอ ตัวเล็ก (< 32×32 px) — พลาดสูงกว่าเจอมาก = สาเหตุ", "—"),
        ("missed_edge_% / found_edge_%", "กี่ % ที่โดนขอบภาพตัด (เห็นไม่ครบตัว)", "—"),
        ("missed_overlap_% / found_overlap_%", "กี่ % ที่กรอบซ้อนกับคนอื่น ≥ 30% (บังกัน / ยืนเบียด)", "—")]),
    "agreement": ("Agreement — แปลงเป็น NCNN แล้วโมเดลยังเหมือนเดิมไหม (NCNN เทียบ .pt ภาพเดียวกัน ไม่ใช้ Label)", [
        ("same_boxes_%", "กี่ % ของกรอบที่ NCNN กับ .pt เจอตรงกัน (IoU ≥ 0.5)", "ใกล้ 100"),
        ("mean_IoU_vs_pt", "กรอบของ NCNN ทับกรอบของ .pt แค่ไหน", "ใกล้ 1"),
        ("IoU>=0.95_%", "กี่ % ของกรอบที่ทับกันเกือบสนิท", "ใกล้ 100"),
        ("same_count_images_%", "กี่ % ของภาพที่ NCNN กับ .pt นับคนได้เท่ากัน", "ใกล้ 100"),
        ("mAP50-95_diff", "mAP50-95 ของ NCNN ลบ .pt (เทียบ Label)", "ใกล้ 0"),
        ("verdict", "PASS = |mAP diff| ≤ 0.02 และ IoU ≥ 0.95 และกรอบตรงกัน ≥ 90% · CHECK = ต้องตรวจเพิ่ม", "PASS")]),
}


def write_metrics(out_dir: Path, results: list[tuple[dict, dict]]) -> None:
    """results = [(key columns, groups)] -> one CSV per kind of metric + summary.md in out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    lines = [f"# Eval on {host()}", "",
             f"ภาพ test {results[0][1]['accuracy']['images']} รูป · นับที่ confidence ≥ {CONF} และ IoU ≥ {IOU_MATCH} "
             "(mAP ไม่ขึ้นกับ conf) · ภาพผลทีละรูป: `results/<เครื่อง>/<model>_<size>_ncnn/` (เขียว = ถูก, "
             "แดง = กรอบผิด, เหลือง LOW = เห็นแต่ไม่มั่นใจ, ส้ม MISSED = ไม่เห็น) · รายคน: `per_person/`", ""]
    for group, file in METRIC_FILES.items():
        rows = [{**key, **groups[group]} for key, groups in results if group in groups]
        if not rows:
            continue
        write_csv(out_dir / file, rows)
        title, info = METRIC_INFO[group]
        cols = list(rows[0])
        lines += [f"## {title}", f"ไฟล์: `{file}`", "", "| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
        lines += ["| " + " | ".join(str(r[c]) for c in cols) + " |" for r in rows]
        lines += ["", "| ค่า | วัดอะไร | ดีเมื่อ |", "|---|---|---|"]
        lines += [f"| {a} | {b} | {c} |" for a, b, c in info] + [""]
    (out_dir / "summary.md").write_text("\n".join(lines) + "\n")
