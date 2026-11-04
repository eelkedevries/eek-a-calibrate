# Task: Pipeline fixes and specification v0.5 (the game-first interface)

## Goal

Prepare the game-first interface ("Pop with your eyes"): integrate the seven pending
final-review fixes to the pipeline, amend the binding specification to v0.5 so that it adopts
the interface design, and write the prompt sequence 013–018 that builds it.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. No interface code is written here: the interface is built by 013–018.

## Owns

- The files touched by the seven cherry-picked fixes (listed under Deliverables, part A).
- `docs-dev/reference/primary_authoritative/specification.md` (§16 merge, §17, version line).
- `docs-dev/plan.md`, `docs-dev/planning/current_state.md`.
- `docs-dev/reference/secondary_background/interface-design-v2/README.md` (status paragraph
  only).
- `docs-dev/agent/prompts/012_pipeline_fixes_and_spec_v05.md` (this file) and
  `013_game_shell_and_routes.md` to `018_integration_and_polish.md`.

## Context

- The owner's request: "implement fully" the game-first interface design in
  `docs-dev/reference/secondary_background/interface-design-v2/` (README.md, design-spec.md,
  spec-core.md, shared.css, briefs/, canvas/, png/). Binding requirements: a modern, clean
  eek-a-style design; no horizontal or vertical scrollbar on any screen at any supported size;
  easy for non-experts; the whole tool a game from the start, with calibration as the warm-up
  levels; the position of the phone or camera (distance, angle, framing, tilt, light) signalled
  continuously, especially on phones.
- `design-spec.md` §9 lists the nine specification amendments the design needs (v0.5).
- The seven fixes sit on branch `wp/final` (`git log origin/main..wp/final`), made by an earlier
  fixer and not yet independently verified. One of them, "docs: specification v0.4 amendment for
  the final-review fixes", collides with the v0.4 amendment already on `main` (§16, real-device
  findings).
- `specification.md` v0.4: §4.1, §4.7, §4.8.6, §4.12, §4.13, §4.15, §4.16, §6, §7, §14, §16.

## Deliverables (required changes)

### A. The seven final-review fixes

Cherry-pick, in order, keeping their messages:

1. `fix: do not count frames refused for lack of time as data loss`
2. `fix: report no BCEA for a target with fewer than three samples`
3. `fix: drop the validation run when a quick recalibration replaces the fit`
4. `perf: read engine specs without loading engine code on the main thread`
5. `perf: make no ImageBitmap for a frame the busy vision host would refuse`
6. `docs: specification v0.4 amendment for the final-review fixes`
7. `fix: say that frames the camera did not deliver are not data loss either`

Review each diff critically and keep only what is correct. Resolve the collision of (6) by
merging its content into §16 as a sub-section "16.2 Final-review fixes" (16.2.1–16.2.4) beside
the existing §16.1, in one v0.4, and renumber the references in code, tests and
`current_state.md` to match. Any correction made on integration is noted in the affected
commit's message.

### B. Specification v0.5

1. A new "## 17. Amendment v0.5: the game-first interface" before Appendix A that adopts
   `interface-design-v2` as the interface and states that `design-spec.md` and the boards are
   binding for look and behaviour where §17 does not say otherwise.
2. §17 makes the nine changes of design §9: flow and screens; the bubble presentation within
   the settle and sample windows; the head-block arcs; device motion for the tilt check
   (overriding §14.2.10); rectangular zones; stars; Re-aim and Quick warm-up as the presentation
   of the drift check and the quick recalibration; the set-up chooser; and the export's
   `phase: 'game'`.
3. §17 records the contract changes the build needs, all additive (`Phase` gains `'game'`; the
   optional tilt fields on `RecordedFrame`; the host progress hook), and the route map (`#/`,
   `#/ready`, `#/warmup`, `#/complete`, `#/look`, `#/challenge`; expert material in Details).
4. The version line becomes v0.5; `plan.md` lists 012–018; `current_state.md` records the
   decision; the design folder's README says it has been adopted.

### C. Prompts 013–018

Write the six prompt files in the house template (Goal, Scope, Owns, Context, Deliverables,
Do not implement, Acceptance criteria, Checks, Commit and push, Final report), each citing
§17 and the interface-design-v2 files it builds: 013 game shell and routes, 014 Title and Get
ready, 015 warm-up levels and Warm-up complete, 016 Free look and the challenge, 017 the
Details sheet, 018 integration and polish.

## Do not implement

- Any interface code, CSS, string, test or screen of 013–018.
- Any change to the frozen contracts in code (§17.11 only specifies them; 014 and 016 apply
  them).

## Acceptance criteria

The task is complete when:
- the seven fixes are on the branch, each reviewed, with the §16 collision resolved into one
  v0.4 and the references renumbered;
- `specification.md` is v0.5 with §17 covering all nine design §9 changes, the contract changes
  and the route map;
- `plan.md`, `current_state.md` and the design README are updated;
- the prompt files 012–018 exist and pass `scripts/validate-prompts.sh`;
- `npm run check` passes, and the end-to-end suite passes (the fixes change runtime code).

## Checks

`npm run check`; `npx playwright test` (with this worktree's `E2E_PORT`).

## Commit and push

The cherry-picked fixes keep their own messages. Parts B and C form one commit with this file's
exact filename as the message. If and only if the scope was followed and checks pass, run
`git pull --rebase`, then push. Never force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
