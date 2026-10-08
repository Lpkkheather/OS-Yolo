#!/usr/bin/env bash
# Copy this folder from the Mac to the Raspberry Pi over the network (run on the Mac).
#   bash send_to_pi.sh                    asks for the Pi's username and IP address
#   bash send_to_pi.sh pi 192.168.1.50    or give them directly
# Find them ON THE PI:   whoami   -> username        hostname -I   -> IP address
# The Mac and the Pi must be on the same network, and SSH must be on (Pi: sudo raspi-config > Interface Options > SSH).
set -euo pipefail
cd "$(dirname "$0")"

PI_USER=${1:-}
PI_IP=${2:-}
[ -n "$PI_USER" ] || read -rp "Pi username (run 'whoami' on the Pi): " PI_USER
[ -n "$PI_IP" ] || read -rp "Pi IP address (run 'hostname -I' on the Pi, e.g. 192.168.1.50): " PI_IP

echo "copying $(pwd) -> $PI_USER@$PI_IP:~/YOLO_Pi   (type the Pi's password if it asks)"
# results/ = the Mac's result images and data/ = the Mac's test counts: the Pi makes its own.
# --update: a file that is newer on the Pi (e.g. zones.json drawn there) is not overwritten.
rsync -av --update --exclude .venv --exclude __pycache__ --exclude .claude --exclude "*.cache" --exclude logs \
  --exclude results --exclude data --exclude zones_preview.jpg "$(pwd)" "$PI_USER@$PI_IP:~/"
echo
echo "done. Next, on the Pi:  cd ~/YOLO_Pi && bash run.sh setup"
