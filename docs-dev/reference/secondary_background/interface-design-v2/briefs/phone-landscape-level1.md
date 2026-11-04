# Brief: `phone-landscape-level1.dc.html` · "Phone landscape · Level 1" · 844×390
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 844×390.

**State**: the same moment as `phone-level1-pop`, phone turned with the **camera on the left**: Level 1, the 7th of 13 bubbles mid-shrink, 6 done. **Mode**: stimulus. Root: `class="on-stage"`, `position:relative`, `--stage` edge to edge. Safe area x 48–796, y 24–366 (48 px sides, 24 top and bottom). No text, no level name, no points.

Content:
1. `<h1 class="sr-only">Level 1: Pop the dots</h1>`.
2. **Pip line, vertical on the camera edge**: `<div role="progressbar" aria-label="Level 1 progress" aria-valuemin="0" aria-valuemax="13" aria-valuenow="6">`, absolute, left 12, top 24, 4 × 342, holding an SVG 4 × 342: 13 rects, width 4, height 22.6, rx 2, at y 0, 26.6, 53.2, 79.8, 106.5, 133.1, 159.7, 186.3, 212.9, 239.5, 266.2, 292.8, 319.4. The first 6 (top) `--pip-on`, the rest `--pip-off`.
3. **Bubble**: full-size SVG `viewBox="0 0 844 390"`, `aria-hidden`, spec-core bubble at `translate(579 123)` (point 0.71, 0.29 of the safe area): ghost RF 39, R 24, SHINE for R 24 (`M-14.1-9.1A16.8 16.8 0 0 1-5.5-15.9`), ABC dot 24 px (cross cut `--stage` then `--bubble-fill`).
4. **Corner cluster** at the bottom of the far side: absolute, right 48, bottom 24, flex, gap 8: the Good position glyph (opacity 0.6), then the 44 px Pause button (`--stage-chip`, `--stage-chip-text`, `aria-label="Pause"`) at x 752–796, y 322–366.

No gold. No links on this board (the bubble pops on its timer).
