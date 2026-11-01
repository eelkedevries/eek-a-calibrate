# Task: Geometric and eye-pixel engines (WP5)

## Goal

The two always-available engines: the geometric landmark/iris/head-pose engine and the clean-room
WebGazer-method eye-pixel engine, with their mapper specs and the face simulator.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs in parallel with 002–004, 006 and 007 (in its own worktree and `E2E_PORT`). It uses
the landmark sets of 004 (`src/core/face/landmarkSets.ts`): run it after 004 has landed.

## Owns

`src/engines/geometric/{index,features,mappers}.ts`, `src/engines/eyepixel/{index,patches,mappers}.ts`,
`tests/sim/faceSim.ts` (and any data it needs under `tests/sim/`, such as the MediaPipe canonical
face model with its Apache-2.0 notice), `tests/sim/geometric-*.test.ts`,
`tests/unit/engine-geometric*.test.ts`, `tests/unit/engine-eyepixel*.test.ts`.

## Context

`specification.md`: §4.3 (landmark sets, eye measures), §4.6 (rule; `FrameImage`), §4.6.1
(`geometric`, featureVersion `geo-4`: in-plane offsets, depth correction `dc = E⁻¹e₃`, the
24-column `geo-linear` and 27-column `geo-quadratic`, floors, primary columns), §4.6.4
(`eyepixel`, featureVersion `ep-1`), §4.8.4 (mapper table), §6 (`MapperSpec`, `EngineModule`,
`GazeEngine`), §10.1 WP5, §10.2 (simulation), Appendix A.

`engines/<id>/mappers.ts` and `features.ts` are DOM-free and pure: the fit worker imports them, so
they never import a runtime. The registry expects a default-exported `EngineModule` from
`index.ts`; `mappers.ts` exports `mappers`. The canonical face model is in the specification's
"Scratch material" table.

## Deliverables (required changes)

1. §4.6.1 and §4.6.4 extractors as pure functions, each wrapped in an `EngineModule` (`probe` ok,
   `create`, `extract` returning `EngineFrame` with the right status codes).
2. Mapper specs: `geo-linear`, `geo-quadratic`, `pix-ridge`, `pix-webgazer` (§4.8.4), with names,
   floors, primary columns, complexity and λ grids.
3. `tests/sim/faceSim.ts` (§10.2): canonical face, iris geometry, head rotation and translation,
   pinhole projection with noise, the synthetic matrix, `eyeLook*` blendshapes, and screen ground
   truth.
4. The mirror-pair test against canonical-model symmetry.
5. The unit tests of §10.1 WP5 and the WP5 simulation test of §10.2.

## Do not implement

- fitting, stacking or selection (002, 008); the vision host (004);
- the label "WebGazer" for the eye-pixel engine: it is "WebGazer method (re-implementation)";
- any WebGazer code (GPL); a change to the contracts or `constants.ts`.

## Acceptance criteria

The task is complete when:
- the §10.1 WP5 list passes: feature finiteness on the landmark fixture, feature layout and
  names, mapper rows and floors, histogram equalisation against a reference implementation, and
  the mirror pairs (|x_a + x_b|, |y_a − y_b|, |z_a − z_b| < 0.01);
- the WP5 simulation test passes: with noise-free landmarks, straight-ahead gaze across yaw ±20°
  and pitch ±15°, OLS with `dc` reduces the pose-induced change in ḡ by at least 80 % compared
  with no `dc`;
- both engines return `ok` in `#/lab` (through `engines.spec.ts` once 006 and 007 land,
  otherwise by a local run);
- `npm run check` passes.

## Checks

`npm run check`; a local `#/lab` run.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
