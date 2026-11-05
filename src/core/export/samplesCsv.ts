// samples.csv (specification §4.16): one row per frame per session phase for the selected
// estimator, plus per-engine columns and the phone's tilt covariates (§17.10.2). The header order matters: eek-a-gaze takes the first
// header that matches a synonym, so `time_ms`, `gaze_x` and `gaze_y` must come before anything
// else it could mistake for them.
import { degToPx, toExportDeg } from '../geometry/angles.ts';
import { ENGINE_IDS, INVALID_MASK } from '../types.ts';
import type { FrameMeta, GazeSample, SessionGeometry, Vec2, Vec3 } from '../types.ts';
import { csvTable, fmtBool, fmtDeg, fmtInt, fmtMm, fmtMs, fmtPx, fmtSig, relMs, type ExportIdentity } from './csv.ts';

export const SAMPLES_HEADER = [
  'participant', 'session', 'trial', 'phase', 'item_id', 'time_ms', 'frame_index', 'estimator', 'gaze_x', 'gaze_y', 'gaze_x_filt', 'gaze_y_filt',
  'gaze_x_uncorrected', 'gaze_y_uncorrected', 'gaze_x_deg', 'gaze_y_deg', 'drift_x_deg', 'drift_y_deg', 'valid', 'flags', 'confidence',
  'target_x', 'target_y', 'head_yaw_deg', 'head_pitch_deg', 'head_roll_deg', 'distance_mm', 'iris_px', 'clock',
  'gaze_x_blazegaze', 'gaze_y_blazegaze', 'gaze_x_peekr', 'gaze_y_peekr', 'gaze_x_geometric', 'gaze_y_geometric', 'gaze_x_eyepixel', 'gaze_y_eyepixel',
  // The tilt covariates of §17.10.2 come last, so the columns before them keep their order.
  'device_tilt_deg', 'device_roll_deg',
] as const;

export type TrialKind = 'calibration' | 'validation' | 'drift' | 'live' | 'game';

/** `calibration`, `validation-<n>`, `drift-<n>`, `live-<nnn>` or `game-<nnn>` (a challenge round, §17.10.1), with n counted from 1. */
export function trialName(kind: TrialKind, n = 1): string {
  if (kind === 'calibration') return 'calibration';
  if (!(Number.isSafeInteger(n) && n >= 1)) throw new RangeError(`trialName: n must be a positive integer, got ${n}`);
  if (kind === 'live' || kind === 'game') return `${kind}-${String(n).padStart(3, '0')}`;
  return `${kind}-${n}`;
}

export interface SampleRow {
  /** `trialName(...)`. */
  trial: string;
  /** The phase of the frame's item (`fixation`, `pursuit`, …), `live` in Live, `game` in a challenge round, null between items. */
  phase: string | null;
  itemId: string | null;
  /** The selected estimator's sample for this frame. */
  sample: GazeSample;
  clock: FrameMeta['clock'];
  /** Head yaw, pitch and roll, degrees. */
  headDeg: Vec3 | null;
  irisPx: number | null;
  /** The target's position at this frame (px), when one was shown. */
  targetPx: Vec2 | null;
  /** The drift offset in effect (§4.13), internal degrees (y down); null before any drift check. */
  driftDeg: Vec2 | null;
  /** The phone's upright angle θ and in-plane roll at this frame (§17.5.4); null or absent without a reading. */
  deviceTiltDeg?: number | null;
  deviceRollDeg?: number | null;
}

/** Valid for export: no invalid flag and a finite corrected θ. */
export function isExportValid(s: GazeSample): boolean {
  const d = s.correctedDeg;
  return (s.flags & INVALID_MASK) === 0 && d !== null && Number.isFinite(d[0]) && Number.isFinite(d[1]);
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function xy(v: Vec2 | null | undefined, fmt: (n: number) => string): [string, string] {
  return v === null || v === undefined ? ['', ''] : [fmt(v[0]), fmt(v[1])];
}

/**
 * Writes the rows in the order given. When a row's sample is not valid, every gaze column is
 * empty (`valid` and `flags` say why); the tilt columns are empty without a reading. Pixel columns are CSS px of the viewport, origin top
 * left; degree columns are positive up (`toExportDeg`). The per-engine columns convert each
 * engine's θ to px at the frame's distance (else D_ref), as the estimator does.
 */
export function samplesCsv(id: ExportIdentity, rows: readonly SampleRow[], g: SessionGeometry): string {
  const body = rows.map((r) => {
    const s = r.sample;
    const valid = isExportValid(s);
    const distance = positive(s.distanceMm) ? s.distanceMm : positive(g.refDistanceMm) ? g.refDistanceMm : null;
    const perEngine = ENGINE_IDS.flatMap((e) => {
      const deg = s.perEngineDeg[e];
      if (!valid || deg === undefined || distance === null) return ['', ''];
      return xy(degToPx(deg, g.screen, distance), fmtPx);
    });
    return [
      id.participant,
      id.session,
      r.trial,
      r.phase ?? '',
      r.itemId ?? '',
      fmtMs(relMs(id, s.tCaptureMs)),
      fmtInt(s.frameIndex),
      s.estimator,
      ...xy(valid ? s.correctedPx : null, fmtPx),
      ...xy(valid ? s.filteredPx : null, fmtPx),
      ...xy(valid ? s.rawPx : null, fmtPx),
      ...xy(valid && s.correctedDeg !== null ? toExportDeg(s.correctedDeg) : null, fmtDeg),
      ...xy(r.driftDeg === null ? null : toExportDeg(r.driftDeg), fmtDeg),
      fmtBool(valid),
      fmtInt(s.flags),
      fmtSig(s.confidence),
      ...xy(r.targetPx, fmtPx),
      fmtDeg(r.headDeg?.[0]),
      fmtDeg(r.headDeg?.[1]),
      fmtDeg(r.headDeg?.[2]),
      fmtMm(s.distanceMm),
      fmtPx(r.irisPx),
      r.clock,
      ...perEngine,
      fmtDeg(r.deviceTiltDeg),
      fmtDeg(r.deviceRollDeg),
    ];
  });
  return csvTable(SAMPLES_HEADER, body);
}
