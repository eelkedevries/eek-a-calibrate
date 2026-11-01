#!/usr/bin/env bash
# Turns the fixture face into the fake camera stream for the end-to-end tests
# (spec §10.4, §14.2.11): a 12 s, 30 fps MJPEG with a slow zoom and pan, which
# Chromium plays through --use-file-for-fake-video-capture. Landscape is
# 640×480; --portrait gives 480×640, as a phone's front camera delivers when
# held upright, with the face at the same scale in pixels.
#
# Usage: bash scripts/make-fake-video.sh [--portrait] [image] [output]
#   image   default tests/fixtures/face/portrait.jpg
#   output  default tests/fixtures/generated/face.mjpeg, or face-portrait.mjpeg
#           with --portrait (both git-ignored)
# CROP_Y (0–1, default 0.25) places the crop on a tall image: 0 keeps the top,
# 1 the bottom. CROP_X (0–1, default 0.5) does the same horizontally for the
# portrait crop.
set -euo pipefail

cd "$(dirname "$0")/.."
PORTRAIT=0
if [[ "${1:-}" == "--portrait" ]]; then
  PORTRAIT=1
  shift
fi
SRC="${1:-tests/fixtures/face/portrait.jpg}"
if [[ "$PORTRAIT" == 1 ]]; then
  OUT="${2:-tests/fixtures/generated/face-portrait.mjpeg}"
else
  OUT="${2:-tests/fixtures/generated/face.mjpeg}"
fi
CROP_Y="${CROP_Y:-0.25}"
CROP_X="${CROP_X:-0.5}"

command -v ffmpeg >/dev/null 2>&1 || { echo "make-fake-video: ffmpeg is required." >&2; exit 1; }
[[ -f "$SRC" ]] || { echo "make-fake-video: face image not found: $SRC" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
tmp="$(dirname "$OUT")/.$(basename "$OUT").tmp.$$"
trap 'rm -f "$tmp"' EXIT

# Landscape: cover 960×720 and crop to 4:3. Portrait: cover 960×960, which
# gives the image the same scale as the landscape cover for a tall image, and
# crop to 3:4. Then zoom (±4 %) and pan (±2 % horizontally, ±1.5 % vertically)
# slowly down to the output size, a scale of 2/3 in both cases. 360 frames =
# 12 s at 30 fps.
if [[ "$PORTRAIT" == 1 ]]; then
  filter="scale=960:960:force_original_aspect_ratio=increase,crop=720:960:(iw-720)*${CROP_X}:(ih-960)*${CROP_Y},"
  size="480x640"
else
  filter="scale=960:720:force_original_aspect_ratio=increase,crop=960:720:(iw-960)/2:(ih-720)*${CROP_Y},"
  size="640x480"
fi
filter+="zoompan=z='1.06+0.04*sin(2*PI*on/360)':x='iw/2-(iw/zoom/2)+iw*0.02*sin(2*PI*on/240)':y='ih/2-(ih/zoom/2)+ih*0.015*sin(2*PI*on/300)':d=1:s=${size}:fps=30,"
filter+="format=yuvj420p"

ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 30 -i "$SRC" -vf "$filter" \
  -frames:v 360 -c:v mjpeg -q:v 4 -f mjpeg "$tmp"
mv -f "$tmp" "$OUT"
trap - EXIT
echo "make-fake-video: wrote $OUT ($(du -h "$OUT" | cut -f1), ${size/x/×}) from $SRC"
