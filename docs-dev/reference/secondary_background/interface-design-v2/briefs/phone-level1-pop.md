# Brief: `phone-level1-pop.dc.html` · "Phone · Level 1 Pop the dots" · 390×844
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 390×844.

**State**: Level 1 in play: the 7th of 13 bubbles, mid-shrink (sampling), 6 bubbles done. **Mode**: stimulus. Root: `class="on-stage"`, `position:relative`, background `--stage` (#808080) edge to edge. Nothing else on screen: no text, no level name, no points.

Content:
1. `<h1 class="sr-only">Level 1: Pop the dots</h1>`.
2. **Pip line**: `<div role="progressbar" aria-label="Level 1 progress" aria-valuemin="0" aria-valuemax="13" aria-valuenow="6">`, absolute, left 16, top 12, 358 × 4, holding an SVG 358 × 4: 13 rects, width 23.8, height 4, rx 2, at x 0, 27.8, 55.7, 83.5, 111.4, 139.2, 167.1, 194.9, 222.8, 250.6, 278.5, 306.3, 334.2. The first 6 `--pip-on`, the other 7 `--pip-off`.
3. **Bubble**: one full-size SVG `viewBox="0 0 390 844"`, absolute, `aria-hidden`, with the spec-core bubble at `translate(270 255)` (CAL13 point 0.71, 0.29 of the safe area): ghost ring RF 39 (full 78 px), bubble R 24, SHINE for R 24 (`M-14.1-9.1A16.8 16.8 0 0 1-5.5-15.9`), ABC dot 24 px with the cross cut `--stage` then `--bubble-fill`.
4. **Prototype link**: `<a href="phone-level2-follow.dc.html" aria-label="Next board: Level 2, Follow the firefly">`, absolute over the bubble (left 231, top 216, 78 × 78, radius 50 %), transparent, no visible change.
5. **Corner cluster** (bottom-right, the corner farthest from the camera): absolute, right 16, bottom 24, flex, gap 8, centred: the position glyph in the Good state (spec-core snippet, opacity 0.6), then `<button aria-label="Pause">` 44 × 44, radius 999, background `--stage-chip`, colour `--stage-chip-text`, Pause icon 20 px (Pause x 330–374, y 776–820).

Colours: only `--stage`, the bubble tokens, pip tokens and the glyph's chip. No gold on this board. The bubble pops on a timer; nothing on the board suggests otherwise.

Links: bubble (prototype) → `phone-level2-follow.dc.html`.
