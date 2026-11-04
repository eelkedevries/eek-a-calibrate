# Brief: `phone-level-complete.dc.html` · "Phone · Warm-up complete" · 390×844
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 390×844. Same state and copy as `desktop-level-complete`.

**State**: outcome **Good**: 2 of 3 stars, 3 zones (portrait 1 × 3: top, middle, bottom), 10 of 12 Test-round bubbles hit, misses at the top-right and bottom-left. All numbers are examples. **Mode**: framed, dark. Root: `--color-background`, padding 24 16, flex column.

1. **Top bar** (y 24–72), space-between. Left: "Warm-up complete" (14 medium), 10 px, phone track SVG with nodes 1–4 **done** (circles r 11 `--node-done`, checks `M6.5 11.5l3 3 6-6.5`, `M34.5 11.5l3 3 6-6.5`, `M62.5 11.5l3 3 6-6.5`, `M90.5 11.5l3 3 6-6.5`, `--color-text` 2 round) and the star **unlocked** (circle and star stroked `--color-text` 1.5); `sr-only` "Warm-up complete. Challenge unlocked". Right: Details icon button.
2. 8 px; **stage card** (≈ y 80–546, flex 1): `--color-surface`, radius 14, padding 16, `position:relative`, column, centred, gap 12. Example badge absolute top 12, left 12.
   - **Miniature**: SVG `viewBox="0 0 176 380"` 176 × 380, `role="img" aria-label="Your 3 zones: top, middle and bottom. 10 of 12 test bubbles hit."`: rect 176 × 380 rx 10 fill `--stage`; zones (rx 8, no fill, `--stage-line` 1.5) at x 8 w 160, y 8 / 132 / 256, h 116.
   - **Marks**, 16 px badges with a 1.5 px `--stage-ink` edge, at x 26.4, 66.9, 109.1, 149.6 × y 57, 190, 323. Hit: `--state-good` + check `M{x-3.5} {y+.3}l2.5 2.5 4.8-5`; missed at (149.6,57) and (26.4,323): `--state-lost` + cross `M{x-3} {y-3}l6 6M{x+3} {y-3}l-6 6`; both glyphs `--badge-ink` 2.
   - Legend, 14 muted, gap 16: [16 px ✓ badge] Hit · [16 px ✗ badge] Missed.
3. 24 px; **panel** (column):
   - row, gap 12, centred: stars (3 × 28 px, gap 8, `role="img" aria-label="2 of 3 stars"`: two filled `--star-on`, one outline `--star-off` 1.5) + Example badge;
   - 8; `<h1>` "You unlocked 3 zones" (Spectral 600, 28);
   - 4; "The challenge will use these 3 zones." (16);
   - 4; tip with Sun icon 16 (`<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`): "More light in front of you may help." (14, muted);
   - `<button>` styled as a text link, 44 px tall, no background, padding 0, 14 `--color-link`: "Rule of thumb · How we judge this" (opens Details → Results; no board).
4. 24 px; **actions** (y 764–820), flex, gap 8: `<a class="btn btn--secondary" href="phone-level1-pop.dc.html">` "Warm up again" (content width); `<a class="btn btn--primary" href="phone-free-look.dc.html" style="flex:1 0 auto">` "Try your zones"; both 56 px.

Gold: only "Try your zones". Stars are never gold. Links: Try your zones → `phone-free-look.dc.html`; Warm up again → `phone-level1-pop.dc.html`.
