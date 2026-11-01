# Deployment

eek-a-calibrate is served at <https://eelkedevries.com/eek-a-calibrate/>.

## How to deploy

Push to `main`, then run:

```bash
npm run deploy
```

This starts the workflow
[`deploy-eek-a-calibrate.yml`](https://github.com/eelkedevries/eelkedevries.com/actions/workflows/deploy-eek-a-calibrate.yml)
in the eelkedevries.com repository. That workflow builds this repository from GitHub and copies
the build into `/eek-a-calibrate/` on the web host. The command waits for the run and then checks
that the live page answers.

Without a terminal, use **Run workflow** on that page instead. A session without a working `gh`
login can start the same workflow through the GitHub API (a `workflow_dispatch` of
`deploy-eek-a-calibrate.yml` on `main` in `eelkedevries/eelkedevries.com`), then poll the run and
re-run it if it failed at *Test SSH connectivity*.

## Things to know

- **A push alone does not deploy.** The workflow builds what is on GitHub, so `npm run deploy`
  refuses to run with uncommitted or unpushed changes.
- **No secrets live in this repository.** The SSH secrets belong to the eelkedevries.com
  repository, and its own site deploy leaves `/eek-a-calibrate/` untouched (a rsync protect
  rule in its `scripts/deploy.sh`).
- **Time-outs:** the host sometimes blocks GitHub's runners for a few minutes. `npm run deploy`
  re-runs a deploy that failed at *Test SSH connectivity* up to three times. Background is in the
  eelkedevries.com README, under *Deploy reliability*.
- **Hash routes only.** The host answers unknown paths with the site's 404 page, so the app uses
  `#/…` routes and a single `index.html`.
- **`www.` and the apex domain are separate origins.** Camera permission and stored calibrations
  are per origin; the page names the apex as its canonical address.

## Headers and types (`public/.htaccess`)

Vite copies `public/.htaccess` into the build, so it lands at `/eek-a-calibrate/.htaccess`. The
site-wide `.htaccess` still applies above it (nosniff, no-store for HTML, the site's 404 page).
This file adds:

- **Types** the host does not send by itself: `text/javascript` for `.mjs`, `application/wasm`
  for `.wasm`, `application/octet-stream` for `.task`, `.tflite`, `.onnx` and `.bin`.
- **Precompressed WebAssembly.** `scripts/precompress.mjs` writes `<file>.wasm.gz` next to every
  `.wasm`; production builds request the `.gz` name, which is served as gzip-encoded
  `application/wasm`. If initialisation fails with a `.gz` URL, the app retries once with the
  plain `.wasm`.
- **A Content Security Policy** enforced as a header, not a meta tag (a meta CSP would not govern
  a dedicated worker), with `connect-src 'self' blob: data:`, so nothing can be sent elsewhere.
  `'wasm-unsafe-eval'` allows WebAssembly compilation; `blob:` in `worker-src` and `connect-src`
  is needed because ONNX Runtime and MediaPipe create object URLs.
- **A Permissions-Policy** that allows the camera for this origin only and refuses the
  microphone and geolocation.
- **No COOP/COEP.** No engine in v1 needs threaded WebAssembly, and cross-origin isolation is
  untested on this host. The lines are present but commented out; enable them only after a live
  test.

`config/headers.mjs` holds the same CSP and Permissions-Policy strings. `scripts/verify-assets.mjs`
checks that both copies agree, and `scripts/serve-dist.mjs` sends them in the end-to-end tests.

If a CSP violation appears in the end-to-end tests, relax only the directive involved and record
the reason here.

## After a deploy

Check from a terminal (or let the workflow's own check do the first two):

```bash
base=https://eelkedevries.com/eek-a-calibrate
curl -sS "$base/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
curl -sI "$base/vendor/mediapipe-0.10.35/vision_wasm_module_internal.wasm.gz" | grep -iE 'content-type|content-encoding'
curl -sI "$base/models/peekr-1.0.7/peekr.onnx" | grep -i content-type
curl -sI "$base/" | grep -iE 'content-security-policy|permissions-policy'
```

Expected: the built `assets/index-*.js`; `application/wasm` with `content-encoding: gzip`;
`application/octet-stream`; both policy headers.
