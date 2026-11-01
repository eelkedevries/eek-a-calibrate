// ===== src/core/constants.ts =====
// Every tunable numeric parameter (specification Appendix A, written verbatim by WP1).
// Values marked heuristic in the specification are defaults, not values derived from evidence.
// Frozen: changing a value needs a specification version bump.
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
