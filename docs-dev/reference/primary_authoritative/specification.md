# eek-a-calibrate: final specification, v0.5 (4 November 2026)

> **v0.2:** §14 makes screen size and viewing distance optional and adds smartphone support. It
> overrides earlier sections where they conflict.
>
> **v0.3:** §15 records corrections and integration rules from the reviews of 002–007.
>
> **v0.4:** §16 handles corrupt landmarks from mobile GPU delegates (first real-device test)
> and records the decisions that follow the final reviews of the integrated app (§16.2).
>
> **v0.5:** §17 adopts the game-first interface ("Pop with your eyes") of
> `secondary_background/interface-design-v2/`: new screens and routes, the bubble target, the
> position guard with device motion, rectangular zones, stars and the challenge. It overrides
> earlier sections where they conflict.

This is the binding, implementation-ready specification for **eek-a-calibrate**. It is a browser
app for webcam eye-tracking calibration, validation and live gaze, served at
`https://eelkedevries.com/eek-a-calibrate/`. It combines the three architecture proposals
(*accuracy-first* = **A**, *robustness-first* = **R**, *researcher-first* = **Res**) and the six
research reports. Where they disagree, this document decides.

WP1 copies this file to `docs-dev/reference/primary_authoritative/specification.md`. That copy
becomes the canon for the house workflow. Any later change bumps the version number.

**Evidence keys.** Each key names a report under
`/tmp/claude-0/-home-user/c1e58262-5f4b-596c-b03f-af344c9ed2b2/scratchpad/research/`:

| Key | Report |
|---|---|
| [GL] | `repo-gaze-lite.md` |
| [PG] | `repo-pocketgaze.md` |
| [RO] | `repo-others.md` |
| [LIT] | `lit-sota.md` |
| [IMPL] | `impl-libs.md` |
| [DEP] | `deploy.md` |

**[C]** means the point was checked again while writing this specification, against the
downloaded packages, sibling repositories or the live environment. **[I]** means inference.
Anything marked "heuristic" is a tunable default, not a value derived from evidence.

**Scratch material that implementers need** (all paths absolute):

| Material | Path |
|---|---|
| Upstream WebEyeTrack source at `75fbd2f` (MIT) | `/tmp/claude-0/-home-user/c1e58262-5f4b-596c-b03f-af344c9ed2b2/scratchpad/downloads/gh-webeyetrack/repo/js/src/` |
| BlazeGaze weights | `/tmp/claude-0/-home-user/c1e58262-5f4b-596c-b03f-af344c9ed2b2/scratchpad/downloads/gh-webeyetrack/repo/js/examples/demo-app/public/web/{model.json,group1-shard1of1.bin}` |
| Peekr 1.0.7 package (model and bundle) | `/tmp/claude-0/-home-user/c1e58262-5f4b-596c-b03f-af344c9ed2b2/scratchpad/downloads/peekr/package/` |
| MediaPipe canonical face model (Apache-2.0) | `/tmp/claude-0/-home-user/c1e58262-5f4b-596c-b03f-af344c9ed2b2/scratchpad/downloads/gaze-lite-verify/canonical_face_model.obj` |
| Face model | `/home/user/gaze-lite/public/models/face_landmarker.task`. Byte-identical to the GCS file, sha256 `64184e22…c9ff` [C]. |
| Deploy drafts | `/tmp/claude-0/-home-user/c1e58262-5f4b-596c-b03f-af344c9ed2b2/scratchpad/research/{deploy-eek-a-calibrate.yml,eek-a-calibrate.htaccess,eek-a-calibrate-deploy.sh}` |
| eek-a-gaze geometry reference | `/home/user/eek-a-gaze/tests/data/geometry_reference.csv` |

---

## 1. Decisions at a glance

1. **The product is a measurement harness with pluggable engines.** Four gaze engines all
   process *the same camera frames* of *the same calibration and validation run*. Each engine
   then gets a personal mapper, fitted and cross-validated on identical labels and folds, and
   is validated on identical held-out targets. This produces the same-participant, in-browser
   comparison the literature lacks [LIT §7].
2. **The four engines, in a-priori rank order.**
   1. **BlazeGaze** (WebEyeTrack, MIT): the default appearance engine.
   2. **Peekr** (MIT): an eye-crop CNN.
   3. **Geometric**: a landmark/iris/head-pose port of gaze-lite with fixes; always available.
   4. **Eye-pixel**: a clean-room re-implementation of the WebGazer method, used as a literature
      baseline.

   **The default estimator is "Auto".** Auto resolves to *Combined* (per-axis convex stacking
   of the engines' calibrated outputs) or to a single engine. The choice is made per person by
   grouped cross-validation on calibration data, and never by looking at validation data. The
   user can switch estimator at any time without recalibrating.
3. **One face front end.** `@mediapipe/tasks-vision` is pinned to **exactly 0.10.35**, because
   1.x posts usage metrics to Google [IMPL §3]. It runs in a **module Web Worker** on the
   *module* WASM variant. If the worker fails, an **inline (main-thread) host** runs the
   identical code on the classic variants.
4. **Units.** Every mapper regresses **visual angle in degrees**, measured from the
   screen-centre normal at the *per-frame* viewing distance. The output is converted back to
   CSS pixels with the current distance, which gives first-order compensation when the person
   leans in or out. Geometry comes from:
   - a credit-card match, for screen scale;
   - the blind-spot test (virtual chinrest), for absolute distance;
   - iris diameter, for per-frame distance.
5. **Calibration, Standard preset, about 100 s with instructions.**
   - 13 fixation targets.
   - A 16 s 2:3 Lissajous pursuit with a lag estimated per session.
   - Guided head motion at 5 locations.
   - Validation on **12 separate targets** that never coincide with calibration points.

   Quick and Thorough presets exist (§4.7).
6. **Statistics.**
   - Weighted ridge with an unpenalised intercept and **physical spread floors**.
   - λ chosen by **exact leave-one-location-out cross-validation via the hat-matrix identity**.
     Groups are spatial blocks, so nothing leaks between folds.
   - Two Huber reweighting passes plus hard rejection.
   - Seeded PCA for 512-d embeddings.
   - Simplex stacking evaluated by nested cross-validation.
7. **Metrics.** Reported in degrees and pixels:
   - exact angular accuracy;
   - precision as RMS sample-to-sample, SD and BCEA;
   - data loss as a funnel;
   - effective rate;
   - a constant-predictor baseline.

   Verdicts are labelled heuristic.
8. **Hosting.**
   - Every runtime and model is self-hosted under versioned paths.
   - WASM is precompressed (`.wasm.gz`).
   - `.htaccess` sends MIME types, an enforced **CSP with `connect-src 'self'`** and a
     Permissions-Policy.
   - **COOP/COEP stay off.** No v1 engine needs threads, and the headers are untested on the
     host [DEP].
9. **Stack.** Plain TypeScript and DOM with no framework, Vite 8, hash routes.
   - `src/core/` is DOM-free and runs under `node --test` directly from the TypeScript source.
   - The browser end-to-end tests use Playwright 1.63.0 with Chromium's fake camera (Chrome for
     Testing 153 is pre-installed under `/opt/pw-browsers`) [C].
10. **Deferred to phase 2** (§13):
    - saccade.js;
    - BlazeGaze Adam head adaptation;
    - Peekr embedding outputs;
    - kernel ridge / GP correction;
    - COOP/COEP threads;
    - webcam clip record/replay;
    - genuine WebGazer.

---

## 2. Evaluation of the proposals

### 2.1 What is taken from each

| Topic | Adopted from | Notes |
|---|---|---|
| Shared harness: all engines on the same frames, CV-selected estimator, validation never used for selection | A, R, Res (consensus) | |
| Default "Auto" = Combined or best single engine | A (stacking) + R (fusion, renormalisation per frame) | Simplex stacking generalises inverse-variance fusion |
| BlazeGaze split into the frozen encoder (`cnn_encoder`) and `gaze_mlp`, run as two TF.js sub-models; features stored, images never kept | A, R, Res | Topology verified [C]: Concatenate(512, 3, 3) → Dense 16 relu → Dense 16 relu → Dense 2; 8,610 head parameters; 156,018 in total |
| BlazeGaze eye strip as **one composite nearest-neighbour pass, bit-exact with upstream's two-pass warp** | A (composite) | Upstream samples with `floor` (nearest) twice [C]. Res's bilinear `tf.image.transform` would change the input distribution, so it is rejected. |
| Module-worker MediaPipe on the module WASM pair, with an inline fallback | R (worker), Res (inline host) | Verified [C]: in a worker the 0.10.35 loader tries `importScripts`, catches the `TypeError`, then calls `import(url)`; only `vision_wasm_module_internal.js` sets `globalThis.ModuleFactory`. The graph runner creates its own `OffscreenCanvas(1,1)` for the GPU delegate. |
| Regress in degrees with per-frame distance | Res | |
| Groups = calibration *locations* (spatial blocking); pursuit frames go to the nearest location, head-motion frames to their location | R | Stricter than A's and Res's 2 s pursuit chunks |
| Physical spread floors plus clipping to the calibration range | R (floors), A (range clipping, `extrapolated` flag) | Fixes [GL] defect 4 |
| Exact grouped LOO via the hat-matrix identity; Huber IRLS plus hard rejection | A | |
| Depth-correction feature for the iris-in-front-of-corners error | A (formulation, corrected in §2.2 item 4) | Fixes [GL] defect 1 |
| Head-motion block: fixate while turning the head, at 5 locations | R | Decorrelates pose from target; fixes [GL] defects 2, 3 and 7 |
| 12-point validation grid with central/peripheral split; data-loss funnel; constant baseline; AOI advice | Res (12 points, funnel), A/R (baseline), R (AOI advice) | Coordinates changed to reach 0.15/0.85 |
| Enforced CSP via `.htaccess` header (not a meta tag); `serve-dist.mjs` emulating production headers in e2e | R (CSP header), Res (serve-dist) | A meta CSP does not govern a dedicated worker, which takes its policy from its own response headers. |
| Models committed under `public/models/` with LICENSE/PROVENANCE; the 2000 KB pre-commit hook excludes that folder | Res | House precedent: gaze-lite, PocketGaze, and eek-a-look's committed 6.4 MB ONNX [C]. R's build-time fetch is rejected. |
| ORT runtime via Vite `?url` imports plus a `.gz` copy | eek-a-look pattern (live on this host) [C] | |
| `time_ms` export **plus `--time-units ms`** | A (correction) | Verified in eek-a-gaze `loader.py` [C] |

### 2.2 Claims in the proposals not supported by the evidence, or wrong

1. **A and Res cite "2.92° with the head still / 5.79° overall" as evidence for the geometric
   engine.** That is EMC-Gaze [LIT §4], a different model. There is **no accuracy figure for
   gaze-lite's features** [GL: no tests, no recorded accuracy].
2. **A: "COOP/COEP switched on; nothing is blocked".** This is untested on SiteGround and its
   proxy cache [DEP §8], and no v1 engine needs threads. **Off.**
3. **A: "Peekr: reproduce mirrored-frame cropping", and R: "input1 is the mirrored crop".**
   Checked in the bundle [C]. Legacy FaceMesh runs with `selfieMode:true`, so the *landmark
   coordinates* are mirrored. The crop, however, is drawn from the **unmirrored** `<video>` at
   `sx = W − x − w`, which is the same physical rectangle. The pixels are therefore *not*
   flipped; only `kps` is in mirrored coordinates. The exact rule is in §4.6.3. R's mirror-pair
   hypothesis (130↔359, 27↔257, 243↔463, 23↔253) is **confirmed by canonical-model symmetry**
   [C].
4. **A: the depth feature is "E⁻¹e₃ divided by the eye width".** This is a dimensional slip.
   When the in-plane offsets are already divided by eye width, the correction term is
   `(c/w)·E⁻¹e₃`. Here `c/w` is a per-person constant that the ridge learns, so the feature is
   **E⁻¹e₃ itself** (§4.6.1).
5. **A: One Euro β = 0.05 per °/s ("about a 0.11 s time constant").** Not derived. Converting
   gaze-lite's tuned value (β = 0.008 per px/s) at about 40 px/° gives **β ≈ 0.3 per °/s**,
   which is what R and Res use.
6. **R and Res: "dropping the first 300 ms halved the error".** [RO] measured 0.121 → 0.072,
   a **−40 %** in-sample change on a single saved session. The settle window is still adopted.
7. **R: per-frame distance from the MediaPipe `tz` ratio.** No evidence. The iris method has
   evidence of <10 % error [LIT §6.5], so **iris diameter** is used. `tz` is logged for
   diagnostics only.
8. **R: geometry YAML `origin: top-left, units: px`.** eek-a-gaze accepts only
   `top_left|centre` and `pixels|degrees` [C: `schema.py`].
9. **Res: a generated ES-module wrapper for the classic loader.** Unnecessary, because
   0.10.35 ships the module pair [C]. Res's "the module pair is never requested, so do not
   copy it" is wrong for a worker design. **All three pairs are copied:** module (worker),
   classic SIMD and no-SIMD (inline fallback).
10. **Res: a grid of BlazeGaze head-adaptation settings (Adam up to 30 steps, lr up to 1e-3).**
    Upstream's default (`stepsInner = 1`, `lr = 1e-5`) is, in effect, the affine correction
    alone [C: `WebEyeTrack.ts adapt()`]. Longer fine-tuning is unvalidated and costly under
    grouped CV, so it moves to **phase 2**.
11. **The digest's "write `time_ms`" is not enough on its own.** The eek-a-gaze auto-detector
    reads a median Δt of about 33 as "samples" with an unknown rate, and the load fails [C:
    `loader.py` lines 60–91 and 197–202]. Exports therefore document
    `--time-units ms` (A's correction).
12. **A: saccade.js in v1.** It is 20.6 MB, WebGPU-only, has no published accuracy, and its
    weight provenance is unstated [IMPL §5.1]. **Deferred.**
13. **A and R: the test browser.** It is not "`/usr/bin/google-chrome` Chrome for Testing" as
    such. That path is a wrapper that runs `/opt/pw-browsers/chromium` (Chrome for Testing
    153.0.8010.12, Playwright revision 1243). The environment sets
    `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` [C].
    Pin `@playwright/test` to **1.63.0** so the bundled revision matches.
14. **Res: blind-spot geometry "[U]".** The jsPsych virtual-chinrest procedure is: cover the
    **right** eye, fixate a square with the **left** eye, a dot moves **leftwards** from the
    square, press Space when it vanishes. Then `D = d / tan(13.5°)`. This matches A and R.
15. **A: "Thaler et al. (2013) ABC target".** This is background knowledge and not in the
    research [I]. It is kept as a design choice, not as evidence.

---

## 3. Engines

### 3.1 Ranked engines, packages, models, licences

| Rank | Id | Runtime package (exact pin) | Model file (committed path, source, sha256, bytes) | Licence | Role |
|---|---|---|---|---|---|
| — | `combined` | own TS | — | own (MIT) | Default via Auto when CV-better (§4.9) |
| 1 | `blazegaze` | `@tensorflow/tfjs-core`, `-layers`, `-backend-webgl`, `-backend-wasm`, `-backend-cpu` **4.22.0**; `ml-matrix` **6.12.1** (for the vendored WebEyeTrack geometry) | `public/models/blazegaze-75fbd2f/model.json` (44,988 B, `a214f074ccd4724cf4ebf008814a05485e7eaa5faf5aaeb85e66b24a1af55688`) and `group1-shard1of1.bin` (624,072 B, `c030a762a2d21ac0f3c59700a723b2d8790f2003b3f8e72fbe31129fcb234e58`). Source `https://raw.githubusercontent.com/RedForestAI/WebEyeTrack/75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c/js/examples/demo-app/public/web/` | MIT, code and weights, © 2025 Davalos, Zhang, Goodwin, Biswas. Weights trained on research datasets [I]. | Default appearance engine. Head-pose-aware family [LIT §3]; drift 7.24→8.72 cm against WebGazer's 7.79→11.62 cm [IMPL §1.6]; no independent validation |
| 2 | `peekr` | `onnxruntime-web` **1.30.0**, `/wasm` import, 1 thread | `public/models/peekr-1.0.7/peekr.onnx` (579,176 B, `9abc6c98ee02ee518da98777d1cd879ff9bbaf71491ed2c803a608e9740ce7fb`). Source `https://registry.npmjs.org/peekr/-/peekr-1.0.7.tgz` → `package/dist/model/peekr.onnx`. Opset 11; inputs `input1` and `input2` [1,3,128,128], `kps` [1,8]; output `output` [1,2] [C] | MIT © 2025 AryamanTaore | Cheap learned engine, about 7 ms on single-thread WASM [IMPL §5.2]. Author reports 1.75°×2.52°, not peer-reviewed |
| 3 | `geometric` | own TS | — | own (MIT; port of gaze-lite) | Always available; fallback; supplies the engine-neutral gating and pruning signals |
| 4 | `eyepixel` | own TS | — | own (MIT; WebGazer *method*, no GPL code) | Literature baseline, 3.3–13.6° in the literature [LIT §2]. Labelled "WebGazer method (re-implementation)", never "WebGazer" |

**The shared front end runs for every engine.**

| Item | Value |
|---|---|
| Package | `@mediapipe/tasks-vision` **0.10.35** (Apache-2.0) |
| Model | `public/models/face-landmarker-f16-v1/face_landmarker.task` (3,758,596 B, `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`). Copy it from `/home/user/gaze-lite/public/models/face_landmarker.task`. |
| Model source | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` |
| Model licence | Apache-2.0 |

**Other dependencies (exact pins).**

| Package | Version | Licence | Use |
|---|---|---|---|
| `fflate` | 0.8.2 | MIT | Zip export |
| `vite` | 8.3.4 | MIT | Dev |
| `typescript` | 6.0.3 | Apache-2.0 | Dev |
| `@playwright/test` | 1.63.0 | Apache-2.0 | Dev |
| `@types/node` | 22.20.4 | MIT | Dev |

Every version is at least two weeks old, apart from npm `latest` lines that are deliberately
not used.

### 3.2 Excluded and deferred

| Option | Decision and reason |
|---|---|
| OpenFace 3.0 | Excluded: the licence forbids distribution [RO §1] |
| UniGaze | Excluded: non-commercial licence, ≥ 346 MB |
| ETH-XGaze baseline | Excluded: CC BY-NC-SA; weights on Google Drive only |
| WebGazer itself | Excluded from v1: GPL, unmaintained since 2026-02-24, needs a second face pipeline. The clean-room `eyepixel` replaces it |
| RealEye Light | Excluded: AGPL |
| EyeGesturesLite | Excluded: logo clause |
| SeeSo | Excluded: commercial key |
| Cloud trackers | Excluded: privacy |
| saccade.js 0.5.0 | Phase 2: WebGPU only; 20.6 MB; ≈240 ms per frame on WASM; no published accuracy |
| MobileGaze MobileOne-S0 | Phase 2: 11–13° on Gaze360; 80–155 ms on WASM |
| BlazeGaze head adaptation (Adam) | Phase 2 |
| Peekr 1,040-d embedding (needs an ONNX graph edit exposing `/Concat_output_0` [C]) | Phase 2 |

---

## 4. Shared pipeline and mathematics

All numeric parameters live in **`src/core/constants.ts`** (WP1), so tuning never touches logic.
The values below are the defaults.

### 4.1 Capture and timing (`src/platform/camera.ts`, `frameClock.ts`)

**Camera request.**

- `getUserMedia({audio:false, video:{facingMode:'user', width:{ideal:W}, height:{ideal:H}, frameRate:{ideal:30, max:30}}})`.
- Ladder: 1280×720, then 960×540, then 640×480, then `{video:true}`.
- Record `track.getSettings()` (width, height, frameRate), the device label and a sha256 of the
  `deviceId` (first 12 hex characters).

**Error messages.**

| Error | Behaviour |
|---|---|
| `NotAllowedError` | "Camera permission denied" |
| `NotFoundError` | "No camera found" |
| `NotReadableError` | "Camera in use by another application" |
| `OverconstrainedError` | Try the next rung; never shown as "no camera" (fixes [GL]) |

A camera picker appears once permission has been granted.

**Video elements.**

- The **source** `<video>` is muted and `playsinline`. It sits fixed at 2×2 CSS px with opacity
  0.01, untransformed. It is never `display:none`, because a hidden video stops frame delivery
  [IMPL §7].
- The **preview** is a second `<video>` on the same `MediaStream`, mirrored with CSS
  `scaleX(-1)`. The frame clock never uses it, because transformed or occluded video throttles
  `requestVideoFrameCallback` [GL `351cb1d`].

**Frame clock.**

- `requestVideoFrameCallback` on the source video drives it.
- `tCaptureMs` is `metadata.captureTime`, else `metadata.expectedDisplayTime`, else the callback
  `now`. The clock source is recorded on every frame.
- A frame is new only if `presentedFrames` increased. `cameraGap = Δ presentedFrames − 1`.
- If no callback arrives for **500 ms** while the video is playing, fall back to rAF polling.
  New frames are then detected by `getVideoPlaybackQuality().totalVideoFrames`, or else by a
  change in `currentTime`, with `clock='poll'`.

**Transfer and back-pressure.**

- In the callback: `createImageBitmap(video)`, then `host.submit(bitmap, meta)`, which
  transfers the bitmap.
- At most **one frame in flight**. `submit` returns `false` when the host is busy; the bitmap
  is then closed and the frame counted as `dropped`.
- All engines always process the *same* submitted frames.

**Clocks.**

- Every timestamp is in the **main-thread** `performance.now()` domain. Workers never stamp
  frames, because their time origin differs.
- `performance.timeOrigin` and `Date.now()` are stored at session start.

**Pause conditions.** Each of these pauses the active phase and logs a gap:

- `visibilitychange` to hidden;
- leaving fullscreen;
- a `resize` or `visualViewport` resize;
- a change in `devicePixelRatio`.

### 4.2 Threading and the vision host (`src/vision/`)

**Vision worker** (`vision.worker.ts`, a module worker) holds:

- MediaPipe;
- frame-image preparation;
- all engine feature extraction and inference.

**Fit worker** (`fit.worker.ts`) holds the pure `core/` fitting.

**Main thread** holds:

- UI and stimulus;
- labelling;
- mapping prediction (cheap);
- filtering, export and persistence.

**`VisionHost` has two implementations with the same API.**

- `WorkerHost` (default) loads MediaPipe with
  `{wasmLoaderPath: vendor/mediapipe-0.10.35/vision_wasm_module_internal.js, wasmBinaryPath: …/vision_wasm_module_internal.wasm(.gz)}`.
- `InlineHost` runs the same `visionCore.ts` on the main thread.
  - It uses `vision_wasm_internal.*` when `FilesetResolver.isSimdSupported()` is true, else
    `vision_wasm_nosimd_internal.*`.
  - The module pair has no no-SIMD variant [C].

**Host selection.**

- `?host=worker|inline` overrides the choice.
- Otherwise try `WorkerHost`. If it raises an error, or fails to deliver `ready` within
  **20 s**, dispose it and start `InlineHost`.
- Record `hostKind` and the reason.

**Delegate.** GPU first, retried on CPU if creation or the first detection throws (gaze-lite
pattern). CPU is the default on iOS.

**`.gz` handling.**

- Production builds request `.wasm.gz` (`import.meta.env.DEV` uses the plain file).
- If MediaPipe, TF.js-WASM or ORT initialisation fails while using a `.gz` URL, retry once with
  the plain `.wasm`, and log it.

### 4.3 Face front end (`src/vision/landmarker.ts`, `src/core/face/*`)

**FaceLandmarker options.**

| Option | Value |
|---|---|
| `runningMode` | `VIDEO` |
| `numFaces` | 1 |
| `minFaceDetectionConfidence` | 0.5 |
| `minFacePresenceConfidence` | 0.35 |
| `minTrackingConfidence` | 0.3 |
| `outputFaceBlendshapes` | true |
| `outputFacialTransformationMatrixes` | true |

- The model is loaded via `modelAssetBuffer`, from a fetch with progress.
- Timestamps passed to `detectForVideo` are forced strictly increasing.
- After a graph error the landmarker is rebuilt [GL].
- **Landmark `visibility` is never used**; it is probably always 0 [PG].

**Landmark sets** (`core/face/landmarkSets.ts`). Anatomical names: "R" is the subject's right
eye, which appears on the image left of an unmirrored frame.

| Set | Indices |
|---|---|
| R eye | outer 33, inner 133, top 159, bottom 145; iris centre 468; iris ring: 469 (image-right), 470 (top), 471 (image-left), 472 (bottom) |
| L eye | outer 263, inner 362, top 386, bottom 374; iris centre 473; ring: 474 (right), 475 (top), 476 (left), 477 (bottom) |
| EAR6 (Soukupová–Čech) | R `[133,158,160,33,144,153]`, L `[362,385,387,263,373,380]` (WebEyeTrack order [C]); EAR = (‖p2−p6‖+‖p3−p5‖)/(2‖p1−p4‖) |
| Contours (eye-pixel boxes) | gaze-lite `RIGHT_EYE` and `LEFT_EYE` 16-point arrays |
| Mirror pairs (Peekr) | 130↔359, 27↔257, 243↔463, 23↔253, verified on the canonical model (x→−x) [C] |

**Head pose** (`core/face/headPose.ts`). Port gaze-lite's `headPoseFromMatrix` unchanged; its
maths was checked [GL].

- It detects packing, divides out uniform scale, and returns R (row-major 3×3).
- yaw = atan2(R02, R22); pitch = atan2(−R12, √(R02²+R22²)); roll = atan2(R10, R11).
- `t` comes from the matrix, in relative canonical cm, because MediaPipe fixes the vertical
  field of view at 63° [GL].
- `t` is logged only, never used metrically.

**Eye measures.**

- `openQ = clamp((EAR4 − 0.1)/0.2, 0, 1)`, using gaze-lite's 4-point EAR.
- `irisDiamPx`: the mean of ‖469−471‖ and ‖474−476‖, in video px.
- `eyeMidNorm`: the mean of 468 and 473.
- `interOcularPx`: ‖33−263‖ in video px.

**"Eyes open" rule** (gaze-lite, proven):

- `blinkL < 0.5 && blinkR < 0.5 && openQL > 0.2 && openQR > 0.2`;
- also mask **one frame either side** of a closed frame.

**Face quality**, computed in the worker on the region of interest (ROI):

- `faceWidthFrac`: landmark bounding-box width divided by the video width.
- `lumaMean` and `lumaSd` of BT.601 Y inside the face box.
- `backlight` = face luma / frame luma. Frame luma comes from a 32×18 downscale.
- `glare` = the fraction of pixels with Y ≥ 245 inside the two eye boxes.
- `centring` = face-box centre − (0.5, 0.5).

### 4.4 Screen scale and viewing distance (`src/core/geometry/*`)

**Screen scale** (Li et al. 2020 virtual chinrest [LIT §6.5]).

- The user resizes an outline to an ID-1 card, **85.60 × 53.98 mm**:
  `pxPerMm = cardWidthCssPx / 85.60`.
- Alternative: enter the diagonal in inches: `pxPerMm = √(screenW² + screenH²) / (inches·25.4)`,
  using `screen.width` and `screen.height` in CSS px.
- "Skip" means an assumed 96 CSS px per inch (`pxPerMm = 3.7795`), with
  `degreesApproximate = true`.
- The result is stored per `screen W×H@dpr`.

**Blind spot.** Recommended; it can be skipped.

1. Cover the **right** eye and fixate a black square at x = 0.85·W, y = 0.5·H with the
   **left** eye.
2. A red dot starts at the square and moves **left** at 1.5°/s. Until the distance is known,
   that is 0.25·pxPerMm·10 px/s.
3. Press Space when it disappears.
4. Run 5 trials. With d the median square-to-dot distance in mm, **D_bs = d / tan(13.5°)**.
5. Accept only if 300 ≤ D_bs ≤ 1200 mm and SD ≤ 15 % of the median; otherwise repeat once.
   The reported error is about 3.25 cm [LIT §6.5, secondary source].

**Focal length.**

- After the blind-spot test, take 2 s with both eyes open and `p̄` = the median `irisDiamPx`.
  Then **f_px = D_bs · p̄ / 11.7**.
- Without the blind-spot test, f_px = (videoW/2) / tan(30°), assuming a 60° horizontal field of
  view, with `focalSource='assumed-fov'` and `degreesApproximate = true`.

**Per-frame distance.**

- **D_t = f_px · 11.7 / median₁ₛ(irisDiamPx)**: a running median over the last 1000 ms of
  frames with eyes open. The iris is 11.7 ± 0.5 mm, with under 10 % error [LIT §6.5].
- **D_ref** = the median of D_t over accepted calibration frames.
- `lnDistRatio_t = ln(D_t / D_ref)`.

### 4.5 Coordinate systems and degree conversion (`src/core/geometry/angles.ts`)

**Screen coordinates.**

- CSS px of the **fullscreen viewport**, origin top-left, y down. Width W and height H come
  from `innerWidth` and `innerHeight` while fullscreen.
- `screen.*`, `devicePixelRatio`, `screenX` and `screenY` are recorded.
- The camera is assumed to sit above the screen centre (instructions only).

**Conversions.** The eye is taken to lie on the screen-centre normal at distance D (the
eek-a-gaze convention [RO §4]).

```
dx_mm = (x − W/2)/pxPerMm,   dy_mm = (y − H/2)/pxPerMm
θx = atan2(dx_mm, D),  θy = atan2(dy_mm, D)                    [degrees, y down internally]
inverse: x = W/2 + D·tan θx·pxPerMm,  y = H/2 + D·tan θy·pxPerMm
```

**Exact angular separation** between two gaze directions:

```
u(θ) = (tan θx, tan θy, 1);   ang(a, b) = atan2(‖u_a × u_b‖, u_a · u_b)
```

D and pxPerMm cancel, so errors computed in degree space are exact. The pixels-per-degree
approximation at the screen centre would overstate errors near the edges by about 20 % [RO §4].

**Export.** `gaze_x_deg = θx` and `gaze_y_deg = −θy`, so positive is up, as in eek-a-gaze. One
tested function, `toExportDeg`, performs this.

### 4.6 Engine features and normalisation

**Rule.** A learned model's training-time preprocessing is never altered. Leftover pose and
distance effects go to the personal mapper as covariates.

**One `FrameImage` per frame** in the worker.

- `roi`: an `ImageData` of the landmark bounding box, enlarged by 25 % on each side and clipped
  to the frame. It is drawn with
  `drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)` onto an `OffscreenCanvas` with
  `willReadFrequently:true`.
- `crop(...)`: `drawImage` onto a reusable 128×128 `OffscreenCanvas`, followed by
  `getImageData`. Used by Peekr to match its browser resampling.
- Pixels outside the frame read as 0, including alpha, as in upstream.

#### 4.6.1 `geometric` (featureVersion `geo-4`)

**In-plane offsets.** Port gaze-lite's `eyeInHeadGaze` (inversion of weak perspective), with:

- aspect correction `a = videoW/videoH`;
- corner order along the head's +x̂: R 33→133, L 362→263.

For one eye:

```
f, t = corner points (x·a, y);  d = iris − (f+t)/2;  widthImg = ‖t − f‖
e1 = (R00, −R10),  e2 = (R01, −R11),  e3 = (R02, −R12),  E = [e1 e2]   (det ≥ 0.2, else planar fallback)
(a, b) = E⁻¹ d;   w = widthImg / max(‖e1‖, 0.2);   g = (a/w, b/w)
```

**Depth correction.** With the iris a depth c in front of the corner plane,
`d = a e1 + b e2 + c e3`. So `g_true = g − (c/w)·E⁻¹e3`, and **dc = E⁻¹e3** (2 values, pose-only)
is a feature whose coefficient the ridge learns per person.

**Feature vector `geo-linear`** (24 columns):

| # | Feature | Floor |
|---|---|---|
| 0–3 | gxL, gyL, gxR, gyR | 0.02 |
| 4–5 | dc = E⁻¹e3 | 0.03 |
| 6–9 | blendshape gaze per eye, signed as gaze-lite: L x = eyeLookOutLeft − eyeLookInLeft, L y = eyeLookDownLeft − eyeLookUpLeft, R x = eyeLookInRight − eyeLookOutRight, R y = eyeLookDownRight − eyeLookUpRight | 0.03 |
| 10–11 | openQL, openQR (lid aperture follows vertical gaze) | 0.02 |
| 12–14 | yaw, pitch, roll (rad) | 0.052 (3°) |
| 15–16 | eyeMidNorm − 0.5 | 0.01 |
| 17 | lnDistRatio | 0.03 |
| 18–19 | gaze-ray ∩ camera plane: gaze-lite `gazeRayIntersection` with canonical constants: eye centre (0, 2.62, 3.47) cm, gain 2.66/1.2 = 2.22 [GL defect 9] | 0.5 |
| 20–23 | ḡx·yaw, ḡy·pitch, ḡx·lnDistRatio, ḡy·lnDistRatio, where ḡ is the mean of both eyes | 0.002 |

**`geo-quadratic`** adds ḡx², ḡy² and ḡx·ḡy (floor 0.002), giving 27 columns.

**Primary columns** (for `extrapolated` and outlier pruning): 0–3.

**Engine-neutral gating and pruning signals** come from this engine.

#### 4.6.2 `blazegaze` (featureVersion `bg-75fbd2f-1`)

**Vendored files.** Vendor `js/src/utils/mathUtils.ts` and `safeSVD.ts` from upstream
`75fbd2f` into `src/engines/blazegaze/vendor/`, keeping the MIT header.

- **Remove only** `applyAffineMatrix` and its `@tensorflow/tfjs` import.
- `UPSTREAM.md` lists every change.
- The upstream `obtainEyePatch` stays in the vendor copy as the **parity reference**.

**Inputs** (per frame, faithful to `WebEyeTrack.prepareInput` [C]):

```
L2 = landmarks mapped to (floor(x·W), floor(y·H))
srcPts = [103,150,379,332] padded radially about landmark 4: p + (p − p4)⊙(0.4, 0.2)
H  = computeHomography(srcPts → [(0,0),(0,512),(512,512),(512,0)])
top = round((H·L2[151]).y);  h = round((H·L2[195]).y − (H·L2[151]).y)
Hr = computeHomography([(0,0),(0,h),(512,h),(512,0)] → [(0,0),(0,128),(512,128),(512,0)])
```

**Composite eye strip (512×128 RGB).** Use the vendored `computeHomography` and the `ml-matrix`
`inverse`, so the floating-point arithmetic matches upstream exactly.

```
for each (u,v): (cx,cy) = Hr⁻¹(u,v); i = floor(cx); j = floor(cy); if outside [0,512)×[0,h) → 0
                y' = j + top; if outside [0,512) → 0
                (sx,sy) = H⁻¹(i, y'); px = (floor(sx), floor(sy)); if outside the frame → 0 else frame[px]
```

This reproduces upstream's warp → crop → resize with `floor` sampling, without the
512×512 intermediate. Read frame pixels from `roi` at the offset (`roiX`, `roiY`).

**Other inputs.**

- `faceWidthCm`: upstream `estimateFaceWidth`, taken as the **median over the first 30
  open-eye frames** of a session and then frozen. Upstream uses the very first frame; the
  change is documented in `UPSTREAM.md`.
- `fo = computeFaceOrigin3D(faceReconstruction(...))`, with `initialZGuess` = the previous
  frame's z, or 60.
- `hv = getHeadVector(translateMatrix(matrix))`.

**Inference.**

- `model = tf.loadLayersModel(url, {onProgress})`.
- `enc = model.getLayer('cnn_encoder')` and `head = model.getLayer('gaze_mlp')`. Both are
  LayersModels; call `enc.predict` and `head.predict` directly.
- `emb = enc.predict(strip/255)` → 512.
- `prior = head.predict([emb, hv, fo])` → 2: centre-origin screen units in about [−0.5, 0.5]
  [PG].
- Upstream's Kalman filter, clipping, click listener and EAR skip are **not** used.

**Output.** `EngineFrame.x = Float32Array(518) [emb, hv, fo]`; `prior = (px, py)`.

**Backend.** `tfjs-webgl` (OffscreenCanvas in the worker), then `tfjs-wasm` (SIMD file), then
`tfjs-cpu`. CPU is allowed only with `?force=cpu` or in Node tests; it took about 900 ms per
frame [IMPL].

#### 4.6.3 `peekr` (featureVersion `pk-1.0.7-1`)

This is an exact reproduction of the bundle [C].

**Mirrored landmarks.** For a tasks-vision landmark L: `m(L) = (1 − L.x, L.y)`.

| Box | Order p0, p1, p2, p3 (tasks-vision indices) |
|---|---|
| `input1` | m(359), m(257), m(463), m(253) |
| `input2` | m(243), m(27), m(130), m(23) |

**Box `B`** (Peekr's own function; normalised, then pixels):

```
cx = (p0.x+p2.x)/2; cy = (p1.y+p3.y)/2; w = p2.x − p0.x; h = p3.y − p1.y
box = ((cx − w/2)·W, (cy − h/2)·H, w·W, h·H) = (bx, by, bw, bh)       // mirrored-frame pixels
kps += (bx/W, by/H, bw/W, bh/H)                                       // input1 first, then input2
crop = image.crop(max(0, W − bx − bw), max(0, by), max(0, bw), max(0, bh), 128, 128)   // UNMIRRORED pixels
tensor[1,3,128,128]: channel 0 = B/255, 1 = G/255, 2 = R/255 (no mean/std)
```

**Session.**

```
ort.InferenceSession.create(bytes, {executionProviders:['wasm'], graphOptimizationLevel:'all'})
ort.env.wasm.numThreads = crossOriginIsolated ? min(4, cores) : 1
ort.env.wasm.wasmPaths = {wasm: wasmUrl(.gz), mjs: mjsUrl}       // Vite ?url imports
```

**Output.** `EngineFrame.x = Float32Array(8) kps`; `prior = output (x, y)`, roughly a [0,1]
screen point.

**Validity.** `status='crop-invalid'` if bw or bh is under 4 px, or the box lies outside the
frame.

#### 4.6.4 `eyepixel` (featureVersion `ep-1`)

- **Per eye:** the bounding box of the 16 contour landmarks in video px, padded 10 %
  horizontally and 30 % vertically on each side.
- Resize to **10×6** by area averaging over `roi`, using BT.601 Y.
- **Histogram-equalise the 60 values**, as in WebGazer:
  `out = round(255·cdf(v)/60)/255`, with `cdf` the cumulative count of a 256-bin histogram.
- `x = Float32Array(120)` [L 60, R 60]; `prior = null`. No pose inputs, faithful to WebGazer.

### 4.7 Calibration protocol (`src/core/protocol/*`, `src/app/screens/calibrate.ts`)

**Presentation.**

- Fullscreen (`requestFullscreen`), mid-grey background `#808080`, one full-viewport canvas,
  drawing in rAF.
- `onsetMs` is the rAF timestamp of the first frame that shows the item.
  `frameIntervalMs` is the median rAF interval.
- Exiting fullscreen, a resize or a DPR change **aborts the current block and invalidates the
  fit**.
- On iOS there is no element fullscreen. A viewport mode with the same invalidation is used,
  and the app warns.

**Target.**

- An "ABC" bullseye-plus-cross: a black disc of diameter 0.6°, a background-coloured cross 0.12°
  thick, a black centre dot of 0.2°. Use `max(computed px, 14 px)`; 24 px if the geometry is
  unknown.
- A ring shrinks from 3° to 0.6° over the first 400 ms of the settle period.
- Static under `prefers-reduced-motion`.
- Keys: Space continues, P pauses, Esc aborts.

**Layouts** (normalised viewport fractions).

| Name | Points |
|---|---|
| `CAL13` | {0.08, 0.5, 0.92}² ∪ {0.29, 0.71}² (13). Group id `loc-<k>` |
| `CAL9` | {0.08, 0.5, 0.92}² |
| `HEAD5` | (0.5,0.5), (0.29,0.29), (0.71,0.29), (0.29,0.71), (0.71,0.71), sharing the `CAL13` group ids |
| `VAL12` | x ∈ {0.15, 0.38, 0.62, 0.85} × y ∈ {0.15, 0.5, 0.85}, each jittered ±0.02 (seeded). Central = the two (0.38/0.62, 0.5) targets; the rest are peripheral. Group `val-<k>` |
| `VAL6` | (0.15,0.15), (0.85,0.15), (0.38,0.5), (0.62,0.5), (0.15,0.85), (0.85,0.85) |
| `RECAL5` | centre ∪ {0.29, 0.71}² |

**Order.** Seeded shuffle within each block: `mulberry32(seed)` then Fisher–Yates. The default
seed is `(Date.now() >>> 0)`; `?seed=` overrides it. The seed is stored and exported.

**Presets.**

| Preset | Blocks | Approx. time |
|---|---|---|
| `quick` | A: `CAL9`; validation `VAL6` | ≈ 35 s |
| **`standard`** (default) | A: `CAL13` → B: pursuit → C: head motion at `HEAD5`; validation `VAL12` | ≈ 100 s |
| `thorough` | standard, then A′: `CAL13` again after "lean about 10 cm closer" (same group ids, which adds distance variation); validation `VAL12`; an optional second validation after Live | ≈ 3 min |

**Fixation item.**

- Settle **600 ms** (excluded), then sample **1000 ms**.
- If fewer than 12 frames were accepted, extend sampling up to 2500 ms.
- If it still has fewer than 12 accepted frames, or its acceptance rate is below 50 %, retry
  it **once** at the end of its block, with the ring re-grown [GL defect 10].
- In `?e2e=1&speed=N`: all durations are divided by N, and the minimum becomes
  `max(3, ceil(12/N))`.

**Pursuit (block B).**

- After a 1000 ms hold at the start point, the target follows
  `x = 0.5 + 0.42·sin(2π·2t/T)` and `y = 0.5 + 0.42·sin(2π·3t/T + π/2)`, with **T = 16 s**:
  one full 2:3 period.
- If the geometry predicts a peak angular speed above 15°/s, T is lengthened proportionally.
- The first 500 ms after motion starts are discarded.
- Each frame is labelled with the target position at **t − τ**, where τ is the pursuit lag
  (§4.8.6).

**Head motion (block C).** At each `HEAD5` location:

- 600 ms settle;
- then 2000 ms of "keep looking at the dot and slowly turn your head left and right", aiming
  for about ±10° yaw;
- then 2000 ms of "…nod slowly up and down", aiming for about ±7° pitch.

A pose-guide ring shows the current yaw and pitch against four sectors. The location extends up
to 6000 ms until at least 3 of the 4 sectors are reached.

**Frame acceptance** (one decision per frame, **shared by all engines**). A frame is accepted
only if all of these hold:

- a face is present;
- the eyes are open (with ±1-frame blink masks);
- for fixation: |yaw| ≤ 25° and |pitch| ≤ 20°, head angular speed ≤ 60°/s (finite difference
  over the frames of the last 100 ms);
- for head motion: |yaw| ≤ 32° and |pitch| ≤ 25°;
- `interOcularPx` ≥ 60;
- fullscreen and visible;
- not dropped, not inside a settle window.

An engine whose extraction returns a status other than `ok` loses that frame for itself only;
its *coverage* is reported. Rejection codes are recorded per frame.

**Labels.** `FrameLabel` is assigned on the main thread when a `FrameResult` arrives, by
comparing `tCaptureMs` with the presentation intervals.

**Weights.**

| Rows | Total weight |
|---|---|
| Each fixation location (A and A′ together) | 1.0 |
| Pursuit block | 4.0 |
| Each head location | 0.8 |
| Recalibration rows | ×2 |

Each total is spread equally over that unit's accepted rows. The weights are stored.

**Cross-validation groups (spatial blocking).**

- `group = loc-<k>` of the calibration location.
- Pursuit frames take the group of the **nearest** `CAL13` location to their (lagged) target.
- Head frames take their location's group.
- Holding out a group removes every frame labelled with that location, which fixes [GL]'s
  leakage defect.

### 4.8 Personal mapping mathematics (`src/core/maths/*`, `src/core/calibration/*`)

#### 4.8.1 Engine-neutral pruning, before any engine is fitted

- **Fixation rows.** Within each location, for the geometric primary columns 0–3:
  `z = (x − median)/(1.4826·MAD)`. Drop the row if any |z| > 2.5.
- **Head rows.**
  1. Fit a provisional `geo-linear` on the pruned fixation rows (λ_rel = 1e-2).
  2. Compute residual magnitudes ρ for the head rows.
  3. Drop rows with ρ > median_loc + 3·1.4826·MAD_loc.
- **Pursuit rows.** The same rule as head rows, after the lag has been chosen.
- Pruned rows get `reject='outlier'` for every engine.

#### 4.8.2 Standardisation and floors

Weights are normalised so that Σw = n. Then:

```
μ_j = Σ w_i x_ij / Σ w_i;   σ_j = √(Σ w_i (x_ij − μ_j)² / Σ w_i);   s_j = max(σ_j, floor_j);   z_ij = (x_ij − μ_j)/s_j
```

- **Floors** are physical and listed per mapper (§4.6, §4.8.4). They replace gaze-lite's
  absolute 1e-2 floor [GL defect 4].
- **Embedding blocks** (BlazeGaze `emb`):
  1. centre;
  2. project onto the **top-64 principal components** by seeded randomised SVD (Halko): 10
     extra dimensions, 2 power iterations, Gaussian sketch from `mulberry32(seed)`;
  3. divide *all* scores by one common scale √λ₁.

  Relative variances are kept, so ridge still shrinks low-variance directions more. These
  columns get no per-column standardisation.
- **Prediction-time clipping.** `z_j ← clamp(z_j, zmin_j − 0.5·r_j, zmax_j + 0.5·r_j)`, where
  `r_j = zmax_j − zmin_j` over accepted calibration rows. If any *primary* column was clipped,
  set `EXTRAPOLATED`.
- **There is no output clamp to [0, 1]**; the clamp hid failures [GL].

#### 4.8.3 Weighted ridge and exact grouped leave-one-out

**Design and fit.**

```
Z̃ = [1, Z] (n × (p+1));  Λ = diag(0, λ, …, λ);  λ = λ_rel · Σw
B = (Z̃ᵀ W Z̃ + Λ)⁻¹ Z̃ᵀ W Y        (Y = n×2 target angles in degrees; Cholesky)
λ_rel ∈ {1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 0.1, 0.3, 1, 3}
```

**Exact leave-group-out.** For each group g, with A = (Z̃ᵀWZ̃ + Λ)⁻¹ and r_g = Y_g − Z̃_g B:

```
H_gg = Z̃_g A Z̃_gᵀ W_g      (n_g × n_g)
e_g  = (I − H_gg)⁻¹ r_g      = residual of the fit that excludes g
OOF_g = Y_g − e_g
```

This equals refitting without g. The unit test checks it against brute-force refits to 1e-9.
Standardisation statistics and PCA are held fixed from the full data; this leaks no labels.

**CV score.**

- Per frame: err_i = ang(OOF_i, Y_i) (§4.5).
- Per group: `m_g = median_i err_i`.
- **meanDeg = mean_g m_g** and **seDeg = sd_g(m_g)/√G**, over groups that contain fixation
  rows.

**Robust refit.**

1. Select λ\* on the base weights.
2. Two Huber IRLS passes at λ\*: ρ_i = ‖r_i‖, s = 1.4826·median(ρ),
   `w_i ← w_i·min(1, 1.345·s/ρ_i)`.
3. Hard rejection: rows with a within-group robust z of ρ above 3.5 get w_i = 0.
4. Re-select λ on the robust weights (LOO with those weights held fixed; slightly optimistic,
   documented).
5. Final fit.

**Leverage.** `h = z̃ᵀ A z̃`. h95 is the 95th percentile over calibration rows. Both are stored
for the confidence measure.

#### 4.8.4 Mapper candidates (`src/engines/<id>/mappers.ts`, pure)

| Engine | Mapper | Design columns (raw) | Floors | Complexity |
|---|---|---|---|---|
| geometric | `geo-linear` | the 24 of §4.6.1 | §4.6.1 | 2 |
| geometric | `geo-quadratic` | 27 | §4.6.1 | 4 |
| blazegaze | `prior-affine` | prior (2); λ_rel grid {1e-6}, which reproduces upstream's affine correction | 0.01 | 1 |
| blazegaze | `prior-ridge-pose` | prior (2), prior², prior x·y (3), hv (3), fo (3), lnDistRatio (1) = 12 | 0.01, 0.001, 0.02, 0.5, 0.03 | 3 |
| blazegaze | `emb-ridge` | PCA64(emb) (64), hv (3), fo (3) = 70 | PCA rule; 0.02, 0.5 | 5 |
| peekr | `prior-affine` | prior (2); {1e-6} (the author's per-axis linear protocol, generalised) | 0.005 | 1 |
| peekr | `prior-ridge-pose` | prior (2), prior², x·y (3), kps (8), yaw, pitch, roll (3), lnDistRatio (1) = 17 | 0.005, 0.0005, 0.002, 0.052, 0.03 | 3 |
| eyepixel | `pix-ridge` | 120 equalised pixels | 2/255 | 5 |
| eyepixel | `pix-webgazer` | 120 pixels ×255, *unstandardised*; absolute λ = 1e-5; unpenalised intercept. Faithful to WebGazer, reported for comparison | — | 5 |

**Choice within an engine.** Take the lowest `meanDeg`. If a lower-complexity candidate is
within 1 SE of it, choose that one (one-standard-error rule). All candidate scores are stored
and shown.

**Budget.** All engines should fit in ≤ 15 s in the fit worker on a 4-core laptop; this is
unmeasured. If it is exceeded, drop the `emb-ridge` candidate first and log it.

#### 4.8.5 Out-of-fold predictions

Each engine's chosen candidate yields `oofDeg`, aligned to its training rows. These feed
stacking and the CV report.

#### 4.8.6 Pursuit lag τ (`core/protocol/lag.ts`)

1. Using the provisional fixation-only `geo-linear` (§4.8.1), predict the pursuit frames.
2. For τ ∈ {0, 33, …, 300} ms, compute the weighted median angular error against the target
   path at t − τ.
3. Take the minimising τ, clamped to [50, 250] ms.
4. If fewer than 50 % of pursuit frames were accepted, use **τ = 100 ms** [LIT §5.2].

τ is shared by all engines and exported.

### 4.9 Combined estimator and selection (`core/calibration/stack.ts`, `select.ts`)

**Members.** Engines with coverage ≥ 0.8 of accepted rows and a finite CV.

**Stacking.** On rows valid for all members, per axis a:

```
minimise Σ_i w_i (y_ia − Σ_e β_ae ŷ_eia)²   s.t. β_a ≥ 0, Σ_e β_ae = 1
```

With K ≤ 4 members, solve exactly by enumerating the 2^K − 1 supports: equality-constrained
least squares via KKT, keeping the feasible minimum.

**Nested CV.** For each group g, fit β on the OOF rows not in g and predict g. The result is
`combined.oof`, then `combined.cv` as in §4.8.3.

**At prediction time,** renormalise β over the members whose frame is `ok`. If none is, the
frame is invalid with `ENGINE_ERROR`.

**Selection (Auto)**, recorded with a human-readable reason:

1. `best` = the single engine with the lowest `meanDeg`. Among singles within 1 SE of it,
   prefer the better a-priori rank (blazegaze 1, peekr 2, geometric 3, eyepixel 4).
2. Choose **Combined** iff `combined.meanDeg ≤ 0.95 × best.meanDeg`.
3. **Validation is never used for selection.** The results screen states that switching to the
   engine that validates best is optimistic.

### 4.10 Prediction-time handling (`core/calibration/estimator.ts`)

**Per frame, per estimator.**

1. Build the `RowContext`: yaw, pitch and roll in radians; `eyeMidNorm`; `lnDistRatio`.
2. Predict θ (in degrees) from the mapper, or from the Combined weighting.
3. Add the drift offset (§4.13) to get the corrected θ.
4. Compute px with D_t (§4.5).

**Flags** (bitmask):

| Flag | Value |
|---|---|
| `NO_FACE` | 1 |
| `BLINK` | 2 |
| `OUT_OF_RANGE` | 4 |
| `EXTRAPOLATED` | 8 |
| `OFFSCREEN` | 16 |
| `DROPPED` | 32 |
| `ENGINE_ERROR` | 64 |
| `NOT_FULLSCREEN` | 128 |
| `HIDDEN` | 256 |

`INVALID_MASK = 1|2|4|32|64|128|256`.

**`OFFSCREEN`** is set when the prediction lies more than 10 % of W (or of H) outside the
viewport. It is flagged, not removed.

**Head range** (a "virtual chinrest" pause [LIT §5.4]), from accepted calibration frames:

| Quantity | Range |
|---|---|
| yaw and pitch | [P2.5 − 4°, P97.5 + 4°] |
| lnDistRatio | [P2.5 − 0.10, P97.5 + 0.10] |
| eyeMidNorm x and y | [P2.5 − 0.05, P97.5 + 0.05] |

Outside the range, the frame gets `OUT_OF_RANGE`. In Live the dot greys out and the user is
asked to "Move back to where you were during calibration". The data is flagged, not deleted.

**Confidence** (advisory; the flags are the hard gate):

```
confidence = exp(−½(h/h95)²) · agreement
agreement  = exp(−½(spread/2°)²)
```

`spread` is the RMS distance of member predictions from the Combined prediction, when there are
two or more members; otherwise agreement = 1.

### 4.11 Filtering and blinks (`core/filters/*`)

- **Raw output is always stored and exported.** Filtering is for display and the Live stream
  only.
- **One Euro filter (Casiez 2012)** on θx and θy independently: `minCutoff 0.8 Hz`,
  `β 0.3 Hz per °/s`, `dCutoff 1.0 Hz`. This is gaze-lite's tuning (0.8 / 0.008 per px/s)
  rescaled at about 40 px/°. It resets after a gap of more than 200 ms. A port of gaze-lite's
  `OneEuroFilter2D`.
- **Blink hold** (gaze-lite `blinkHold`):
  - close when both blink blendshapes > 0.6; open when both < 0.4;
  - hold the last valid position for at most 800 ms;
  - hide the dot after 600 ms without valid data;
  - the data is flagged `BLINK`.

### 4.12 Validation metrics (`core/metrics/validation.ts`)

**Protocol.**

- `VAL12` (Standard/Thorough) or `VAL6` (Quick), in seeded order.
- Settle 600 ms, then sample 1000 ms. **No retries**, so there is no selective re-measurement.
- Validation frames are recorded while the fit worker runs. Scoring follows the fit.

**Inputs.** Raw (unfiltered, uncorrected) predictions; frames with `flags & INVALID_MASK = 0`.

**Per target** (and per estimator):

- **Accuracy** = ang(T, Ḡ), where Ḡ is the mean of the valid θ samples (the standard
  definition). Also reported: the median per-sample error, the signed offset (Ḡ − T in
  degrees) and the accuracy in px.
- **Precision:**
  - RMS-S2S = √(mean ang(G_i, G_{i+1})²) over consecutive valid pairs with
    Δt ≤ 1.5 × the median frame interval (gap-aware);
  - SD = √(σx² + σy²);
  - **BCEA₆₈ = 2kπσxσy√(1−ρ²), k = −ln(1−0.68) = 1.1394** [PG].
- **Data-loss funnel:**

  | Stage | Meaning |
  |---|---|
  | expected | sampleMs/1000 × nominal fps (`getSettings().frameRate`, else 30) |
  | delivered | camera frames whose capture time falls in the window |
  | processed | not dropped |
  | face | a face was found |
  | open | eyes open |
  | inRange | head within range |
  | valid | the estimator's frame is valid |

  Data loss = 1 − valid/expected.

**Summary.**

- Accuracy: mean, median and p90 over targets; central; peripheral.
- Pooled RMS-S2S, SD and BCEA (medians over targets).
- Data loss.
- **Effective rate** = valid samples / window seconds, on the capture clock.
- **Latency** = mean(receivedMs − tCaptureMs).
- **Constant baseline** = mean_k ang(T_k, C), where C is the centroid of the validation targets.
  **trackingGain = baseline / mean accuracy.**
- accuracyPctDiag = mean accuracy in px / viewport diagonal.

**Verdict** (heuristic; the UI says so):

| Verdict | Condition |
|---|---|
| `not-tracking` | gain < 1.5 |
| `good` | mean accuracy ≤ 2.5° and loss ≤ 20 % |
| `acceptable` | ≤ 4.0° and ≤ 35 % |
| `poor` | otherwise |

When `degreesApproximate` is set, use % of the diagonal instead: good < 6 %, acceptable < 10 %.
Basis: about 2–4° is realistic in good conditions [LIT §8].

**Areas-of-interest advice.** The largest n ∈ {2, 3, 4} for which the half-cell angular size is
at least p75 accuracy + 2·RMS-S2S; 0 if none [LIT §6.9: at most 4–6 areas].

**Fair comparison.** Every report is computed twice:

- `mode='own'`: each estimator's valid frames;
- `mode='intersection'`: frames valid for every fitted estimator.

**Paired engine differences.** Per-target accuracy differences use a Wilcoxon signed-rank test,
within the session only. The output states that one session does not generalise and that
between-run variability is about 4.6° [LIT §7].

### 4.13 Drift and recalibration (`core/calibration/drift.ts`)

**Drift check.**

- Key D in Live; prompted every **5 min** in Live, which can be turned off. Sessions of about
  5 minutes are stable [LIT §5.5].
- Two targets: the centre plus one seeded `VAL12` location. Settle 500 ms, sample 1000 ms each.
- The offset o is the mean over the two targets of (Ḡ − T), in degrees.

**Outcomes.**

- If |o| ≤ max(2°, 1.5 × validation accuracy), **apply a translation correction**:
  `drift = o` replaces the previous one; the time and value are logged. Exports carry
  `drift_x_deg` and `drift_y_deg`, and `gaze_*` are the corrected values (§4.16).
- Otherwise, prompt a **quick recalibration**:
  1. run `RECAL5` with the fixation rules;
  2. append its rows to the training set with weight ×2 and nearest-location groups;
  3. refit all engines;
  4. require a `VAL6` revalidation.

  Spreading anchors over the session beats front-loading them [LIT §5.5].

Any recalibration invalidates the previous validation.

**A drift check is forced** after:

- a camera or resolution change;
- a viewport or DPR change;
- a backend or delegate change;
- a worker restart;
- restoring a stored calibration.

Click-based learning is **off**.

### 4.14 Event detection (`core/events/idt.ts`)

**Input.** The selected estimator's corrected θ, with flags.

1. **Segmentation.** Gaps of 75 ms or less (up to 2 frames) are linearly interpolated. Longer
   gaps and invalid runs break segments, and are never bridged (fixes [PG]'s Step 6 defect).
2. **Smoothing.** A 3-sample median within each segment.
3. **I-DT** (Salvucci & Goldberg 2000):
   - dispersion `(max x − min x) + (max y − min y)` ≤ θ_D;
   - **θ_D = clamp(4 × SD₂d, 1.5°, 6°)**, where SD₂d is the median validation SD of the
     selected estimator on the median-filtered stream;
   - minimum duration 100 ms.
4. **Merging.** Fixations separated by less than 75 ms whose centroids lie within 1° are
   merged.
5. **Saccades** = the intervals between consecutive fixations in a segment. Amplitude only;
   **no peak velocity**, because 30 Hz cannot resolve saccade dynamics [LIT §6.9].
6. **Blinks** = runs of `BLINK` flags lasting 50–500 ms. Longer runs of invalid samples become
   `bad_data`.

**Output.** onset_ms, offset_ms, type, centroid (px and degrees), amplitude in degrees, n
samples, thresholds used. Types are eek-a-gaze's names: `fixation`, `saccade`, `blink`,
`bad_data` (onset/offset pairs) [C].

### 4.15 Persistence (`src/platform/storage.ts`, IndexedDB `eek-a-calibrate` v1)

**Object stores.**

| Store | Contents |
|---|---|
| `geometry` | card pxPerMm per `W×H@dpr`; f_px per camera hash |
| `profiles` | `FitResult` mapping states, head range, versions |
| `sessions` | session summaries and reports, without per-frame features unless the user opts in |

**Profile key.**

```
{location.origin}|{cssW}x{cssH}@{dpr}|{cameraHash}|{videoW}x{videoH}|{engine}@{featureVersion}+{modelSha8}
```

**Rules.**

- **A restored profile is usable only after a `VAL6` check gives a verdict of at least
  "acceptable".**
- Up to 8 profiles are kept, least recently used first out.
- If quota or IndexedDB is unavailable, warn and continue in memory.
- "Delete all my data" appears on the Data screen and in the footer of every screen.
- **No images or video are ever stored.**
- `www.` and the apex domain are separate origins [DEP]. The page sets
  `<link rel="canonical" href="https://eelkedevries.com/eek-a-calibrate/">`.

### 4.16 Export (`core/export/*`; zip via fflate)

**Zip name.** `eek-a-calibrate_<pid>_<session>_<yyyymmdd-hhmm>.zip`.

**Format rules.**

- Line endings `\n`; UTF-8; empty field means NaN or not applicable.
- Fixed decimals: ms 3 dp, px 2 dp, deg 4 dp, mm 1 dp, others 6 significant figures.
- **Identical state gives identical bytes** (unit-tested), apart from `session.json.exportedAt`.

**`samples.csv`** has one row per frame per session phase, for the *selected* estimator, plus
per-engine columns. **Header order matters**, because eek-a-gaze takes the first matching
synonym [C]:

```
participant,session,trial,phase,item_id,time_ms,frame_index,estimator,gaze_x,gaze_y,gaze_x_filt,gaze_y_filt,
gaze_x_uncorrected,gaze_y_uncorrected,gaze_x_deg,gaze_y_deg,drift_x_deg,drift_y_deg,valid,flags,confidence,
target_x,target_y,head_yaw_deg,head_pitch_deg,head_roll_deg,distance_mm,iris_px,clock,
gaze_x_blazegaze,gaze_y_blazegaze,gaze_x_peekr,gaze_y_peekr,gaze_x_geometric,gaze_y_geometric,gaze_x_eyepixel,gaze_y_eyepixel
```

- `time_ms` is relative to session start.
- `trial` is one of `calibration`, `validation-1`, `drift-<n>`, `live-<nnn>`.
- `gaze_*` are raw (unfiltered), drift-corrected CSS px with a top-left origin; empty when
  invalid.

**Other files.**

| File | Contents |
|---|---|
| `targets.csv` | id, phase, block, x/y px, onset_ms, offset_ms, frame_uncertainty_ms, attempt, pursuit parameters |
| `validation.csv` | estimator × mode × target metrics, then summary rows |
| `cv.csv` | engine × candidate × λ_rel × meanDeg, seDeg |
| `events.csv` | the selected estimator's events |
| `geometry.yaml` | `screen_width_px` (int), `screen_height_px`, `screen_width_mm` (= W/pxPerMm), `screen_height_mm`, `viewing_distance_mm` (= D_ref), `origin: top_left`, `units: pixels` |
| `session.json` | schema `eek-a-calibrate/session@1`: app version and commit; asset sha256 table; user agent and capabilities; host kind, delegate and backends; camera settings and clock source; geometry sources and uncertainty; presets, seeds and schedules; τ; weights; the `FitResult` (mapping states); selection and reason; validations; drift log; thresholds; licences |
| `README.txt` | file list and the eek-a-gaze command: `eek-a-gaze samples.csv --time-units ms --geometry geometry.yaml --units pixels` |

**Optional `dataset.json`** (off by default): derived per-frame features and labels, for
offline refitting. Raw frames and landmarks are excluded.

---

## 5. Module layout

Files are grouped by owning work package (§11). Three layers are **DOM-free** and import only
with `.ts` extensions, so `node --test` runs them from source:

- `core/**`;
- `engines/*/mappers.ts`, `engines/*/features.ts` and `engines/*/preprocess.ts`;
- `engines/blazegaze/vendor/**`.

```
eek-a-calibrate/
  AGENTS.md  CLAUDE.md(@AGENTS.md)  README.md  LICENSE(MIT)  NOTICE.md  .gitignore  .pre-commit-config.yaml   [WP1]
  .github/workflows/check-build.yml                                                                        [WP1]
  index.html  vite.config.ts  tsconfig.json  playwright.config.ts  package.json  package-lock.json           [WP1]
  assets-manifest.json  config/headers.mjs                                                                  [WP1]
  public/.htaccess  public/favicon.svg                                                                      [WP1]
  public/models/face-landmarker-f16-v1/{face_landmarker.task,LICENSE,PROVENANCE.md}                         [WP1]
  public/models/blazegaze-75fbd2f/{model.json,group1-shard1of1.bin,LICENSE,PROVENANCE.md}                   [WP1]
  public/models/peekr-1.0.7/{peekr.onnx,LICENSE,PROVENANCE.md}                                              [WP1]
  public/vendor/            (git-ignored; written by copy-assets)
  scripts/{copy-assets.mjs,precompress.mjs,verify-assets.mjs,serve-dist.mjs,make-fake-video.sh,
           check-public-build.sh,validate-prompts.sh,new-prompt.sh,deploy.sh}                               [WP1]
  src/main.ts                                                                                               [WP1]
  src/app/{router.ts,state.ts,dom.ts,strings.en-GB.ts,style.css,testHooks.ts}                               [WP1 shell; screens add strings]
  src/app/screens/{welcome,camera,screen,distance,live,data,about}.ts                                       [WP9]
  src/app/screens/{calibrate,validate,results}.ts                                                           [WP8]
  src/app/screens/lab.ts                                                                                    [WP4]
  src/app/components/{stimulusCanvas,target,poseGuide,metricTable,targetPlot}.ts                            [WP8]
  src/app/components/{qualityMeter,gazeDot,banner,progress,cardMatch,blindSpot}.ts                          [WP9]
  src/platform/{camera,frameClock,fullscreen,capabilities,assets}.ts                                        [WP4]
  src/platform/storage.ts                                                                                   [WP9]
  src/vision/protocol.ts                                                                                    [WP1, frozen]
  src/vision/{host,workerHost,inlineHost,vision.worker,visionCore,landmarker,frameImage}.ts                 [WP4]
  src/engines/types.ts  src/engines/registry.ts  src/engines/mappers.ts(aggregator)                         [WP1, frozen]
  src/engines/geometric/{index,features,mappers}.ts  src/engines/eyepixel/{index,patches,mappers}.ts        [WP5]
  src/engines/blazegaze/{index,preprocess,runtime,mappers}.ts  src/engines/blazegaze/vendor/{mathUtils.ts,safeSVD.ts,LICENSE,UPSTREAM.md}
  src/engines/runtimes/tfjs.ts                                                                              [WP6]
  src/engines/peekr/{index,preprocess,runtime,mappers}.ts  src/engines/runtimes/ort.ts                      [WP7]
  src/fit/{fit.worker.ts,fitClient.ts}                                                                      [WP8]
  src/core/types.ts  src/core/constants.ts                                                                  [WP1, frozen]
  src/core/maths/{linalg,standardise,ridge,groupedLoo,robust,pca,simplex,rng,stats,wilcoxon}.ts            [WP2]
  src/core/filters/{oneEuro,blinkHold}.ts                                                                   [WP2]
  src/core/geometry/{screen,angles,distance,blindSpot}.ts                                                   [WP3]
  src/core/metrics/{validation,funnel,aoi,compare}.ts                                                       [WP3]
  src/core/events/idt.ts                                                                                    [WP3]
  src/core/export/{csv,samplesCsv,targetsCsv,validationCsv,geometryYaml,sessionJson,zip,readme}.ts          [WP3]
  src/core/face/{landmarkSets,headPose,eyeMeasures,blink,quality}.ts                                        [WP4]
  src/core/protocol/{layouts,schedule,pursuit,gating,labelling,lag,headRange}.ts                            [WP8]
  src/core/calibration/{dataset,prune,fitEngine,stack,select,estimator,drift,restore}.ts                    [WP8; drift.ts WP9]
  tests/unit/  tests/parity/  tests/sim/  tests/e2e/  tests/fixtures/{face/,landmarks/,eek-a-gaze/}         [per WP]
  docs/{usage,methods,engines,privacy,export-format,deployment,troubleshooting}.md                          [WP9/WP10]
  docs-dev/ (house layout: agent guides, prompts/001–010, plan.md, planning/current_state.md,
             reference/primary_authoritative/specification.md = this file, secondary_background/overview.md) [WP1]
```

**Layering rules.**

- `core/` imports nothing outside `core/`.
- `engines/*` import `core/` and `engines/types.ts`.
- `vision/` imports `engines/` and `core/`.
- Only `app/` and `platform/` touch the DOM.
- The fit worker imports `core/` and `engines/mappers.ts` only, **never** a runtime, TF.js or
  ORT.

---

## 6. TypeScript contracts (WP1 writes these verbatim; changing them needs a spec bump)

```ts
// ===== src/core/types.ts =====
export type Ms = number;
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type EngineId = 'blazegaze' | 'peekr' | 'geometric' | 'eyepixel';
export type EstimatorId = EngineId | 'combined';
export type BackendId = 'tfjs-webgl' | 'tfjs-wasm' | 'tfjs-cpu' | 'ort-wasm' | 'js';
export const ENGINE_IDS: readonly EngineId[] = ['blazegaze', 'peekr', 'geometric', 'eyepixel'];
export const ENGINE_RANK: Readonly<Record<EngineId, number>> = { blazegaze: 1, peekr: 2, geometric: 3, eyepixel: 4 };

export interface FrameMeta {
  index: number; tCaptureMs: Ms; clock: 'captureTime' | 'expectedDisplayTime' | 'callback' | 'poll';
  presentedFrames: number; cameraGap: number; videoW: number; videoH: number;
}
export interface HeadPose { yawDeg: number; pitchDeg: number; rollDeg: number; R: readonly number[]; t: Vec3; scale: number; }
export interface EyeMeasures {
  earL: number; earR: number; openQL: number; openQR: number; blinkL: number; blinkR: number;
  irisDiamPx: number; eyeMidNorm: Vec2; interOcularPx: number; open: boolean;
}
export interface FaceQuality { faceWidthFrac: number; lumaMean: number; lumaSd: number; backlight: number; glare: number; centring: Vec2; }
export interface FaceObservation {
  landmarks: Float32Array; blendshapes: Float32Array; matrix: Float32Array;
  pose: HeadPose; eyes: EyeMeasures; quality: FaceQuality; landmarkerMs: number; delegate: 'GPU' | 'CPU';
}
export type EngineStatusCode = 'ok' | 'no-face' | 'crop-invalid' | 'skipped' | 'error';
export interface EngineFrame { engine: EngineId; status: EngineStatusCode; x: Float32Array | null; prior: Vec2 | null; weight: number; computeMs: number; }
export interface FrameResult {
  meta: FrameMeta; face: FaceObservation | null; engines: Partial<Record<EngineId, EngineFrame>>;
  workerMs: number; receivedMs: Ms;
}

export interface ScreenGeometry {
  viewportWpx: number; viewportHpx: number; screenWpx: number; screenHpx: number; dpr: number;
  fullscreen: boolean; pxPerMm: number; pxPerMmSource: 'card' | 'diagonal' | 'assumed';
}
export interface DistanceModel {
  focalPx: number; focalSource: 'blind-spot' | 'assumed-fov';
  blindSpotMm: number | null; blindSpotSdMm: number | null; irisMm: number;
}
export interface SessionGeometry { screen: ScreenGeometry; distance: DistanceModel; refDistanceMm: number | null; degreesApproximate: boolean; }

export type Phase = 'fixation' | 'pursuit' | 'head' | 'validation' | 'drift';
export type Preset = 'quick' | 'standard' | 'thorough';
export interface TargetItem { kind: 'target'; id: string; phase: Phase; block: number; xNorm: number; yNorm: number;
  groupId: string; settleMs: Ms; sampleMs: Ms; maxSampleMs: Ms; headMotion?: boolean; }
export interface PursuitItem { kind: 'pursuit'; id: string; phase: 'pursuit'; block: number; periodMs: Ms;
  holdMs: Ms; discardMs: Ms; ax: number; ay: number; phiX: number; phiY: number; }
export interface InstructionItem { kind: 'instruction'; id: string; textKey: string; }
export type ScheduleItem = TargetItem | PursuitItem | InstructionItem;
export interface Schedule { seed: number; preset: Preset; kind: 'calibration' | 'validation' | 'drift' | 'recalibration'; items: ScheduleItem[]; }
export interface Presentation { itemId: string; onsetMs: Ms; offsetMs: Ms; attempt: number; frameIntervalMs: number; aborted: boolean; }
export type RejectCode = 'no-face' | 'blink' | 'pose' | 'motion' | 'small-face' | 'settle' | 'outlier'
  | 'not-fullscreen' | 'hidden' | 'dropped' | 'out-of-range';
export interface FrameLabel { itemId: string; phase: Phase; groupId: string; tRelMs: Ms; accepted: boolean; reject: RejectCode | null; }
export interface RecordedFrame {
  meta: FrameMeta; distanceMm: number | null; yawDeg: number | null; pitchDeg: number | null; rollDeg: number | null;
  eyeMidNorm: Vec2 | null; open: boolean; label: FrameLabel | null; engines: Partial<Record<EngineId, EngineFrame>>;
}
export interface Recording { id: string; schedule: Schedule; geometry: SessionGeometry; presentations: Presentation[]; frames: RecordedFrame[]; }

export type MapperId = 'geo-linear' | 'geo-quadratic' | 'prior-affine' | 'prior-ridge-pose' | 'emb-ridge' | 'pix-ridge' | 'pix-webgazer';
export interface RowContext { yawRad: number; pitchRad: number; rollRad: number; eyeMidNorm: Vec2; lnDistRatio: number; }
export interface MapperSpec {
  id: MapperId; engine: EngineId; complexity: number; names: readonly string[];
  row(f: EngineFrame, c: RowContext): Float64Array | null;
  floors: Float64Array; primary: readonly number[];
  pca?: { start: number; end: number; k: number };
  standardise: boolean; lambdaRel: readonly number[]; absoluteLambda?: boolean;
}
export interface CvReport { meanDeg: number; seDeg: number; perGroupMedianDeg: Record<string, number>; nRows: number; nGroups: number; coverage: number; }
export interface CandidateScore { mapper: MapperId; lambdaRel: number; cv: CvReport; }
export interface MappingState {
  schema: 'eek-a-calibrate/mapping@1'; engine: EngineId; mapper: MapperId; featureVersion: string; lambdaRel: number;
  mu: number[]; scale: number[]; zMin: number[]; zMax: number[];
  pca: { mean: number[]; components: number[]; k: number; commonScale: number } | null;
  B: number[]; A: number[]; h95: number;
}
export interface MappedGaze { deg: Vec2; extrapolated: boolean; leverage: number; }
export interface EngineFit { engine: EngineId; chosen: MappingState; cv: CvReport; candidates: CandidateScore[];
  oofDeg: number[]; rowFrameIndex: number[]; nPruned: number; }
export interface CombinedModel { members: EngineId[]; wx: Partial<Record<EngineId, number>>; wy: Partial<Record<EngineId, number>>; cv: CvReport; }
export interface HeadRange { yawDeg: Vec2; pitchDeg: Vec2; lnDistRatio: Vec2; eyeMidX: Vec2; eyeMidY: Vec2; }
export interface Selection { estimator: EstimatorId; reason: string; ranking: { estimator: EstimatorId; meanDeg: number; seDeg: number }[]; }
export interface FitResult {
  schema: 'eek-a-calibrate/fit@1'; seed: number; pursuitLagMs: number; refDistanceMm: number;
  fits: Partial<Record<EngineId, EngineFit>>; combined: CombinedModel | null; headRange: HeadRange;
  selection: Selection; fitMs: number; warnings: string[];
}
export const Flags = { NO_FACE: 1, BLINK: 2, OUT_OF_RANGE: 4, EXTRAPOLATED: 8, OFFSCREEN: 16,
  DROPPED: 32, ENGINE_ERROR: 64, NOT_FULLSCREEN: 128, HIDDEN: 256 } as const;
export const INVALID_MASK = 1 | 2 | 4 | 32 | 64 | 128 | 256;
export interface GazeSample {
  frameIndex: number; tCaptureMs: Ms; estimator: EstimatorId;
  rawDeg: Vec2 | null; correctedDeg: Vec2 | null; rawPx: Vec2 | null; correctedPx: Vec2 | null; filteredPx: Vec2 | null;
  perEngineDeg: Partial<Record<EngineId, Vec2>>; flags: number; confidence: number; distanceMm: number | null;
}
export interface Funnel { expected: number; delivered: number; processed: number; face: number; open: number; inRange: number; valid: number; }
export interface TargetMetrics {
  itemId: string; targetPx: Vec2; region: 'central' | 'peripheral'; funnel: Funnel; dataLossPct: number;
  accuracyDeg: number; medianErrorDeg: number; offsetDeg: Vec2; accuracyPx: number;
  rmsS2SDeg: number; sdDeg: number; bcea68Deg2: number;
}
export interface ValidationReport {
  estimator: EstimatorId; mode: 'own' | 'intersection'; targets: TargetMetrics[];
  accuracyMeanDeg: number; accuracyMedianDeg: number; accuracyP90Deg: number; accuracyCentralDeg: number; accuracyPeripheralDeg: number;
  rmsS2SDeg: number; sdDeg: number; bcea68Deg2: number; dataLossPct: number; samplingHz: number; latencyMs: number;
  baselineDeg: number; trackingGain: number; accuracyPctDiag: number; aoiGrid: 0 | 2 | 3 | 4;
  verdict: 'good' | 'acceptable' | 'poor' | 'not-tracking'; degreesApproximate: boolean;
}
export interface ComparisonRow { estimator: EstimatorId; backend: BackendId | 'mixed'; computeMsP50: number;
  cv: CvReport | null; validation: ValidationReport | null; selected: boolean; }

// ===== src/engines/types.ts =====
import type { BackendId, EngineFrame, EngineId, FaceObservation, FrameMeta, MapperId, MapperSpec } from '../core/types.ts';
export type Capability = 'webgl2' | 'wasm-simd' | 'offscreen-canvas';
export type AssetId = 'face-landmarker' | 'mp-module-js' | 'mp-module-wasm' | 'mp-simd-js' | 'mp-simd-wasm'
  | 'mp-nosimd-js' | 'mp-nosimd-wasm' | 'tfjs-wasm' | 'tfjs-wasm-simd' | 'blazegaze-model' | 'peekr-model' | 'ort-wasm' | 'ort-mjs';
export interface RuntimeEnv { baseUrl: string; dev: boolean; inWorker: boolean; crossOriginIsolated: boolean; cores: number;
  webgl2: boolean; wasmSimd: boolean; offscreenCanvas: boolean; e2e: boolean; }
export interface EngineSpec {
  id: EngineId; displayName: string; rank: number; family: 'appearance-fewshot' | 'appearance-cnn' | 'geometric' | 'eye-pixel';
  version: string; featureVersion: string; featureDim: number; licence: { code: string; weights: string | null };
  citation: string; sourceUrl: string; assets: readonly AssetId[]; requires: readonly Capability[];
  frameBudgetMs: number; mappers: readonly MapperId[]; inCombinedByDefault: boolean; downloadBytes: number;
}
export interface FrameImage {
  readonly width: number; readonly height: number; readonly bitmap: ImageBitmap;
  readonly roi: ImageData; readonly roiX: number; readonly roiY: number;
  crop(sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): ImageData;
}
export interface EngineInput { meta: FrameMeta; face: FaceObservation; image: FrameImage; }
export interface EngineContext { env: RuntimeEnv; assetUrl(id: AssetId): string; onProgress(loaded: number, total: number): void; signal: AbortSignal; }
export interface GazeEngine {
  readonly spec: EngineSpec; readonly backend: BackendId;
  warmUp(): Promise<void>; resetSession(): void; extract(input: EngineInput): Promise<EngineFrame>; dispose(): void;
}
export interface EngineModule {
  spec: EngineSpec;
  probe(env: RuntimeEnv): { ok: true } | { ok: false; reason: string };
  create(ctx: EngineContext): Promise<GazeEngine>;
}
export type MapperTable = Readonly<Record<EngineId, readonly MapperSpec[]>>;
// registry.ts: export const ENGINE_LOADERS: Record<EngineId, () => Promise<EngineModule>> (dynamic import per folder)
// mappers.ts:  export const MAPPERS: MapperTable   (pure; imported by the fit worker and the main thread)

// ===== src/vision/protocol.ts =====
import type { BackendId, EngineId, FrameMeta, FrameResult } from '../core/types.ts';
export interface VisionConfig { baseUrl: string; dev: boolean; gz: boolean; delegate: 'GPU' | 'CPU'; e2e: boolean; forceBackend?: BackendId; }
export interface VisionInfo { kind: 'worker' | 'inline'; delegate: 'GPU' | 'CPU'; wasmVariant: 'module' | 'simd' | 'nosimd';
  mediapipe: '0.10.35'; modelSha256: string; initMs: number; }
export interface EngineStatus { id: EngineId; ok: boolean; backend?: BackendId; reason?: string; loadMs?: number; }
export interface ProbeResult { frames: number; landmarkerP50Ms: number; landmarkerP90Ms: number; prepP50Ms: number;
  engines: Partial<Record<EngineId, { p50Ms: number; p90Ms: number; okFrames: number }>>; totalP50Ms: number; }
export type ToVision =
  | { t: 'init'; cfg: VisionConfig }
  | { t: 'engines'; ids: EngineId[] }
  | { t: 'frame'; bitmap: ImageBitmap; meta: FrameMeta }       // bitmap transferred
  | { t: 'probe'; frames: number }
  | { t: 'reset-session' }
  | { t: 'dispose' };
export type FromVision =
  | { t: 'ready'; info: VisionInfo }
  | { t: 'progress'; asset: string; loaded: number; total: number }
  | { t: 'engines'; status: EngineStatus[] }
  | { t: 'result'; result: Omit<FrameResult, 'receivedMs'> }   // typed-array buffers transferred
  | { t: 'probe'; result: ProbeResult }
  | { t: 'error'; stage: 'landmarker' | 'host' | EngineId; message: string; recoverable: boolean };
export interface VisionHost {
  readonly kind: 'worker' | 'inline';
  init(cfg: VisionConfig): Promise<VisionInfo>;
  setEngines(ids: EngineId[]): Promise<EngineStatus[]>;
  submit(bitmap: ImageBitmap, meta: FrameMeta): boolean;       // false ⇒ busy; bitmap closed by host
  onResult(cb: (r: FrameResult) => void): () => void;
  onProgress(cb: (asset: string, loaded: number, total: number) => void): () => void;
  probe(frames: number): Promise<ProbeResult>;
  resetSession(): void;
  dispose(): void;
}
export declare function createVisionHost(cfg: VisionConfig, prefer?: 'worker' | 'inline'): Promise<VisionHost>;

// ===== src/fit/fitClient.ts (WP8) =====
// export function fitRecording(rec: Recording, opts: { seed: number; engines: EngineId[]; maxMs: number },
//   onProgress?: (stage: string, fraction: number) => void): Promise<FitResult>;
// export function restoreEstimators(fit: FitResult, geometry: SessionGeometry): Map<EstimatorId, Estimator>;
// export interface Estimator { readonly id: EstimatorId; estimate(f: RecordedFrame, baseFlags: number): GazeSample; }
// ===== src/core/metrics/validation.ts (WP3) =====
// export function scoreValidation(rec: Recording, samples: Map<EstimatorId, GazeSample[]>, g: SessionGeometry,
//   mode: 'own' | 'intersection', nominalFps: number): ValidationReport[];
// ===== src/core/maths/groupedLoo.ts (WP2) =====
// export function groupedLooResiduals(Z: Float64Array, Y: Float64Array, w: Float64Array, n: number, p: number,
//   lambda: number, groups: Int32Array, unpenalised: readonly number[]): Float64Array;   // n×2 LOO residuals
```

**TypeScript configuration.**

- `target ES2022`, `module ESNext`, `moduleResolution bundler`, `strict`, `noEmit`.
- `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.
- `lib ["ES2023", "DOM", "DOM.Iterable"]` and `types ["node"]` for the tests.
- Workers cast `self as unknown as Worker` for `postMessage` and `onmessage`; mixing the DOM and
  WebWorker libs is avoided.
- Node 22.23 strips types without a flag when test files are passed by glob [C].

---

## 7. UI screens and flow

The app is a single page with **hash routes** only, because the host returns its 404 page for
unknown paths [DEP].

- All copy is in `strings.en-GB.ts`, in formal British English.
- Fully operable by keyboard; colour-blind-safe palette; light and dark themes through CSS
  tokens; visible focus.
- Under `prefers-reduced-motion` the target is static and pursuit can be skipped, with a note.

**Query parameters** (they pre-fill settings):

- `pid`, `session`, `preset`, `engines`, `select` (`auto` or an engine id), `seed`,
  `driftEveryMin`;
- `host` (`worker` or `inline`), `force` (`cpu`);
- `e2e=1` and `speed=N`, for tests only. Test hooks expose read-only `window.__eek` state, allow
  injected geometry and skip fullscreen.

| # | Route | Content | WP |
|---|---|---|---|
| 0 | `#/` Welcome | What it does. Privacy: "Everything runs on your device; nothing is uploaded; no images are stored". Realistic expectations [LIT §8]: about 2–4° in good conditions, often 4–8° or worse, at most 30 Hz, 4–6 coarse areas only. Capability check: HTTPS, getUserMedia, rVFC, WASM SIMD, WebGL2, OffscreenCanvas, module workers, fullscreen. Preset choice (Quick / **Standard** / Thorough). Engines: **Auto (recommended)**, or Advanced with checkboxes and download sizes. Participant and session fields | WP9 |
| 1 | `#/camera` | Permission, picker, mirrored preview with face box. Live meters (heuristic thresholds, green for 2 s to continue): face found; face width 15–60 % of the frame; centred (\|dx\| ≤ 0.2, \|dy\| ≤ 0.25); face luma 60–200; backlight ≥ 0.8; glare ≤ 2 %; frame rate ≥ 20 Hz; \|yaw\|, \|pitch\| ≤ 15°. Eyewear question (none / glasses / contacts / prefer not to say), with glare advice. Engines load in the background with progress bars. Then the **device probe**: 30 frames with every selected engine. **Run set**: each learned engine is included if its p50 is within budget (BlazeGaze ≤ 25 ms, Peekr ≤ 15 ms); then, while the total p50 (landmarker + preparation + engines) exceeds 45 ms, the slowest learned engine is dropped. Geometric and eye-pixel are always included. Warn if the total exceeds 66 ms (below 15 Hz) | WP9 (+WP4 meters) |
| 2 | `#/screen` | Card match (slider and arrow keys), or diagonal in inches, or Skip (degrees approximate). Remembered per screen | WP9 |
| 3 | `#/distance` | Blind-spot test (5 trials), then 2 s of iris measurement with both eyes open, or Skip. Shows the distance band (450–850 mm recommended) | WP9 |
| 4 | `#/calibrate` | Fullscreen; instruction cards; blocks A, B and C; progress bar; pose guide in C; pause overlays for face lost > 400 ms, fullscreen exit and hidden tab. The fit then starts in the fit worker, and the app moves straight on to validation | WP8 |
| 5 | `#/validate` | Fullscreen; `VAL12` or `VAL6`; then "Scoring…" | WP8 |
| 6 | `#/results` | Table per estimator (Combined and each engine): CV error, validation accuracy (mean, median, central, peripheral), RMS-S2S, SD, BCEA, loss, Hz, ms/frame, gain, verdict; own and intersection tabs. The **selected estimator** is marked with its reason. SVG target plot (target, centroid, sample cloud, offset vector), toggled per engine. Data-loss funnel. CV candidates table. AOI advice. Note on optimism when switching. Actions: Accept, Revalidate, Recalibrate, Switch estimator (instant) | WP8 |
| 7 | `#/live` | Gaze dot (filtered, raw toggle), optional per-engine dots, confidence ring, head-range greying. Estimator switcher. Quadrant/AOI demo (n from the advice). Record start/stop (R) with markers (M). Drift check (D) and the timed prompt; quick recalibration | WP9 |
| 8 | `#/data` | Export zip; stored profiles and sessions; restore (forces `VAL6`); delete all | WP9 |
| 9 | `#/about` | Methods and metric formulae, protocol, engines with licences and citations, limitations, privacy | WP9 |
| 10 | `#/lab` | Diagnostics: host, delegate, backends, per-stage timings, live crops (BlazeGaze strip, Peekr crops, 10×6 patches), engine status; "Run each engine on 10 frames". Linked from About and the footer | WP4 (engines add crop renderers) |

**First-run flow.** Welcome → Camera → Screen → Distance → Calibrate → Validate → Results →
Live → Data.

- A stored profile for this key offers "Use stored calibration (validation required)".
- Leaving mid-flow is allowed; state lives in `app/state.ts`.

---

## 8. Asset and build pipeline, headers

### 8.1 Assets

**`assets-manifest.json`** (WP1) is the single list. Each entry has `id`, `path` (published,
relative to `BASE_URL`), `from` (`npm:<pkg>@<ver>/<file>` or `committed`), `sha256`, `bytes`,
`licence`, `source`, `retrieved` and `gz` (bool).

**`scripts/copy-assets.mjs`** runs as `predev` and `prebuild`.

- It copies npm files into `public/vendor/<pkg>-<ver>/` (git-ignored):
  - from `@mediapipe/tasks-vision/wasm/`: all three pairs;
  - from `@tensorflow/tfjs-backend-wasm/dist/`: `tfjs-backend-wasm{,-simd}.wasm`.
- It **never copies a package root**, because roots contain `.map` files [DEP].
- It verifies every sha256 against the manifest and fails on any mismatch.

**ORT runtime** files come via Vite `?url` imports of
`onnxruntime-web/ort-wasm-simd-threaded.{wasm,mjs}`, as in eek-a-look [C].

**`scripts/precompress.mjs`** writes `<file>.wasm.gz` (gzip -9) next to every `.wasm` in `dist/`.

**`scripts/verify-assets.mjs dist`** (part of `check`) checks that:

- every manifest entry exists with the right hash;
- each committed model folder has a LICENSE;
- there are no `.map` files;
- **every `https?://` string in `dist/**/*.{js,mjs}` is on an allowlist**: w3.org namespaces,
  licence and comment URLs, `eelkedevries.com`;
- strings containing `odml.pa.googleapis.com`, `storage.googleapis.com`, `cdn.jsdelivr.net`,
  `blob.core.windows.net` or `redforestai.github.io` fail the check;
- `public/.htaccess` contains the CSP and Permissions-Policy strings exported by
  `config/headers.mjs` verbatim.

**Sizes** [C/IMPL]:

| Asset | Raw | On the wire | Loaded when |
|---|---|---|---|
| MediaPipe module wasm + js (worker) | 11,153,641 + 322,082 B | ≈ 3.28 MB gz + ≈ 0.08 MB | always (worker) |
| MediaPipe classic SIMD / no-SIMD (inline fallback) | 11,153,617 / 10,481,398 B | ≈ 3.3 / 3.2 MB gz | fallback only |
| `face_landmarker.task` | 3,758,596 B | ≈ 3.4 MB (gzip saves only ≈ 11 %, so not compressed) | always |
| TF.js JS (core, layers, webgl, wasm, cpu) | ≈ 1.2 MB min | ≈ 0.3 MB [I] | BlazeGaze |
| `tfjs-backend-wasm-simd.wasm` | 424,594 B | ≈ 0.14 MB gz | BlazeGaze, WASM fallback |
| BlazeGaze model | 669,060 B | same | BlazeGaze |
| ORT `ort-wasm-simd-threaded.wasm` + `.mjs` | 14,239,897 + 24,381 B | ≈ 3.66 MB gz | Peekr |
| `peekr.onnx` | 579,176 B | same | Peekr |

A first visit with every engine is ≈ 12.5 MB on the wire; geometric and eye-pixel only is
≈ 7.3 MB. Each engine runtime is loaded only by a dynamic `import()` once it is selected.

### 8.2 Build configuration

**`vite.config.ts`.**

- `base:'/eek-a-calibrate/'`.
- `build.sourcemap:false`.
- `rollupOptions.input:{index:'index.html'}`; the entry stays `assets/index-*.js` for the
  deploy check [DEP].
- `worker.format:'es'`.
- `optimizeDeps.exclude:['onnxruntime-web','@mediapipe/tasks-vision']`.
- `define`: `__APP_VERSION__`, `__APP_COMMIT__` (`git rev-parse --short HEAD`, else `dev`),
  `__BUILD_DATE__`.
- No CSP in the dev server (HMR); `serve-dist.mjs` applies production headers.

**`package.json` scripts.**

| Script | Command |
|---|---|
| `predev` / `prebuild` | `node scripts/copy-assets.mjs` |
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build && node scripts/precompress.mjs` |
| `test` | `node --test 'tests/unit/**/*.test.ts' 'tests/parity/**/*.test.ts' 'tests/sim/**/*.test.ts'` |
| `test:e2e` | `playwright test` |
| `serve:dist` | `node scripts/serve-dist.mjs` (port 4173, under `/eek-a-calibrate/`) |
| `check` | `npm run build && npm test && node scripts/verify-assets.mjs dist && bash scripts/check-public-build.sh dist && bash scripts/validate-prompts.sh` |
| `check:all` | `npm run check && npm run test:e2e` |
| `deploy` | `bash scripts/deploy.sh` |

**Other configuration.**

- `.pre-commit-config.yaml` (copied from eek-a-look): `check-added-large-files --maxkb=2000`
  with `exclude: ^public/models/`.
- `.gitignore`: `node_modules/`, `dist/`, `public/vendor/`, `tests/fixtures/generated/`,
  `test-results/`, `playwright-report/`, `.cache/`, `.env*`.

### 8.3 `public/.htaccess` (final; `config/headers.mjs` holds the same strings)

```apache
AddType text/javascript .mjs
AddType application/wasm .wasm
AddType application/octet-stream .task .tflite .onnx .bin
<FilesMatch "\.wasm\.gz$">
  ForceType application/wasm
  <IfModule mod_headers.c>
    Header set Content-Encoding gzip
  </IfModule>
  SetEnv no-gzip 1
</FilesMatch>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType application/wasm "access plus 30 days"
  ExpiresByType application/octet-stream "access plus 30 days"
</IfModule>
<IfModule mod_headers.c>
  Header set Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
  Header set Permissions-Policy "camera=(self), microphone=(), geolocation=()"
</IfModule>
# COOP/COEP (threaded WASM) intentionally off in v1; see deploy.md. Uncomment only after a live test:
# Header set Cross-Origin-Opener-Policy "same-origin"
# Header set Cross-Origin-Embedder-Policy "require-corp"
```

**Checked [C].** The MediaPipe glue, ORT `ort.wasm.min.mjs` and `ort-wasm-simd-threaded.mjs`,
and the TF.js 4.22 core, layers, webgl and wasm builds contain no `eval(` and no
`new Function`. `'wasm-unsafe-eval'` is enough for WebAssembly compilation. ORT and MediaPipe
call `createObjectURL`, hence `blob:` in `worker-src` and `connect-src`.

**If a CSP violation appears in e2e,** relax only the directive involved, and record why in
`docs/deployment.md`.

---

## 9. Deploy integration (as [DEP], drafts saved)

**In eek-a-calibrate (WP1).**

- **Create the `main` branch.** The checkout is on `claude/gallant-rubin-xdhp1p` with no
  commits.
- The repo is **public**, size 0, default branch `main` [C].
- Ship:
  - `scripts/deploy.sh` (the draft);
  - `scripts/check-public-build.sh` (from eek-a-look);
  - `docs/deployment.md`;
  - a committed `package-lock.json`.

**In `eelkedevries/eelkedevries.com` (WP10).** One commit to `main`, as its `CLAUDE.md`
requires: merge the harness branch, push `main`, and say so. Message: "Deploy eek-a-calibrate to
/eek-a-calibrate/ on a calibrate-updated dispatch". It contains:

1. `.github/workflows/deploy-eek-a-calibrate.yml`, from the draft. It is eek-a-rise's file
   renamed; it checks for `200 application/wasm` on the first `.wasm`.
2. In `scripts/deploy.sh`, after the eek-a-rise protect line:
   ```
     # eek-a-calibrate is deployed separately by deploy-eek-a-calibrate.yml, which
     # writes only into this folder.
     --filter='protect /eek-a-calibrate/***'
   ```
3. One README sentence, worded as in [DEP].

**Order.**

1. Push eek-a-calibrate `main`.
2. Push eelkedevries.com `main`. This starts a full *Render & Deploy*.
3. **Wait** until no *Render & Deploy* run created before the protect line is queued or
   running. Check with `mcp__github__actions_list` using
   `{method:"list_workflow_runs", resource_id:"deploy.yml"}`.
4. Dispatch with `mcp__github__actions_run_trigger`
   `{method:"run_workflow", owner:"eelkedevries", repo:"eelkedevries.com", workflow_id:"deploy-eek-a-calibrate.yml", ref:"main"}`.
   `gh` has an invalid token in this session [DEP].
5. Poll for the run. On a *Test SSH connectivity* failure, re-run the failed jobs, up to 3
   times.
6. Verify with curl from the session:
   - 200 and `assets/index-*.js` on the page;
   - `application/wasm` and `content-encoding: gzip` on a `.wasm.gz`;
   - `text/javascript` on the `.mjs`;
   - `application/octet-stream` on `.task` and `.onnx`;
   - the CSP and Permissions-Policy headers on `index.html`.

A Projects card is **not** added, matching eek-a-look's precedent.

---

## 10. Test plan

Everything below runs headless here and in CI, except §10.6.

### 10.1 Unit tests (`node --test`, TypeScript sources)

**WP2 — maths and filters.**

- **Linear algebra:** Cholesky and solves against known systems.
- **Ridge:** against the closed form; unpenalised intercept; λ scaling.
- **Grouped LOO equals brute-force refits** (max |Δ| < 1e-9) on random designs with unequal
  groups and weights.
- **Robust:** a planted outlier is down-weighted by Huber; hard rejection.
- **Standardisation and PCA:** floors applied; clipping and the extrapolation flag; seeded PCA
  gives byte-identical components for the same seed and matches the exact SVD subspace on a
  low-rank fixture.
- **Simplex stacking:** KKT conditions; recovers known weights; renormalisation when a member is
  missing.
- **RNG and filters:** mulberry32 golden sequence; Fisher–Yates; One Euro step response and
  reset; blinkHold hysteresis, 800 ms cap and 600 ms hide.
- **Wilcoxon:** against tabulated values.

**WP3 — geometry, metrics, events, export.**

- **Angles:** against `geometry_reference.csv` copied from eek-a-gaze, atol 1e-9, with
  provenance. Exact angle: symmetric, zero at identity, agrees with ppd near the centre,
  ≈ 20 % lower near the edges. Distance-scale cancellation in px. Card, diagonal and blind-spot
  formulae; iris distance.
- **Metrics:** RMS-S2S ≈ σ√2 per axis on seeded Gaussian data; gap-aware pairing; SD; BCEA
  against an analytic value; funnel arithmetic; baseline and gain; AOI rule; verdict table.
- **Events:** synthetic scanpaths with noise, gaps and blinks give onsets and offsets within one
  sample. Gaps > 75 ms are never bridged.
- **Export:**
  - byte-identical output for identical state;
  - header order and the presence of `time_ms`;
  - with eek-a-gaze's synonym rule (the first matching header, normalised) re-implemented in the
    test, `time_ms` → time, `gaze_x` → gaze_x, `gaze_y` → gaze_y;
  - `geometry.yaml` keys and `origin: top_left` / `units: pixels`;
  - y sign convention;
  - the zip parses.

**WP4 — face and capture.**

- `headPoseFromMatrix` round-trips synthetic rotations in both packings.
- EAR4/EAR6 and openQ; iris diameter; blink masking ±1 frame.
- Frame-clock dedupe logic, with `presentedFrames` sequences injected.
- The camera-ladder decision function.

**WP5 — geometric and eye-pixel engines.**

- Feature finiteness on the landmark fixture.
- Feature layout and names; mapper rows and floors.
- Histogram equalisation against a reference implementation.
- Mirror-pair table against canonical-model symmetry (|x_a + x_b|, |y_a − y_b|, |z_a − z_b|
  < 0.01).

**WP8 — protocol and calibration.**

- Seed → identical schedule. Calibration and validation points never coincide (min distance
  ≥ 0.05).
- Pursuit peak speed within the limit; labelling at t − τ.
- Gating per rule.
- Group assignment (nearest location); **no group appears in both training and held-out rows**;
  weights per unit.
- Lag recovery of a planted 120 ms delay (±33 ms).
- Head-range gate.
- Selection rules (one-SE rule, Combined 5 % rule) on hand-made CV tables.
- Mapping state serialise → restore → predict, identical.

### 10.2 Simulation (`tests/sim`, WP5 harness, WP8 pipeline test)

**`tests/sim/faceSim.ts`** builds synthetic frames.

- Canonical face model (468 vertices).
- Iris landmarks 468–477: eyeball centre 0.8 cm behind the corner midpoint, radius 1.2 cm (iris
  0.4 cm in front of the corners; [GL]'s assumed case). Ring radius 0.585 cm, perpendicular to
  the gaze.
- Head rotation and translation, pinhole projection (f, W×H), landmark noise σ.
- A synthetic column-major matrix `[s·R | t]`.
- `eyeLook*` blendshapes as clamp(angle/30°).
- **Screen ground truth.**
  - Camera frame (OpenCV): +X image-right, +Y down, +Z towards the user.
  - Screen plane Z = 0, with the CSS point (x, y) at `X = W_mm/2 − x_mm`, `Y = y_mm + 5`.
  - Gaze ray from eye E with s = −E_z/d_z.

**Tests.**

- **WP5:** with noise-free landmarks, straight-ahead gaze across yaw ±20° and pitch ±15° gives
  geometric features whose OLS correction with `dc` reduces the pose-induced change in ḡ by at
  least 80 % compared with no `dc`.
- **WP8, end to end:**
  1. Simulate a Standard session: CAL13, pursuit, HEAD5, VAL12, at 30 Hz.
  2. Run `fitRecording`, then score.
  3. Assert:
     - noise-free validation mean accuracy < 0.5°;
     - with σ = 0.5 px and head poses inside the range, < 1.5°;
     - `trackingGain` > 3;
     - out-of-range poses are flagged;
     - fixed seed → identical `FitResult` JSON.

### 10.3 Parity (`tests/parity`, Node)

**WP6 — BlazeGaze.**

1. **Eye strip.** The composite strip is **bit-identical** to the vendored upstream
   `obtainEyePatch` (two-pass) on the committed fixture frame and landmarks. Provide a minimal
   `ImageData` polyfill in the test. At least 99.9 % of pixels must be identical, and any
   difference may only be at boundary pixels.
2. **Model split.** Encoder → `gaze_mlp` equals the full `model.predict` (max |Δ| < 1e-5),
   using `@tensorflow/tfjs-core`, `-layers` and `-backend-cpu` with `tf.io.fromMemory`.
3. `hv` and `fo` are finite. `faceWidthCm` is frozen after 30 frames.

**WP7 — Peekr.**

1. Box and `kps` equal Peekr's `B`/`C` functions, copied from the bundle into
   `tests/reference/peekr-boxes.js` with its MIT notice, applied to legacy-equivalent mirrored
   landmarks.
2. The ORT session (onnxruntime-web in Node, 1 thread) gives finite, deterministic output.
3. The BGR tensor layout matches on a synthetic RGBA fixture.

**Landmark fixture.** `tests/fixtures/landmarks/face-01.json` (478 points, blendshapes, matrix,
frame size) is produced once by `tests/e2e/make-landmark-fixture.spec.ts` from the fixture face
in Chromium (WP4) and committed. MediaPipe does not run in Node.

### 10.4 Browser end-to-end (Playwright, `tests/e2e`)

**Configuration.**

- `@playwright/test` **1.63.0**; `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, which provides
  Chromium 1243 = Chrome for Testing 153 [C]. No download.
- `webServer: node scripts/serve-dist.mjs`. It emulates `.htaccess`: MIME types, `.wasm.gz` with
  `Content-Encoding: gzip`, CSP and Permissions-Policy headers, and 404 for unknown paths.
- Launch arguments:
  ```
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
  --use-file-for-fake-video-capture=tests/fixtures/generated/face.mjpeg
  --use-angle=swiftshader --enable-unsafe-swiftshader --autoplay-policy=no-user-gesture-required
  ```
- If WebGL is unavailable in the headless shell, use `channel:'chromium'` (new headless).

**Fake camera.** `scripts/make-fake-video.sh` (ffmpeg) turns
`tests/fixtures/face/portrait.jpg` into a 12 s, 640×480, 30 fps MJPEG with a slow zoom and pan.

- The source image is a **public-domain US-government portrait**: a NASA official astronaut
  portrait from Wikimedia Commons tagged PD-USGov-NASA. It is downscaled to ≤ 150 KB, with
  `PROVENANCE.md`.
- The scratch White House photo must **not** be committed, because its reproduction terms are
  restricted (A §9).

**Specs.**

| Spec | WP | Checks |
|---|---|---|
| `smoke.spec.ts` | WP1 | Loads under `/eek-a-calibrate/`. **Every request is same-origin** (`page.on('request')`, including worker requests). No console errors, no `securitypolicyviolation`. A hash-route reload works |
| `vision.spec.ts` | WP4 | Worker host: `ready`, `wasmVariant='module'`, a face within 15 s, finite `FaceObservation`. `?host=inline` gives the same with `wasmVariant='simd'`. Delegate recorded. The `.wasm.gz` responses are `application/wasm` with gzip |
| `engines.spec.ts` | WP6/WP7 | `#/lab` "run each engine on 10 frames": every engine returns `ok` on at least 3 frames, with backend and ms recorded. `?force=cpu` path for BlazeGaze |
| `flow.spec.ts` | WP8 | `?e2e=1&speed=4&preset=quick&engines=all`: injected geometry; Quick calibration and validation complete; the results table has a row for every available engine plus Combined; fit time is logged. Accuracy is **not** asserted, because the fake face does not look at the targets |
| `live-data.spec.ts` | WP9 | Live dot renders. Drift check runs. The export zip parses and validates (headers, YAML keys, `session.json` schema). IndexedDB profile saved → reload → restore forces VAL6 |
| `failures.spec.ts` | WP10 | No camera permission (a context without the grant) shows the right message. A fullscreen exit simulated through `__eek` aborts the block. A tampered model hash (served by a test route) marks only that engine unavailable. A worker crash (`__eek.crashWorker()`) recovers |

### 10.5 Build checks

`npm run check` (§8.2) is green before every commit.

CI (`check-build.yml`) runs:

1. Node 22, `npm ci`;
2. `npm run check`;
3. `npx playwright install --with-deps chromium`, then `npm run test:e2e`;
4. gitleaks.

### 10.6 After deploy, and manual checks

**After deploy:** the curl checks of §9 (WP10).

**Manual checklist** in `docs-dev/manual-verification.md`. It needs a real webcam, so it falls
to the owner under the house deferral rule:

- Chrome, Edge, Firefox and Safari on desktop; iOS Safari; Android Chrome.
- Glasses and none; lighting changes; 40, 60 and 80 cm; head movement; a low-end laptop.
- Record frame rate per engine and backend, validation per engine, and the selected estimator.
- **No accuracy figure is published in the UI or docs until this has been done**
  (anti-fabrication).

---

## 11. Work breakdown

**Common rules for every work package.**

- Each WP is one prompt file `docs-dev/agent/prompts/0NN_<name>.md`. WP1 creates all ten from
  this section, so numbering is fixed.
- One commit per WP, to **`main`**, with the **exact prompt filename** as the message. Run
  `git pull --rebase` before pushing; never force-push.
- A WP touches only the files it owns (§5). Contracts (§6), `constants.ts`, `package.json` and
  the lock file belong to WP1. Changing them requires an explicit note in the WP report and a
  spec version bump.
- `npm run check` must pass before the commit.
- Each WP ends with the house five-section report: Work done, Files changed, Scope deviations,
  Open issues, Human actions required.
- British English throughout.

**Dependency graph.**

```
WP1 ─┬─> WP2 ─┐
     ├─> WP3 ─┤
     ├─> WP4 ─┼─> WP8 ─> WP9 ─> WP10
     ├─> WP5 ─┤      (WP9 setup screens may start once WP4 has landed)
     ├─> WP6 ─┤
     └─> WP7 ─┘
```

### WP1 — `001_scaffold_and_contracts.md` (sequential, first)

**Goal.** A buildable, deployable shell, with every contract, dependency, asset and check in
place.

**Deliverables.**

- House files: AGENTS.md (eek-a-look's, with project conventions: British English; commit and
  push to `main`; verify `npm run check`; tests per §10; base `/eek-a-calibrate/`; hosting via
  `deploy-eek-a-calibrate.yml`; a push does not deploy), CLAUDE.md, README.md.
- docs-dev skeleton, with this spec as `specification.md` v0.1, `plan.md` (= §11) and
  `current_state.md`.
- `package.json` with **all** dependencies pinned (§3.1), and the lock file.
- tsconfig, vite.config, index.html (canonical link), `.htaccess`, `config/headers.mjs`.
- `assets-manifest.json`, the committed models (§3.1) with LICENSE and PROVENANCE.
- Every script in §5.
- CI workflow; Playwright config; the fixture face and `make-fake-video.sh`.
- `src/core/types.ts`, `src/core/constants.ts`, `src/engines/types.ts`,
  `src/vision/protocol.ts`, `src/engines/registry.ts` (dynamic loaders pointing at stub
  `index.ts` files that return `probe → {ok:false, reason:'not implemented'}`) and
  `src/engines/mappers.ts` (aggregating stub `mappers.ts` that export `[]`).
- App shell: router, state, dom helper, strings, style tokens, and placeholder screens for every
  route in §7.
- `tests/e2e/smoke.spec.ts`.
- Create and push `main`.

**Acceptance criteria.**

- `npm ci && npm run check` passes.
- `dist/` contains `vendor/mediapipe-0.10.35/*` (three pairs) with `.wasm.gz`, the TF.js WASM,
  the ORT `?url` assets with `.gz`, and the models, with no `.map` files.
- `verify-assets` passes, and fails on a tampered hash (checked by hand once).
- `serve-dist` serves `.wasm.gz` as `application/wasm` + gzip, and the CSP header.
- `npm run test:e2e -- smoke` passes.
- `git log origin/main` shows the commit.

### WP2 — `002_core_maths.md` (parallel)

**Owns.** `src/core/maths/*`, `src/core/filters/*`, `tests/unit/maths-*.test.ts`,
`tests/unit/filters-*.test.ts`.

**Deliverables.** Everything in §4.8.2, §4.8.3 (generic, per-mapper-agnostic: standardise with
floors and PCA, ridge fit, grouped LOO, Huber and hard rejection, leverage) and §4.9 (simplex
solver, nested CV helper), plus One Euro, blinkHold, mulberry32, Fisher–Yates, robust stats and
Wilcoxon.

**Acceptance.** The §10.1 WP2 list passes; grouped LOO matches brute force to 1e-9; a fit of
1,500×72 with 13 groups and 10 λ takes < 300 ms in Node.

### WP3 — `003_geometry_metrics_export.md` (parallel)

**Owns.** `src/core/geometry/*`, `src/core/metrics/*`, `src/core/events/*`,
`src/core/export/*`, their tests, `tests/fixtures/eek-a-gaze/`.

**Deliverables.** §4.4 and §4.5 (formulae and `DistanceTracker`), §4.12, §4.14, §4.16.

**Acceptance.** The §10.1 WP3 list passes, including the eek-a-gaze reference at 1e-9 and
byte-identical CSV and zip output.

### WP4 — `004_capture_and_vision.md` (parallel)

**Owns.** `src/platform/{camera,frameClock,fullscreen,capabilities,assets}.ts`, `src/vision/*`
(protocol.ts excepted), `src/core/face/*`, `src/app/screens/lab.ts`, `tests/e2e/vision.spec.ts`,
`tests/e2e/make-landmark-fixture.spec.ts`, `tests/fixtures/landmarks/face-01.json`.

**Deliverables.**

- §4.1–§4.3.
- `WorkerHost` and `InlineHost` with automatic fallback.
- The `FrameImage` ROI and crop.
- Engine orchestration in the worker: load the selected `EngineModule`s, run `extract`
  sequentially per frame, isolate errors per engine, time each stage.
- The probe.
- Lab diagnostics, with a pluggable crop-renderer hook for the engines.

**Acceptance.**

- `vision.spec.ts` passes on both hosts.
- The fixture JSON is committed.
- The §10.1 WP4 units pass.
- The stub engines report `not implemented` without breaking the frame loop.

### WP5 — `005_geometric_and_eyepixel_engines.md` (parallel)

**Owns.** `src/engines/geometric/*`, `src/engines/eyepixel/*`, `tests/sim/faceSim.ts`,
`tests/sim/geometric-*.test.ts`, `tests/unit/engine-geometric*.test.ts`,
`tests/unit/engine-eyepixel*.test.ts`.

**Deliverables.**

- §4.6.1 and §4.6.4 extractors: pure functions plus an `EngineModule` wrapper.
- Mapper specs: `geo-linear`, `geo-quadratic`, `pix-ridge`, `pix-webgazer`.
- The simulation generator (§10.2).
- The mirror-pair test.

**Acceptance.** The §10.1 WP5 list and the WP5 simulation test pass; both engines return `ok`
in `#/lab` (checked through `engines.spec.ts` once WP6 and WP7 land, otherwise by a local run).

### WP6 — `006_blazegaze_engine.md` (parallel)

**Owns.** `src/engines/blazegaze/*` (including `vendor/`), `src/engines/runtimes/tfjs.ts`,
`tests/parity/blazegaze-*.test.ts`, the BlazeGaze part of `tests/e2e/engines.spec.ts`.

**Deliverables.**

- §4.6.2: vendoring with `UPSTREAM.md`, composite strip, model split, backend chain
  (`setWasmPaths` with the `.gz` URLs), progress, `resetSession`.
- Mapper specs: `prior-affine`, `prior-ridge-pose`, `emb-ridge`.
- A strip crop renderer for `#/lab`.

**Acceptance.** §10.3 WP6 (bit-identical strip; split |Δ| < 1e-5); the e2e engine returns `ok`;
no third-party request.

### WP7 — `007_peekr_engine.md` (parallel)

**Owns.** `src/engines/peekr/*`, `src/engines/runtimes/ort.ts`, `tests/parity/peekr-*.test.ts`,
`tests/reference/peekr-boxes.js`, the Peekr part of `engines.spec.ts`.

**Deliverables.**

- §4.6.3: ORT via `?url` with `.gz`, crops via `FrameImage.crop`, BGR tensors.
- Mapper specs: `prior-affine`, `prior-ridge-pose`.
- A crop renderer for `#/lab`.

**Acceptance.** §10.3 WP7 passes; the e2e engine returns `ok`; no third-party request (Peekr's
Azure URL is never referenced).

### WP8 — `008_calibration_fit_validation.md` (after WP2–WP5; uses WP6 and WP7 if present)

**Owns.** `src/core/protocol/*`, `src/core/calibration/{dataset,prune,fitEngine,stack,select,estimator,restore}.ts`,
`src/fit/*`, `src/app/screens/{calibrate,validate,results}.ts`,
`src/app/components/{stimulusCanvas,target,poseGuide,metricTable,targetPlot}.ts`,
`tests/unit/protocol-*.test.ts`, `tests/unit/calibration-*.test.ts`, `tests/sim/pipeline.test.ts`,
`tests/e2e/flow.spec.ts`.

**Deliverables.**

- §4.7–§4.10: schedules and layouts; the stimulus with rAF onsets; the recorder and labelling;
  gating; pruning; lag; dataset building; per-engine candidate fitting; stacking; selection;
  head range; estimators.
- The fit worker with progress.
- Validation scoring (calls WP3); the results screen.

**Acceptance.**

- §10.1 WP8 and §10.2 WP8 pass.
- `flow.spec.ts` passes.
- `fitMs` ≤ 15 s logged in e2e (headless figures are informational).
- The results table shows every available engine plus Combined, with the selection reason.

### WP9 — `009_setup_live_data_screens.md` (after WP8; setup screens may start after WP4)

**Owns.** `src/app/screens/{welcome,camera,screen,distance,live,data,about}.ts`,
`src/app/components/{qualityMeter,gazeDot,banner,progress,cardMatch,blindSpot}.ts`,
`src/core/calibration/drift.ts`, `src/platform/storage.ts`, `docs/{usage,methods,engines,privacy,export-format,troubleshooting}.md`,
`tests/unit/drift-*.test.ts`, `tests/e2e/live-data.spec.ts`.

**Deliverables.**

- §7 screens 0–3 and 7–9; the device probe and run-set decision.
- §4.11 Live filtering and display; §4.13 drift; §4.15 persistence; export UI over WP3.
- `docs/` pages, where every numeric claim carries a source or is labelled heuristic.

**Acceptance.** `live-data.spec.ts` passes; drift unit tests pass; About lists every engine
with licence and citation; no unsourced accuracy claims (grep review).

### WP10 — `010_integration_and_deploy.md` (last)

**Owns.** `tests/e2e/failures.spec.ts`, `docs/deployment.md` (final), `docs-dev/planning/current_state.md`,
`docs-dev/manual-verification.md`, and the eelkedevries.com changes (§9).

**Deliverables.**

- Full `npm run check:all` green; fixes for any integration defects in the owning files, with
  each fix noted.
- The eelkedevries.com commit; the dispatch; the live verification of §9.
- The manual checklist.

**Acceptance.**

- `https://eelkedevries.com/eek-a-calibrate/` returns 200 with the built `assets/index-*.js`.
- `.wasm.gz` is served as `application/wasm` with `content-encoding: gzip`.
- The CSP header is present.
- `deploy-eek-a-calibrate.yml` has a successful run.
- The main-site `scripts/deploy.sh` contains the protect line.
- The final report lists the camera checks still to be done by hand.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| No engine's accuracy is verifiable here (no real camera) | The app's own validation is the only source of figures. The UI shows sourced ranges only. Manual checklist; anti-fabrication rule |
| The BlazeGaze port's preprocessing diverges from training | Bit-exact strip parity; upstream function boundaries kept; `UPSTREAM.md`; `#/lab` strip view; CV and Auto fall back to other engines |
| The Peekr landmark source differs (legacy FaceMesh v. tasks-vision) | Mirror pairs verified; exact `B` parity; the affine mapper absorbs small shifts; Auto protects users |
| MediaPipe in a module worker fails on some browsers | Verified loader path [C]; `InlineHost` fallback with a 20 s timeout; e2e on both hosts |
| Weak devices: all engines at once is too slow | Probe and run-set ladder; back-pressure dropping; effective rate reported; Quick preset; 640×480 rung |
| Optimistic CV or selection bias | Location-blocked exact LOO; one-SE rule; 5 % Combined rule; validation never used for selection; switching note |
| Head-pose and distance error dominate [LIT §5.4] | Depth-correction feature; head-motion block; pose covariates; degree-space regression with per-frame distance; head-range gate; Thorough at two distances |
| Drift | 5-minute checks, offset correction, spread recalibration anchors |
| Viewport, window or DPR change silently invalidating the mapping | Fullscreen; invalidation; geometry in the profile key; forced drift check |
| Hosting: MIME types, gzip, stale cache, main deploy deleting the folder | `.htaccess`; versioned and hashed paths; `.gz` → plain retry; protect line before the first dispatch; wait for older runs; curl checks |
| Telemetry or CDN calls creeping in | Exact 0.10.35 pin; enforced CSP `connect-src 'self'`; dist URL allowlist; e2e same-origin assertion |
| TF.js unmaintained since 4.22 | Confined to `runtimes/tfjs.ts` and `blazegaze/runtime.ts`; phase-2 ONNX conversion with parity gating |
| Licence caveats (weights trained on research datasets; Peekr's data provenance) | Disclosed in About and NOTICE; non-commercial research use; no GPL or NC-only code shipped |
| Parallel agents colliding | Disjoint ownership; frozen contracts; `pull --rebase`; WP1 owns `package.json` |

---

## 13. Phase-2 backlog (not in v1)

1. saccade.js engine behind WebGPU detection: `navigator.gpu.requestAdapter()`, then
   `onnxruntime-web/webgpu`, with a ≤ 25 ms probe.
2. BlazeGaze head adaptation (Adam on 8,610 parameters in TS) as a candidate, under 5-fold
   grouped CV.
3. Peekr embedding outputs through a reproducible ONNX edit (`tools/models/peekr_expose.py`,
   exposing `/Concat_output_0`, 1,040-d [C]).
4. GP or kernel-ridge local residual correction (2-D, degree space), accepted only with a CV gain
   of at least 5 %.
5. COOP/COEP plus threaded WASM, after a live header test.
6. Webcam clip record and deterministic replay for real-gaze regression tests.
7. Genuine WebGazer as an opt-in GPL comparison; MobileGaze yaw/pitch as a WebGPU feature.
8. A one-line eek-a-gaze change to treat a `time_ms` column as milliseconds (in that repository).

---

## 14. Amendment v0.2 (1 November 2026): optional geometry and smartphone support

Requested by the owner after v0.1: screen size and viewing distance must not be mandatory, and
the app should also work with smartphone cameras. **Where this section conflicts with an earlier
section, this section wins.**

### 14.1 Screen size and viewing distance are optional

Calibration fits a personal mapping from camera features to screen positions; it needs neither
the physical screen size nor the viewing distance. Both only make the *degree* figures exact.

1. **Default flow:** Welcome → Camera → Calibrate → Validate → Results → Live → Data.
   `#/screen` and `#/distance` are **not** steps of the default flow. They are offered as one
   optional action, "Measure screen and distance (optional; makes degree values exact)", on
   Welcome (under Advanced), on Results and on Data. Nothing waits for them; at most one
   dismissible hint appears on Results while degrees are approximate.
2. **Without measurement:** `pxPerMm = ASSUMED_PX_PER_MM` (`pxPerMmSource = 'assumed'`) and
   `f_px = (max(videoW, videoH)/2) / tan(DISTANCE.assumedHfovDeg/2)` — the assumed field of view
   applies to the **long side** of the delivered video, so portrait video is handled
   (`focalSource = 'assumed-fov'`). `degreesApproximate = true`. Per-frame distance compensation
   still works, because it depends on `D_t / D_ref`, in which `f_px` cancels.
3. **Measuring after calibration does not invalidate the fit.** Each estimator keeps converting
   with the geometry it was fitted under, stored as `FitResult.fitGeometry`. Reports re-derive
   degrees from the (unchanged) pixel predictions and targets with the new geometry, and
   validation is re-scored from the stored validation frames. Pixel results never change.
4. **Reporting while approximate:** Results, Live and Data show **pixels and % of the screen
   diagonal first**; degrees are shown with "≈" and the note "assumes 96 CSS px per inch and a
   typical camera field of view; measure screen and distance for exact values". The verdict uses
   the % of diagonal thresholds (§4.12, already specified).
5. **Setup meters:** the 450–850 mm distance band is shown only when distance has been measured;
   otherwise distance guidance uses the face-width fraction alone.
6. **Export:** `geometry.yaml` keeps its keys with the assumed values; `session.json` records the
   sources, and `README.txt` states that degree values are approximate when geometry was assumed.

### 14.2 Smartphones and tablets

Targets: current Android Chrome and iOS/iPadOS Safari (17 or later), front camera, portrait and
landscape. Desktop behaviour is unchanged except where noted.

1. **Device class.** `mobile = matchMedia('(pointer: coarse)').matches &&
   min(screen.width, screen.height) <= MOBILE.maxShortSidePx` (heuristic); recorded in
   `session.json`.
2. **Camera.** `facingMode: 'user'`. On mobile the ladder is `CAMERA_LADDER_MOBILE`
   (960×540, then 640×480), then `{video: true}`. **Never assume landscape video**: portrait
   frames (for example 480×640) are normal; all code uses the delivered `videoW`/`videoH`. A change
   of track settings (phones may switch resolution on rotation) is treated as a camera change.
3. **Orientation.** A calibration is valid only for the orientation and viewport size it was
   made in (the profile key already contains `W×H`). An orientation change pauses the active
   block (and aborts it, as a resize does); in Live the dot greys out with "Rotate back to the
   orientation you calibrated in, or recalibrate". Where supported (Android in fullscreen),
   `screen.orientation.lock(<current>)` during calibration and validation; failure is ignored.
4. **Fullscreen or viewport mode** (`platform/presentation.ts`). Use element fullscreen where
   available. Where it is not (iPhone Safari), use **viewport mode**: a `position: fixed;
   inset: 0` stage sized to the visual viewport at block start, with `touch-action: none`,
   `overscroll-behavior: none` and no text selection. In viewport mode, visual-viewport size
   changes of at most `MOBILE.viewportToleranceFrac` of either dimension (browser bars) are logged
   and tolerated; larger changes and orientation changes abort the block. `NOT_FULLSCREEN` is not
   set in viewport mode; `ScreenGeometry.presentationMode` records which mode was used. In
   `?e2e=1` both modes remain testable.
5. **Safe areas.** `index.html` uses `width=device-width, initial-scale=1, viewport-fit=cover`.
   Normalised layout coordinates map into the **safe rectangle** (viewport minus
   `env(safe-area-inset-*)`, measured with a probe element) so that no target, pursuit path or
   button lies under a notch, camera cut-out or home indicator. One function,
   `layoutToPx(xNorm, yNorm, geometry)`, is used by the stimulus, labelling, metrics and export;
   `ScreenGeometry.insets` stores the insets.
6. **Wake lock.** `navigator.wakeLock.request('screen')` during camera setup, calibration,
   validation and Live; re-acquired when the page becomes visible again; ignored if unsupported.
7. **Touch.** Every keyboard action has a touch equivalent with a target of at least
   `MOBILE.minTouchPx` CSS px: tap anywhere on an instruction card to continue; small Pause and
   Abort buttons in a screen corner during blocks, never at a target position; a large "It
   disappeared" button in the blind-spot test. No hover-only interface.
8. **Instructions.** On mobile: "Prop the phone up, or hold it steadily at eye level, about
   30–40 cm from your face (heuristic). Keep the same orientation throughout." Copy never
   requires the camera to be above the screen: on phones and tablets it may be at the top or the
   side.
9. **Performance.** iOS uses the CPU delegate (§4.2). The probe and run-set rule (§7) applies
   unchanged; on mobile the warning threshold is `MOBILE.warnMs`. Live shows the effective frame
   rate.
10. **Head and hand motion.** On a hand-held phone what matters is the face pose relative to the
    device; the head-motion block and the pose covariates cover it. No device-motion sensors are
    used.
11. **Tests.** WP10 adds `tests/e2e/mobile.spec.ts`: Playwright emulation of a phone (`isMobile`,
    `hasTouch`, portrait viewport) with a portrait fake video (`scripts/make-fake-video.sh
    --portrait`, 480×640). The Quick flow completes by taps without element fullscreen, targets
    lie inside the safe rectangle, and an orientation change pauses and invalidates.
12. **Manual checklist** adds iPhone Safari and Android Chrome in portrait and landscape, propped
    and hand-held.

### 14.3 Contract and constant changes (all additive)

```ts
// src/core/types.ts
export interface ScreenGeometry { /* …v0.1 fields… */
  insets?: { top: number; right: number; bottom: number; left: number };
  presentationMode?: 'fullscreen' | 'viewport'; }
export interface FitResult { /* …v0.1 fields… */ fitGeometry?: SessionGeometry; }
// src/core/constants.ts
export const CAMERA_LADDER_MOBILE = [[960, 540], [640, 480]] as const;
export const MOBILE = { maxShortSidePx: 820, viewportToleranceFrac: 0.12, warnMs: 80, minTouchPx: 44 };
```

`DISTANCE.assumedHfovDeg` now refers to the long side of the video.

### 14.4 Work allocation

- **011** `011_optional_geometry_and_mobile_platform.md` runs **before 008**: §14.3; the mobile
  ladder and a portrait audit of WP3/WP4 code; the long-side focal assumption;
  `platform/presentation.ts` (fullscreen or viewport mode with tolerance, orientation lock, wake
  lock, safe rectangle, `layoutToPx`); the viewport meta; `make-fake-video.sh --portrait`; unit
  tests.
- **008** uses `presentation.ts` and `layoutToPx`, touch controls, px-first reporting,
  `fitGeometry` and re-scoring.
- **009** implements the new default flow, the optional geometry entry points, mobile setup copy
  and meters, wake lock in Live and touch controls.
- **010** adds `mobile.spec.ts` and the manual checklist items.

## 15. Amendment v0.3 (1 November 2026): review findings from 002–007

These decisions follow the independent reviews of packages 002–007. **Where this section
conflicts with an earlier section, this section wins.**

### 15.1 Corrections (already applied on `main`)

1. **BlazeGaze head vector (§4.6.2).** MediaPipe's JavaScript returns the facial transformation
   matrix column-major (the translation is at indices 12–14). Upstream WebEyeTrack's JavaScript
   reads it row-major, so its `hv` is built from Rᵀ, which inverts head yaw and pitch. The model
   was trained by upstream's Python pipeline, where MediaPipe's Python API transposes
   column-major data into a proper `[R | t]` (`matrix.T` when the layout is column-major;
   checked in mediapipe 0.10.14 `face_landmarker.py`), and `get_head_vector` uses that R
   (`scripts/preprocessing/utils.py`). Following the rule of §4.6 (training-time preprocessing
   is never altered), **`hv` follows the Python training formula**. `fo` keeps upstream's
   JavaScript reading, because the Python reconstruction applies Euler angles to `inv(R)` there
   and the two agree. A parity test pins `hv` to an independent re-implementation of the Python
   formula and shows that the transposed reading departs from it by more than 0.1 under a 25°
   head turn.
2. **Blind-spot dot speed before the distance is known (§4.4).** v0.1's "0.25·pxPerMm·10 px/s"
   is 2.5 mm/s, about six times slower than the stated 1.5°/s. It is now 1.5°/s at an assumed
   600 mm (`BLIND_SPOT_ASSUMED_DISTANCE_MM`, heuristic): `600·tan(1.5°)·pxPerMm` px/s.
3. **Worker start-up limit (§4.2).** The 20 s limit counts silence, not download time: every
   `progress` message re-arms it, so a slow (for example mobile) connection that is still
   fetching the WebAssembly and model is not abandoned for the inline host.

### 15.2 Integration rules for 008, 009 and 010

1. **008:** pass a map from frame index to `receivedMs` into `scoreValidation`, or latency
   stays NaN. Apply `maskBlinks` (±1 frame, `core/face/blink.ts`) to each recorded sequence;
   `EyeMeasures.open` is the per-frame rule only. Build the `RowContext` (pose in radians, eye
   midpoint, `lnDistRatio`) for every mapper; the geometric engine's `x` holds only 14 values.
   Pass an explicit CV `score` mask so that hard-rejected rows do not count in the robust CV
   score. Use `withIntercept` and `unpenalised = [0]` with the 002 ridge functions.
2. **009:** `geometryYaml` throws without `D_ref` and `detectEvents` throws when SD₂d is NaN
   (validation without valid data): the export flow must guard both and still produce the rest
   of the zip, recording what was left out in `README.txt`. Export is offered once calibration
   has set `D_ref` (assumed geometry still gives one).
3. **010:** the lab's "run each engine on 10 frames" limit (`src/vision/hostBase.ts`,
   10 s + 1 s per frame) must grow with the measured frame time, so that the CPU BlazeGaze path
   (about 1.5 s per frame) can finish. Add a line to `NOTICE.md` saying that Peekr's
   preprocessing is reproduced from its MIT bundle. Correct the stale comment in
   `src/platform/assets.ts` about where the ORT files come from. Add to the manual checklist: on a
   real GPU, BlazeGaze reports `tfjs-webgl`, its median time is within budget and the lab strip
   shows both eyes; Peekr's per-frame time against its 15 ms budget.

## 16. Amendment v0.4 (1 November 2026): first real-device findings and final-review fixes

The owner's first run on a real Android phone (Chrome) showed the camera checks with face sizes
of up to 3·10²¹ %, centring values of the order of 10¹⁸, glare "NaN %" and head angles jumping
between ±74°, while brightness, backlight and frame rate (24–25 Hz) were sensible. The face box
therefore spanned the whole frame: some landmarks were far outside it, and the transformation
matrix computed from them was corrupt. Headless tests had not shown this, because the GPU is
only emulated there. **Where this section conflicts with an earlier section, it wins.**

### 16.1 Implausible landmarks and the delegate

1. **Plausibility check** (`core/face/plausibility.ts`), on every landmarker result: all
   landmark coordinates finite; x and y within [−0.5, 1.5]; |z| ≤ 1; mesh bounding box between
   0.02 and 2 in each dimension; matrix (when present) finite, last row (0, 0, 0, 1) within
   10⁻³, rotation column norms within [0.5, 2] and pairwise |cos| ≤ 0.15. An implausible result
   is discarded (the frame has no face) and logged; it never reaches meters, engines or
   calibration.
2. **Automatic switch:** on the GPU delegate, 3 consecutive or 5 cumulative implausible results
   rebuild the landmarker on the CPU delegate (logged; the host reports the new delegate).
3. **Default delegate:** CPU on phones and tablets (iOS, iPadOS and **Android**), GPU elsewhere
   with the check above. `?delegate=cpu|gpu` overrides. Rationale: the CPU delegate took a median
   30 ms per frame against 163 ms for the software-emulated GPU in headless Chromium here; on
   phones its speed must still be confirmed (manual checklist).
4. **Test mode** (`?e2e=1`) defaults to the CPU delegate, so that end-to-end tests run at
   realistic frame rates instead of about 3 Hz.
5. **Meters:** a non-finite reading (for example glare without eye pixels) shows "—" and is
   neither fine nor a fault.

### 16.2 Final-review fixes

These decisions follow the independent reviews of the integrated app (`main` at `1051d0e`).

#### 16.2.1 Validation metrics on devices slower than their camera, and small samples (§4.12, §4.8.6)

The vision host takes one frame at a time (§4.2), so a device whose per-frame time exceeds the
camera's frame interval refuses a share of the frames: a steady per-frame time between one and
two frame intervals (33–67 ms at 30 fps, which includes the 45 ms run-set budget of §7) refuses
every second frame, and a median just below one interval still refuses some frames whenever a
frame takes longer than that. Under v0.3 those frames counted as data loss, broke every RMS-S2S pair and failed the
pursuit acceptance rule, so such a device scored `poor` at any accuracy, could never reuse a
stored profile (§4.15 requires `acceptable`), had no precision figure or areas-of-interest
advice, and always used the fallback lag. Compute is now kept apart from data quality:

1. **Data loss** = 1 − valid / basis, per target and pooled (Σ valid / Σ basis), with
   basis = sampleMs/1000 × min(nominal fps, r). r, the rate the host sustained, is the median
   over target windows longer than zero of processed frames per second of window. A median, so a
   stall within one target still counts as loss there; when nothing was processed (r = 0), the
   nominal rate is used and everything is lost. The funnel keeps `expected` at the nominal rate
   (§4.12 table), so `dataLossPct` is no longer 1 − valid/expected; the effective rate reports
   the slowdown. Because r counts the frames the host processed, frames that the camera did not
   deliver at its nominal rate lower r as well and are not data loss either. No contract
   changes: `Funnel` and `ValidationReport` are as in §6.
2. **RMS-S2S** pairs consecutive valid samples with Δt ≤ 1.5 × the median interval between
   consecutive **processed** (not `DROPPED`) frames, so only a missing processed frame breaks a
   pair.
3. **Pursuit lag (§4.8.6 step 4).** The 50 % rule is accepted / processed pursuit frames outside
   the hold and discard: frames labelled `dropped` are left out.
4. **BCEA₆₈ and ρ need at least three samples** (`BCEA_MIN_SAMPLES = 3`): with two, the sample
   correlation is exactly ±1 and the area would read as a perfect 0. SD keeps n ≥ 2. Below three,
   the target's BCEA is NaN (shown as a dash) and is left out of the pooled median.
5. With items 1 and 2, RMS-S2S lacks a value only when no target has two consecutive valid
   processed samples. The areas-of-interest advice stays **0** then (§4.12: "0 if none"; the
   `aoiGrid` type is unchanged), which is the cautious reading of such data.

#### 16.2.2 A quick recalibration drops the validation run (§4.13)

"Any recalibration invalidates the previous validation" covers the stored validation run as
well as the reports: after `RECAL5` and the refit, the session's current validation run is
cleared together with `validation`. Results then says that the calibration in use has not been
validated yet and links to Live, which requires the `VAL6` revalidation; it never re-scores the
earlier run with the new fit. The export keeps the session's first validation (scored with the
first fit) and leaves `events.csv` out until a validation of the fit in use exists (§15.2.2).

#### 16.2.3 Frame clock: no snapshot for a busy host (§4.1)

`FrameSink` gains an optional `readonly busy?: boolean` (`ManagedVisionHost.busy`). When it is
true and no `tap` needs every frame (only `#/lab` has one), the clock makes no `ImageBitmap`: the
frame is counted as `dropped` and reported through `onFrame(meta, false)` at once, exactly as a
refused frame. Otherwise the §4.1 sequence (`createImageBitmap`, then `submit`, which may still
refuse) is unchanged.

#### 16.2.4 Static engine specs (§5, §6)

Each engine's `EngineSpec` literal moves to a pure `src/engines/<id>/spec.ts` (DOM-free, the
same layer as `mappers.ts`), which `index.ts` exports unchanged as `EngineModule.spec`.
`src/engines/specs.ts` collects them as `ENGINE_SPECS: Readonly<Record<EngineId, EngineSpec>>`.
The main thread reads names, licences, sizes and feature versions from that table (Welcome,
About, the export, and `fitRecording`'s default `featureVersions`) instead of importing the
engine modules through `ENGINE_LOADERS`, which stays the only way to load engine code.
`BG_FEATURE_VERSION` moves to `engines/blazegaze/mappers.ts` beside the layout constants
(`preprocess.ts` re-exports it), so the BlazeGaze spec does not pull in `ml-matrix`. The frozen
§6 contracts are unchanged.

## 17. Amendment v0.5 (4 November 2026): the game-first interface

The owner asked for a new interface: optimised for smartphone cameras (portrait) and webcams
(landscape); modern and clean, in the eek-a-style design system; **no horizontal or vertical
scrollbar on any screen at any supported size**; easy for people who know nothing about eye
tracking; organised from the first screen as a game, with calibration as its warm-up levels; and
the position of the phone or camera (distance, angle, framing, tilt, light) signalled
continuously, especially on phones. The design that answers this, "Pop with your eyes", is in
`docs-dev/reference/secondary_background/interface-design-v2/`. This section adopts it and
records what it changes in the earlier sections. **Where this section conflicts with an earlier
section, this section wins.**

### 17.1 Adoption and precedence

1. **Binding interface documents.** From v0.5 these files are part of the canon by reference,
   although they stay where they are:
   - `interface-design-v2/design-spec.md` (version 2, 4 November 2026; cited below as
     "design §n");
   - `interface-design-v2/spec-core.md` and `interface-design-v2/shared.css` (tokens and
     component CSS);
   - the boards `interface-design-v2/canvas/*.dc.html` (exact markup, CSS and SVG) with their
     renderings `interface-design-v2/png/*.png` (the visual target), and the per-board briefs
     `interface-design-v2/briefs/*.md`.

   **They are binding for the interface's look, copy and behaviour wherever this section does
   not say otherwise.** `interface-design-v2/research/` and `authoring-guide.md` stay
   non-binding background.
2. **Order of precedence for the interface:** this section, then design-spec.md, then a board
   (a board shows one example state of what design-spec.md describes), then its brief. Every
   number drawn on a board is an example; the app shows the player's real values and never the
   boards' **Example** badge.
3. **The pipeline is not redesigned.** Capture and timing (§4.1), the vision host (§4.2), the
   face front end (§4.3, §16.1), the four engines (§3, §4.6), the protocol blocks, layouts,
   schedules, durations and their order (§4.7), frame acceptance, labelling and weights (§4.7),
   the fit, estimators and selection (§4.8–§4.10), filtering (§4.11), validation metrics and the
   verdict (§4.12, §16.2.1), drift and recalibration (§4.13), events (§4.14), persistence and
   export (§4.15, §4.16), the headers and the rule that no request leaves the origin (§8) all
   stand, except where §17.4–§17.10 amend them. The new interface drives that pipeline; it does
   not reimplement it.

The nine changes that design §9 asks for, and where this section makes them:

| # | Change (design §9) | Here |
|---|---|---|
| 1 | Flow and screens become the game's parts, with new routes (§7) | §17.2 |
| 2 | The target is the bubble: scale-in in the settle window, shrink over the sample window (§4.7) | §17.6.3 |
| 3 | The head block shows four arcs and no pose dot (§4.7) | §17.6.5 |
| 4 | Device motion for the phone tilt check (overrides §14.2.10) | §17.5.4 |
| 5 | Rectangular zones from the validation (columns and rows chosen separately) | §17.7.2 |
| 6 | Stars from the verdict, and challenge stars | §17.7.3, §17.9.5 |
| 7 | The drift check is presented as Re-aim, the quick recalibration as Quick warm-up (§4.13) | §17.8.2 |
| 8 | The set-up chooser (Propped / In hand / Webcam) | §17.4.1 |
| 9 | Challenge rows in the export as `phase: 'game'` (§4.16) | §17.10 |

### 17.2 Flow, screens and routes (replaces the route table and first-run flow of §7)

**First-run flow:** Title → Get ready → Warm-up (four levels in Standard) → Warm-up complete →
Free look → Challenge (three rounds). This replaces the flow of §7 and of §14.1.1 item 1.

| Route | Screen (design §) | Mode (design §2.2) | Boards |
|---|---|---|---|
| `#/` | Title (§2.4) | framed, dark | `Main`, `desktop-title` |
| `#/ready` | Get ready, the ready check (§2.5, §3) | immersive, grey veil | `phone-ready`, `desktop-ready`, `position-signals` |
| `#/warmup` | Level cards, the warm-up levels, "Checking your aim…" (§2.6–§2.11); the Quick warm-up (§2.15) | stimulus, grey | `phone-level1-pop`, `phone-level2-follow`, `desktop-level1-pop`, `desktop-level3-turn`, `phone-landscape-level1` |
| `#/complete` | Warm-up complete (§2.12) | framed, dark | `phone-level-complete`, `desktop-level-complete` |
| `#/look` | Free look (§2.13) | immersive, grey | `phone-free-look`, `desktop-free-look` |
| `#/challenge` | Round cards, rounds, Round complete (§2.14, §5) | stimulus, grey; Round complete framed | `phone-challenge`, `desktop-challenge`, `phone-landscape-challenge` |
| `#/details/<tab>` | The Details sheet (§2.17) opened on `results`, `settings`, `data`, `device` or `about` over the Title (a deep link for researchers) | sheet | — |
| `#/methods` | Methods, the long read (a document page; it may scroll, because it is a document) | document | — |
| `#/screen`, `#/distance` | Measure screen and distance (the card match and blind-spot test of §4.4), opened from Details → Device only, restyled to fit one screen | framed | — |
| `#/lab` | Diagnostics (§7 row 10), opened from Details → Device only, restyled to fit one screen | framed | — |

1. **Expert material lives in the Details sheet** (design §2.17): per-estimator results,
   settings, engines, export, saved data, device readings, measurement, diagnostics and the
   methods. Opening it from a screen never changes the route, so the screen underneath keeps its
   state; it is reached from the top bar of every screen and from the manual Pause card, never
   during a running level otherwise. "Delete all my data" sits in the sheet's footer on every tab,
   which replaces the footer link of §4.15.
2. **Legacy routes.** `#/camera`, `#/calibrate`, `#/validate`, `#/results`, `#/live`, `#/data`
   and `#/about` (and the old Welcome, moved to `#/welcome` when `#/` becomes the Title) stay
   reachable until prompt 018. Then they redirect: `#/welcome` → `#/`; `#/camera`,
   `#/calibrate` and `#/validate` → `#/ready`; `#/results` → `#/details/results`; `#/live` →
   `#/look`; `#/data` → `#/details/data`; `#/about` → `#/details/about`.
3. **Route guards.** A route whose state is missing sends the player to the nearest screen that
   can run: no camera or no ready check → `#/ready` (or `#/` before Play); `#/complete` without a
   scored Test round → `#/ready`; `#/look` and `#/challenge` without a validated fit of at least
   two zones → `#/complete`, or `#/` when there is no fit. A reload inside the fullscreen span
   lands on `#/ready`, because fullscreen needs a tap.
4. **The fullscreen span** (design §2.1). "Start warm-up" starts the presentation of
   `platform/presentation.ts` (element fullscreen, or viewport mode on iPhone, §14.2.4) from its
   tap; it stays on through the warm-up, Warm-up complete, Free look and the challenge, because
   any exit invalidates the fit (§4.7). Screens inside the span, the dark menu screens included,
   render into the presentation stage (the fullscreen element), not into the page outlet. The
   Details sheet opens above it as a modal dialog (top layer).
5. The query parameters of §7 keep their meaning (`preset` pre-selects the warm-up length).
   `?e2e=1&speed=N` divides every new duration as well (level-card countdowns, the hold ring,
   the challenge's dwell, lifetimes and gaps), and `window.__eek` gains read-only hooks per new
   screen. `?target=ring` keeps the §4.7 ring instead of the bubble, for the pilot of §17.12.

### 17.3 Shell, theme and the no-scroll rule (amends §7)

1. **Tokens and components.** `shared.css` is brought into `src/app/style.css`: the eek-a-style
   roles (dark identity by default; light under `:root[data-theme="light"]`, chosen in Details →
   Settings), the theme-independent stage roles (the grey `#808080` stage is never themed), the
   game roles and the component classes. Colour is used only through these role tokens.
2. **Fonts.** Spectral (600), Lexend (400, 500) and JetBrains Mono (400, 500) are self-hosted
   WOFF2 files under `public/fonts/` with their OFL 1.1 licence and a `PROVENANCE.md`, served as
   `font/woff2` (`config/headers.mjs`, `public/.htaccess`); the CSP (`font-src 'self'`) is
   unchanged. If a family cannot be obtained, the token's fallback stack is used and the gap is
   reported; no font is ever loaded from another origin.
3. **The no-scroll rule** (design §4.1, binding): the document never scrolls in either
   direction on any route of §17.2 except `#/methods`; `.app` is `100svh` (with the `100vh`
   fallback) in normal flow; exactly one flexible region (the stage); layouts switch by aspect
   ratio (5/4) and height (480 px), components by container queries; type in `rem`; the fit
   guard ladders of design §4.1 rule 11; the escape hatch of rule 12 (only the panel may scroll,
   and only under enlarged text or zoom). Automated check: for every route and its main states,
   at **360×640, 390×844, 844×390, 1280×650 and 1440×900**, `document.documentElement`'s
   `scrollWidth ≤ innerWidth` and `scrollHeight ≤ innerHeight`, and no visible element extends
   past the viewport. The further sizes of design §4.1 rule 13 and 125 % text are checked in the
   accessibility pass of prompt 018.
4. **Layout templates** per design §4.3 (phone portrait), §4.4 (phone landscape, camera side
   from `screen.orientation.angle`) and §4.5 (desktop), with the safe-area insets of §14.2.5.
5. **The level track** (design §2.3) replaces any step indicator: one node per warm-up level of
   the chosen length plus the star node; states future, current, done, star locked, unlocked and
   current; never gold; hidden on stimulus screens.
6. **Copy.** British English, no em dashes in interface copy, within the budget of design §4.6,
   and the honesty rule of design §7 (a warm-up line never says or implies that looking pops,
   moves or scores anything; only round cards, the round HUD and Round complete credit the
   eyes). Copy moves from the one flat `strings.en-GB.ts` to one module per screen under
   `src/app/strings/`, merged behind the same `t()`.
7. **Touch and keyboard.** Every target is at least `MOBILE.minTouchPx` (44 px); primaries are
   56 px tall on `pointer: coarse` and 48 px on `pointer: fine`; one gold primary per screen at
   most. Keys: Space starts or continues, P pauses, Esc aborts a level as in §4.7 (its touch
   equivalent is Exit in the Pause card) or closes the sheet, D opens Re-aim in Free look; Expert
   mode keeps R (record) and M (marker). Under `prefers-reduced-motion` the rules of design §2.6,
   §2.8 and §5.4 apply.

### 17.4 Title and Get ready (replace §7 rows 0 and 1)

1. **Set-up chooser** (design §2.4): "How are you playing?" with **Propped**, **In hand** and
   **Webcam**, pre-selected from the device class of §14.2.1 (mobile → Propped, otherwise
   Webcam). The choice overrides the device class for copy and position thresholds only
   (design §3.2: In hand relaxes the phone steadiness cue to 30°/s and adds "Hold the phone at
   eye level"); it never changes the camera ladder, the delegate or the protocol. It is
   recorded in `session.json` as `setup` (`propped` | `in-hand` | `webcam`).
2. **Play** asks for the camera only after the tap (permission priming), then, on iOS,
   `DeviceMotionEvent.requestPermission()` in the same gesture (camera first, motion second;
   refusing motion changes nothing visible). A refused camera shows "Camera blocked" with the
   browser-settings guidance and "Try again" on the Title (design §2.16). The wake lock
   (§14.2.6) is held from Play until the player leaves the game, re-acquired when the page
   becomes visible again. Web Audio starts on this tap.
3. **The face model starts downloading when the Title loads** (same origin; its size is shown in
   Details → Device), and its progress is shown before and after Play ("Getting ready… 62 %" in the
   Get ready cue). The host's progress listener is registered before its `init` starts (§17.11), so
   progress is reported from the first byte. A blocking capability gap shows only the blocking
   message in the Play slot.
4. **"Skip warm-up"** appears beside Play only when a stored calibration exists for this screen;
   whether it also matches the camera (§4.15) is checked once the camera is open, and a mismatch
   falls back to the full warm-up with one line of explanation. It runs Get ready, then a
   one-level Test round on `VAL6`; at a verdict of at least acceptable (§4.15) a forced Re-aim
   follows (§4.13) and then Warm-up complete; below acceptable the stored calibration is not
   used, and Warm-up complete offers only the full warm-up.
5. **Get ready** (design §2.5, §3.5, §3.6) is the full position guard over the mirrored
   preview: target oval, live face outline, eye dots, one directional cue, one cue card, the
   status row (Distance · Position · Light), the hold ring over `SETUP.holdMs`, and the *Ready*
   latch that stores *home*. **Start warm-up** is enabled only when *Ready* has latched **and** the
   engines have loaded and the device probe with its run-set rule (§7 row 1, unchanged) has run;
   the probe runs silently once a face is present. "Start anyway" (secondary) appears after 20 s
   without *Ready* while a face is present, never without one; "Make the window larger to play"
   replaces the action when the stage's short side would be under 280 px.
6. The camera screen's meters of §7 row 1 and their `SETUP` thresholds no longer gate the flow:
   the position guard of §17.5 replaces them, and Details → Device shows the readings. The
   eyewear question moves to Details → Settings (Glasses). The camera picker moves to Details →
   Settings (Camera, shown with two or more cameras). "Measure screen and distance" moves to
   Details → Device; it stays optional (§14.1). The mobile instruction text of §14.2.8 gives way
   to the guard's cues; the advised distances of design §3.2 appear in Details → About and
   Device only.

### 17.5 The position guard (new; replaces the §7 camera meters, overrides §14.2.10)

1. **Pure core.** `src/core/position/*` (DOM-free, unit-tested) implements design §3: the
   signals and their smoothing (§3.1), the target ranges per device class (§3.2, every value
   **heuristic**), hysteresis and timing (a new cue persists 300 ms, a shown cue stays 1 s,
   all clear holds `SETUP.holdMs`), the priority order and the single-instruction rule (§3.4),
   the status-row grouping, the *home* reference latched at *Ready* (and again at the start of
   "Lean in"), the tolerances around home during the warm-up, the calibrated head range of §4.10
   after the fit, and the two grades *drifting* and *out* (§3.3). The thresholds live in
   `core/position/thresholds.ts`, not in `constants.ts`.
2. **It is presentation, not gating.** The guard pauses and resumes presentations and shows
   cues; it never changes frame acceptance, rejection codes, labels or weights (§4.7). A block
   paused by the guard behaves as one paused by the face-lost pause of §7 row 4: the interrupted
   item is shown again with its full settle window.
3. **Auto-pause** (design §3.8): *out* for more than 0.5 s or the face lost for more than 0.4 s in
   the warm-up and Re-aim; more than 1 s or 0.7 s in Free look and the challenge. The overlay's
   card, headlines, "Carries on by itself", the resume rule (in range for 1 s, "Back in place")
   and the extra action after 10 s follow design §3.8; three pauses in one level open "Let's fix
   the set-up first" (design §2.6). The **compact glyph** (design §3.7) shows Good, Drifting and
   Lost in the corner cluster and in Free look; words beside it ("nudges") appear only in Free
   look and the challenge.
4. **Device motion (overrides §14.2.10).** On phones and tablets the app reads
   `DeviceMotionEvent` gravity (`accelerationIncludingGravity`) and `rotationRate` for the
   upright angle θ, the in-plane roll (corrected by `screen.orientation.angle`) and steadiness
   (design §3.1, §3.9); `DeviceOrientationEvent` is a fallback only where motion is unavailable.
   It is optional and never blocks: without a sensor or permission the camera-based cues still
   cover phone height and angle. θ and roll are exported as covariates (§17.10). The readings
   never leave the device.
5. **Haptics, sound and speech** (design §3.10) are optional extras and never the only cue:
   `navigator.vibrate` where supported; Web Audio tones generated in the page (no audio files),
   on by default at low volume from the first level card and off on Get ready; "Read instructions
   aloud" (Settings) uses `speechSynthesis` with `lang 'en-GB'` and **only voices whose
   `localService` is true**, so that no text is sent to a speech service; without such a voice
   the setting is unavailable.

### 17.6 The warm-up levels (amends §4.7 presentation; the protocol is unchanged)

1. **Levels per warm-up length** (design §2.11): Quick = Pop the dots (`CAL9`) and Test round
   (`VAL6`); **Standard** = Pop the dots (`CAL13`), Follow the firefly (pursuit), Turn your head
   (`HEAD5`) and Test round (`VAL12`); Thorough = Standard plus "Lean in" (block A′) before the
   Test round. These are the presets of §4.7, shown as levels; blocks, layouts, seeds, order and
   timings are unchanged. "Lean in" re-latches *home* at its start.
2. **Level cards** (design §2.6) open each level: the previous level's steadiness line (design
   §2.6 table, heuristic, from that level's frame-acceptance log only), the track, "Level n of
   N", pictogram, name, rule, hint, a 3 s countdown that starts the level by itself, "Start now"
   (Space or a tap anywhere also starts it) and the Sound toggle. This satisfies §14.2.7's
   "tap anywhere on an instruction card". Under reduced motion the pursuit card offers "Skip this
   level" (§7 allows pursuit to be skipped).
3. **The bubble replaces the §4.7 ring** (design §2.6, §6.1). For a fixation, validation or drift
   item (head-motion items: item 5) with onset t₀, the bubble scales in from 0.6× to its full size
   over the first 150 ms of the settle window and stays static to the window's end; over the sample
   window its radius shrinks **linearly** from full to the core's radius; during any extension (up
   to `maxSampleMs`) it holds at the core's radius; when the item ends it pops (a 150 ms burst),
   outside every sampling window, and the next onset follows. A retried item re-grows. Full
   diameter: 3° from the geometry, clamped to [64 px, 20 % of the stage's short side]; the core is
   the ABC target of §4.7, unchanged (0.6°, at least 14 px; 24 px when the geometry is unknown).
   Under reduced motion the bubble is static at full size and simply disappears. `onsetMs` stays
   the rAF timestamp of the first frame that shows the item, and the drawing (canvas or SVG) stays
   on the one grey stage of `components/stimulusCanvas.ts`. The radius as a function of time is a
   pure, unit-tested function.
4. **Pursuit** is drawn as the firefly (design §2.8, §6.1): the ABC core on a 44 px light disc
   with a faint 300 ms trail; no path ahead is drawn. Path, hold, discard and lag are §4.7.
5. **Head block** (design §2.9): a static bubble (64 px phones, 80 px desktop) and **four arcs**
   whose fills grow with the measured head turn towards each side; the moving pose dot of §4.7 is
   not drawn; one caption chip ("Slowly turn your head", then "Now nod slowly"). The 3-of-4
   sector rule and the 6000 ms limit are §4.7. With **Limited head movement** (Settings) the
   sector targets are halved (±5° yaw, ±3.5° pitch); the setting is recorded in `session.json`.
6. **Stimulus HUD** (design §2.6, §4.3–§4.5): the pip line on the camera edge
   (`role="progressbar"`) and the corner cluster (position glyph and Pause, 44 px) in the corner
   farthest from the camera. The cluster fades out, and takes no pointer input, while a bubble
   or the firefly is within 96 px of it, so no control ever sits at a target position
   (§14.2.7). **Exit** in the Pause card is the abort of §4.7 and §14.2.7 (Esc still aborts on a
   keyboard). Nothing else is drawn: no score, no text, no level name.
7. **Screen changes** (§4.7, §14.2.3–4): an invalidation shows "The screen changed" with "Warm
   up again" (rotation: "Turn the phone back, or warm up again"), design §2.16.
8. **Checking your aim…** (design §2.10) shows the fit worker's progress (§4.8) and the
   validation scoring; after 3 s it adds "Almost there". `FIT_BUDGET_MS` is unchanged.

### 17.7 Warm-up complete: zones, stars, marks and cause

1. **Source.** Everything comes from the Test round and the fit, for the **selected estimator**
   (`FitResult.selection`) in `mode: 'own'`; nothing new is measured.
2. **Zones (rectangular).** `zoneGrid` in `src/core/game/zones.ts` (pure, unit-tested) chooses
   the columns and the rows **separately**: for each axis, the largest n ∈ {1, 2, 3, 4} whose
   smallest half-cell along that axis (as `halfCellDeg` of §4.12, for one axis) is at least
   need = p75 of the per-target accuracy + 2 × RMS-S2S; 0 on that axis when even n = 1 fails or
   need is not finite. The number of zones is cols × rows. **At least two zones unlock the
   challenge.** The square `aoiGrid` of §4.12 and its contract are unchanged and remain the
   advice in Details → Results and `validation.csv`.
3. **Stars** (heuristic, shown under "Rule of thumb"): verdict `good` → 3, `acceptable` → 2,
   `poor` → 1, `not-tracking` or fewer than two zones → 0 (`VERDICT`, Appendix A).
4. **Marks:** a Test-round bubble is a hit (✓) when the mean gaze on it (Ḡ, in px) lies in the
   zone that contains its target, a miss (✗) otherwise, and a miss when it had no valid sample.
5. **Cause** (one line): from the warm-up's frame log and the guard's light readings, the first
   that applies of: face often lost, backlit, too dark, much head movement, glare, too far
   (design §2.12; the thresholds are heuristic).
6. **Outcomes and actions** follow design §2.12 (Great, Good, Rough, Didn't work), with the
   arrival sequence and "Rule of thumb · How we judge this" opening Details → Results. After a
   Quick warm-up (§17.8.3) the primary is "Back to the challenge"; after "Skip warm-up" below
   acceptable, §17.4.4 applies.

### 17.8 Free look, Re-aim and Quick warm-up (replace §7 row 7; §4.11 and §4.13 unchanged)

1. **Free look** (design §2.13): the zones as outlines, the zone of the filtered gaze (§4.11, with
   the drift correction) lit, and a soft disc at the filtered gaze point whose radius is the 68th
   percentile of the selected estimator's per-target Test-round accuracy in px. The disc fades
   with the frame's confidence and greys out, with a dashed edge, outside the calibrated head
   range (`OUT_OF_RANGE`, §4.10). The dock holds "Tracking", "The zone you look at lights up.",
   **Re-aim** (secondary) and **Play the challenge** (primary); bar and dock fade after 3 s
   without input. Live recording with markers, the raw and per-engine dots, the trail and the
   estimator switch of §7 row 7 are kept for **Expert mode** (Details → Settings); Free look is
   recorded only when Expert mode recording is started, as Live was.
2. **Re-aim is the drift check of §4.13** (two bubbles: the centre and one seeded `VAL12`
   location; settle 500 ms, sample 1000 ms), presented as a two-pip mini-level without a card,
   over the screen that offered it (the route does not change, and play resumes where it was).
   It is offered by the triggers of design §2.15 (always in Free look; in a round when the hit
   rate falls below 50 % over the last six bubbles; after more than 10 s in the auto-pause
   overlay; 5 min after the warm-up, the `DRIFT.everyMin` prompt; on a Round complete that went
   badly). A drift check forced by §4.13 (camera, viewport, backend or delegate change, worker
   restart, restored calibration) is a Re-aim the player cannot skip. **Behaviour is unchanged:**
   when |o| ≤ max(2°, 1.5 × validation accuracy) the correction is applied, and the chip reads
   "Your aim was fine" when |o| < 0.5° (heuristic) and "Aim fixed" otherwise; beyond the limit
   the card "Your aim moved a lot" offers the Quick warm-up.
3. **Quick warm-up is the quick recalibration of §4.13** (`RECAL5` with the fixation rules, the
   refit at weight ×2, then the required `VAL6`), shown as two levels ("Pop the dots", 5 bubbles;
   "Test round", 6 bubbles) on `#/warmup` and ending on Warm-up complete with the new zones
   (§16.2.2 applies: the earlier validation is dropped).

### 17.9 The challenge (new)

1. **Pure core.** `src/core/game/*` (DOM-free, unit-tested; parameters in `core/game/params.ts`,
   every value **heuristic**) implements design §5: the board (the safe rectangle minus a 4 %
   margin per axis, split into the zones of §17.7.2, 16 px gutters); bubble size and placement
   (zone centre ± 10 % jitter, never the same zone twice in a row, zones balanced over the round,
   every fifth bubble in the centre zone when both counts are odd, so that a centre zone exists);
   the **leaky dwell** (fills at 1/dwell per second while the lit zone is the bubble's, drains at
   twice that rate outside, resets after 300 ms continuously outside; frames held by the blink hold
   of §4.11 or flagged invalid pause it); the 4 s lifetime, the 500 ms gap and the three rounds
   (Pop! 1000 ms, Mind the spikes 800 ms with a decoy that bonks after 600 ms, Drifters 700 ms with
   drift ≤ 3°/s); scoring, streaks and stars (design §5.5); the per-zone statistics and the Re-aim
   offer rule; all seeded through `mulberry32` so a round is reproducible from its seed.
2. **Gaze input** is the selected estimator's filtered, drift-corrected gaze (§4.11, §4.13),
   snapped to a zone. There is no gaze dot on the board (design §5.2).
3. **The challenge as a quality check** (design §5.6): each pop stores the target, zone, time to
   pop and the median filtered gaze over the last 400 ms. Consistent offsets in at least three
   zones (resultant length ≥ 0.6 and a mean offset above a quarter of a zone) give a global
   offset correction for the next round. That gaze is already drift-corrected, so the offset
   (converted to degrees) is **added** to the selected estimator's correction in use, never put
   in its place as a drift check's offset is (§4.13 measures on uncorrected gaze); it is not
   applied when the resulting correction would exceed the §4.13 limit. It is logged in the drift
   log with source `game` and announced on Round complete ("We corrected a small shift.").
4. **Screens** follow design §2.14: round cards ("Round n of 3", rule, hint, "16 bubbles · about
   1 minute", countdown, Sound), the board with the pip line, the score chip and the corner
   cluster with nudges, and Round complete (zone map with per-zone pops and marks, Replay of the
   smoothed gaze trail, stars, headline, one sentence, the score line, and the actions per
   outcome). Pause and auto-pause freeze the round (lifetime and dwell held); a screen change
   ends it ("The screen changed").
5. **Challenge stars** (heuristic, per round): 1 at ≥ 50 % popped, 2 at ≥ 75 %, 3 at ≥ 90 % with a
   median time to pop ≤ 1.6 s. The best score is kept per zone set on the device (§17.10).

### 17.10 Export and persistence additions (amend §4.15 and §4.16)

1. **Challenge rows** (`phase: 'game'`). Every round played is recorded like a Live block and
   exported:
   - `samples.csv`: trial `game-<nnn>` (one per round, numbered from 001 in the session),
     phase `game`, `item_id` the bubble's id, `target_x`/`target_y` the bubble's centre at that
     frame (a drifter moves);
   - `targets.csv`: one row per bubble with phase `game`;
   - **`game.csv`** (new): one row per bubble or decoy, with trial, round, round name, id, kind
     (`bubble` | `decoy`), zone column and row, x/y px, onset and offset ms, outcome (`popped` |
     `missed` | `bonked` | `ignored`), time to pop ms, score change, streak, and the offset of the
     median filtered gaze over the last 400 ms (px);
   - `session.json`: the set-up choice, the warm-up length, Limited head movement, the motion
     permission state, the guard's pauses per level with their reasons, the zones, stars and
     marks of each Warm-up complete, each round's seed, score, stars and per-zone statistics,
     and the offset corrections; `README.txt` lists `game.csv`.
2. **Tilt covariates.** `samples.csv` gains two trailing columns, `device_tilt_deg` and
   `device_roll_deg` (θ and roll of §17.5.4; empty when unavailable), **after** the per-engine
   columns, so the column order that eek-a-gaze reads (§4.16) is unchanged.
3. **Persistence.** IndexedDB `eek-a-calibrate` becomes **version 2**: the upgrade keeps the
   v1 stores and adds `prefs` (theme, sound, speech, warm-up length, set-up choice, Limited head
   movement, Expert mode) and `scores` (the best score per zone set: a 1 × 2 board is never
   compared with a 3 × 2 board). "Delete all my data" clears both. No image or video is ever
   stored (unchanged).

### 17.11 Contract changes (all additive)

```ts
// src/core/types.ts
export type Phase = 'fixation' | 'pursuit' | 'head' | 'validation' | 'drift' | 'game';
export interface RecordedFrame { /* …v0.4 fields… */
  deviceTiltDeg?: number | null;   // phone upright angle θ (0 flat, 90 vertical), §17.5.4
  deviceRollDeg?: number | null; } // in-plane roll, corrected for screen.orientation.angle
// src/vision/protocol.ts
export interface HostHooks { onProgress?(asset: string, loaded: number, total: number): void; }
export declare function createVisionHost(cfg: VisionConfig, prefer?: 'worker' | 'inline',
  hooks?: HostHooks): Promise<VisionHost>;   // hooks are registered before init starts
```

`src/core/constants.ts`, `src/engines/types.ts`, `FitResult`, `ValidationReport` (including
`aoiGrid`) and the remaining §6 contracts are unchanged. App-level types (`Settings` in
`app/state.ts`, the export input types in `core/export/*`) grow as the prompts need; they are not
frozen contracts.

### 17.12 Tests and checks (amend §10)

1. **Unit** (`node --test`): `core/position/*` (priority order, hysteresis, timing, home,
   grades, per-class thresholds, tilt from gravity), the bubble timeline, the steadiness line,
   `zoneGrid`, stars, marks and cause, `core/game/*` (placement, leaky dwell, lifetimes, decoys,
   drifters, scoring, streaks, stars, the offset correction and the Re-aim offer), and the export
   additions (byte-identical output still holds, §4.16).
2. **End-to-end:** `tests/e2e/no-scroll.spec.ts` with a reusable helper (§17.3.3) at the five
   sizes for every route; `smoke`, `vision`, `engines`, `flow`, `live-data`, `failures` and
   `mobile` retargeted at the new screens by prompt 018 (each prompt keeps the suite green for
   what it touches). Accuracy is still not asserted.
3. **Visual pass:** each new screen compared with its rendering in `png/` at the board size;
   the screenshots are kept for the report, not pixel-asserted.
4. **Pilot and device checks** (design §10) join `docs-dev/manual-verification.md`: the bubble
   against the ring (`?target=ring`) on at least one phone and one laptop, for accepted frames
   per target and validation accuracy, before any accuracy figure is published (if the bubble is
   worse, a later amendment restores the ring); the position thresholds, hysteresis and
   steadiness lines on real phones (Propped and In hand) and webcams; the camera side in phone
   landscape; iOS 26 `svh` and the motion permission; contrast on the grey; challenge tuning;
   reduced motion and Read instructions aloud end to end.

### 17.13 Work allocation

Prompts 013–018 run in order, each after the previous one has landed. Each owns the files its
prompt names, cites this section and the interface-design-v2 files it builds, and leaves `npm
run check` green.

| Prompt | Content |
|---|---|
| `013_game_shell_and_routes.md` | §17.2 routes and guards (with the legacy routes kept), §17.3 shell, tokens, fonts, theme, track, Details sheet frame, strings split, the no-scroll helper and spec |
| `014_title_and_ready.md` | §17.4 Title and Get ready, §17.5 position guard (pure core, glyph, overlay, device motion, haptics, sound, speech), the progress hook of §17.11, the tilt covariates |
| `015_warmup_levels_and_complete.md` | §17.6 warm-up levels over the existing protocol, §17.7 Warm-up complete |
| `016_free_look_and_challenge.md` | §17.8 Free look, Re-aim and Quick warm-up, §17.9 the challenge, §17.10 game export, `Phase` gains `'game'` |
| `017_details_sheet.md` | the Details tabs (design §2.17) filled from the existing logic, `#/methods`, the restyled `#/screen`, `#/distance` and `#/lab`, IndexedDB v2 |
| `018_integration_and_polish.md` | legacy routes removed and redirected, every e2e spec on the new interface, visual and accessibility passes, docs, manual checklist |

## Appendix A — `src/core/constants.ts` defaults (WP1)

```ts
export const CAMERA_LADDER = [[1280, 720], [960, 540], [640, 480]] as const; export const CAMERA_FPS = 30;
export const RVFC_STALL_MS = 500; export const HOST_INIT_TIMEOUT_MS = 20000;
export const LANDMARKER = { minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.35, minTrackingConfidence: 0.3 };
export const OPEN = { blinkMax: 0.5, openQMin: 0.2, maskFrames: 1 };
export const BLINK_HOLD = { close: 0.6, open: 0.4, capMs: 800, hideMs: 600 };
export const GATE_FIX = { yawDeg: 25, pitchDeg: 20, headSpeedDegS: 60, interOcularPx: 60 };
export const GATE_HEAD = { yawDeg: 32, pitchDeg: 25 };
export const FIXATION = { settleMs: 600, sampleMs: 1000, maxSampleMs: 2500, minFrames: 12, minAcceptRate: 0.5, retries: 1 };
export const VALIDATION = { settleMs: 600, sampleMs: 1000 };
export const HEAD_BLOCK = { settleMs: 600, yawMs: 2000, pitchMs: 2000, maxMs: 6000, yawAmpDeg: 10, pitchAmpDeg: 7, sectorsNeeded: 3 };
export const PURSUIT = { periodMs: 16000, ratio: [2, 3], ax: 0.42, ay: 0.42, phiX: 0, phiY: Math.PI / 2, holdMs: 1000, discardMs: 500, maxSpeedDegS: 15 };
export const LAG = { minMs: 0, maxMs: 300, stepMs: 33, clampMin: 50, clampMax: 250, fallbackMs: 100, minPursuitAccept: 0.5 };
export const WEIGHTS = { fixationPerLocation: 1, pursuitTotal: 4, headPerLocation: 0.8, recalibrationFactor: 2 };
export const PRUNE = { fixationZ: 2.5, residualMad: 3 };
export const ROBUST = { huberK: 1.345, irlsPasses: 2, hardRejectZ: 3.5 };
export const LAMBDA_REL = [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 0.1, 0.3, 1, 3];
export const PCA = { k: 64, oversample: 10, powerIters: 2 };
export const SELECT = { combinedGain: 0.95, minCoverage: 0.8 };
export const CLIP_RANGE_FRACTION = 0.5; export const OFFSCREEN_FRACTION = 0.1;
export const HEAD_RANGE = { pLow: 2.5, pHigh: 97.5, angleMarginDeg: 4, lnDistMargin: 0.1, eyeMidMargin: 0.05 };
export const ONE_EURO = { minCutoffHz: 0.8, betaPerDegS: 0.3, dCutoffHz: 1.0, resetGapMs: 200 };
export const DISTANCE = { irisMm: 11.7, medianWindowMs: 1000, assumedHfovDeg: 60 };
export const BLIND_SPOT = { angleDeg: 13.5, trials: 5, minMm: 300, maxMm: 1200, maxRelSd: 0.15, dotSpeedDegS: 1.5 };
export const CARD_MM = { w: 85.6, h: 53.98 }; export const ASSUMED_PX_PER_MM = 96 / 25.4;
export const VERDICT = { goodDeg: 2.5, goodLoss: 0.2, okDeg: 4.0, okLoss: 0.35, minGain: 1.5, goodPctDiag: 0.06, okPctDiag: 0.10 };
export const EVENTS = { bridgeMs: 75, medianN: 3, idtK: 4, idtMinDeg: 1.5, idtMaxDeg: 6, minFixMs: 100, mergeMs: 75, mergeDeg: 1, blinkMinMs: 50, blinkMaxMs: 500 };
export const DRIFT = { everyMin: 5, settleMs: 500, sampleMs: 1000, applyMinDeg: 2, applyAccFactor: 1.5 };
export const PROBE = { frames: 30, budgetMs: { blazegaze: 25, peekr: 15 }, totalMs: 45, warnMs: 66 };
export const FIT_BUDGET_MS = 15000;
export const SETUP = { faceWidthMin: 0.15, faceWidthMax: 0.6, centreX: 0.2, centreY: 0.25, lumaMin: 60, lumaMax: 200, backlightMin: 0.8, glareMax: 0.02, fpsMin: 20, poseMaxDeg: 15, distMinMm: 450, distMaxMm: 850, holdMs: 2000 };
```

## Appendix B — Evidence index for UI and documentation claims

| Claim | Source |
|---|---|
| Realistic webcam accuracy about 2–4°, often worse; ≤ 30 Hz; coarse AOIs only | [LIT §1, §8] |
| WebGazer 3.3–13.6° | [LIT §2] |
| Labvanced 1.45° (vendor-authored; 5-minute multi-pose calibration) | [LIT §1] |
| BlazeGaze drift 7.24→8.72 cm against WebGazer 7.79→11.62 cm (Eye of the Typer) | [IMPL §1.6; arXiv 2508.19544] |
| Peekr 1.75°×2.52° after a 5-point calibration (author-reported, not peer-reviewed) | [IMPL §5.2] |
| Blind spot ≈ 3.25 cm error; iris method < 10 % | [LIT §6.5] |
| Pursuit lag about 100 ms; fixation plus pursuit best | [LIT §5.2] |
| Sessions of about 5 minutes stable; spread anchors better than front-loaded (−32 %) | [LIT §5.5] |
| Between-run variability about 4.6° | [LIT §4, §7] |
| capture-time stamping gives 22–34 ms median latency | [LIT §6.6] |
