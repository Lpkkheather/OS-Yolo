#!/usr/bin/env bash
# YOLO_Pi — run on the Raspberry Pi 5 (every step also works on the Mac for testing first).
#
#   bash run.sh setup          once on the Pi: Python environment .venv + packages (needs internet)
#   bash run.sh 1              eval on the 200 test images: accuracy, IoU, MAE, speed, NCNN-vs-.pt agreement
#                              -> metrics/<machine>/summary.md, results/<machine>/ (one image per test image)
#   bash run.sh 1 --quick      50 images, NCNN only (about 1 minute on the Pi)
#   bash run.sh 2 --seconds 30 --name corridor      record a test clip (Pi camera on the Pi, webcam on the Mac)
#   bash run.sh 3              live people detection + log of every frame, q = quit
#   bash run.sh 3 --source clips/corridor.mp4 --true-count 4     run on a clip; you counted 4 people in it
#   bash run.sh 3 --no-show --seconds 60                        live 60 s without a window (over SSH)
#                              -> metrics/<machine>/camera/<run>/summary.md, metrics/<machine>/camera/runs.csv
#   bash run.sh 4              draw the counting line / zone on the camera picture -> zones.json
#   bash run.sh 4 --line 0.5,0.1,0.5,0.9          ... or give it as numbers (over SSH, see zones_preview.jpg)
#   bash run.sh 3 --zones      counting with a window: line, zone and counters on the picture
#   bash run.sh 3 --source clips/site.mp4 --zones --true-in 5 --true-out 3    check the counting on a clip
#   bash run.sh count          count for real: no window, one row per minute -> data/<date>.csv + MQTT
#                              pi5/people/count (broker on this Pi; --mqtt <ip> = other broker, --mqtt off = none)
#   bash run.sh service install    start "count" at every boot and restart it if it stops (Pi only)
#   bash run.sh service status | logs | stop | start | restart | uninstall
#   bash run.sh import         on the Mac: bring the trained models (models/*_trained.pt) and the test set from
#                              ~/Documents/YOLO, and convert them to NCNN -> then bash run.sh 1 / send
#   bash run.sh send           on the Mac: copy this folder to the Pi (asks for the Pi's username + IP)
#   bash run.sh github "what changed"   on the Mac: put this folder on GitHub (branch YoLo_Detect, folder YOLO_Pi/)
#   bash run.sh 0              re-export every .pt in models/ -> NCNN
# Steps 0, 1 and import are also saved in logs/<step>.log
set -euo pipefail
cd "$(dirname "$0")"

STEP=${1:-}
[ $# -gt 0 ] && shift
UNIT=yolo-pi-counter  # systemd service of "bash run.sh service"

camera_free() {  # stop if the counting service has the camera: a second program on it makes the USB camera reset
  local source=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --source) source=${2:-} ;;
      --source=*) source=${1#--source=} ;;
    esac
    shift
  done
  [ -e "$source" ] || [[ "$source" == *://* ]] && return 0  # a clip, a picture or a stream, not the camera
  if command -v systemctl >/dev/null && systemctl is-active --quiet $UNIT; then
    echo "the counting service is using the camera: stop it first with  bash run.sh service stop"
    echo "(start it again afterwards with  bash run.sh service start)"
    exit 1
  fi
}

if [ "$STEP" = send ]; then
  exec bash send_to_pi.sh "$@"
fi

if [ "$STEP" = github ]; then
  [ -f push_to_github.sh ] || { echo "push_to_github.sh is only on the author's Mac (it is not part of the repository)"; exit 1; }
  exec bash push_to_github.sh "$@"
fi

if [ "$STEP" = setup ]; then
  if command -v apt >/dev/null && [ "$(uname)" = Linux ]; then
    sudo apt install -y python3-picamera2        # Pi camera library (already on Raspberry Pi OS)
    python3 -m venv --system-site-packages .venv  # lets the venv use picamera2 from Raspberry Pi OS
    # The Pi's storage is small: keep no download cache, and unpack here instead of /tmp (which can be a RAM disk).
    export PIP_NO_CACHE_DIR=1 TMPDIR="$PWD/.pip-tmp"
    mkdir -p "$TMPDIR"
    # CPU-only PyTorch first. The default Linux PyTorch also downloads several GB of NVIDIA GPU libraries that a
    # Pi cannot use and that fill the SD card ("No space left on device").
    .venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
  else
    python3 -m venv .venv
  fi
  .venv/bin/pip install -r requirements.txt
  rm -rf .pip-tmp
  echo "done: .venv is ready"
  exit 0
fi

if [ "$STEP" = service ]; then
  ACTION=${1:-status}
  [ $# -gt 0 ] && shift
  case "$ACTION" in
    install)
      [ "$(uname)" = Linux ] || { echo "the service is for the Raspberry Pi (Linux + systemd)"; exit 1; }
      [ "$(id -u)" != 0 ] || { echo "run it without sudo (it asks for sudo itself)"; exit 1; }
      [ -f zones.json ] || { echo "no zones.json yet: draw the line / zone first with  bash run.sh 4"; exit 1; }
      sudo tee /etc/systemd/system/$UNIT.service >/dev/null <<EOF
[Unit]
Description=YOLO_Pi people counter -> data/*.csv + MQTT pi5/people/count
After=network-online.target mosquitto.service
Wants=network-online.target

[Service]
User=$(id -un)
WorkingDirectory=$PWD
ExecStart=/bin/bash $PWD/run.sh count $*
Environment=PYTHONUNBUFFERED=1
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
      sudo systemctl daemon-reload
      sudo systemctl enable --now $UNIT
      echo "installed: counting starts at every boot and restarts by itself. Check: bash run.sh service logs" ;;
    uninstall)
      sudo systemctl disable --now $UNIT || true
      sudo rm -f /etc/systemd/system/$UNIT.service
      sudo systemctl daemon-reload
      echo "removed" ;;
    start|stop|restart) sudo systemctl "$ACTION" $UNIT ;;
    status) systemctl status $UNIT --no-pager || true ;;
    logs) journalctl -u $UNIT -n 30 -f ;;
    *) echo "usage: bash run.sh service [install|status|logs|stop|start|restart|uninstall]"; exit 1 ;;
  esac
  exit 0
fi

if [ -f .venv/bin/activate ]; then
  source .venv/bin/activate
elif [ -f ~/Downloads/Lab07/.venv/bin/activate ]; then
  source ~/Downloads/Lab07/.venv/bin/activate  # on the Mac, until "bash run.sh setup" has been run
else
  echo "run 'bash run.sh setup' first"; exit 1
fi
export PYTHONWARNINGS=ignore
mkdir -p logs

run() {  # run one step: show it on screen and save it in logs/<name>.log
  local name=$1
  shift
  echo "===== $name =====   (log: logs/$name.log)"
  python "$@" 2>&1 | tee "logs/$name.log"
}

case "$STEP" in
  import)
    YOLO_DIR=${YOLO_DIR:-$HOME/Documents/YOLO}
    trained=("$YOLO_DIR"/models/*_trained.pt)
    [ -e "${trained[0]}" ] || { echo "no trained model in $YOLO_DIR/models (run 'bash run.sh 2' there first)"; exit 1; }
    cp "${trained[@]}" models/
    rm -rf test_data/images test_data/labels && mkdir -p test_data
    cp -R "$YOLO_DIR/dataset/images/test" test_data/images
    cp -R "$YOLO_DIR/dataset/labels/test" test_data/labels
    echo "copied: $(for f in "${trained[@]}"; do basename "$f"; done | tr '\n' ' ') + test set ($(ls test_data/images | wc -l | tr -d ' ') images)"
    names=(); for f in "${trained[@]}"; do names+=("$(basename "$f" .pt)"); done
    run 0_export_ncnn 0_export_ncnn.py --models "${names[@]}" ;;
  0) run 0_export_ncnn 0_export_ncnn.py "$@" ;;
  1) run "1_eval_$(hostname -s)" 1_eval.py "$@" ;;
  2) camera_free "$@"; python 2_record_clip.py "$@" ;;
  3) camera_free "$@"; python 3_camera.py "$@" ;;
  4|zones) camera_free "$@"; python 4_set_zones.py "$@" ;;
  count)
    [ -f zones.json ] || { echo "no zones.json yet: draw the line / zone first with  bash run.sh 4"; exit 1; }
    exec python 3_camera.py --zones zones.json --mqtt localhost --no-show --no-frame-log --every 0 "$@" ;;
  *) echo "usage: bash run.sh [setup|1|2|3|4|count|service|import|send|github|0] [options]"; exit 1 ;;
esac
