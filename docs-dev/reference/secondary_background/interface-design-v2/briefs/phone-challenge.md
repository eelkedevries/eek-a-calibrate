# Brief: `phone-challenge.dc.html` · "Phone · Challenge" · 390×844
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 390×844. Same state as `phone-landscape-challenge`.

**State**: round 2 "Mind the spikes" in play, bubble 9 of 16 (8 done), the player looks at the **middle** zone, so its bubble is shrinking (the eyes really pop it here); a decoy sits in the top zone; streak active; position good. Score is an example. **Mode**: stimulus. Root: `class="on-stage"`, `position:relative`, `--stage`.

1. `<h1 class="sr-only">Challenge, round 2: Mind the spikes</h1>`.
2. **Board**: full-size SVG `viewBox="0 0 390 844"`, `role="img" aria-label="Three zones. A bubble in the middle zone, a spike in the top zone. You are looking at the middle zone."`:
   - zones rx 14, x 30, w 330: top y 56 h 233 and bottom y 554 h 234 (no fill, `--stage-line` 1.5); middle y 305 h 233 **lit** (fill `--stage-lit`, stroke `--halo` 2);
   - **decoy** at `translate(128 200)`: `<path d="M0-30L6-22.2L15-26L16.3-16.3L26-15L22.2-6L30 0L22.2 6L26 15L16.3 16.3L15 26L6 22.2L0 30L-6 22.2L-15 26L-16.3 16.3L-26 15L-22.2 6L-30 0L-22.2-6L-26-15L-16.3-16.3L-15-26L-6-22.2Z" fill="var(--decoy)"/>`;
   - **bubble** (spec-core recipe) at `translate(205 430)`: ghost RF 39, R 23, SHINE `M-13.5-8.8A16.1 16.1 0 0 1-5.2-15.2`, ABC dot (cross cut `--stage` then `--bubble-fill`).
3. **Pip line**: `<div role="progressbar" aria-label="Round 2 progress" aria-valuemin="0" aria-valuemax="16" aria-valuenow="8">`, left 16, top 12, 358 × 4; SVG: 16 rects 18.6 × 4, rx 2, at x = 22.6 × i (0, 22.6, 45.2 … 339); first 8 `--pip-on`, rest `--pip-off`.
4. **Score chip**: absolute, left 16, top 24, 40 px tall, `--stage-chip` pill, padding 0 8 0 14, flex, gap 8, centred, `role="status"`: "1 040" (JetBrains Mono 20 medium, `--stage-chip-text`); streak tag "×1.5" (24 px pill, padding 0 8, `--stage-chip-raise`, 14 medium); Example badge (stage variant).
5. **Corner cluster**: right 16, bottom 24, gap 8: Good glyph (opacity 0.6) + 44 px Pause (`--stage-chip`, `aria-label="Pause"`).

No gaze dot, no track, no round name on screen. No gold. No links (the round's end is drawn on `desktop-challenge`).
