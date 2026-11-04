# Brief: `desktop-challenge.dc.html` · "Webcam · Challenge" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900.

**State**: **Round complete** after round 1 ("Pop!"): 14 of 16 popped, 2 of 3 stars (87.5 %, below the 90 % for three), zones left 5 of 5 ✓, middle 6 of 6 ✓, right 3 of 5 ~; the round went well, so the primary is "Next round". All numbers are examples. **Mode**: framed, dark. Root: `--color-background`, padding 24 40, grid `"top top" 48px "stage side" 1fr / minmax(0,1fr) 420px`, gaps 40 / 24.

1. **Top bar** (y 24–72): left Mark 24 + 8 + "eek-a-calibrate" (Spectral 600, 20). Centre: desktop `<ol>` track: Pop, Follow, Turn, Test done (`--node-done` + check `M7.5 12.5l3 3 6-6.5`); Challenge **current** (`aria-current="step"`; circle r 12 fill `--color-text`, star fill `--color-background`; name 14 medium `--color-text`); other names muted; no phase label (a node is current). Right: Details (desktop form).
2. **Stage card** (x 40–940, y 96–876): `--color-surface`, radius 14, `position:relative`, flex, centred. Example badge absolute top 16, left 16. **Replay**: absolute top 12, right 12, `<button class="icon-btn" aria-label="Replay where you looked">` with the Play icon.
   - **Zone map**: SVG `viewBox="0 0 640 400"` 640 × 400, `role="img" aria-label="Left zone 5 of 5, middle 6 of 6, right 3 of 5."`: rect rx 14 fill `--stage`; zones rx 12, `--stage-line` 1.5, at x 16 / 224 / 432, w 192, y 16, h 368.
   - In each zone, centred at x 112 / 320 / 528: the pops as text at y 196, JetBrains Mono 20 medium, fill `--stage-ink`, centred: "5 of 5", "6 of 6", "3 of 5"; under it a 24 px badge centred at y 232 with a 1.5 px `--stage-ink` edge: ✓ `--state-good` (check `M{x-5.5} 232.5l3.5 3.5 6.5-7`), ✓, and ~ `--state-adjust` (wave `M{x-5.5} 233c1.8-2.4 3.6-2.4 5.5 0s3.7 2.4 5.5 0`); glyphs `--badge-ink` 2.5.
3. **Side column** (x 980–1400), one group, vertically centred, left aligned:
   - "Round 1 of 3" (14 medium, muted);
   - 12; row, gap 12: stars 3 × 32 px, gap 8 (`role="img" aria-label="2 of 3 stars"`; two `--star-on`, one outline `--star-off`) + Example badge;
   - 16; `<h1>` "14 of 16 popped" (Spectral 600, 36);
   - 12; "The right zone was the hardest." (16);
   - 12; "Score 1 820 · Best 1 820" (JetBrains Mono 14, muted) + 8 + Example badge;
   - 32; actions, gap 8, 48 px: `<a class="btn btn--secondary" href="desktop-free-look.dc.html">` Back icon (`<path d="M19 12H5M11 6l-6 6 6 6"/>`) + "Free look"; `<button class="btn btn--primary">` "Next round" (no board).

Gold: only "Next round". Stars never gold. Links: Free look → `desktop-free-look.dc.html`.
