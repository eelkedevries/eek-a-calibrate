// ===== src/core/types.ts =====
// Contract: specification §6, written verbatim by WP1 (001_scaffold_and_contracts.md), with the
// additive v0.2 fields of §14.3 (ScreenGeometry.insets and .presentationMode, FitResult.fitGeometry)
// and the additive v0.5 changes of §17.11 (Phase 'game'; RecordedFrame.deviceTiltDeg and .deviceRollDeg).
// Frozen: changing anything here needs a specification version bump.
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
  insets?: { top: number; right: number; bottom: number; left: number };
  presentationMode?: 'fullscreen' | 'viewport';
}
export interface DistanceModel {
  focalPx: number; focalSource: 'blind-spot' | 'assumed-fov';
  blindSpotMm: number | null; blindSpotSdMm: number | null; irisMm: number;
}
export interface SessionGeometry { screen: ScreenGeometry; distance: DistanceModel; refDistanceMm: number | null; degreesApproximate: boolean; }

export type Phase = 'fixation' | 'pursuit' | 'head' | 'validation' | 'drift' | 'game';
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
  deviceTiltDeg?: number | null;   // phone upright angle θ (0 flat, 90 vertical), §17.5.4
  deviceRollDeg?: number | null; } // in-plane roll, corrected for screen.orientation.angle
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
  selection: Selection; fitMs: number; warnings: string[]; fitGeometry?: SessionGeometry;
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
