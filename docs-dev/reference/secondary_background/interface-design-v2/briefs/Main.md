# Brief: `Main.dc.html` · "Phone · Title screen" · 390×844
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `<title>Phone · Title screen</title>`, `$preview` 390×844. Same state and copy as `desktop-title`.

**State**: first run (no "Skip warm-up"), Propped chosen. **Mode**: framed, dark. Root: `--color-background`, padding 24 16, flex column; y values below are absolute.

1. **Top bar** (y 24–72): left Mark (24 px, `--color-text`) + 8 + "eek-a-calibrate" (Spectral 600, 20); right Details icon button.
2. **Title block** (y 96–199, centred): `<h1>` "Pop with your eyes" (Spectral 600, 36, line-height 1.25, one line); 8; `<p>` "Warm up the tracker, then pop bubbles just by looking." (16, `--color-muted-text`, max 300 px, 2 lines).
3. **Hero card** (flex 1, ≈ y 223–579): `--color-surface`, radius 14, padding 16, column, centred, gap 24.
   - **Emblem** (decorative, `aria-hidden`): SVG `viewBox="0 0 358 184"` 326 × 168. On the dark card the bubble is drawn in light ink: fill `--node-done`, edge `--color-text` 2, shine `--color-text` 3 round, ABC dot in `--color-text` with the cross cut in `--color-surface` then `--node-done`.
     - big bubble at (130,104) r 64, ABC dot `scale(1.5)`, shine `M92.4 79.6A44.8 44.8 0 0 1 115.4 61.6`;
     - small bubble at (232,62) r 30, ABC dot `scale(.75)`, shine `M214.4 50.6A21 21 0 0 1 225.2 42.1`;
     - mid-pop at (252,150): dashed ring r 14 (`--node-line`, 1.5, `4 4`) and burst `M252 136L252 126M264.1 143L272.8 138M264.1 157L272.8 162M252 164L252 174M239.9 157L231.2 162M239.9 143L231.2 138`, `--color-text` 2 round.
   - **Level map**: SVG 326 × 48 (`aria-hidden`): dotted line `M32.6 24H293.4` (`--node-line` 1.5, dasharray `2 4`); five circles r 23.25 at x 32.6, 97.8, 163, 228.2, 293.4 (fill `--color-surface`, stroke `--color-text` 1.5; the last stroked `--node-line`, locked); in each a 28 px pictogram (24 box, `translate(cx-14 10) scale(1.1667)`, stroke 1.3, `--color-text`, last `--color-muted-text`): Pop `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2" F/><path d="M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4"/>`; Follow `<path d="M3 18c3-1 4-7 8-7s5 4 8-1" stroke-dasharray="1.5 2.5"/><circle cx="19.5" cy="9.5" r="2.5" F/>`; Turn: dot (12,12) r 2.2 F + `M5.1 16A8 8 0 0 1 5.1 8M18.9 8A8 8 0 0 1 18.9 16M8 5.1A8 8 0 0 1 16 5.1M16 18.9A8 8 0 0 1 8 18.9`; Test `<circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="2" F/><path d="M15.5 18.5l2 2 4-4.5"/>`; Challenge: the star path (spec-core) stroked.
   - Below it (8 px), `<ol aria-label="The game">`, 5 equal columns, names 14 muted centred: Pop · Follow · Turn · Test · Challenge.
4. **Chooser** (y 603–703): `<p id="setup">` "How are you playing?" (14 medium, muted); 8; `role="radiogroup" aria-labelledby="setup"`, grid 3 × 1fr, gap 8; each `<button class="choice" role="radio">` 72 px: 24 px icon over label.
   - Propped (`aria-checked="true"`, `aria-label="Phone propped up"`): `<rect x="8" y="3" width="8" height="14" rx="1.5"/><path d="M6 21l6-4 6 4"/>`
   - In hand (`aria-label="Phone in hand"`): `<rect x="9" y="2.5" width="7" height="12" rx="1.5"/><path d="M6 12v3.5a5 5 0 0 0 5 5h2.5a4 4 0 0 0 4-4V14"/>`
   - Webcam (`aria-label="Computer webcam"`): `<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/><circle cx="12" cy="7.2" r="0.9" F/>`
5. **Play** (y 727–783): `<a class="btn btn--primary" href="phone-ready.dc.html">`, full width, 56 px: Play icon + "Play".
6. **Meta** (y 799–820, centred, 14 muted, plain text, not chips): Clock icon 16 (`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`) "About 3 minutes" · Lock icon 16 (`<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`) "Nothing is uploaded".

Gold: only Play. No track on this screen. Links: Play → `phone-ready.dc.html`.
