# Artboard authoring guide (Design canvas, `.dc.html`)

Each artboard is ONE self-contained file `project/<name>.dc.html`. Fixed-size device mockup:
the root element is EXACTLY the artboard's `w`×`h` in px (phone portrait 390×844, phone
landscape 844×390, desktop browser viewport 1440×900, sheet 1440×900), `overflow: hidden`.
Everything must fit inside it — the owner's hard rule is NO scrollbars: the content must fit
on one screen. Design so that it would also fit at 360×640 (small phone) and 1280×720 (small
laptop) — no element may rely on extra height.

## Skeleton (copy exactly; keep the support.js line EXACTLY)

```html
<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>Phone · Intro</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;700&family=Spectral:wght@500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
body{margin:0}
a{color:#7fb4ec}a:hover{color:#a9cdf3}
/* + the shared token block from design-spec.md (":root{--color-text:…}") */
</style>
</helmet>
<div style="width: 390px; height: 844px; overflow: hidden; box-sizing: border-box; background: var(--color-background); color: var(--color-text); font-family: var(--font-sans); display: flex; flex-direction: column">
  …content…
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
```

## Rules that bite (each fails silently)

- Close every non-void element; quote every attribute. Valid XHTML-ish markup.
- Layout with flex/grid + `gap`, written as INLINE `style="…"` on elements (that is what the
  editor's properties panel edits). `<helmet><style>` only for page basics, the token `:root`
  block, `a`/`a:hover`, `@keyframes`, and pseudo-elements/states (`:focus-visible`, `::before`).
- Grids: `display: grid; grid-template-columns: repeat(N, minmax(0, 1fr)); gap: …`.
- `{{hole}}` is a dotted lookup into `renderVals()` only — never an expression. Prefer literal
  markup for copy (viewers retype it in place). Use `<sc-for list="{{items}}" as="item"
  hint-placeholder-count="3">` only for genuinely repeated data; set hint attrs.
- Always include the `<script type="text/x-dc" data-dc-script>` block with
  `class Component extends DCLogic { renderVals() { return {…}; } }` (classic JS, no imports)
  and `data-props` holding at least `$preview` = the artboard size. Tweaks (`data-props`
  editors) only for real levers (e.g. a `theme` enum dark/light, or a `state` enum that switches
  which positioning state is shown) — never for copy. `data-props` is single-quoted JSON; escape
  `&` as `&amp;`, `'` as `&#39;`.
- All UI is markup, never script-built (no innerHTML/appendChild/window globals). No global
  keydown handlers.
- Links between artboards: `<a href="phone-position.dc.html" style="…button styles…">Start</a>`
  — style the `<a>` itself as the button (never a `<button>` inside an `<a>`).
- Network: only the Google Fonts css2 `<link>` above. No other URLs, no `data:` URIs, no
  `<img>` of external files, no `<iframe>/<object>/<embed>`.
- Icons and illustrations: inline `<svg>` with strokes/fills using `currentColor` or token
  vars; decorative SVG gets `aria-hidden="true"`, meaningful SVG gets `role="img"
  aria-label="…"`. NEVER emoji. A camera preview is drawn as an abstract face silhouette
  (inline SVG: head outline, eyes, iris dots) on a dark video-like panel — no photos.
- No fake device status bars, no browser chrome, no notch drawings. The artboard IS the
  viewport. (Safe-area padding: keep ≥ 16 px side padding and ≥ 24 px at top/bottom on phones.)
- Accessible as drawn: real `<button>`, `<a href>`, `<input>` + `<label>`; `aria-label` on
  icon-only buttons; text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24 px); touch targets ≥ 44×44 px;
  status never by colour alone (pair with word or icon). Colours that must be told apart also
  differ in lightness.
- No filler, no lorem ipsum, no invented statistics. Any number shown (accuracy, score) is an
  example value and must look like one (e.g. a placeholder state), never a claim about the app.
- British English in all copy. Plain words for non-experts. No em dashes in UI copy.
- No AI design tropes: no gradient washes, no left-border accent cards, no glow, no emoji.

## eek-a-style essentials (the owner's design system; dark identity default)

Use tokens by ROLE via CSS variables (the `:root` block in design-spec.md). Gold `--color-accent`
only for the ONE primary action and the live/active state (≤ 2 touchpoints visible). Iris
`--color-secondary` = data/signal (gaze dot, traces). Elevation: `--color-background` →
`--color-surface` step, `--color-border` as secondary cue. Radii: `--radius-control` 12 px
(buttons, inputs), `--radius-card` 14 px (cards, panels), `--radius-sheet` 22 px (bottom-sheet
top corners), `--radius-pill` (chips, toggles). Spacing scale 4/8/16/24/40. Type: Spectral
for display headings and the wordmark ONLY; Lexend for all UI/body; JetBrains Mono for live
numerics (timers, %, fps, scores). States: success/warning/error/info roles + word or icon.
Motion calm (live pulse 1.8 s); one dominant primary action per view; header bars carry content
at both ends; single-line control labels; say each fact once; secondary options in a bottom
sheet behind a compact row; calibration stimulus areas carry no non-essential UI.
