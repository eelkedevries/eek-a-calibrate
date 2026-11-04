# spec-core (v2): read before drawing any board

Paste `design/shared.css` verbatim into `<helmet><style>` after `body{margin:0}` and the `a` rules; use only its tokens.

## Look
- **Framed** (Title, Warm-up complete, Round complete): `--color-background`; stage = `--color-surface` card, r 14.
- **Immersive** (Get ready, Free look): stage edge to edge; bar, cue, dock on `--stage-chip` (text `--stage-chip-text`, muted `--stage-chip-muted`).
- **Stimulus** (level cards, levels, rounds): grey `--stage` only, plus pip line, corner cluster, score chip (rounds), Level 3 caption chip. Ink on grey `--stage-ink`.
- Gold `--color-accent` only for the ONE primary and the live dot. `--gaze` = gaze signal. `--state-good` ✓, `--state-adjust` !, `--state-lost` ✗, always with glyph or word.
- Spectral 600 only for wordmark (20), game title (36 phone, 48 desktop), level/round names (28), result headlines (28 phone, 36 desktop). Lexend for all else (14/16/20; labels 500). JetBrains Mono for live numbers.
- Radii 12 control, 14 card, 22 sheet, pill. Spacing 4/8/16/24/40. Padding (vertical/side): phone 24/16, desktop 24/40, phone landscape 24/48.

## Controls
- `<a class="btn btn--primary" href="x.dc.html">` (`<button>` if no link); `btn--secondary`; `btn--ghost`; secondary on stage chips `btn--chip`. Inline `min-block-size` 56 phone, 48 desktop.
- Dark chip on grey: `--stage-chip`, pill, 14 px medium.
- Example badge: `<span class="ex">Example</span>`; in a stage chip add `style="color:var(--stage-chip-muted);border-color:var(--stage-chip-muted)"`.
- Details (a button, never a link): phone `<button class="icon-btn" aria-label="Details">`+More; desktop `btn btn--ghost`, 48 px, padding 0 12, More + "Details".

## Icons (24 box, 20 px, `fill="none" stroke="currentColor" stroke-width="1.75"`, round caps and joins, `aria-hidden="true"`; F = `fill="currentColor" stroke="none"`)
Mark (24 px) `<path d="M2 12c2.6-4.2 6-6.3 10-6.3s7.4 2.1 10 6.3c-2.6 4.2-6 6.3-10 6.3S4.6 16.2 2 12z"/><circle cx="12" cy="12" r="3.2" F/>` · More: circles r 1.6 F at x 5, 12, 19, y 12 · Pause `<rect x="7" y="5" width="3.2" height="14" rx="1" F/><rect x="13.8" y="5" width="3.2" height="14" rx="1" F/>` · Check `M5 12.5l4.5 4.5L19 7.5` · Alert `M12 6.5v7` + circle (12,17.5) r 1.2 F · Cross `M7 7l10 10M17 7L7 17` · Sound `<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>` · Play `<path d="M8 5.5v13l10.5-6.5z" F/>`. Others: in the briefs.
State badge (16/24 px): circle filled `--state-good|adjust|lost`, Check/Alert/Cross stroked `--badge-ink` 2.5; on grey add a 1.5 px `--stage-ink` edge.

## Level track
**Phone** (bar < 640): label (14 medium), 10 px, SVG (Get ready state):
```html
<svg width="134" height="22" viewBox="0 0 134 22" aria-hidden="true" style="font-family:var(--font-sans)"><path d="M22 11h6M50 11h6M78 11h6M106 11h6" stroke="var(--node-line)" stroke-width="1.5"/><g fill="none" stroke="var(--node-line)" stroke-width="1.5"><circle cx="11" cy="11" r="10.25"/><circle cx="39" cy="11" r="10.25"/><circle cx="67" cy="11" r="10.25"/><circle cx="95" cy="11" r="10.25"/><circle cx="123" cy="11" r="10.25"/></g><g font-size="14" font-weight="500" text-anchor="middle" fill="var(--color-muted-text)"><text x="11" y="16">1</text><text x="39" y="16">2</text><text x="67" y="16">3</text><text x="95" y="16">4</text></g><path d="M123 5.1L124.6 9.3L129.1 9.5L125.6 12.3L126.8 16.7L123 14.2L119.2 16.7L120.4 12.3L116.9 9.5L121.4 9.3Z" fill="none" stroke="var(--color-muted-text)" stroke-width="1.5"/></svg>
```
Add `sr-only` text ("Get ready. Next: level 1 of 4"). Node at x C: **current** `r="11"` fill `--color-text`, number fill `--color-background`; **done** `r="11"` fill `--node-done`, no number, check `M{C-4.5} 11.5l3 3 6-6.5` stroke `--color-text` 2; **star unlocked**: circle and star stroked `--color-text`; **star current**: circle fill `--color-text`, star fill `--color-background`. Never gold.
**Desktop** (bar ≥ 640): `<ol aria-label="Game progress">` row; `<li>` = 24 px node (same states; r 11.25, numbers y 17, check `M7.5 12.5l3 3 6-6.5`, star `M12 5.5L13.7 10.1L18.7 10.3L14.8 13.4L16.1 18.2L12 15.4L7.9 18.2L9.2 13.4L5.3 10.3L10.3 10.1Z`) + 8 + name 14 (current medium `--color-text`, else muted): Pop, Follow, Turn, Test, Challenge; 24 × 1.5 `--node-line` connectors; current `aria-current="step"`. Phase label + 1 × 20 divider at the left only when no node is current.

## Position guard
Glyph, 40 px, Good:
```html
<div role="img" aria-label="Position good" style="inline-size:40px;block-size:40px;border-radius:999px;background:var(--stage-chip);opacity:.6"><svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><ellipse cx="20" cy="19" rx="8" ry="10.5" fill="none" stroke="var(--stage-chip-muted)" stroke-width="1.5"/><circle cx="16.8" cy="17.5" r="1.6" fill="var(--gaze)"/><circle cx="23.2" cy="17.5" r="1.6" fill="var(--gaze)"/><circle cx="31" cy="31" r="7" fill="var(--state-good)"/><path d="M27.8 31.2l2.2 2.2 4.2-4.6" fill="none" stroke="var(--badge-ink)" stroke-width="2" stroke-linecap="round"/></svg></div>
```
Drifting: opacity 1, oval `--state-adjust`, eyes at cx 18/22, badge `--state-adjust` + `M31 27.6v3.4` + dot (31,34). Lost: oval `--state-lost` dashed 3 3, no eyes, badge `--state-lost` + `M28.5 28.5l5 5M33.5 28.5l-5 5`.
**Corner cluster** (stimulus, corner farthest from the camera): glyph, 8 px, Pause (44 px `--stage-chip` circle, `aria-label="Pause"`).
**Pause overlay**: `--stage-scrim` over the frozen stage; dark card at the camera edge: live preview with the dashed ghost of home, headline, "Carries on by itself", ghost "Exit".

## Level card (`role="dialog"`, `--stage-chip`, r 14, 328 px phone / 400 desktop, padding 24/32, centred, gap 16)
Clear line (cards 2–4) · track nodes only + "Level 1 of 4" · 48 px pictogram · name (Spectral 28) · rule (16) · hint (14 muted) · countdown row (40 px ring: track r 17 `--node-line` 3, arc `--stage-chip-text` 3, digit mono 16; + ghost "Start now") · Sound toggle 44 px top-right, `aria-pressed="true"`.

## Recipes
**Bubble** at (X,Y), full radius RF, current R:
```html
<g transform="translate(X Y)"><circle r="RF" fill="none" stroke="var(--bubble-ghost)" stroke-width="1.5" stroke-dasharray="4 4"/><circle r="R" fill="var(--bubble-fill)" stroke="var(--bubble-edge)" stroke-width="2"/><path d="SHINE" fill="none" stroke="var(--bubble-shine)" stroke-width="3" stroke-linecap="round"/><circle r="12" fill="var(--bubble-core)"/><path d="M-12-1.5h24v3h-24zM-1.5-12h3v24h-3z" fill="var(--stage)"/><path d="M-12-1.5h24v3h-24zM-1.5-12h3v24h-3z" fill="var(--bubble-fill)"/><circle r="4" fill="var(--bubble-core)"/></g>
```
Last five = **ABC dot** (24 px). SHINE by R: 20 `M-11.7-7.6A14 14 0 0 1-4.6-13.2` · 23 `M-13.5-8.8A16.1 16.1 0 0 1-5.2-15.2` · 24 `M-14.1-9.1A16.8 16.8 0 0 1-5.5-15.9` · 39 `M-22.9-14.9A27.3 27.3 0 0 1-8.9-25.8` · 40 `M-23.5-15.2A28 28 0 0 1-9.1-26.5`. Static bubble: omit the ghost.
**Firefly**: `<circle r="22" fill="var(--firefly-light)"/>` + ABC dot (second cross fill `--firefly-light`); trail: three 3 px round-cap segments, stroke `--firefly-trail` at stroke-opacity 1 / .625 / .3 (newest to oldest).
**Zone**: `<rect rx="14" fill="none" stroke="var(--stage-line)" stroke-width="1.5"/>`; lit: `fill="var(--stage-lit)" stroke="var(--halo)" stroke-width="2"`.
**Gaze disc**: `<circle fill="var(--gaze-soft)" stroke="var(--gaze-outline)" stroke-width="1.5"/>`.
**Pips**: `<rect height="4" rx="2">`, done `--pip-on`, to go `--pip-off`, 12 px from the camera edge, `role="progressbar"`.
**Star** (24 box, shown 28/32 px): `M12 3.6L14.3 9.6L20.7 10L15.7 14L17.4 20.2L12 16.7L6.6 20.2L8.3 14L3.3 10L9.7 9.6Z`; on: fill `--star-on`; off: no fill, stroke `--star-off` 1.5. Row gap 8, `role="img" aria-label="2 of 3 stars"`.

## Copy rules
British English, plain words, no em dashes in UI copy, single-line labels, one instruction per screen. Warm-up bubbles pop **on a timer**: "until the bubble pops", never that the eyes pop them; only challenge copy may. No "calibration", "yaw", "degrees" or accuracy figures outside Details. Every example number gets the Example badge.
