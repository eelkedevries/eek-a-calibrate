# Visual pass of prompt 018 (specification §17.12.3)

Each screen of the design's board list (design §8), captured by `tests/e2e/visual.spec.ts` at the
board's size in the board's state through the screens' fixtures, with the fake camera, beside a
copy of the board's rendering (`<board>.board.png`, from
`docs-dev/reference/secondary_background/interface-design-v2/png/`). Refresh the captures with
`VISUAL_018=update E2E_PORT=<port> npx playwright test visual.spec.ts` after `npm run build`. The
captures are not pixel-asserted; each must render without an error, a scrollbar or a target
under 44 px.

Fixed in this pass:

- **Get ready (every state): the status row's badges were empty pills.** Details' text pill
  (`.badge` in `details.css`) also matched the state badges (`svg.badge`), whose reset lived in
  `game.css`, which Get ready does not load. The pill is now `span.badge`; the badges draw on
  every screen (`phone-ready`, `desktop-ready`, `position-signals-*`).
- **Small faint text** (the sheet's version line and status, the pager's "2 of 5", the metric
  card's backend, the lab's pager) now uses the muted role: faint text is under 4.5 : 1 on the
  surfaces (the contrast test).

What remains differs only in example values, which the boards mark *Example* and the app never
shows (§17.1.2), or in the fixtures' own example data:

| Board | Capture | Remaining differences |
|---|---|---|
| `Main` (390×844, Propped) | `Main.png` | None beyond antialiasing. |
| `desktop-title` (1440×900, Webcam) | `desktop-title.png` | None. |
| `phone-ready`, `desktop-ready` (*Ready*) | `phone-ready.png`, `desktop-ready.png` | The board's preview shows a figure behind the face; the fixture draws no camera picture (the live preview shows the camera, mirrored). |
| `phone-level1-pop` (bubble 7 of 13, mid-shrink) | `phone-level1-pop.png` | The bubble's position is the schedule's real seventh location, not the board's example place; its size is the moment of capture in the shrink. |
| `phone-level2-follow` (firefly 20 % along) | `phone-level2-follow.png` | The firefly sits a little from the board's point: the capture shows the real Lissajous path at that moment. |
| `desktop-level1-pop` (Level 1 card, 3 s) | `desktop-level1-pop.png` | None. |
| `desktop-level3-turn` (bubble 3 of 5, nodding) | `desktop-level3-turn.png` | The arcs' fills are the fixture's example values. |
| `phone-level-complete`, `desktop-level-complete` (Good, 2 stars, 3 zones) | `*-level-complete.png` | No *Example* badges; the zone map's marks sit at the Test round's real target positions, so they differ slightly from the board's. |
| `phone-free-look`, `desktop-free-look` | `*-free-look.png` | None beyond the dock's text metrics (a pixel or two). |
| `phone-challenge` (round 2, bubble 9, decoy) | `phone-challenge.png` | No *Example* badge. The decoy is drawn at the bubble's full diameter, as design §5.3 specifies; the board draws it smaller. |
| `desktop-challenge` (Round 1 complete, 14 of 16) | `desktop-challenge.png` | No *Example* badges; the score line's figures are the fixture's. |
| `phone-landscape-level1` (camera left) | `phone-landscape-level1.png` | As `phone-level1-pop`: the real seventh location. |
| `phone-landscape-challenge` (camera left) | `phone-landscape-challenge.png` | As `phone-challenge`: no *Example* badge, decoy at the bubble's size. |
| `position-signals` (a sheet of components) | `position-signals-<state>-<phone or webcam>.png` | The board is a component sheet; the captures show each state on its own screen: searching, adjust (too far), holding, *Ready*, the auto-pause overlay (phone) and the overlay after 10 s (webcam). The compact glyph's *Drifting* state with its nudge has no fixture (it appears in Free look and the challenge as the guard grades the live picture); it is covered by the unit tests of `core/position` and the manual checklist. The auto-pause card sits near the camera edge (top centre), as design §3.8 places it, rather than in a panel. |

The further sizes of design §4.1 rule 13 (390×664, 375×553, 750×342, 802×293, 1920×969) and 125 %
root text at the five sizes were checked once with `A11Y_EXTRA=1` (`tests/e2e/a11y.spec.ts`): after
the fixes above (the Title's name and meta line wrap under enlarged text, the fit guards re-run
when the root text size changes, the sheet's tabs keep 44 px) no state scrolls, overflows the
viewport or has a target under 44 px. The review of this prompt repeated the check over every
state fixture and found one more: at 802×293 the round 3 card ("Drifters", whose rule takes two
lines) ran 18 px past the viewport, with Start now cut. A level or round card now drops its tip
lines (the hint and "16 bubbles · about 1 minute") when the room left for it is under 18.25 rem
(`game.css`, a container query on the card layers), and `challenge-card-3` and `warmup-card-2`
join the check's states.
