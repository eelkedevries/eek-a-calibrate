# Brief: `phone-ready.dc.html` · "Phone · Get ready" · 390×844
Folder: `./`. Read `spec-core.md` (paste `shared.css`) and `authoring-guide.md`. `$preview` 390×844. Same state and copy as `desktop-ready`.

**State**: *Ready* latched (hold ring complete, ✓ badge, "Start warm-up" enabled). **Mode**: immersive. Root: `position:relative`, `--preview-bg`.

**Camera layer**: one SVG `viewBox="0 0 390 844"`, absolute, full size, `aria-hidden`, in this order:
1. shoulders `<path d="M10 844C20 650 110 600 195 600S370 650 380 844Z" fill="var(--preview-figure)"/>`; head `<ellipse cx="195" cy="402" rx="124" ry="162" fill="var(--preview-figure)" stroke="var(--preview-edge)"/>`;
2. veil `<path fill-rule="evenodd" fill="var(--stage-veil)" d="M0 0H390V844H0ZM56 397A139 181 0 1 0 334 397A139 181 0 1 0 56 397Z"/>`;
3. hold ring, complete: ellipse (195,397) rx 139 ry 181, no fill, first `--halo` 8 px, then `--state-good` 5 px;
4. live face outline: ellipse (195,400) rx 122 ry 160, `--halo` 5 px, then `--color-text` 2 px;
5. eye dots: r 6 at (148,372) and (242,372), fill `--gaze`, stroke `--gaze-outline` 1.5;
6. ✓ badge at the top of the oval: circle (195,216) r 12, fill `--state-good`, stroke `--stage-ink` 1.5; check `M189.5 216.5l3.5 3.5 6.5-7`, `--badge-ink` 2.5, round.

**Overlay**: absolute, full size, flex column, padding 24 16 0:
1. **Top bar** (y 24–72): `--stage-chip` pill, padding 0 2 0 12, space-between. Left: "Get ready" (14 medium, `--stage-chip-text`), 10 px, the phone track exactly as the spec-core snippet (all future, star locked), `sr-only` "Get ready. Next: level 1 of 4". Right: Details icon button (`--stage-chip-text`).
2. 8 px; **cue card**, centred: `--stage-chip`, radius 14, padding 12 20, text centred, `role="status" aria-live="polite"`: "Ready" (20 medium) over "Stay like this while you play" (14, `--stage-chip-muted`).
3. flexible clear band (the oval shows through).
4. **Dock** (y 704–844): `margin:0 -16px`, `--stage-chip`, radius 22 22 0 0, padding 16 16 24, column, gap 12:
   - status row, 32 px, centred, gap 24: three items, each a 16 px `--state-good` ✓ badge + word (14 medium, `--stage-chip-text`), `aria-label` "Distance: good", "Position: good", "Light: good": Distance · Position · Light;
   - `<a class="btn btn--primary" href="phone-level1-pop.dc.html">` "Start warm-up", full width, 56 px.

Gold: only "Start warm-up". No numbers on screen. Links: Start warm-up → `phone-level1-pop.dc.html`.
