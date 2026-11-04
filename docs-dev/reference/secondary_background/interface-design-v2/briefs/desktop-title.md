# Brief: `desktop-title.dc.html` · "Webcam · Title screen" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900. Same state and copy as `Main` (phone).

**State**: first run (no "Skip warm-up"), Webcam chosen. **Mode**: framed, dark. Root: `--color-background`, padding 24 40, grid `"top top" 48px "stage side" 1fr / minmax(0,1fr) 420px`, column gap 40, row gap 24.

1. **Top bar** (y 24–72): left Mark 24 + 8 + "eek-a-calibrate" (Spectral 600, 20); right Details (desktop form). No track on the Title.
2. **Stage card** (x 40–940, y 96–876): `--color-surface`, radius 14; column, centred, gap 56.
   - **Emblem** (`aria-hidden`): SVG `viewBox="0 0 358 184"` at 520 × 267. Light-ink bubbles for the dark card: fill `--node-done`, edge `--color-text` 2, shine `--color-text` 3 round, ABC dot in `--color-text` with the cross cut in `--color-surface` then `--node-done`. Big bubble (130,104) r 64, dot `scale(1.5)`, shine `M92.4 79.6A44.8 44.8 0 0 1 115.4 61.6`; small bubble (232,62) r 30, dot `scale(.75)`, shine `M214.4 50.6A21 21 0 0 1 225.2 42.1`; mid-pop at (252,150): dashed ring r 14 (`--node-line` 1.5, `4 4`) + burst `M252 136L252 126M264.1 143L272.8 138M264.1 157L272.8 162M252 164L252 174M239.9 157L231.2 162M239.9 143L231.2 138` (`--color-text` 2 round).
   - **Level map**: SVG `viewBox="0 0 600 64"` at 600 × 64 (`aria-hidden`): dotted line `M60 32H540` (`--node-line` 1.5, `2 4`); circles r 31.25 at x 60, 180, 300, 420, 540 (fill `--color-surface`, stroke `--color-text` 1.5; Challenge stroked `--node-line`); 36 px pictograms (24 box, `translate(cx-18 14) scale(1.5)`, stroke 1, `--color-text`; star `--color-muted-text`): Pop `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2" F/><path d="M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4"/>`; Follow `<path d="M3 18c3-1 4-7 8-7s5 4 8-1" stroke-dasharray="1.5 2.5"/><circle cx="19.5" cy="9.5" r="2.5" F/>`; Turn: dot (12,12) r 2.2 F + `M5.1 16A8 8 0 0 1 5.1 8M18.9 8A8 8 0 0 1 18.9 16M8 5.1A8 8 0 0 1 16 5.1M16 18.9A8 8 0 0 1 8 18.9`; Test `<circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="2" F/><path d="M15.5 18.5l2 2 4-4.5"/>`; Challenge: the spec-core star, stroked.
   - 12 px below: `<ol aria-label="The game">`, 5 columns of 120 px, names 16 muted centred: Pop · Follow · Turn · Test · Challenge.
3. **Side column** (x 980–1400): one group, vertically centred, left aligned:
   - `<h1>` "Pop with your eyes" (Spectral 600, 48, line-height 1.25, one line);
   - 12; `<p>` "Warm up the tracker, then pop bubbles just by looking." (16, muted);
   - 40; `<p id="setup">` "How are you playing?" (14 medium, muted), 8, `role="radiogroup" aria-labelledby="setup"`, grid 3 × 1fr, gap 8, `<button class="choice" role="radio">` 72 px, 24 px icon over label:
     Propped (`aria-label="Phone propped up"`) `<rect x="8" y="3" width="8" height="14" rx="1.5"/><path d="M6 21l6-4 6 4"/>` · In hand (`aria-label="Phone in hand"`) `<rect x="9" y="2.5" width="7" height="12" rx="1.5"/><path d="M6 12v3.5a5 5 0 0 0 5 5h2.5a4 4 0 0 0 4-4V14"/>` · Webcam (`aria-label="Computer webcam"`, `aria-checked="true"`) `<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/><circle cx="12" cy="7.2" r="0.9" F/>`;
   - 32; `<a class="btn btn--primary" href="desktop-ready.dc.html">` full width, 48 px: Play icon + "Play";
   - 16; meta, 14 muted: Clock 16 (`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`) "About 3 minutes" · Lock 16 (`<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`) "Nothing is uploaded".

Gold: only Play. Links: Play → `desktop-ready.dc.html`.
