# Brief: `desktop-ready.dc.html` · "Webcam · Get ready" · 1440×900
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 1440×900. Same state and copy as `phone-ready`.

**State**: *Ready* latched (ring complete, ✓ badge, "Start warm-up" enabled). **Mode**: immersive. Root: `position:relative`, `--preview-bg`.

**Camera layer**: SVG `viewBox="0 0 1440 900"`, absolute, full size, `aria-hidden`, in order:
1. shoulders `<path d="M330 900C350 720 520 680 720 680S1090 720 1110 900Z" fill="var(--preview-figure)"/>`; head ellipse (720,432) rx 152 ry 198, fill `--preview-figure`, stroke `--preview-edge` 1;
2. veil `<path fill-rule="evenodd" fill="var(--stage-veil)" d="M0 0H1440V900H0ZM552 423A168 218 0 1 0 888 423A168 218 0 1 0 552 423Z"/>`;
3. hold ring, complete: ellipse (720,423) rx 168 ry 218, `--halo` 8 px then `--state-good` 5 px;
4. live outline: ellipse (720,428) rx 148 ry 194, `--halo` 5 then `--color-text` 2;
5. eye dots r 6 at (663,398) and (777,398), `--gaze`, edge `--gaze-outline` 1.5;
6. ✓ badge: circle (720,205) r 12 `--state-good`, edge `--stage-ink` 1.5; check `M714.5 205.5l3.5 3.5 6.5-7`, `--badge-ink` 2.5.

**Overlay** (absolute):
1. **Top bar** x 24–1416, y 24–72: `--stage-chip` pill, padding 0 8 0 20, three parts:
   - left: Mark 24 + 8 + "eek-a-calibrate" (Spectral 600, 20, `--stage-chip-text`);
   - centre: "Get ready" (14 medium), 16, a 1 × 20 `--node-line` divider, 16, the desktop `<ol>` track: all four nodes future (numbers 1–4), Challenge star locked, all names muted;
   - right: Details (desktop form, `--stage-chip-text`).
2. **Cue card**: top 88, centred, `--stage-chip`, radius 14, padding 12 20, centred text, `role="status"`: "Ready" (20 medium) / "Stay like this while you play" (14 `--stage-chip-muted`).
3. **Dock**: x 360–1080, y 796–876, `--stage-chip`, radius 14, padding 16 24, one row, space-between, centred:
   - status row, gap 24: ✓ Distance · ✓ Position · ✓ Light (16 px `--state-good` badges, 14 medium words, `aria-label` "Distance: good" etc.);
   - `<a class="btn btn--primary" href="desktop-level1-pop.dc.html">` "Start warm-up", 48 px.

Gold: only "Start warm-up". Links: Start warm-up → `desktop-level1-pop.dc.html`.
