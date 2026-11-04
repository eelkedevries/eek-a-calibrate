# Interface design v2: "Pop with your eyes" (game-first)

**Status: non-binding background (4 November 2026).** This folder holds the proposed redesign
of the user interface. It is not yet part of the binding specification; adopting it needs the
specification amendment that `design-spec.md` §9 lists (v0.5), followed by implementation
prompts.

## The owner's brief

- Optimise for smartphone cameras (portrait) and webcams (landscape).
- Modern and clean; built on the owner's design system, eek-a-style.
- No horizontal or vertical scrollbar: every screen fits one viewport.
- Easy for people with no experience of eye tracking.
- Signal the position of the phone or camera (distance, angle, framing) so that it stays good.
- Organise the whole tool from the start as a game: calibration is the game's warm-up.

## The design in one paragraph

A title screen ("Pop with your eyes") leads to a ready check, where a face guide over the
mirrored camera image gives one instruction at a time. Four warm-up levels are the calibration:
Pop the dots (fixation targets), Follow the firefly (smooth pursuit), Turn your head (head
motion) and a Test round (validation). The warm-up bubbles pop on a timer, and the copy never
says that the eyes popped them. "Warm-up complete" shows stars and the number of screen zones
the user's eyes can control. Free look shows live gaze as a lit zone. The Challenge is a
gaze-contingent bubble game with zones sized from the user's own result. A position guard
(a compact indicator and an auto-pause overlay) runs through every level. Expert material
(engines, per-estimator results, export, diagnostics, optional screen and distance measurement)
lives in one Details sheet.

## Contents

| Path | What it is |
|---|---|
| `design-spec.md` | The full design specification (v2, game-first) |
| `spec-core.md` | A compact digest of the look and shared components |
| `shared.css` | The shared stylesheet every board embeds (eek-a-style tokens by role) |
| `briefs/` | One brief per board: content, layout, copy, state and links |
| `canvas/` | The 17 board sources (`.dc.html`) and the canvas index, as published to the owner's private design canvas |
| `png/` | A rendering of each board (the visual target for the implementation) |
| `research/` | The four research reports behind the design: positioning guidance, flow and game, single-screen layout, audit of the current interface |
| `authoring-guide.md` | The board file format used for `canvas/` |

## What has not been checked

The boards are static mock-ups. Nothing here has been tested with users, on a real phone or with
a real webcam. Every number shown on a board is an example value and is marked as such.
