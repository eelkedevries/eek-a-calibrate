# Signalling camera and phone positioning to non-experts

Research report for the eek-a-calibrate interface redesign (4 November 2026). Scope: how to get, and
keep, a good distance, angle, framing, lighting and stability on (a) smartphones held in portrait
(camera at the top edge, typically 25–40 cm, hand-held or propped) and (b) laptops and desktops with a
webcam (landscape, 45–75 cm), before **and** during calibration, live tracking and the game. No
repository was modified.

**Evidence labels.**
- **[E]** peer-reviewed or normative primary source (URL given).
- **[V]** vendor documentation or shipped product source code: evidence of practice, not of efficacy.
- **[S]** secondary source (press, blog, forum): treat with care.
- **[R]** the owner's repositories or the current eek-a-calibrate code and specification (path given).
- **[D]** derived here by arithmetic; heuristic, with the assumptions stated.
- **[H]** design judgement or heuristic threshold, not tested.

---

## 0. Recommendations in one page

1. **One instruction at a time, chosen by a fixed priority order** (§3). No meter list on the main
   screens; numeric values go behind a "Details" disclosure for experts. Every shipped face-capture
   flow examined shows one hint at a time (AWS Amplify liveness, Face ID, Guided Frame) [V/E].
2. **Phrase instructions as a visual goal** ("Centre your face in the oval", "Fill the oval", "Line
   up with the outline"). Use device-specific verbs only where they cannot be misread ("Raise the
   phone to eye level", "Move a little closer"). "Move to your left" is ambiguous on a phone, where
   moving the phone and moving the head work in opposite directions [H].
3. **Setup screen = full-bleed mirrored preview, dimmed outside an oval**, with the live face outline,
   two eye dots and one chevron. The oval is sized for the target distance of the device class, so
   "fill the oval" *is* the distance instruction (the liveness metaphor [V]). The eye dots are the
   Tobii "track status" idea: they show at once that the eyes are being seen [V].
4. **Device-class targets** (§2.3). Desktop: about 50–70 cm (accept 45–75); the face is about 17–28 %
   of the long side of the frame. Phone in portrait: about 35–40 cm (accept 30–45); about 28–42 % of
   the long side. Normalise face size by the **long side** of the frame. The present code uses the
   frame width, which reads 1.8 times too high in portrait [R]. Never show centimetres unless the
   distance has been measured.
5. **Before calibration the targets are absolute. After it they are relative to a "home" pose**: the
   pose captured at the end of setup, then replaced by the calibrated head range in spec §4.10 [R].
   The pause overlay shows a **ghost outline of home**, and the user lines up with it. This is
   Labvanced's mesh-to-mesh alignment [E].
6. **Full-screen phases carry a compact position glyph** next to Pause/Exit: a small oval with two eye
   dots. It is faint and static when all is well. It goes amber with a 2–3-word nudge, during live
   tracking and the game only, never during calibration or validation. If position is lost for more
   than 0.5–1 s it becomes an **auto-pause overlay with one instruction**, and it resumes by itself
   after 1 s back in place [H; precedents in §1].
7. **Phone tilt via DeviceOrientation/DeviceMotion** is a cheap, strong cue. It catches a phone lying
   too flat ("Stand the phone more upright") and a phone moved after calibration. The upright angle
   is computed from the gravity vector (acos |g_z|/|g|), which needs no remapping for orientation.
   On iOS it needs a tap and a permission. **It conflicts with spec §14.2.10 ("No device-motion
   sensors are used")**, so it needs an amendment [R].
8. **Haptics are Android-only and an extra, never the only cue.** iOS Safari has no Vibration API, and
   Firefox for Android silently disables it [E: MDN BCD]. Sound is off by default except in the game.
   Offer an optional "Read instructions aloud", as Guided Frame and VoiceOver do [V/S].
9. **Single screen** (§6). Use one `100svh` stage with no scrolling, the preview cover-cropped but never
   below 70 % of the frame visible (the Amplify rule [V]), the instruction near the camera edge, and
   one primary action in the thumb zone. Secondary items go in a bottom sheet (the eek-a-style mobile
   rule [R]). Add a Playwright "no scrollbars" assertion at nine viewports.
10. **Fix two latent threshold errors.** The current ±15° pose window is measured from the camera axis,
    but simply looking at the screen centre already gives 11–15° of pitch (camera above the screen)
    or yaw (phone in landscape) [D]. And face width is normalised by the short side in portrait [R].

---

## 1. What existing products and studies do

| Source | Guide shape | Feedback channel | One hint or many | Notable details |
|---|---|---|---|---|
| **Apple Face ID** enrolment [V] | Circular ring around the face; head circles to fill it | Visual ring that fills; text | One | Works "arm's length or less (25–50 cm away from your face)". **Accessibility Options** need no full range of head motion. Source: https://support.apple.com/en-us/102381 |
| **Apple iOS 18 Eye Tracking** (phone front camera) [S] | Calibrate by following a dot | Visual | – | Advice: place the device **on a stable surface about 1.5 ft (≈45 cm) from the face**, in good light. https://9to5mac.com/2024/09/19/turn-on-iphone-eye-tracking-ios-18/ ; https://www.iphoneincanada.ca/2024/12/06/use-eye-tracking-on-iphone-and-ipad/ |
| **Google Pixel Guided Frame** [V] | Frame around the subject | **Speech, haptics, high-contrast animation** | One | User testing found that people needed **real-time feedback while framing**, not information about where the camera is. Users "quickly knew if they were to the left, right or middle". Auto-capture was valued by blind and low-vision users but **disliked by sighted users**. https://blog.google/products/pixel/how-we-tested-the-pixels-new-inclusive-camera-features/ ; https://support.google.com/pixelcamera/answer/14110054 |
| **iOS Camera with VoiceOver** [S] | – | Speech: "one face, small face, centred" | One | Reports face count, size and position. https://www.imore.com/making-iphone-camera-work-blind |
| **AWS Amplify FaceLivenessDetector** (open source) [V] | **Oval** over a mirrored preview; the rest dimmed | Text hint plus oval colour | **One** (`FaceMatchState` → one string) | Hints: "Move face in front of camera", "Ensure only one face is in front of camera", "Move closer", "Move back", "Center your face", "Face is not in the oval, center your face to the camera", "Hold still", "Move to brighter area", "Move to dimmer area". On landscape phones: "Rotate your device to portrait". Pre-start: "make sure your camera is at the center top of your screen". The oval is 80 % of a 3:4 portrait crop, its centre within 7/16–9/16 of the frame. The preview keeps **≥ 70 % of the frame width visible** when cover-cropped. Minimum camera: 320×240 and 15 fps. https://github.com/aws-amplify/amplify-ui/blob/main/packages/react-liveness/src/components/FaceLivenessDetector/displayText.ts ; …/service/utils/liveness.ts ; https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html |
| **WebGazer** face feedback box [V] | Square, 66 % of the shorter video side | Border colour only: green if both eyes are inside, red if not | – | Colour is the only cue, which fails WCAG 1.4.1. https://github.com/brownhci/WebGazer/blob/master/src/params.mjs ; `checkEyesInValidationBox` in `src/index.mjs` |
| **jsPsych webgazer-init-camera** [V] | WebGazer box | Static paragraphs | Many (4 paragraphs) | "Center your face in the box and look directly towards the camera … When your face is centered in the box and the box is green, you can click to continue." Continue is disabled until then. https://github.com/jspsych/jsPsych/blob/main/packages/plugin-webgazer-init-camera/src/index.ts |
| **Labvanced** (Kaduk et al., 2024) [E] | **Live blue face mesh aligned to a green target mesh** | Visual | – | A "virtual chinrest" **pauses the trial** when the head leaves the allowed range and shows the face with the mask overlay until the head is back. Six strictness levels; 60 cm. https://pmc.ncbi.nlm.nih.gov/articles/PMC11289017/ (doi:10.3758/s13428-023-02237-8) |
| **RealEye** [V] | Green dots where the eyes should return | Visual | – | Virtual chinrest after a shift from the calibration position. Resumes once the eyes stay on the dots for **≈5 s**. "Their face SHOULD take up at least one-third of the webcam frame"; webcam "slightly below the panelist's eye level"; "The webcam image MUST be steady"; one face only. Phones in landscape: "rotate the phone to the LEFT so the camera is on the LEFT". https://www.realeye.io/support/how-realeye-works ; https://www.realeye.io/support/how-to-get-accurate-results |
| **Tobii Dynavox Track Status** [V] | Black box with **two dots for the eyes**; a multi-coloured side bar with a white marker for distance | Visual | – | "Two solid dots … no or very little flickering … should not be too close to the edges." Marker too high means too close; too low means too far. Re-check periodically. For droopy eyelids, **raise the device so the user looks straight ahead**. https://us.tobiidynavox.com/blogs/support-articles/what-am-i-looking-for-in-the-track-status-box-for-better-positioning ; https://us.tobiidynavox.com/blogs/support-articles/how-can-i-position-the-device-to-get-a-better-calibration |
| **Tobii Eye Tracker 5** [V] | – | – | – | Operating distance 45–95 cm (some Tobii pages say 50–95 cm). https://help.tobii.com/hc/en-us/articles/360012483818-Specifications-for-Eye-Tracker-5 |
| **Google Look to Speak** (phone gaze) [S] | Head-in-circle setup guide | Visual | – | Phone **slightly below eye level**, ideally on a stand. https://blog.google/outreach-initiatives/accessibility/look-to-speak/ ; https://9to5google.com/2020/12/08/google-look-to-speak/ |
| **Google smartphone gaze** (Valliappan et al., 2020) [E] | – | – | – | 0.6–1° at **25–40 cm**; accuracy fell with head pan, tilt, roll and distance. doi:10.1038/s41467-020-18360-5 |
| **Virtual chinrest** (Li et al., 2020) [E] | Blind-spot test plus credit card | – | – | Viewing distance error about 3.25 cm; already optional in eek-a-calibrate (§14.1). doi:10.1038/s41598-019-57204-1 |
| **gaze-lite** `src/autoFrame.ts` [R] | Eye-centred virtual pan/zoom of the preview | – | – | Display only (the tracker sees the full frame); 7 % centre deadband, 12 % zoom deadband; eased with τ 0.07–0.30 s. (session scratch, not kept)/research/repo-gaze-lite.md §2.11 |
| **saccadacus** commit 7e7292b [R] | Preview scaled ×1.3 and panned so the head stays centred | – | – | Replaced a static centring guide; EMA 0.15. (session scratch, not kept)/repos/saccadacus (src/app/useRealTracking.ts) |
| **PocketGaze** step 3 [R] | Head-axis gizmo on the preview | Label "Low / Moderate / Uncertain head motion" | One label | Thresholds 15 °/s (moderate) and 60 °/s (uncertain). /home/user/PocketGaze/src/demos/step3.tsx, src/lib/motionQuality.ts |
| **foxie-kindergaze** [R] | Central fixation circle; the target shrinks while gaze stays on it | – | – | Gaze must stay in a 1° window for 1 s; a dwell-based "hold" metaphor. /home/user/foxie-kindergaze-demo/kindergaze-demo/FOXIE_demo_kindergaze.py |
| **eek-a-calibrate today** [R] | Rectangular face box (solid green or dashed amber) over the preview | **Nine-row meter list** with values; Continue after 2 s all green | Many | `src/app/components/qualityMeter.ts`. In Live the dot only greys out, with "Move back to where you were during calibration" (`live.ts:910`); there is no pause and no direction. |

**Lessons.**
1. Consumer flows show one short imperative at a time and change the guide's state; research tools
   show paragraphs and colour-only boxes.
2. The best "during" mechanisms (Labvanced, RealEye, Tobii) are relative to the calibrated position
   and show a target to return to.
3. Accessibility products add speech and haptics, and found that real-time framing feedback matters
   most [V].
4. Every phone-based eye-tracking product found advises propping the device [S/V].

---

## 2. Signals and target ranges

### 2.1 Signals available per frame

| Signal | Computation (existing in eek-a-calibrate unless noted) | Use | Noise handling [H] |
|---|---|---|---|
| Frame alive and not black | frame luma (32×18 downscale) | "Uncover the camera", "Too dark" | 500 ms median |
| Face found / face count | MediaPipe face landmarker (`numFaces` > 1 needs `numFaces: 2` in the options; **new**) | no face / several faces | 300 ms debounce |
| Face box and margin | landmark bounding box; **new: min distance of the box to each frame edge** | "Move into the oval" | — |
| Face scale | **Prefer the inter-ocular distance (outer corners 33/263) ÷ cos(yaw)** or the median iris diameter (469–471, 474–476), normalised by the **long side** of the frame | distance band | 500 ms median |
| Approximate distance | D = f·11.7/iris_px with f from the assumed 60° long-side FOV (§14.1.2), or measured f after the blind spot | only internally, plus Details | 1 s median (spec D_t) |
| Centring | face-box centre minus frame centre, in fractions of each side | "Centre your face in the oval" | 500 ms median |
| Head pose | yaw, pitch, roll from the transformation matrix | facing / chin / level | 300 ms median |
| Face luma, backlight ratio, glare | existing `faceQuality()` | light cues | 1 s mean |
| Eyes open | EAR/blendshapes, blink hold | "Keep your eyes open" only if closed > 1.5 s | ignores blinks |
| Head angular speed | Δpose/Δt | "Hold still" | 300 ms |
| Frame rate | rVFC timestamps | device warning (not a position cue) | 2 s |
| **Phone tilt** (new) | `devicemotion.accelerationIncludingGravity` → upright angle θ = acos(\|g_z\|/\|g\|); in-plane roll = atan2(g_x, g_y) rotated by `screen.orientation.angle` | "Stand the phone more upright", "Hold the phone straight", "The phone has moved" | 300 ms low-pass |
| **Phone shake** (new) | `devicemotion.rotationRate` magnitude | "Hold the phone steady" | 300 ms |

Why gravity rather than DeviceOrientation β/γ: the W3C frame is fixed to the device's natural
orientation, not to the current screen rotation. The Z-X′-Y″ Euler angles hit gimbal lock exactly at
the upright pose (β = 90°) that we care about [E: https://www.w3.org/TR/orientation-event/ — β is
90 when upright; the frame "does not" change with screen rotation; γ ∈ [−90, 90)]. The gravity
vector avoids both problems [D]. Note: some iOS and Android versions have reported
`accelerationIncludingGravity` with opposite signs. Using |g_z| and rotating g_x, g_y by the observed
sign of g_y when upright sidesteps this. **Verify on devices** [H].

### 2.2 Geometry arithmetic behind the bands [D]

Assumptions: the MediaPipe face box is about 145 mm wide (as in the review finding); iris 11.7 mm [E:
MediaPipe Iris, Google Research 2020, https://ai.googleblog.com/2020/08/mediapipe-iris-real-time-iris-tracking.html];
field of view along the long side 60° (spec assumption) or 70° (a Logitech C920 has a 78° diagonal,
about 70° horizontal [V: https://www.logitech.com/en-za/shop/p/c920-pro-hd-webcam]).

**Desktop or laptop, 16:9 landscape, face width ÷ long side; iris px at 1280 and 640 px wide:**

| D | 60° FOV: face | iris@1280 | iris@640 | 70° FOV: face | iris@1280 | iris@640 |
|---|---|---|---|---|---|---|
| 45 cm | 0.28 | 28.8 | 14.4 | 0.23 | 23.8 | 11.9 |
| 50 cm | 0.25 | 25.9 | 13.0 | 0.21 | 21.4 | 10.7 |
| 60 cm | 0.21 | 21.6 | 10.8 | 0.17 | 17.8 | 8.9 |
| 70 cm | 0.18 | 18.5 | 9.3 | 0.15 | 15.3 | 7.6 |
| 75 cm | 0.17 | 17.3 | 8.6 | 0.14 | 14.3 | 7.1 |

**Phone in portrait, face width ÷ long side (÷ short side for 16:9 and 4:3 video); iris px with a 960 px long side:**

| D | 60°: ÷long | ÷short 16:9 | ÷short 4:3 | iris@960 | 70°: ÷long | ÷short 16:9 |
|---|---|---|---|---|---|---|
| 25 cm | 0.50 | **0.89** | 0.67 | 38.9 | 0.41 | 0.74 |
| 30 cm | 0.42 | 0.74 | 0.56 | 32.4 | 0.35 | 0.61 |
| 35 cm | 0.36 | 0.64 | 0.48 | 27.8 | 0.30 | 0.53 |
| 40 cm | 0.31 | 0.56 | 0.42 | 24.3 | 0.26 | 0.46 |
| 45 cm | 0.28 | 0.50 | 0.37 | 21.6 | 0.23 | 0.41 |

Consequences:
- **The current `SETUP.faceWidthMax 0.6` on the frame width tells a portrait phone user at 35 cm to
  move further away** (0.64), which confirms the review finding [R].
- **Lower distance bound for phones.** The head-motion block (±10° yaw) moves the face centre about
  10 cm × sin 10° ≈ 1.7 cm sideways. That is about 7.6 % of the frame width at 35 cm. At 25 cm the
  face already fills 89 % of a 16:9 portrait width, leaving 5.5 % margin per side, which is not
  enough. At 30 cm the margin is 13 % and at 35 cm 18 % [D]. So **≥ 30 cm, ideally 35–40 cm**.
- **Phone in landscape** (16:9): a face box about 175 mm tall fills 77 % of the frame height at 35 cm.
  Landscape phones therefore need **≥ 40 cm** [D].
- **The FOV assumption scales every "distance".** With a true 70° and an assumed 60°, distance is
  over-estimated by 21 % (tan 35°/tan 30° = 1.21) [D]. So do not show centimetres to users unless the
  blind-spot measurement has been done (consistent with §14.1).
- **Resolution floor.** Below about 10 px of iris (a 640 px camera beyond about 60 cm) eye-pixel
  appearance features are coarse. Treat **iris < 10 px as "Move a little closer"** whatever the
  distance band says [H]. The existing gate `GATE_FIX.interOcularPx 60` corresponds to an iris of
  about 7.6 px [R/D].
- **Facing the screen is not facing the camera.** The expected pitch (camera above the screen) or yaw
  (phone in landscape) when looking at the screen centre is 10.8° (15.6″ laptop at 55 cm), 15.3° (27″
  monitor at 65 cm), 12.6° (phone at 35 cm) and 14.6° (phone at 30 cm). A phone in landscape gives
  about 11° of *yaw* [D]. The current `SETUP.poseMaxDeg 15`, measured from the camera axis, leaves
  almost no margin. **Centre the pose window on the expected offset** (default about +12° pitch down
  for top-mounted cameras; ±11° yaw towards the camera side for landscape phones) [H].

### 2.3 Recommended target ranges

| Quantity | Desktop/laptop (landscape) | Phone, portrait (primary) | Phone, landscape | Tablet | Basis |
|---|---|---|---|---|---|
| Viewing distance | **50–70 cm** ideal; accept 45–75 | **35–40 cm** ideal; accept 30–45 | 40–50 cm | 40–55 cm | Tobii ET5 45–95 cm [V]; Labvanced 60 cm [E]; spec 450–850 mm [R]; Face ID 25–50 cm [V]; Apple Eye Tracking ≈45 cm [S]; natural phone distance 32–36 cm (range 17.5–60) [E: Bababekova et al. 2011, https://pubmed.ncbi.nlm.nih.gov/21499163/]; Valliappan 25–40 cm [E]; iris distance stable at 250–500 mm in a one-person pilot [E: https://wydawnictwo.pan.pl/index.php/ijet/article/view/1734]; §2.2 [D] |
| Face width ÷ **long side** of frame | target 0.21; band **0.16–0.30** | target 0.33; band **0.28–0.42** | target 0.28; band 0.24–0.33 | target 0.27; band 0.22–0.33 | §2.2 [D]. RealEye's "face ≥ ⅓ of the frame" [V] fits phones but not 60 cm on a desktop |
| Iris diameter | ≥ 12 px good; 10–12 marginal; < 10 → "closer" | ≥ 16 px (typical 22–32) | ≥ 14 px | ≥ 14 px | [H] from §2.2 |
| Face fully inside frame, with margin | ≥ 6 % per side | ≥ 10 % per side horizontally | ≥ 8 % vertically | ≥ 8 % | [D] head-block excursion plus drift |
| Centring (face centre to frame centre) | \|dx\| ≤ 0.12, \|dy\| ≤ 0.15 | \|dx\| ≤ 0.10, \|dy\| ≤ 0.12 | \|dx\| ≤ 0.12, \|dy\| ≤ 0.10 | as phone | [H]; Amplify keeps its oval centre within ±1/16 [V]; current spec ±0.2/±0.25 is loose [R] |
| Yaw (relative to expected offset) | ±12° | ±12° | ±12° around ≈ ±11° | ±12° | [H]; ICAO frontal-photo limits ±5° yaw/pitch, ±8° roll are the strict reference [E: https://www.icao.int/Meetings/TAG-MRTD/Documents/Tag-Mrtd-18/TAGMRTD.18.WP10.PhotoStandards.pdf] |
| Pitch (relative to expected offset, positive = down) | −10° … +12° around ≈ +12° | same | ±12° | same | [H] |
| Roll | ±10° | ±10° | ±10° | ±10° | [H]; ICAO ±8° [E] |
| **Phone upright angle θ** (0 = flat, 90 = vertical) | n/a | **60–100°**; < 55° → "more upright" | 60–100° | 55–100° | [H]; stands typically give 60–75°; low θ means looking down → eyelid occlusion (vertical error rises with downward gaze [E: Pupil Invisible, https://arxiv.org/abs/2009.00508; appearance models, https://arxiv.org/abs/2603.26945]; Tobii advice to raise the device [V]) |
| Phone height | camera at or slightly below eye level | **camera at or just below eye level** | same | same | RealEye "slightly below eye level" [V]; Look to Speak "slightly below eye level" [S] |
| In-plane roll of the phone (gravity) | n/a | ±10° | ±10° | ±10° | [H] |
| Face luma (0–255) | 60–200 | 60–200 | 60–200 | 60–200 | spec SETUP [R, heuristic] |
| Backlight (face ÷ frame luma) | ≥ 0.8 | ≥ 0.8 | ≥ 0.8 | ≥ 0.8 | spec [R, heuristic] |
| Glare in eye boxes | ≤ 2 % | ≤ 2 % | ≤ 2 % | ≤ 2 % | spec [R, heuristic] |
| Head angular speed for "still" | < 15 °/s (cue at > 30 °/s for 300 ms); data gate 60 °/s | same | same | same | PocketGaze 15/60 °/s [R]; spec `GATE_FIX` [R] |
| Phone rotation rate for "steady" | n/a | < 10 °/s; cue at > 20 °/s for 300 ms | same | same | [H] |
| Frame rate | ≥ 20 Hz (device warning, not a position cue) | ≥ 20 Hz | ≥ 20 Hz | ≥ 20 Hz | spec [R]; ≈20 Hz sufficient for single-time-point analyses [E: Prystauka et al. 2024, PMC11133053]; Amplify minimum 15 fps [V] |

**Orientation.** Recommend **portrait on phones** (camera centred above the screen, so yaw is
symmetric; Amplify refuses landscape on mobile [V]), while still supporting landscape: WCAG 2.2
SC 1.3.4 forbids locking orientation unless it is essential [E: https://www.w3.org/TR/WCAG22/#orientation].
In landscape, tell users where the camera is: RealEye standardises "camera on the LEFT" [V]. The
camera side can be inferred from `screen.orientation.angle` (90 usually means rotated
anticlockwise, camera on the left; 270 on the right). This is [H] and needs checking on devices: the
spec defines the angle anticlockwise from the natural orientation
(https://www.w3.org/TR/screen-orientation/), but the device mapping varies.

### 2.4 Phone tilt via DeviceOrientation / DeviceMotion

- **Support.** `deviceorientation` and `devicemotion` need a secure context and the
  `accelerometer`/`gyroscope` permissions-policy features (default `self`). They fire only while the
  document is visible, with 0.1° precision [E: W3C].
- **iOS** needs `DeviceOrientationEvent.requestPermission()` / `DeviceMotionEvent.requestPermission()`
  **from a tap** (transient activation; otherwise `NotAllowedError`). MDN BCD lists Safari iOS 14.5 for
  the static method [E: https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static;
  https://github.com/mdn/browser-compat-data/blob/main/api/DeviceOrientationEvent.json].
  Android Chrome grants it without a prompt.
- **Flow [H].** On a phone, the "Start the camera" tap also calls `requestPermission()` (iOS). If it is
  denied or unsupported, continue without it; it only adds cues and never gates. Do not explain
  sensors up front. A single-line tip appears only on iOS: "Allow motion so we can check the phone's
  angle".
- **Uses.**
  1. Before calibration: "Stand the phone more upright" (θ < 55°), "Tilt the phone back slightly"
     (θ > 105°), "Hold the phone straight" (|roll| > 10°), "Hold the phone steady" (rotation rate).
  2. Store θ and roll in the home pose. If θ changes by > 6° or roll by > 6° after calibration, the
     cue is **"The phone has moved"**. This separates "the phone moved" from "the head moved", which
     the camera alone cannot do; the remedy (line up again, or recalibrate) is the same [H].
  3. Hand-held detection: rotation-rate variance over 2 s > threshold → show the tip "Prop it on books
     or a mug" once [H].
- **Spec conflict.** §14.2.10 says "No device-motion sensors are used". Adopting this needs a spec
  amendment and version bump. It also adds `deviceTiltDeg`/`deviceRollDeg` covariates to the export,
  which is useful for analysis [R].

### 2.5 Before versus during: absolute targets, then "home"

- **Before calibration**: the absolute bands of §2.3.
- **End of setup**: capture **home** as the median over the 2 s "hold still" window. It holds face
  centre, face scale, yaw/pitch/roll and phone θ/roll. Home is used as a provisional range during
  calibration, with generous tolerances [H]: scale ±20 %, centre ±0.10, yaw/pitch ±15° (except during
  the head-motion block, when angles are not checked), θ ±8°.
- **After the fit**: switch to the calibrated head range (spec §4.10: yaw/pitch P2.5–P97.5 ± 4°,
  ln distance ratio ± 0.10, eye midpoint ± 0.05) [R]. Two levels [H]:
  - "drifting" = beyond 70 % of the margin: nudge, only in live tracking and the game;
  - "out" = beyond the range for > 0.5 s (calibration/validation) or > 1 s (live/game): auto-pause.
- **Face lost**: pause after 0.7 s. That is longer than a blink: the blink hold cap is 800 ms, with
  `BLINK_HOLD` handling closures [R].

### 2.6 Hysteresis and timing [H]

- Each condition has an enter threshold and a tighter exit threshold. Examples:
  - too far: enter at scale < 0.80 of target, exit at > 0.88;
  - too close: enter at > 1.25, exit at < 1.15;
  - centring: enter at |dx| > 0.12, exit at < 0.08;
  - pose: enter at 15° off, exit at 10° off;
  - luma: enter at < 60, exit at > 70.
- A new cue must persist for 300 ms before it is shown, except blockers, which show at once.
- A shown cue stays at least 1 s.
- "Good" requires every condition clear for 2 s (the existing `SETUP.holdMs`). The ring fills over
  those 2 s and resets on a break.
- Smooth the signals with the medians in §2.1, so landmark noise does not make the text flicker.
  gaze-lite's deadbands (7 % centre, 12 % scale) are a good starting point [R].

---

## 3. Priority order: one instruction at a time

Rule: show the highest-ranked active condition only. The order is:
1. blockers first;
2. then geometry from coarse to fine (each adjustment changes the later measurements: moving closer
   changes centring, face luma and glare, which are measured inside the face box);
3. then light;
4. then eyes;
5. steadiness last, because it is a state rather than a placement.

| Rank | Condition | Measured by | Desktop headline | Phone headline |
|---|---|---|---|---|
| 1 | Camera not allowed / not delivering | permission, track state, no frames 2 s | Allow the camera to start | same |
| 2 | Frame black or nearly black | frame luma < 15 | Uncover the camera | same |
| 3 | Too dark to find a face | no face and frame luma < 45 | Too dark – add light | same |
| 4 | No face | no landmarks 300 ms | Sit facing the camera | Point the camera at your face |
| 5 | Several faces | face count > 1 | Only one face, please | same |
| 6 | Face cut off by the frame edge | box margin < threshold | Move into the oval | same |
| 7 | Too far / eyes too small | scale < band or iris < floor | Move a little closer | same |
| 8 | Too close | scale > band | Move back a little | same |
| 9 | Phone lying too flat / leaning | θ outside 60–100° (sensor) | – | Stand the phone more upright / Tilt the phone back slightly |
| 10 | Camera too low or high (vertical off-centre) | dy outside band (plus pitch sign) | Tilt the screen back a little (face high) / Tilt the screen towards you (face low) | Raise the phone to eye level (face high) / Lower the phone slightly (face low) |
| 11 | Off-centre horizontally | dx outside band | Centre your face in the oval (plus chevron) | same |
| 12 | Phone rotated in its plane | gravity roll > 10° | – | Hold the phone straight |
| 13 | Head turned | yaw beyond offset ± 12° | Turn to face the screen | same |
| 14 | Chin up / down | pitch beyond window | Lower your chin a little / Raise your chin a little | same |
| 15 | Head tilted | roll > 10° | Keep your head level | same |
| 16 | Face too dark | face luma < 60 | Add light in front of you | same |
| 17 | Backlit | backlight < 0.8 | Avoid bright light behind you | same |
| 18 | Face too bright | face luma > 200 | Soften the light on your face | same |
| 19 | Glare on glasses | glare > 2 % | Tilt your glasses down slightly | same |
| 20 | Eyes hidden or closed > 1.5 s | eye landmarks / openQ | Make sure we can see your eyes / Keep your eyes open | same |
| 21 | Moving | head speed > 30 °/s, or phone rotation rate > 20 °/s | Hold still for a moment | Hold the phone steady |
| — | All clear, holding | 2 s ring | Perfect – hold still | same |
| — | Ready | latched | Ready (button: **Start calibration**) | same |

Notes [H]:
- Rank 10 before 11: on phones the vertical error usually comes from phone height and tilt, which is
  the root cause of the chin-up pose that rank 14 would otherwise report.
- If ranks 7–8 and 11 are active at once, distance first, because the oval is the target.
- A **"Continue anyway"** secondary button appears after 20 s (as now) and is announced to screen
  readers. This satisfies WCAG 2.2.1 for users who cannot reach a band, such as wheelchair users or
  limited head motion. A **"Limited head movement"** option, modelled on Face ID's Accessibility
  Options [V], narrows the head-motion block.
- Frame rate and device speed are **not** in this list. They are a one-off device message, because the
  user cannot fix them by moving.

Sketch:

```ts
interface Cue { id: CueId; rank: number; blocker: boolean; headline: string; tip?: string; arrow?: 'left'|'right'|'up'|'down'|'in'|'out' }
function pickCue(s: Signals, shown: Cue | null, now: number): Cue | null {
  // each rule tests its exit threshold if it is the one being shown, else its enter threshold
  const active = RULES.filter(r => r.active(s, shown?.id === r.id)).sort((a, b) => a.rank - b.rank);
  const top = active[0] ?? null;
  if (!top) return null;                                   // all clear: the hold ring runs
  if (shown && shown.id !== top.id && !top.blocker && now - shownSince < 1000) return shown; // min dwell
  return pendingFor(top.id, now) >= (top.blocker ? 0 : 300) ? top : shown;                 // debounce
}
```

---

## 4. Visual language

### 4.1 Setup screen (before calibration)

- **Full-bleed, mirrored live preview** with a **dark scrim (≈60 %) outside an oval cut-out**. This
  follows the liveness pattern [V], makes the camera feed the subject (the eek-a-style rule "the
  subject gets the space" [R]) and leaves no empty columns. Mirroring is kept: the existing
  `placeFaceBox` mirrors [R]. With a mirror, moving the head and the image move the same way, so the
  directions feel natural.
- **Target oval.** Width = target face-width fraction (§2.3) × displayed frame long side; aspect 1 : 1.3;
  centred on the frame centre. Desktop and portrait phone: optionally 3 % above centre, so that the
  eyes sit near the frame centre. The oval *is* the distance cue: "fill the oval".
- **Live face outline**: a thin ellipse fitted to the face landmarks (face-oval landmarks). The user
  sees the gap between their outline and the target. This is the clearest distance signal, and the
  Amplify "too far" illustration shows exactly that gap [V].
- **Two eye dots** at the iris centres, in the `secondary`/iris colour #6ba6e4. Stable dots mean "we
  can see your eyes"; flickering dots signal a problem. This is the Tobii track-status idea [V]. An
  optional faint "eye line" tick at 40 % of the oval height shows where the eyes belong.
- **One directional cue**: a single chevron outside the oval edge, pointing where the face should move
  *in the mirror*; or, for distance, two inward/outward chevron pairs on the oval rim. Draw no more
  than one cue at a time. No motion except a 200 ms fade (eek-a-style motion rule) [R]; respect
  `prefers-reduced-motion`.
- **Oval states** (colour plus line style plus glyph plus word, never colour alone: WCAG 1.4.1 [E]):

| State | Stroke | Glyph | Text |
|---|---|---|---|
| Searching (no face) | light, dashed, 60 % opacity | – | headline per §3 |
| Adjust | `warning` #f0b429, solid, 3 px | chevron | headline |
| Good, holding | `success` #3ad08a, solid; a **ring fills clockwise over 2 s** (Face ID-like) | ✓ when full | Perfect – hold still |
| Ready | `success`, solid | ✓ | Ready + accent **Start calibration** button |

- **Contrast on video**: every overlay stroke gets a 1.5 px rgba(0,0,0,.6) outer halo, so it stays
  ≥ 3:1 against bright and dark video (WCAG 1.4.11 [E]). The headline sits on a `surface` pill at
  92 % opacity, which guarantees ≥ 4.5:1 [H].
- **Why not auto-framing here.** gaze-lite and saccadacus pan and zoom the preview to keep the face
  centred [R]. That is pleasant in a demo, but **it hides exactly the errors setup must reveal**: an
  off-centre or too-distant face looks centred and normal-sized. Keep the true (cover-cropped) frame
  in setup and in the pause overlay. Auto-framing may be used only for an optional "eye close-up" in
  the Details sheet (for checking glasses glare), and never when `prefers-reduced-motion` is set [H].
- **Details** (experts): a disclosure or sheet showing the values: distance (≈ cm, or measured cm),
  face %, iris px, yaw/pitch/roll, θ, luma, backlight, glare, frame rate. This keeps the existing
  information without the list on the main view, which is the eek-a-style progressive-disclosure
  rule [R].

### 4.2 Compact persistent indicator (calibration, validation, live tracking, game)

- **Glyph**: a small oval about 36–40 px high, with two eye dots placed relative to the *home* pose
  (amplified about ×3, so drift is visible) and scaled with distance. It is an abstract glyph, not a
  video thumbnail. A self-view draws attention and self-evaluation (Bailenson, 2021, a theoretical
  argument: doi:10.1037/tmb0000030 [E, hypothesis]) and costs paint time.
- **Placement**: in the same corner cluster as the small Pause/Exit buttons (spec §14.2.7: "in a
  screen corner …, never at a target position" [R]). Portrait phone: top-right below the safe-area
  inset. Desktop: top-right. Landscape phone: the corner on the camera side.
- **Behaviour per phase [H]:**

| Phase | Good | Drifting (> 70 % of margin) | Out (> 0.5 s cal/val, > 1 s live/game) | Face lost > 0.7 s |
|---|---|---|---|---|
| Calibration | faint (`muted-text`, 60 % opacity), static | **no nudge** (it would pull gaze off the target); glyph only turns amber | **auto-pause overlay**; the current target is redone after resume (settle 600 ms) | overlay |
| Head-motion block | angle checks off; distance and centre on | as above | overlay (distance/centre only) | overlay |
| Validation | as calibration | as calibration | overlay; the point is redone | overlay |
| Live tracking | faint | amber glyph plus a **2–3-word nudge** beside it ("A little closer"); dot greyed (existing) | overlay | overlay |
| Game | faint | amber plus nudge plus optional soft tick sound | overlay; the game freezes | overlay |

### 4.3 Auto-pause overlay

- **Scrim** over the stimulus. A small mirrored preview near the camera edge: phone about 45 % of the
  width at the top; desktop about 320 px wide, top-centre. On it, a **ghost outline of home**
  (Labvanced green target mesh [E]; RealEye green dots [V]) and the live outline.
- **One headline**, from the same priority list but relative to home (§5.2).
- Small text "Carries on by itself", and **Exit**.
- After **10 s** stuck: a secondary **Calibrate again** button (an accent primary is not needed).
- **Resume** when everything has been in range for 1 s [H]; RealEye's 5 s is long for a game [V].
  Show "Back in place" for 400 ms, then continue. In calibration, re-show the target with its settle
  window.
- **Focus and ARIA**: `role="alertdialog"`, focus moves to it on keyboard, `aria-live="assertive"` for
  the first headline only; Esc and Pause still work.

### 4.4 Haptics and sound

- **Haptics (Android only)**: `navigator.vibrate(20)` once when the hold ring completes;
  `navigator.vibrate([30, 60, 30])` on auto-pause. Nothing continuous [H]. It needs sticky user
  activation (Chrome 60+ returns `false` otherwise). **Safari/iOS does not support it; Firefox for
  Android returns `true` but never vibrates** [E: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate;
  BCD https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json]. Silent and
  Do-Not-Disturb modes may suppress it [E: MDN]. So it is never the only cue.
- **Sound**:
  - one toggle, "Sound cues", off on setup and calibration screens [H];
  - on by default in the game, where attention is on the game (a soft 2-tone on pause, a short chime
    on resume, low volume);
  - Web Audio started in the first tap (autoplay policy).
- **Spoken guidance** (accessibility option "Read instructions aloud"): `speechSynthesis` with
  `lang 'en-GB'`, speaking the headline on change, at most once per 2.5 s. Widely supported (Chrome 33,
  Safari 7, Firefox 49 per BCD) [E]. When it is on, **auto-continue after 3 s of "Ready"**. Guided
  Frame found auto-capture valued by blind and low-vision users but disliked by sighted users [V], so
  sighted users keep the Start button by default.

### 4.5 Accessibility checklist (WCAG 2.2, https://www.w3.org/TR/WCAG22/) [E]

- **1.4.1 Use of colour**: state = colour + line style + glyph + words. WebGazer's red/green box fails
  this.
- **1.4.11 Non-text contrast**: the halo on strokes (§4.1).
- **4.1.3 Status messages**: one `role="status"` (`aria-live="polite"`) holding only the headline,
  updated on change, never with the ring percentage.
- **2.2.1 Timing adjustable**: "Continue anyway" after 20 s; no forced time-outs in setup.
- **2.3.1 Three flashes**: no flashing or pulsing on the oval.
- **2.5.8 Target size**: ≥ 24 px; the app uses 44 px (`MOBILE.minTouchPx`) [R].
- **1.3.4 Orientation**: support both orientations.
- **1.3.3 Sensory characteristics**: do not say "the green box"; say "the oval".
- **Motor**: "Limited head movement" option (Face ID precedent [V]); "Continue anyway".

---

## 5. Copy (British English, 2–6 words per headline)

Tone: plain imperatives, positive, no jargon ("frame rate", "luma", "yaw" appear only in Details).
Optional tips are one line, ≤ 8 words, in `faint` text, and shown only after the same headline has
stood for 4 s [H].

### 5.1 Setup

| State | Headline | Optional tip (after 4 s) |
|---|---|---|
| Starting | Starting the camera… | – |
| Loading model | Getting ready… (with %) | First time only |
| Permission needed | Allow the camera to start | Nothing leaves this device |
| Permission blocked | Camera blocked – check settings | Then reload this page |
| Black frame | Uncover the camera | – |
| Too dark to see | Too dark – add light | Face a window or a lamp |
| No face (desktop) | Sit facing the camera | – |
| No face (phone) | Point the camera at your face | – |
| Several faces | Only one face, please | – |
| Face cut off | Move into the oval | – |
| Too far / eyes small | Move a little closer | Fill the oval with your face |
| Too close | Move back a little | – |
| Phone too flat | Stand the phone more upright | Prop it on books or a mug |
| Phone leaning towards you | Tilt the phone back slightly | – |
| Face high (desktop) | Tilt the screen back a little | Or sit up a little |
| Face low (desktop) | Tilt the screen towards you | – |
| Face high (phone) | Raise the phone to eye level | Prop it on books or a mug |
| Face low (phone) | Lower the phone slightly | – |
| Off-centre | Centre your face in the oval | – |
| Phone rotated | Hold the phone straight | – |
| Head turned | Turn to face the screen | – |
| Chin up | Lower your chin a little | – |
| Chin down | Raise your chin a little | – |
| Head tilted | Keep your head level | – |
| Face dark | Add light in front of you | Light from behind the screen is best |
| Backlit | Avoid bright light behind you | Close the blind or turn round |
| Face too bright | Soften the light on your face | – |
| Glare | Tilt your glasses down slightly | Or move the lamp |
| Eyes hidden | Make sure we can see your eyes | Move hair or a cap away |
| Eyes closed | Keep your eyes open | – |
| Moving (desktop) | Hold still for a moment | – |
| Moving (phone) | Hold the phone steady | Resting it works best |
| Hand-held detected (once) | – | Prop it on books or a mug |
| Holding | Perfect – hold still | – |
| Ready | Ready | Button: **Start calibration** |
| After 20 s | (button) Continue anyway | Results may be less accurate |
| iOS motion prompt | – | Allow motion so we can check the phone's angle |

### 5.2 During calibration, validation, live tracking and the game

| State | Nudge (live/game only, ≤ 3 words) | Pause-overlay headline | Pause tip |
|---|---|---|---|
| Drift: too far | A little closer | Move a little closer | Line up with the outline |
| Drift: too close | Back a little | Move back a little | Line up with the outline |
| Drift: off-centre | Re-centre | Line up with the outline | – |
| Turned | Face the screen | Turn to face the screen | – |
| Phone moved (sensor) | Phone moved | The phone has moved | Put it back, or calibrate again |
| Face lost | – | Look back at the screen | – |
| Moving | Hold still | Hold still for a moment | – |
| Light changed | More light | Add light in front of you | – |
| Resuming | – | Back in place | – |
| Stuck 10 s | – | (button) Calibrate again | (button) Exit |
| Indicator ARIA labels | "Position good" · "Position: move a little closer" · "Paused: move back into place" | | |

Replace the current `live.outOfRange` ("Move back to where you were during calibration.", 9 words) with
the ghost-outline overlay and "Line up with the outline" [R].

---

## 6. Keeping it on one screen in portrait and landscape

**Principle**: one fixed stage of the viewport's *small* height. `100vh` on iOS Safari is the large
viewport and overflows while the bars are shown. `svh`/`dvh` are supported from Chrome 108, Safari 15.4
and Firefox 101 [E: https://github.com/mdn/browser-compat-data/blob/main/css/types/length.json;
https://www.w3.org/TR/css-values-4/#viewport-relative-lengths]. Every element is placed inside the
stage; nothing lives below it.

```css
html, body { height: 100%; margin: 0; overflow: hidden; background: var(--color-background); }
.setup {
  position: fixed; inset: 0; height: 100svh;              /* fits with browser bars visible */
  display: grid;
  grid-template: "top" auto "stage" minmax(0, 1fr) "bottom" auto / minmax(0, 1fr);
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}
.stage { grid-row: 1 / -1; grid-column: 1; position: relative; overflow: hidden; }   /* full bleed */
.stage video { position: absolute; inset: 0; width: 100%; height: 100%;
               object-fit: cover; transform: scaleX(-1); }
.stage canvas { position: absolute; inset: 0; }   /* scrim + oval + outline + eye dots + chevron */
.top    { grid-area: top;    z-index: 1; justify-self: center; margin-top: var(--space-md); }   /* headline pill, near the camera */
.bottom { grid-area: bottom; z-index: 1; display: flex; gap: var(--space-sm);
          justify-content: center; padding: var(--space-md); }                             /* one primary + Settings */
.headline { font: 500 clamp(18px, 2.2vmin + 10px, 24px)/1.25 var(--font-sans); max-inline-size: 22ch;
            text-align: center; background: color-mix(in srgb, var(--color-surface) 92%, transparent);
            border-radius: var(--radius-pill); padding: var(--space-sm) var(--space-md); }
/* landscape phone: camera at a side edge; text and actions on the camera side */
@media (orientation: landscape) and (max-height: 500px) {
  .setup { grid-template: "top bottom" auto / 1fr 1fr; align-content: space-between; }
  .setup[data-camera-side="left"]  .top { justify-self: start; }
  .setup[data-camera-side="right"] .top { justify-self: end; }
}
```

- **Cover-crop rule** (Amplify [V]):
  `scale = min(max(Vw/vw, Vh/vh), Vw/(0.70·vw), Vh/(0.70·vh))`, so that at least 70 % of each frame
  dimension stays visible. If the rule bites, the uncovered band shows a blurred copy of the video.
- **Overlay coordinates**: map landmarks with the same cover transform (PocketGaze's `coverMap` [R]).
- **Guidance stays relative to the full frame** (what the tracker sees). The visible crop is centred,
  so centring targets coincide. Edge margins are tested against the *visible* region whenever that is
  smaller [H].
- **Portrait phone** (for example 390×664, 375×553 iPhone SE with bars, 360×640):
  - headline pill at the top, just under the camera, which also keeps the user's gaze near the camera
    while reading, so the pose looks frontal [H];
  - oval in the middle; primary button at the bottom (thumb zone);
  - "Settings" opens a **bottom sheet** (camera picker, glasses question, sound, read aloud, Details),
    to the eek-a-style sheet spec [R].
- **Desktop or laptop** (1280×633, 1366×657, 1920×969):
  - the same full-bleed stage; the 16:9 video covers 16:10 with about 10 % cropped;
  - the headline sits top-centre under the webcam;
  - the glasses question is a chip row next to the primary button;
  - a slim header can carry the step name (left) and the camera name or Settings (right): "both
    header ends carry content" [R].
- **Landscape phone** (844×390, 667×320):
  - text and actions sit on the camera side (§2.3); the oval stays centred;
  - if the height is < 360 px, the tip line is dropped.
- **Full-screen phases**: the stage is the stimulus; the indicator and Pause/Exit are in one corner;
  nothing else.
- **Test**: in Playwright, at each of the nine viewports above, assert
  `scrollWidth ≤ clientWidth && scrollHeight ≤ clientHeight` on `document.documentElement` for every
  screen. This turns "no scrollbars" into a check [H].

---

## 7. Changes against the current spec and code (owner decisions)

| Item | Current | Proposed | Needs |
|---|---|---|---|
| Face size normalisation | width fraction (`quality.ts:151`), 0.15–0.60 | long-side fraction, bands per device class (§2.3) | constants change (SETUP belongs to prompt 001: spec bump) |
| Pose window | \|yaw\|, \|pitch\| ≤ 15° about the camera axis | windows centred on the expected camera→screen offset | spec bump |
| Centring | ±0.20 / ±0.25 | ±0.10–0.12 / ±0.12–0.15, plus edge margins | spec bump |
| Meter list, 9 rows | shown | one headline; values under Details | WP9 screen change |
| Left/right copy | "Move a little to your right." | goal-based "Centre your face in the oval" plus chevron | strings |
| Live out-of-range | dot greys plus 9-word text | indicator, nudge, auto-pause overlay with ghost outline | §4.10 / Live |
| Calibration out-of-range | blocks pause on orientation/resize only | also pause on home-range exit | §4.7 / presentation |
| Device sensors | §14.2.10 "No device-motion sensors are used" | optional DeviceMotion tilt/shake cues plus export covariates | **spec amendment** |
| Face count | `numFaces` presumably 1 | 2, to detect "several faces" | landmarker option (perf check) |
| Haptics, sound, speech | none | as in §4.4 | new, small |

---

## 8. Open questions and manual checks

1. Verify the `screen.orientation.angle` → camera side mapping on Pixel, Samsung and iPhone [H].
2. Verify gravity sign conventions of `accelerationIncludingGravity` on iOS versus Android [H].
3. Check whether `numFaces: 2` costs measurable time in the landmarker on low-end phones.
4. Calibrate the bands against real devices. Measure on a few phones (front-camera FOV) and webcams:
   face fraction and iris px at 30/35/40/45 cm and 50/60/70 cm. This replaces the 60°/70° assumptions
   in §2.2.
5. Usability check with 5 non-experts per device class. Time to "Ready", number of instructions
   shown, and whether "Centre your face in the oval" is understood without left/right words. No
   accuracy figure follows from this (anti-fabrication rule [R]).
6. Decide whether the game's sound cues default to on.

## 9. Sources

- Apple, *About Face ID advanced technology*: https://support.apple.com/en-us/102381
- iOS 18 Eye Tracking setup (secondary): https://9to5mac.com/2024/09/19/turn-on-iphone-eye-tracking-ios-18/ ; https://www.iphoneincanada.ca/2024/12/06/use-eye-tracking-on-iphone-and-ipad/
- Google, *How we tested Guided Frame and Real Tone*: https://blog.google/products/pixel/how-we-tested-the-pixels-new-inclusive-camera-features/ ; Guided Frame help: https://support.google.com/pixelcamera/answer/14110054
- VoiceOver camera face announcements (secondary): https://www.imore.com/making-iphone-camera-work-blind
- AWS Amplify UI liveness source: https://github.com/aws-amplify/amplify-ui/tree/main/packages/react-liveness/src/components/FaceLivenessDetector ; AWS Rekognition Face Liveness: https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html
- WebGazer: https://github.com/brownhci/WebGazer (src/params.mjs, src/index.mjs)
- jsPsych webgazer-init-camera: https://github.com/jspsych/jsPsych/blob/main/packages/plugin-webgazer-init-camera/src/index.ts
- Kaduk, Goeke, Finger & König (2024), Labvanced validation: https://pmc.ncbi.nlm.nih.gov/articles/PMC11289017/
- RealEye: https://www.realeye.io/support/how-realeye-works ; https://www.realeye.io/support/how-to-get-accurate-results
- Tobii Dynavox Track Status: https://us.tobiidynavox.com/blogs/support-articles/what-am-i-looking-for-in-the-track-status-box-for-better-positioning ; https://us.tobiidynavox.com/blogs/support-articles/how-can-i-position-the-device-to-get-a-better-calibration
- Tobii Eye Tracker 5 specifications: https://help.tobii.com/hc/en-us/articles/360012483818-Specifications-for-Eye-Tracker-5
- Google Look to Speak: https://blog.google/outreach-initiatives/accessibility/look-to-speak/ ; https://9to5google.com/2020/12/08/google-look-to-speak/
- Valliappan et al. (2020), Nat. Commun.: https://doi.org/10.1038/s41467-020-18360-5
- Li, Joo, Yeatman & Reinecke (2020), Virtual chinrest, Sci. Rep.: https://doi.org/10.1038/s41598-019-57204-1
- Bababekova et al. (2011), Optom. Vis. Sci.: https://pubmed.ncbi.nlm.nih.gov/21499163/
- Iris-based face-to-screen distance on smartphones (2026 pilot): https://wydawnictwo.pan.pl/index.php/ijet/article/view/1734 ; smartphone myopia screening with iris distance (2025): https://doi.org/10.3389/fbioe.2025.1678800
- MediaPipe Iris (11.7 mm, < 10 % depth error): https://ai.googleblog.com/2020/08/mediapipe-iris-real-time-iris-tracking.html
- ICAO TAG-MRTD/18 WP/10 (pose tolerances): https://www.icao.int/Meetings/TAG-MRTD/Documents/Tag-Mrtd-18/TAGMRTD.18.WP10.PhotoStandards.pdf
- Pupil Invisible evaluation (downward-gaze occlusion): https://arxiv.org/abs/2009.00508 ; anisotropic vertical error: https://arxiv.org/abs/2603.26945
- Prystauka, Altmann & Rothman (2024), BRM: https://pmc.ncbi.nlm.nih.gov/articles/PMC11133053/
- Bailenson (2021), Nonverbal overload: https://doi.org/10.1037/tmb0000030
- Logitech C920 (78° diagonal FOV): https://www.logitech.com/en-za/shop/p/c920-pro-hd-webcam
- W3C Device Orientation and Motion: https://www.w3.org/TR/orientation-event/ ; MDN requestPermission: https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static ; MDN vibrate: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate ; MDN BCD: https://github.com/mdn/browser-compat-data
- W3C Screen Orientation: https://www.w3.org/TR/screen-orientation/
- CSS Values 4 viewport units: https://www.w3.org/TR/css-values-4/#viewport-relative-lengths
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Owner repositories (read only):
  - /home/user/eek-a-calibrate (src/core/face/quality.ts, src/app/components/qualityMeter.ts, src/core/constants.ts, src/app/strings.en-GB.ts, specification §4.10, §14.1–14.2)
  - /home/user/eek-a-style (source/visual/ui-and-interaction.md, data/visual/tokens.css)
  - /home/user/PocketGaze (src/demos/step3.tsx, src/lib/motionQuality.ts)
  - (session scratch, not kept)/repos/saccadacus (commit 7e7292b)
  - gaze-lite via (session scratch, not kept)/research/repo-gaze-lite.md
  - /home/user/foxie-kindergaze-demo
- Review findings: (session scratch, not kept)/review-findings.json (ui-mobile: face-size normalisation, preview below the fold; ui-desktop: camera screen column)
