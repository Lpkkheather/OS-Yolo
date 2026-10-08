"""Step 2 — record a test clip from the camera, so every model can be tested on exactly the same video.

On the Raspberry Pi it records from the Pi camera, elsewhere from webcam 0.
Record at the real spot, angle and light where the camera will be used (day and night).
People in the clip must agree to being recorded (PDPA).

Usage:
    python 2_record_clip.py --seconds 30 --name corridor      # -> clips/corridor.mp4
    python 2_record_clip.py --no-show                         # without a preview window (over SSH)
Then: python 3_camera.py --source clips/corridor.mp4 --true-count <people you see in the clip>
"""

import argparse
import time

import cv2

from common import CLIPS, default_source, open_webcam, picamera_frames


def webcam_frames(index: int):
    cap = open_webcam(index)  # gives up with a clear message if the camera is busy or not allowed
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                return
            yield frame
    finally:
        cap.release()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=30)
    ap.add_argument("--name", default=time.strftime("clip_%Y%m%d_%H%M%S"))
    ap.add_argument("--source", default=None, help="picamera | webcam index (default: Pi camera on the Pi, else 0)")
    ap.add_argument("--size", default="1280x720", help="saved video size WxH")
    ap.add_argument("--fps", type=float, default=30, help="frame rate written into the video file")
    ap.add_argument("--no-show", action="store_true", help="do not open a preview window")
    args = ap.parse_args()

    width, height = map(int, args.size.lower().split("x"))
    source = args.source or default_source()
    frames = picamera_frames(width, height) if source == "picamera" else webcam_frames(int(source))
    CLIPS.mkdir(exist_ok=True)
    out = CLIPS / f"{args.name}.mp4"
    writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"mp4v"), args.fps, (width, height))

    print(f"recording {args.seconds:.0f} s from {source} -> {out}   (q = stop early)")
    start = time.time()
    n = 0
    for frame in frames:
        if frame.shape[1] != width or frame.shape[0] != height:
            frame = cv2.resize(frame, (width, height))
        writer.write(frame)
        n += 1
        elapsed = time.time() - start
        if not args.no_show:
            preview = frame.copy()
            cv2.putText(preview, f"REC {elapsed:4.1f}/{args.seconds:.0f} s", (10, 36), cv2.FONT_HERSHEY_SIMPLEX,
                        1.0, (0, 0, 255), 2)
            cv2.imshow("recording (q = stop)", preview)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
        if elapsed >= args.seconds:
            break
    writer.release()
    if not args.no_show:
        cv2.destroyAllWindows()
    elapsed = time.time() - start
    print(f"saved {out}: {n} frames in {elapsed:.1f} s ({n / elapsed:.1f} fps captured)")
    print(f"next: python 3_camera.py --source {out.relative_to(CLIPS.parent)} --true-count <people in the clip>")


if __name__ == "__main__":
    main()
