# Task: Integration and deploy (WP10)

## Goal

The whole suite green, the failure-path tests, the deploy workflow in the eelkedevries.com
repository, the first live deploy with its verification, and the manual checklist.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs last.

## Owns

`tests/e2e/failures.spec.ts`, `docs/deployment.md` (final), `docs-dev/planning/current_state.md`,
`docs-dev/manual-verification.md`, and the eelkedevries.com changes of §9. Integration fixes go
into the owning files, each fix noted in the report.

## Context

`specification.md`: §9 (deploy integration: files, protect line, README sentence, order of
pushes, waiting for older site deploys, dispatch, re-runs, curl checks), §10.4
(`failures.spec.ts`), §10.5 (CI), §10.6 (after deploy and the manual checklist), §12 (risks).

The deploy drafts (`deploy-eek-a-calibrate.yml`, `eek-a-calibrate.htaccess`, the deploy script)
are listed in the specification's "Scratch material" table. The eelkedevries.com `CLAUDE.md`
requires committing and pushing to its `main`, merging any harness branch first, and saying so.
Where `gh` has no valid login, use the GitHub API tools named in §9.

## Specification v0.2 amendments (binding)

Specification §14 and §15 (v0.3) override earlier sections. Apply the integration rules of §15.2.3. For this prompt:
- Add `tests/e2e/mobile.spec.ts` (§14.2.11): phone emulation (`isMobile`, `hasTouch`, portrait
  viewport) with the portrait fake video; the Quick flow completes by taps without element
  fullscreen; targets inside the safe rectangle; an orientation change pauses and invalidates.
- Add the §14.2.12 items to `docs-dev/manual-verification.md`.
- Check that the default flow never requires the screen or distance step (§14.1.1).

## Deliverables (required changes)

1. `npm run check:all` green; fixes for any integration defects in the owning files, each noted.
2. `tests/e2e/failures.spec.ts`: no camera permission shows the right message; a fullscreen exit
   simulated through `__eek` aborts the block; a tampered model hash (served by a test route)
   marks only that engine unavailable; `__eek.crashWorker()` recovers.
3. In eelkedevries.com, one commit to `main` with the message "Deploy eek-a-calibrate to
   /eek-a-calibrate/ on a calibrate-updated dispatch": `.github/workflows/deploy-eek-a-calibrate.yml`
   from the draft, the protect line in `scripts/deploy.sh` after the eek-a-rise one, and one
   README sentence.
4. The order of §9: push eek-a-calibrate `main`, push eelkedevries.com `main`, wait until no older
   *Render & Deploy* run is queued or running, dispatch `deploy-eek-a-calibrate.yml`, re-run up to
   three times on a *Test SSH connectivity* failure, then verify with curl.
5. `docs-dev/manual-verification.md` (§10.6): browsers, glasses, lighting, distances, head
   movement, a low-end laptop; frame rate per engine and backend, validation per engine, the
   selected estimator. No accuracy figure is published until it has been done.
6. The final `docs/deployment.md` and an updated `current_state.md`.

## Do not implement

- new features or phase-2 items (§13); a Projects card on eelkedevries.com;
- COOP/COEP headers; a change to the contracts, `constants.ts` or `package.json` without a
  specification bump.

## Acceptance criteria

The task is complete when:
- `https://eelkedevries.com/eek-a-calibrate/` returns 200 with the built `assets/index-*.js`;
- `.wasm.gz` is served as `application/wasm` with `content-encoding: gzip`;
- the CSP header is present;
- `deploy-eek-a-calibrate.yml` has a successful run;
- the main site's `scripts/deploy.sh` contains the protect line;
- the final report lists the camera checks still to be done by hand.

## Checks

`npm run check:all`; the curl checks of §9.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push. The eelkedevries.com commit follows that repository's own rules.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
