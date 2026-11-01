# Deployment

eek-a-calibrate is served at <https://eelkedevries.com/eek-a-calibrate/>.

## How it is wired

- **This repository builds the site; the eelkedevries.com repository publishes it.** The
  workflow
  [`deploy-eek-a-calibrate.yml`](https://github.com/eelkedevries/eelkedevries.com/actions/workflows/deploy-eek-a-calibrate.yml)
  in `eelkedevries/eelkedevries.com` checks out this repository's `main`, runs `npm ci` and
  `npm run build`, checks that no development material is in `dist/`, and copies `dist/` into
  `/eek-a-calibrate/` on the web host with rsync. It writes nowhere else.
- **No secrets live here.** The SSH secrets belong to the eelkedevries.com repository.
- **The site's own deploy leaves the folder alone.** eelkedevries.com's `scripts/deploy.sh`
  carries the rsync rule `--filter='protect /eek-a-calibrate/***'`, so a *Render & Deploy* run of
  the main site never deletes what this workflow published.
- **The workflow starts on demand only:** a `workflow_dispatch` (the *Run workflow* button,
  `npm run deploy`, or the GitHub API), or a `repository_dispatch` of type `calibrate-updated`.
  A push to this repository does not deploy.

## Status

The first deploy, run 1 of `deploy-eek-a-calibrate.yml`
([run 41296551329](https://github.com/eelkedevries/eelkedevries.com/actions/runs/41296551329)),
succeeded on 1 November 2026, started by a workflow dispatch on eelkedevries.com `main` at commit
`c64030f` (the commit that added the workflow, the protect line and the README note). Checked
from outside afterwards: the page answers 200 and names the built `assets/index-*.js`; the CSP and
Permissions-Policy headers are present; `.wasm.gz` arrives as `application/wasm` with
`content-encoding: gzip`; the ONNX Runtime `.mjs` as `text/javascript`; `.task` and `.onnx` as
`application/octet-stream`; an unknown path gives 404.

## How to deploy

Push to `main` first: the workflow builds what is on GitHub, not your working tree. Then start it
in one of three ways.

1. **From a terminal with a `gh` login** that can reach eelkedevries.com:

   ```bash
   npm run deploy
   ```

   `scripts/deploy.sh` refuses to run with uncommitted or unpushed changes, starts the workflow,
   waits for the run, re-runs it up to three times if it failed at *Test SSH connectivity*, and
   then checks that the live page answers 200.

2. **In the browser:** *Run workflow* (branch `main`) on the workflow's page linked above.

3. **Through the GitHub API**, for example from a session whose `gh` login is not valid. With a
   token that may run workflows in `eelkedevries/eelkedevries.com`:

   ```bash
   api=https://api.github.com/repos/eelkedevries/eelkedevries.com
   auth=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json")

   # Start the run (the answer is 204 with no body).
   curl -sS -X POST "${auth[@]}" "$api/actions/workflows/deploy-eek-a-calibrate.yml/dispatches" \
     -d '{"ref":"main"}'

   # Find it and follow it: status, then conclusion.
   curl -sS "${auth[@]}" "$api/actions/workflows/deploy-eek-a-calibrate.yml/runs?event=workflow_dispatch&per_page=1" \
     | grep -E '"(id|status|conclusion)"' | head -n 3

   # If it failed at "Test SSH connectivity", re-run its failed job (up to three times).
   curl -sS -X POST "${auth[@]}" "$api/actions/runs/<run id>/rerun-failed-jobs"
   ```

   The same requests are available as tools to an agent: `actions_run_trigger` with
   `{method: "run_workflow", owner: "eelkedevries", repo: "eelkedevries.com",
   workflow_id: "deploy-eek-a-calibrate.yml", ref: "main"}`, then `actions_list` with
   `{method: "list_workflow_runs", resource_id: "deploy-eek-a-calibrate.yml"}` to poll, and
   `actions_run_trigger` with `method: "rerun_failed_jobs"` and the run id. The alternative
   trigger is `POST $api/dispatches` with `{"event_type":"calibrate-updated"}`.

Whichever way it starts, finish with the checks below.

## Things to know

- **Time-outs:** the host sometimes blocks GitHub's runners for a few minutes. The workflow's
  *Test SSH connectivity* step retries with back-off for about eleven minutes; if it still fails,
  re-run the failed job (up to three times). Background is in the eelkedevries.com README, under
  *Deploy reliability*.
- **A site deploy and this deploy may run at the same time.** They write to disjoint files (the
  protect rule above), and each workflow has its own concurrency group, so neither cancels the
  other.
- **Hash routes only.** The host answers unknown paths with the site's 404 page, so the app uses
  `#/…` routes and a single `index.html`.
- **`www.` and the apex domain are separate origins.** Camera permission and stored calibrations
  are per origin; the page names the apex as its canonical address.
- **Caching.** Every script, stylesheet and WebAssembly file name carries a hash or a version
  (`vendor/mediapipe-0.10.35/`, `models/peekr-1.0.7/`), and the site-wide `.htaccess` sends HTML
  as no-store, so a deploy is visible on the next page load.

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

The workflow's last step already checks, from the host, that the live page names this build's
`assets/index-*.js` and that a `.wasm` file answers `200 application/wasm`. Check the rest from a
terminal (the `.mjs` name comes from a local build of the same commit):

```bash
base=https://eelkedevries.com/eek-a-calibrate
curl -sS "$base/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
curl -sI "$base/" | grep -iE 'content-security-policy|permissions-policy'
curl -sI "$base/vendor/mediapipe-0.10.35/vision_wasm_module_internal.wasm.gz" | grep -iE 'content-type|content-encoding'
curl -sI "$base/assets/$(ls dist/assets | grep -m1 '^ort-wasm-simd-threaded-.*\.mjs$')" | grep -i content-type
curl -sI "$base/models/face-landmarker-f16-v1/face_landmarker.task" | grep -i content-type
curl -sI "$base/models/peekr-1.0.7/peekr.onnx" | grep -i content-type
```

Expected: the built `assets/index-*.js`; both policy headers; `application/wasm` with
`content-encoding: gzip`; `text/javascript`; `application/octet-stream` twice.

Then open the page in a browser with a camera and go through the checks in
`docs-dev/manual-verification.md` that the change could affect.
