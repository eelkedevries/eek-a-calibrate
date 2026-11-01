# Current state

Living, high-level orientation for the project: what exists now, key
architectural decisions, and what is in progress. Read it at the start of a
session to orient quickly.

Update it only for genuinely useful orientation (a new system, an
architectural decision), not after routine commits. A stale or bloated state
file is worse than none.

This file records what *is* (current reality). The binding design canon is
`docs-dev/reference/primary_authoritative/`; when the two conflict, the canon
wins and the gap is work still to be done.

## Systems (after prompt 001)

- **Build:** Vite 8 + TypeScript 6, no framework, base `/eek-a-calibrate/`, hash routes.
  `npm run check` = build (`tsc --noEmit`, `vite build`, `scripts/precompress.mjs`), unit tests
  (`node --test` on the TypeScript sources), `scripts/verify-assets.mjs dist`,
  `scripts/check-public-build.sh dist`, `scripts/validate-prompts.sh`.
- **Assets:** `assets-manifest.json` lists every runtime and model file with its hash.
  `scripts/copy-assets.mjs` (predev, prebuild) copies the MediaPipe 0.10.35 WebAssembly pairs
  (module, SIMD, no-SIMD) and the TF.js WebAssembly files into `public/vendor/` (git-ignored).
  ONNX Runtime arrives through Vite `?url` imports in `src/engines/runtimes/ort.ts`. Models are
  committed under `public/models/` with LICENSE and PROVENANCE.
- **Headers:** `public/.htaccess` (types, `.wasm.gz` as gzip-encoded WebAssembly, enforced CSP
  with `connect-src 'self'`, Permissions-Policy; COOP/COEP off). `config/headers.mjs` holds the
  same strings; `scripts/serve-dist.mjs` serves `dist/` with them for the end-to-end tests
  (`E2E_PORT`, default 4173).
- **Contracts (frozen):** `src/core/types.ts`, `src/engines/types.ts`, `src/vision/protocol.ts`
  (specification §6, verbatim) and `src/core/constants.ts` (Appendix A, verbatim).
- **Engines:** `src/engines/registry.ts` loads each engine folder's default-exported
  `EngineModule` by dynamic import; `src/engines/mappers.ts` aggregates each folder's
  `mappers` export. All four engines are stubs (`probe` → not implemented, `mappers` = []).
- **App shell:** `src/main.ts` (header, footer with "Delete all my data", live region),
  `src/app/router.ts` (hash routes, lazy screens with a default-exported `Screen`, a
  `placeholder()` for routes not yet built), `src/app/state.ts` (settings from the query string,
  session clock, result slots, delete-all hook), `src/app/strings.en-GB.ts` (flat dotted keys,
  `t()`), `src/app/testHooks.ts` (`window.__eek` with `?e2e=1`; `registerTestHook`),
  `src/app/dom.ts`, `src/app/style.css` (light/dark tokens, Okabe–Ito engine colours).
  Every route in specification §7 shows a placeholder screen.
- **Tests:** `tests/unit/contracts.test.ts`; `tests/e2e/smoke.spec.ts` (same-origin requests,
  no console errors or CSP violations, hash-route reload, production headers). The fake camera
  is built from `tests/fixtures/face/portrait.jpg` (public-domain NASA portrait) by
  `scripts/make-fake-video.sh`.
- **Deploy:** `scripts/deploy.sh` dispatches `deploy-eek-a-calibrate.yml` in the eelkedevries.com
  repository (prompt 010 adds that workflow). Not yet deployed.

## In progress

Prompts 002–007 can run in parallel; then 008, 009 and 010 (`docs-dev/plan.md`).
