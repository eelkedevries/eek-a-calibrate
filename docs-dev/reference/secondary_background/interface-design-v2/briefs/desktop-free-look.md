# Brief: `desktop-free-look.dc.html` · "Webcam · Free look" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900. Same state and copy as `phone-free-look`.

**State**: just arrived (bar and dock shown); the player looks at the **left** zone; position good. **Mode**: immersive on the grey. Root: `class="on-stage"`, `position:relative`, `--stage`.

**Stage**: full-size SVG `viewBox="0 0 1440 900"`, `role="img" aria-label="Three zones. You are looking at the left zone."`:
- zones, rx 14, y 58, h 784, w 416: left x 80 **lit** (fill `--stage-lit`, stroke `--halo` 2); middle x 512 and right x 944: no fill, `--stage-line` 1.5;
- gaze disc: circle (300,430) r 60, fill `--gaze-soft`, stroke `--gaze-outline` 1.5.

**Overlay** (absolute):
1. **Top bar** x 24–1416, y 24–72: `--stage-chip` pill, padding 0 8 0 20, colour `--stage-chip-text`:
   - left: Mark 24 + 8 + "eek-a-calibrate" (Spectral 600, 20);
   - centre: "Free look" (14 medium), 16, 1 × 20 `--node-line` divider, 16, desktop `<ol>` track: Pop, Follow, Turn, Test done (`--node-done` + check `M7.5 12.5l3 3 6-6.5`), Challenge star unlocked (stroked `--color-text`), names 14 muted;
   - right: the position glyph (Good, opacity 0.6), 8, Details (desktop form).
2. **Dock**: x 340–1100 (760), y 796–876, `--stage-chip`, radius 14, padding 16 24, one row, centred, gap 16:
   - live dot (8 px, `--color-accent`, `ek-live`) + 8 + "Tracking" (14 medium);
   - `<p>` "The zone you look at lights up." (16), `flex:1`;
   - `<button class="btn btn--chip" style="min-block-size:48px">` Crosshair icon (`<circle cx="12" cy="12" r="7"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>`) + "Re-aim";
   - `<a class="btn btn--primary" href="desktop-challenge.dc.html" style="min-block-size:48px">` "Play the challenge".

Gold: the live dot and "Play the challenge" only. Links: Play the challenge → `desktop-challenge.dc.html` (the webcam board shows the round's end). Re-aim is a button.
