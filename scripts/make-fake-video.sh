#!/usr/bin/env bash
# Turns the fixture face into the fake camera stream for the end-to-end tests
# (spec §10.4): a 12 s, 640×480, 30 fps MJPEG with a slow zoom and pan, which
# Chromium plays through --use-file-for-fake-video-capture.
#
# Usage: bash scripts/make-fake-video.sh [image] [output]
#   image   default tests/fixtures/face/portrait.jpg
#   output  default tests/fixtures/generated/face.mjpeg (git-ignored)
# CROP_Y (0–1, default 0.25) places the 4:3 crop on a tall portrait: 0 keeps
# the top, 1 the bottom.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="${1:-tests/fixtures/face/portrait.jpg}"
OUT="${2:-tests/fixtures/generated/face.mjpeg}"
CROP_Y="${CROP_Y:-0.25}"

command -v ffmpeg >/dev/null 2>&1 || { echo "make-fake-video: ffmpeg is required." >&2; exit 1; }
[[ -f "$SRC" ]] || { echo "make-fake-video: face image not found: $SRC" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
tmp="$(dirname "$OUT")/.$(basename "$OUT").tmp.$$"
trap 'rm -f "$tmp"' EXIT

# Cover 960×720, crop to 4:3, then zoom (±4 %) and pan (±2 % horizontally,
# ±1.5 % vertically) slowly down to 640×480. 360 frames = 12 s at 30 fps.
filter="scale=960:720:force_original_aspect_ratio=increase,crop=960:720:(iw-960)/2:(ih-720)*${CROP_Y},"
filter+="zoompan=z='1.06+0.04*sin(2*PI*on/360)':x='iw/2-(iw/zoom/2)+iw*0.02*sin(2*PI*on/240)':y='ih/2-(ih/zoom/2)+ih*0.015*sin(2*PI*on/300)':d=1:s=640x480:fps=30,"
filter+="format=yuvj420p"

ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 30 -i "$SRC" -vf "$filter" \
  -frames:v 360 -c:v mjpeg -q:v 4 -f mjpeg "$tmp"
mv -f "$tmp" "$OUT"
trap - EXIT
echo "make-fake-video: wrote $OUT ($(du -h "$OUT" | cut -f1)) from $SRC"
