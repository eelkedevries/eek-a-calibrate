# Brief: `position-signals.dc.html` · "Position guard: every state" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900. No links, no gold.

**Component sheet**, dark: `--color-background`, padding 32 40. Section labels 14 medium muted; captions: state 14 medium, cue 14 muted. Header (y 32–88): "Position guard: every state" (Spectral 600, 28).

**Camera layers** (strokes halo first in `--halo`; in tiles use `vector-effect="non-scaling-stroke"`: halo 4, oval 2, ring 4, outline 1.5; eye dots r 12, `--gaze`, black edge):
- Phone, `viewBox="0 0 390 844"`, `--preview-bg`: shoulders `M10 844C20 650 110 600 195 600S370 650 380 844Z` and head ellipse (195,402) 124 × 162 in `--preview-figure`; veil, even-odd, `--stage-veil`: `M0 0H390V844H0ZM56 397A139 181 0 1 0 334 397A139 181 0 1 0 56 397Z`; oval (195,397) 139 × 181; outline (195,400) 122 × 160 `--color-text`; eyes (148,372), (242,372); ✓ badge (195,216) r 12 `--state-good`, check `M189.5 216.5l3.5 3.5 6.5-7`.
- Webcam, `viewBox="0 0 1440 900"`: shoulders `M330 900C350 720 520 680 720 680S1090 720 1110 900Z`, head (720,432) 152 × 198; veil `M0 0H1440V900H0ZM552 423A168 218 0 1 0 888 423A168 218 0 1 0 552 423Z`; oval (720,423) 168 × 218; outline (720,428) 148 × 194; eyes (663,398), (777,398); badge (720,205), check `M714.5 205.5l3.5 3.5 6.5-7`.

**Column 1** (x 40–580):
1. "Get ready · phone" (y 104): four tiles 117 × 253, gap 24, radius 14, clipped (y 132–385), captions below:
   - **Searching**: veil, no face; oval `--color-text` 50 %, dashed `8 6`. "Point the camera at your face".
   - **Adjust**: small face (head 80 × 104, outline 78 × 102, eyes (165,382), (225,382)); oval `--state-adjust`; outward chevrons `M98 385l-12 12 12 12`, `M292 385l12 12-12 12`, `M183 270l12-12 12 12`, `M183 524l12 12 12-12`. "Move a little closer".
   - **Holding**: full face; oval `--state-good`; ring `M195 216A139 181 0 1 1 194.9 216`, `pathLength="100" stroke-dasharray="60 100"`. "Perfect, hold still".
   - **Ready**: ring complete + badge. "Ready · Stay like this while you play".
2. "Get ready · webcam" (y 457): two tiles 258 × 161 (y 485–646): **Adjust**, face high (head and outline 100 px higher), oval `--state-adjust`, chevron `M700 560l20 20 20-20`: "Tilt the screen back a little"; **Ready**: "Ready".
3. "Status row and phone tilt" (y 718): `--stage-chip` card (radius 14, padding 12 16, y 746–794): ✓ Distance · ! Position (`--state-adjust` badge) · ✓ Light; below (y 806–846) a 40 px `--stage-chip` pill: phone side view (`<rect x="9" y="3" width="6" height="18" rx="1.5" transform="rotate(25 12 12)"/><path d="M17 6.5a7 7 0 0 1 1.5 6M19.8 10.6l-1.3 2.2-2.2-1.2"/>`, `--state-adjust`) + "Stand the phone more upright".

**Column 2** (x 620–1400):
1. "Compact glyph" (y 104): `--stage` panel 780 × 132, radius 14 (y 132–264), four groups with captions in `--stage-ink` 14 medium: Good; Drifting + nudge pill (32 px `--stage-chip`: 14 px ! badge + "A little closer"); Lost; corner cluster (glyph + 44 px Pause). Note (14 muted): "In warm-up levels it turns amber silently. Words appear only in Free look and the challenge."
2. "Auto-pause" (y 316): panel 780 × 524 (y 344–868, radius 14, clipped), `--stage` under a `--stage-scrim` layer; padding 20, gap 20, two `--stage-chip` cards (radius 14, padding 16, column, gap 8, `role="alertdialog"`):
   - **Phone**, 320 wide: "Paused" (14 medium muted); preview 180 × 240 (phone layer cropped, head moved right and partly out; the home ghost dashed 2 px `--color-text` at 70 %; live outline and eyes); "Move back into view" (20 medium); "Carries on by itself" (14 muted); ghost "Exit" (44 px).
   - **Webcam**, 400 wide, after 10 s, face lost: "Paused"; preview 368 × 230 with the home ghost only; "Look back at the screen"; "Carries on by itself"; ghost "Exit" + `btn--chip` "Warm up again".
