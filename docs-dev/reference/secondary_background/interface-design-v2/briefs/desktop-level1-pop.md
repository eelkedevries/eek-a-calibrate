# Brief: `desktop-level1-pop.dc.html` · "Webcam · Level 1 Pop the dots" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900.

**State**: the Level 1 card, just shown (3 s left, starts by itself). **Mode**: stimulus. Root: `class="on-stage"`, `position:relative`, `--stage` edge to edge, flex, card centred. No pip line yet.

**Card**: `role="dialog" aria-labelledby="lvl" aria-describedby="rule"`, width 400, `--stage-chip`, radius 14, padding 32, `position:relative`, column, centred, text centred, gap 16, colour `--stage-chip-text` (≈ y 245–655):
1. **Sound toggle**: absolute top 8, right 8: `<button class="icon-btn" aria-label="Sound" aria-pressed="true">` with the Sound icon.
2. A column, gap 8: the phone track SVG (134 × 22) with node 1 **current** (circle r 11 fill `--color-text`, "1" fill `--color-background`), nodes 2–4 future, star locked; then "Level 1 of 4" (14 medium, `--stage-chip-muted`). (No clear line: this is the first card.)
3. **Pictogram** 48 px (24 box, stroke 1.5, `--stage-chip-text`): `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2" F/><path d="M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4"/>`.
4. `<h2 id="lvl">` "Pop the dots" (Spectral 600, 28).
5. `<p id="rule">` "Keep your eyes on the dot until the bubble pops." (16, 2 lines).
6. Hint: "Keep your head still." (14, `--stage-chip-muted`).
7. **Countdown row** (margin-top 8), flex, gap 16, centred:
   - `<div role="timer" aria-label="Starts in 3 seconds">` SVG 40 × 40: circle (20,20) r 17, no fill, `--node-line` 3; the same circle stroked `--stage-chip-text` 3, `stroke-dasharray="106.8"`, `transform="rotate(-90 20 20)"` (full: 3 s left); text "3" at (20, 25.5), JetBrains Mono 16 medium, centred, fill `--stage-chip-text`;
   - `<a class="btn btn--ghost" href="desktop-level3-turn.dc.html" style="min-block-size:48px;color:var(--stage-chip-text)">` "Start now".

**Position glyph** alone in the corner-cluster place: absolute, right 24, bottom 24 (x 1376–1416, y 836–876), Good state, opacity 0.6.

No gold on this board (the card has no primary). Links: Start now → `desktop-level3-turn.dc.html` (the next webcam board).
