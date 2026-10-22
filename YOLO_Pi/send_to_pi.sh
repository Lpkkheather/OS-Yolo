#!/usr/bin/env bash
# Copy this folder from the Mac to the Raspberry Pi over the network (run on the Mac), and the dashboard backend
# (../backend, without node_modules) next to it: ~/YOLO_Pi + ~/backend on the Pi (bash run.sh backend install).
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

SOURCES=("$(pwd)")
BACKEND="$(cd .. && pwd)/backend"
[ -d "$BACKEND" ] && SOURCES+=("$BACKEND")
echo "copying ${SOURCES[*]} -> $PI_USER@$PI_IP:~/   (type the Pi's password if it asks)"
# results/ = the Mac's result images and data/ = the Mac's test counts: the Pi makes its own.
# node_modules = the Mac's packages: the Pi installs its own (bash run.sh backend install).
# --update: a file that is newer on the Pi (e.g. zones.json drawn there) is not overwritten.
rsync -av --update --exclude .venv --exclude __pycache__ --exclude .claude --exclude "*.cache" --exclude logs \
  --exclude results --exclude data --exclude zones_preview.jpg --exclude node_modules "${SOURCES[@]}" "$PI_USER@$PI_IP:~/"
echo
echo "done. Next, on the Pi:  cd ~/YOLO_Pi && bash run.sh setup"
[ -d "$BACKEND" ] && echo "      dashboard backend:  bash run.sh backend install   (after a backend change: bash run.sh backend install again)"
exit 0
