"""Step 0 — convert the .pt models to NCNN, the fastest format on the Raspberry Pi (already done on the Mac).

NCNN runs the same network with code optimised for ARM processors like the Pi 5's. An NCNN model is
fixed to the image size it was exported with, so there is one per size (640 = more detail, 320 = faster).
Run this again only if the .pt models change (for example after re-training in ~/Documents/YOLO).

Usage:
    python 0_export_ncnn.py                  # yolo26n and yolo11n, sizes 640 and 320
Output:
    models/<model>_<size>_ncnn_model/   model.ncnn.param (layers) + model.ncnn.bin (weights) + metadata.yaml
"""

import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO

from common import MODEL_NAMES, SIZES, ncnn_model, pt_model


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=list(MODEL_NAMES), choices=MODEL_NAMES)
    ap.add_argument("--sizes", type=int, nargs="+", default=list(SIZES))
    args = ap.parse_args()

    for name in args.models:
        for imgsz in args.sizes:
            exported = Path(YOLO(pt_model(name)).export(format="ncnn", imgsz=imgsz))  # models/<name>_ncnn_model
            target = ncnn_model(name, imgsz)
            if target.exists():
                shutil.rmtree(target)
            exported.rename(target)
            for extra in ("model_ncnn.py", "__pycache__"):  # example script written by the converter, not needed
                p = target / extra
                shutil.rmtree(p) if p.is_dir() else p.unlink(missing_ok=True)
            print(f"{name} {imgsz}: {pt_model(name).name} -> {target.name}")
    print("next: python 1_check_accuracy.py")


if __name__ == "__main__":
    main()
