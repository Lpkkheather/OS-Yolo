"""Step 1 — EVAL: check every model on the 200 test images (with Ground Truth) on THIS machine.

For each model (yolo26n, yolo11n) x image size (640, 320) x format (ncnn = what the Pi runs, pt = original):
accuracy (precision, recall, F1, accuracy, mAP), IoU, counting error (MAE) and speed — all against the labels.
Agreement: the NCNN boxes compared directly with the .pt boxes on the same images, to prove the conversion
did not change the model (IoU close to 1, same number of people).
One result image per test image is saved for the NCNN models.
Run it on the Mac to test first, then on the Pi — each machine's results are kept in its own folder.

Usage:
    python 1_eval.py            # everything (on the Pi about 10 minutes)
    python 1_eval.py --quick    # 50 images, NCNN only, no mAP (on the Pi about 1 minute)
    python 1_eval.py --models yolo26n yolo26n_trained     # only these models
Output:
    metrics/<machine>/summary.md          all tables + what each metric means
    metrics/<machine>/accuracy.csv, iou.csv, counting_mae.csv, speed.csv, missed.csv, agreement.csv,
                      per_image/<model>_<size>_<format>.csv
                      per_person/<model>_<size>_<format>.csv     one row per labelled person: found / low / missed + why
    results/<machine>/<model>_<size>_ncnn/NNN_<image>.jpg
                      green = correct, red = wrong box, yellow LOW = seen with a score of 0.10-0.40, orange MISSED = not seen
"""

import argparse
import tempfile

from ultralytics import YOLO

from common import (METRICS, MODEL_NAMES, PERSON, RESULTS, SIZES, agreement, data_yaml, evaluate, host, ncnn_model,
                    pt_model, write_csv, write_metrics)

# The NCNN model counts as unchanged (PASS) when, compared with the .pt model on the same images:
MAX_MAP_DIFF = 0.02  # accuracy against the labels differs by at most 0.02 mAP50-95
MIN_IOU = 0.95  # its boxes overlap the .pt boxes by IoU >= 0.95 on average
MIN_SAME = 90.0  # at least 90% of the boxes are found by both


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="50 images, NCNN models only, no mAP")
    ap.add_argument("--models", nargs="+", default=list(MODEL_NAMES), choices=MODEL_NAMES,
                    help="which models in models/ to check (default: all)")
    args = ap.parse_args()
    limit = 50 if args.quick else 0
    formats = ("ncnn",) if args.quick else ("ncnn", "pt")
    data = str(data_yaml())

    results = []
    for name in args.models:
        for imgsz in SIZES:
            preds = {}
            for fmt in formats:
                path = ncnn_model(name, imgsz) if fmt == "ncnn" else pt_model(name)
                if not path.exists():
                    print(f"[{name} {imgsz} {fmt}] skipped: {path.name} not found (run 0_export_ncnn.py)")
                    continue
                model = YOLO(path, task="detect")
                image_dir = RESULTS / host() / f"{name}_{imgsz}_ncnn" if fmt == "ncnn" else None
                groups, rows, people, preds[fmt] = evaluate(model, imgsz, image_dir, limit)
                if not args.quick:
                    v = model.val(data=data, split="val", classes=[PERSON], imgsz=imgsz, batch=1, plots=False,
                                  verbose=False, project=tempfile.gettempdir(), name="yolo_pi_val", exist_ok=True)
                    groups["accuracy"].update({"mAP50": round(v.box.map50, 3), "mAP50-95": round(v.box.map, 3)})
                write_csv(METRICS / host() / "per_image" / f"{name}_{imgsz}_{fmt}.csv", rows)
                write_csv(METRICS / host() / "per_person" / f"{name}_{imgsz}_{fmt}.csv", people)
                results.append(({"model": name, "size": imgsz, "format": fmt}, groups))
                a, i, c, s, m = (groups[g] for g in ("accuracy", "iou", "counting", "speed", "missed"))
                print(f"[{name} {imgsz} {fmt:>4}] accuracy {a['accuracy']}  F1 {a['F1']}  "
                      f"mAP50-95 {a.get('mAP50-95', '-')}  |  IoU {i['mean_IoU']}  |  MAE {c['MAE']}  |  "
                      f"missed {m['FN']} = {m['seen_low']} LOW + {m['not_seen']} not seen  |  "
                      f"{s['ms_per_image']} ms  {s['FPS']} FPS" + (f"  CPU {s['cpu_temp_C']} °C" if s["cpu_temp_C"] else ""),
                      flush=True)
            if len(preds) == 2:  # NCNN vs .pt on the same images
                ncnn_groups = next(g for k, g in results if k == {"model": name, "size": imgsz, "format": "ncnn"})
                pt_groups = next(g for k, g in results if k == {"model": name, "size": imgsz, "format": "pt"})
                ag = agreement(preds["ncnn"], preds["pt"])
                map_diff = ncnn_groups["accuracy"]["mAP50-95"] - pt_groups["accuracy"]["mAP50-95"]
                ok = abs(map_diff) <= MAX_MAP_DIFF and ag["mean_IoU_vs_pt"] >= MIN_IOU and ag["same_boxes_%"] >= MIN_SAME
                ag.update({"mAP50-95_diff": round(map_diff, 3), "verdict": "PASS" if ok else "CHECK"})
                ncnn_groups["agreement"] = ag
                print(f"[{name} {imgsz} ncnn vs pt] {ag['verdict']}: same boxes {ag['same_boxes_%']}%  "
                      f"IoU {ag['mean_IoU_vs_pt']}  same count {ag['same_count_images_%']}% of images  "
                      f"mAP50-95 diff {map_diff:+.3f}", flush=True)

    write_metrics(METRICS / host(), results)
    print(f"\nnumbers -> {METRICS / host() / 'summary.md'}\nimages  -> {RESULTS / host()}/")
    print("next: bash run.sh 2 (record a test clip) / bash run.sh 3 (live camera)")


if __name__ == "__main__":
    main()
