# Brief: `phone-landscape-challenge.dc.html` · "Phone landscape · Challenge" · 844×390
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 844×390.

**State**: as `phone-challenge`, phone turned with the **camera on the left**: round 2 "Mind the spikes", bubble 9 of 16 (8 done), zones 3 × 1, the player looks at the **right** zone and its bubble shrinks; a decoy in the left zone; streak active. Score is an example. **Mode**: stimulus. Root: `class="on-stage"`, `position:relative`, `--stage`. Safe area x 48–796, y 24–366.

1. `<h1 class="sr-only">Challenge, round 2: Mind the spikes</h1>`.
2. **Board**: full-size SVG `viewBox="0 0 844 390"`, `role="img" aria-label="Three zones. A bubble in the right zone, a spike in the left zone. You are looking at the right zone."`:
   - zones rx 14, y 38, h 314: left x 78 w 219 and middle x 313 w 219 (no fill, `--stage-line` 1.5); right x 548 w 218 **lit** (fill `--stage-lit`, stroke `--halo` 2);
   - **decoy** at `translate(180 240)`: `<path d="M0-30L6-22.2L15-26L16.3-16.3L26-15L22.2-6L30 0L22.2 6L26 15L16.3 16.3L15 26L6 22.2L0 30L-6 22.2L-15 26L-16.3 16.3L-26 15L-22.2 6L-30 0L-22.2-6L-26-15L-16.3-16.3L-15-26L-6-22.2Z" fill="var(--decoy)"/>`;
   - **bubble** at `translate(676 170)`: ghost RF 39, R 20, SHINE `M-11.7-7.6A14 14 0 0 1-4.6-13.2`, ABC dot (cross cut `--stage` then `--bubble-fill`).
3. **Pip line, vertical on the camera edge**: `<div role="progressbar" aria-label="Round 2 progress" aria-valuemin="0" aria-valuemax="16" aria-valuenow="8">`, left 12, top 24, 4 × 342; SVG: 16 rects 4 × 17.6, rx 2, at y = 21.6 × i (0, 21.6 … 324); first 8 (top) `--pip-on`.
4. **Score chip** at the top of the camera side: left 48, top 24, 40 px, `--stage-chip` pill, padding 0 8 0 14, gap 8, `role="status"`: "1 040" (Mono 20 medium) + "×1.5" tag (`--stage-chip-raise` pill, 14 medium) + Example badge (stage variant).
5. **Corner cluster** at the bottom of the far side: right 48, bottom 24, gap 8: Good glyph (opacity 0.6) + 44 px Pause (`aria-label="Pause"`) at x 752–796, y 322–366.

No gaze dot, no gold, no links.
