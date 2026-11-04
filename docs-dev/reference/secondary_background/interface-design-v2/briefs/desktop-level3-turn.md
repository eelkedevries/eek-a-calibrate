# Brief: `desktop-level3-turn.dc.html` · "Webcam · Level 3 Turn your head" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900.

**State**: Level 3 in play, the 3rd of 5 bubbles (HEAD5 point 0.71, 0.29): turning done (left and right arcs full), now nodding; the up arc 40 % reached and active. **Mode**: stimulus. Root: `class="on-stage"`, `position:relative`, `--stage` edge to edge. Safe area x 24–1416, y 24–876.

Content:
1. `<h1 class="sr-only">Level 3: Turn your head</h1>`.
2. **Pip line**: `<div role="progressbar" aria-label="Level 3 progress" aria-valuemin="0" aria-valuemax="5" aria-valuenow="2">`, left 24, top 12, 1392 × 4; SVG: 5 rects 273.6 × 4, rx 2, at x 0, 279.6, 559.2, 838.8, 1118.4; first 2 `--pip-on`, rest `--pip-off`.
3. Full-size SVG `viewBox="0 0 1440 900"`, `role="img" aria-label="Left and right reached. Up partly reached. Down not yet."`:
   - **Arc tracks**, fill none, `--arc-off`, dasharray `4 4`, width 4 (up: 6): left `M958.3 302A62 62 0 0 1 958.3 240`; right `M1065.7 240A62 62 0 0 1 1065.7 302`; up `M981 217.3A62 62 0 0 1 1043 217.3`; down `M1043 324.7A62 62 0 0 1 981 324.7`.
   - **Arc fills**, solid `--arc-on`, butt caps: left and right full (same paths, 4 px); up partial from its midpoint `M999.1 210.4A62 62 0 0 1 1024.9 210.4`, 6 px; down none.
   - **Bubble, static** (no ghost, no shrink) at `translate(1012 271)`: R 40 (80 px), SHINE for R 40 (`M-23.5-15.2A28 28 0 0 1-9.1-26.5`), ABC dot 24 px (cross cut `--stage` then `--bubble-fill`).
4. **Caption chip**: absolute, top 349, left 1012, `transform:translateX(-50%)`, 32 px tall, padding 0 16, `--stage-chip` pill, 14 medium `--stage-chip-text`, `role="status"`: "Now nod slowly".
5. **Prototype link**: `<a href="desktop-level-complete.dc.html" aria-label="Next board: Warm-up complete">` over the bubble (left 972, top 231, 80 × 80, radius 50 %), transparent.
6. **Corner cluster**: right 24, bottom 24, gap 8: Good glyph (opacity 0.6) + 44 px Pause (`--stage-chip`, `aria-label="Pause"`) at x 1372–1416, y 832–876.

The arcs respond to the head, not to gaze; no copy claims otherwise. No gold. Links: bubble (prototype) → `desktop-level-complete.dc.html`.
