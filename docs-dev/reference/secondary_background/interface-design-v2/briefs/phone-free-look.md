# Brief: `phone-free-look.dc.html` · "Phone · Free look" · 390×844
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 390×844. Same state and copy as `desktop-free-look`.

**State**: just arrived from Warm-up complete (bar and dock shown); the player looks at the **top** zone; position good. **Mode**: immersive on the grey. Root: `class="on-stage"`, `position:relative`, `--stage`.

**Stage**: full-size SVG `viewBox="0 0 390 844"`, `role="img" aria-label="Three zones. You are looking at the top zone."`:
- zones, rx 14, x 30, w 330: top y 56 h 233 **lit** (fill `--stage-lit`, stroke `--halo` 2); middle y 305 h 233 and bottom y 554 h 234: no fill, `--stage-line` 1.5;
- gaze disc: circle (178,176) r 44, fill `--gaze-soft`, stroke `--gaze-outline` 1.5. No gaze dot, no trail.

**Overlay**: absolute, full size, flex column, padding 24 16 0:
1. **Top bar** (y 24–72): `--stage-chip` pill, padding 0 2 0 12, space-between. Left: "Free look" (14 medium, `--stage-chip-text`), 10 px, phone track with nodes 1–4 done (`--node-done`, checks `M6.5 11.5l3 3 6-6.5`, `M34.5 11.5l3 3 6-6.5`, `M62.5 11.5l3 3 6-6.5`, `M90.5 11.5l3 3 6-6.5`) and the star unlocked (stroked `--color-text`); `sr-only` "Free look. Challenge unlocked". Right: Details icon button.
2. flexible band.
3. **Dock** (y 663–844): `margin:0 -16px`, `--stage-chip`, radius 22 22 0 0, padding 16 16 24, column:
   - row 40 px, space-between: left a live dot (8 × 8, radius 999, `--color-accent`, class `ek-live`) + 8 + "Tracking" (14 medium); right the position glyph, Good (opacity 0.6);
   - 8; `<p>` "The zone you look at lights up." (16, `--stage-chip-text`);
   - 12; actions, gap 8, 56 px: `<button class="btn btn--chip">` Crosshair icon (`<circle cx="12" cy="12" r="7"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>`) + "Re-aim"; `<a class="btn btn--primary" href="phone-challenge.dc.html" style="flex:1 0 auto">` "Play the challenge".

Gold: the live dot and "Play the challenge" only. Links: Play the challenge → `phone-challenge.dc.html`. Re-aim is a button (no board).
