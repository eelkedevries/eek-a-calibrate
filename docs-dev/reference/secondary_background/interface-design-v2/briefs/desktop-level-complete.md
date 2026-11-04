# Brief: `desktop-level-complete.dc.html` · "Webcam · Warm-up complete" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900. Same state and copy as `phone-level-complete`.

**State**: outcome **Good**: 2 of 3 stars, 3 zones (webcam 3 × 1: left, middle, right), 10 of 12 Test-round bubbles hit, misses top-right and bottom-left. All numbers are examples. **Mode**: framed, dark. Root: `--color-background`, padding 24 40, grid `"top top" 48px "stage side" 1fr / minmax(0,1fr) 420px`, gaps 40 / 24.

1. **Top bar** (y 24–72): left Mark 24 + 8 + "eek-a-calibrate" (Spectral 600, 20). Centre: "Warm-up complete" (14 medium), 16, 1 × 20 `--node-line` divider, 16, desktop `<ol>` track: Pop, Follow, Turn, Test **done** (circle r 12 `--node-done`, check `M7.5 12.5l3 3 6-6.5` `--color-text` 2), Challenge star **unlocked** (circle and star stroked `--color-text`); names 14 muted; no current item. Right: Details (desktop form).
2. **Stage card** (x 40–940, y 96–876): `--color-surface`, radius 14, `position:relative`, column, centred, gap 16; Example badge absolute top 16, left 16.
   - **Miniature**: SVG `viewBox="0 0 640 400"` 640 × 400, `role="img" aria-label="Your 3 zones: left, middle and right. 10 of 12 test bubbles hit."`: rect rx 14 fill `--stage`; zones (rx 12, `--stage-line` 1.5) x 16 / 224 / 432, w 192, y 16, h 368.
   - **Marks**, 24 px badges with a 1.5 px `--stage-ink` edge, at x 96, 243.2, 396.8, 544 × y 60, 200, 340. Hit: `--state-good`, check `M{x-5.5} {y+.5}l3.5 3.5 6.5-7`; missed at (544,60) and (96,340): `--state-lost`, cross `M{x-4.5} {y-4.5}l9 9M{x+4.5} {y-4.5}l-9 9`; glyphs `--badge-ink` 2.5.
   - Legend, 14 muted, gap 16: [✓ badge 16] Hit · [✗ badge 16] Missed.
3. **Side column** (x 980–1400), one group, vertically centred, left aligned:
   - row, gap 12: stars 3 × 32 px, gap 8 (`role="img" aria-label="2 of 3 stars"`; two `--star-on`, one outline `--star-off`) + Example badge;
   - 16; `<h1>` "You unlocked 3 zones" (Spectral 600, 36);
   - 12; "The challenge will use these 3 zones." (16);
   - 12; Sun icon 16 (`<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`) + "More light in front of you may help." (14 muted);
   - 4; text-link `<button>` 44 px tall, 14 `--color-link`: "Rule of thumb · How we judge this";
   - 32; actions, gap 8, 48 px: `<a class="btn btn--secondary" href="desktop-level1-pop.dc.html">` "Warm up again", `<a class="btn btn--primary" href="desktop-free-look.dc.html">` "Try your zones".

Gold: only "Try your zones". Links: Try your zones → `desktop-free-look.dc.html`; Warm up again → `desktop-level1-pop.dc.html`.
