# Brief: `phone-level2-follow.dc.html` · "Phone · Level 2 Follow the firefly" · 390×844
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 390×844.

**State**: Level 2 in play, the firefly 20 % along its 16 s path (pursuit). **Mode**: stimulus. Root: `class="on-stage"`, `position:relative`, `--stage` edge to edge. No text, no level name, no points, no path ahead.

Content:
1. `<h1 class="sr-only">Level 2: Follow the firefly</h1>`.
2. **Progress bar** (Level 2 has one continuous bar, not pips): `<div role="progressbar" aria-label="Level 2 progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20">`, absolute, left 16, top 12, 358 × 4; SVG 358 × 4: rect 358 × 4 rx 2 `--pip-off`, then rect 71.6 × 4 rx 2 `--pip-on`.
3. Full-size SVG `viewBox="0 0 390 844"`, `aria-hidden`:
   - **Trail** (the last 300 ms, behind the firefly), three paths, fill none, stroke `--firefly-trail`, 3 px, round caps and joins:
     oldest `M309.3 100.2L305.4 106.1L301.3 113.1` stroke-opacity .3; middle `M301.3 113.1L297.1 121.2L292.7 130.3` stroke-opacity .625; newest `M292.7 130.3L288.1 140.4L283.4 151.5` stroke-opacity 1.
   - **Firefly** at `translate(283.4 151.5)`: `<circle r="22" fill="var(--firefly-light)"/>` then the ABC dot 24 px (disc r 12 `--bubble-core`; cross cut `--stage` then `--firefly-light`; centre dot r 4).
4. **Prototype link**: `<a href="phone-level-complete.dc.html" aria-label="Next board: Warm-up complete">`, absolute over the firefly (left 261, top 129, 44 × 44, radius 50 %), transparent.
5. **Corner cluster** bottom-right: right 16, bottom 24, gap 8: Good position glyph (opacity 0.6) + 44 px Pause button (`--stage-chip`, `aria-label="Pause"`).

No gold. Links: firefly (prototype) → `phone-level-complete.dc.html`.
