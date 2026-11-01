# Task: Scaffold and contracts (WP1)

## Goal

A buildable, deployable shell, with every contract, dependency, asset and check in place.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs first and alone; every later prompt builds on it.

## Owns

`AGENTS.md`, `CLAUDE.md`, `README.md`, `LICENSE`, `NOTICE.md`, `.gitignore`,
`.pre-commit-config.yaml`, `.github/workflows/check-build.yml`, `index.html`, `vite.config.ts`,
`tsconfig.json`, `playwright.config.ts`, `package.json`, `package-lock.json`,
`assets-manifest.json`, `config/headers.mjs`, `public/.htaccess`, `public/favicon.svg`,
`public/models/**`, `scripts/*`, `src/main.ts`, `src/env.d.ts`, `src/app/{router,state,dom,strings.en-GB,testHooks}.ts`,
`src/app/style.css`, the placeholder `src/app/screens/*.ts`, `src/core/types.ts`,
`src/core/constants.ts`, `src/engines/types.ts`, `src/engines/registry.ts`,
`src/engines/mappers.ts`, the stub `src/engines/<id>/{index,mappers}.ts` and
`src/engines/runtimes/ort.ts`, `src/vision/protocol.ts`, `tests/e2e/{smoke.spec,global-setup}.ts`,
`tests/unit/contracts.test.ts`, `tests/fixtures/face/`, `docs/deployment.md` (first version),
`docs-dev/**`.

## Context

`specification.md`: §3.1 (pins and models), §5 (layout and layering), §6 (contracts), §7
(routes), §8 (assets, build, headers), §9 (deploy integration), §10.4 (Playwright and the fake
camera), §10.5 (CI), §11 WP1, Appendix A (constants).

## Deliverables (required changes)

1. House files: `AGENTS.md` (eek-a-look's, with the project conventions: British English;
   commit and push to `main`; verify `npm run check`; tests per §10; base `/eek-a-calibrate/`;
   hosting via `deploy-eek-a-calibrate.yml`; a push does not deploy), `CLAUDE.md`, `README.md`,
   `LICENSE` (MIT), `NOTICE.md`.
2. The `docs-dev/` skeleton: agent guides, prompts 001–010 (from §11), `plan.md` (= §11),
   `planning/current_state.md`, `reference/primary_authoritative/specification.md` (the
   specification, v0.1) and `reference/secondary_background/overview.md`.
3. `package.json` with every dependency pinned exactly as §3.1 lists, the scripts of §8.2, and the
   committed `package-lock.json`.
4. `tsconfig.json` (§6), `vite.config.ts` (§8.2), `index.html` with the canonical link,
   `public/.htaccess` (§8.3) and `config/headers.mjs` holding the same CSP and Permissions-Policy.
5. `assets-manifest.json` and the committed models of §3.1 under `public/models/`, each folder
   with LICENSE and PROVENANCE.md; every sha256 checked against the specification.
6. Every script of §5: `copy-assets.mjs`, `precompress.mjs`, `verify-assets.mjs`,
   `serve-dist.mjs`, `make-fake-video.sh`, `check-public-build.sh`, `validate-prompts.sh`,
   `new-prompt.sh`, `deploy.sh`. `serve-dist.mjs` and `playwright.config.ts` read the port from
   `E2E_PORT` (default 4173); Playwright starts its own server (`reuseExistingServer: false`); no
   script assumes the repository path or writes outside the repository except the OS temp
   directory; `copy-assets.mjs` is idempotent and safe in a fresh worktree.
7. The CI workflow, the Playwright configuration, the fixture face
   (`tests/fixtures/face/portrait.jpg`, a public-domain NASA portrait of at most 150 KB, with
   PROVENANCE.md) and `make-fake-video.sh`.
8. The contracts of §6 written verbatim (`src/core/types.ts`, `src/engines/types.ts`,
   `src/vision/protocol.ts`), `src/core/constants.ts` = Appendix A verbatim,
   `src/engines/registry.ts` (dynamic loaders pointing at stub `index.ts` files whose `probe`
   returns `{ok:false, reason:'not implemented'}`) and `src/engines/mappers.ts` (aggregating stub
   `mappers.ts` files that export `[]`).
9. The app shell: router, state, DOM helper, strings, style tokens, test hooks and a placeholder
   screen for every route in §7, so later prompts only replace files they own.
10. `tests/e2e/smoke.spec.ts`.

## Do not implement

- any engine, the vision host, calibration, fitting, metrics or real screens (002–009);
- the eelkedevries.com workflow and protect line (010);
- COOP/COEP headers.

## Acceptance criteria

The task is complete when:
- `npm ci && npm run check` passes;
- `dist/` contains `vendor/mediapipe-0.10.35/*` (three pairs) with `.wasm.gz`, the TF.js
  WebAssembly, the ONNX Runtime `?url` assets with `.gz`, and the models, with no `.map` files;
- `verify-assets` passes, and fails on a tampered hash (checked by hand once);
- `serve-dist` serves `.wasm.gz` as `application/wasm` with gzip, and sends the CSP header;
- `npm run test:e2e -- smoke` passes;
- `git log origin/main` shows the commit.

## Checks

`npm run check`; `npm run test:e2e -- smoke`; one manual tamper test of `verify-assets`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, then push (create `main` first: the repository has
no commits).

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
