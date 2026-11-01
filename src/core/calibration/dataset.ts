// The calibration dataset (specification §4.7 labels, weights and groups; §4.8): one row per
// accepted calibration frame, shared by every engine, with its target in degrees at that frame's
// viewing distance, its RowContext, its weighting unit and its cross-validation group.
import { WEIGHTS } from '../constants.ts';
import { pxToDeg } from '../geometry/angles.ts';
import { layoutToPx, safeRect } from '../geometry/screen.ts';
import { nearestCalibrationGroup } from '../protocol/layouts.ts';
import { pursuitPoint } from '../protocol/pursuit.ts';
import type { EngineId, MapperSpec, Phase, PursuitItem, RecordedFrame, Recording, RowContext, ScheduleItem, TargetItem, Vec2 } from '../types.ts';

const RAD = Math.PI / 180;

export type CalibrationPhase = Extract<Phase, 'fixation' | 'pursuit' | 'head'>;

export interface CalibrationRow {
  /** Position in the dataset. */
  id: number;
  /** Index of the recording the frame came from. */
  rec: number;
  frame: RecordedFrame;
  phase: CalibrationPhase;
  itemId: string;
  /** The presentation's onset (capture clock), from the label's tRelMs. */
  onsetMs: number;
  /** Weighting unit (§4.7): a fixation location (blocks A and A′ together), the pursuit block, or a head location. */
  unit: string;
  groupId: string;
  targetNorm: Vec2;
  targetPx: Vec2;
  /** The target direction, degrees from the screen-centre normal at `distanceMm` (y down). */
  targetDeg: Vec2;
  /** D_t, or D_ref when the frame had no distance. */
  distanceMm: number;
  ctx: RowContext;
  /** ×2 for rows of a quick recalibration (§4.13). */
  factor: number;
}

export interface Dataset {
  rows: CalibrationRow[];
  /** Sorted group names; a row's integer group is its index here. */
  groupNames: string[];
  group: Int32Array;
  /** 1 for fixation rows: the CV score averages over the groups that contain one (§4.8.3). */
  fixation: Uint8Array;
  refDistanceMm: number;
  lagMs: number;
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

const CALIBRATION_PHASES: ReadonlySet<Phase> = new Set(['fixation', 'pursuit', 'head']);

/** The calibration phase of an accepted, labelled frame, else null. */
export function calibrationPhase(f: RecordedFrame): CalibrationPhase | null {
  const label = f.label;
  if (!label || !label.accepted || !CALIBRATION_PHASES.has(label.phase)) return null;
  return label.phase as CalibrationPhase;
}

/** The RowContext of a frame with a face; lnDistRatio = ln(D_t / D_ref), 0 without a distance. */
export function rowContext(f: RecordedFrame, refDistanceMm: number): RowContext | null {
  if (f.yawDeg === null || f.pitchDeg === null || f.rollDeg === null || f.eyeMidNorm === null) return null;
  const d = positive(f.distanceMm) ? f.distanceMm : refDistanceMm;
  return {
    yawRad: f.yawDeg * RAD,
    pitchRad: f.pitchDeg * RAD,
    rollRad: f.rollDeg * RAD,
    eyeMidNorm: f.eyeMidNorm,
    lnDistRatio: Math.log(d / refDistanceMm),
  };
}

/** D_ref: the median of D_t over the accepted calibration frames (§4.4); null when none has one. */
export function referenceDistanceMm(recs: readonly Recording[]): number | null {
  const ds: number[] = [];
  for (const rec of recs) for (const f of rec.frames) if (calibrationPhase(f) && positive(f.distanceMm)) ds.push(f.distanceMm);
  if (ds.length === 0) return null;
  ds.sort((a, b) => a - b);
  const m = ds.length >> 1;
  return ds.length % 2 ? (ds[m] as number) : ((ds[m - 1] as number) + (ds[m] as number)) / 2;
}

/**
 * Builds the rows of every accepted calibration frame. Pursuit frames are labelled with the
 * target at t − lagMs and grouped with the CAL13 location nearest to it (measured on the screen);
 * rows of a recording whose schedule is a recalibration get the ×2 factor and nearest-location
 * groups. Frames whose item is missing from the schedule, or without a face, are skipped.
 */
export function buildDataset(recs: readonly Recording[], lagMs: number, refDistanceMm: number): Dataset {
  if (!positive(refDistanceMm)) throw new RangeError(`buildDataset: invalid reference distance ${refDistanceMm}`);
  const rows: CalibrationRow[] = [];
  recs.forEach((rec, r) => {
    const items = new Map<string, ScheduleItem>(rec.schedule.items.map((it) => [it.id, it]));
    const screen = rec.geometry.screen;
    const safe = safeRect(screen);
    const recal = rec.schedule.kind === 'recalibration';
    for (const f of rec.frames) {
      const phase = calibrationPhase(f);
      if (!phase) continue;
      const label = f.label!;
      const item = items.get(label.itemId);
      if (!item || item.kind === 'instruction') continue;
      const ctx = rowContext(f, refDistanceMm);
      if (!ctx) continue;
      const t = f.meta.tCaptureMs;
      const onsetMs = t - label.tRelMs;
      let targetNorm: Vec2;
      let groupId: string;
      if (item.kind === 'pursuit') {
        const p = item as PursuitItem;
        targetNorm = pursuitPoint(p, t - lagMs - onsetMs - p.holdMs);
        groupId = nearestCalibrationGroup(targetNorm, safe.w, safe.h);
      } else {
        const ti = item as TargetItem;
        targetNorm = [ti.xNorm, ti.yNorm];
        groupId = recal ? nearestCalibrationGroup(targetNorm, safe.w, safe.h) : ti.groupId;
      }
      const distanceMm = positive(f.distanceMm) ? f.distanceMm : refDistanceMm;
      const targetPx = layoutToPx(targetNorm[0], targetNorm[1], screen);
      const unit = phase === 'pursuit' ? `${r}:pursuit` : recal ? `${r}:recal:${groupId}` : `${phase}:${groupId}`;
      rows.push({
        id: rows.length,
        rec: r,
        frame: f,
        phase,
        itemId: item.id,
        onsetMs,
        unit,
        groupId,
        targetNorm,
        targetPx,
        targetDeg: pxToDeg(targetPx, screen, distanceMm),
        distanceMm,
        ctx,
        factor: recal ? WEIGHTS.recalibrationFactor : 1,
      });
    }
  });
  const groupNames = [...new Set(rows.map((row) => row.groupId))].sort(compareGroupNames);
  const index = new Map(groupNames.map((g, i) => [g, i]));
  const group = Int32Array.from(rows, (row) => index.get(row.groupId) as number);
  const fixation = Uint8Array.from(rows, (row) => (row.phase === 'fixation' ? 1 : 0));
  return { rows, groupNames, group, fixation, refDistanceMm, lagMs };
}

/** loc-2 before loc-10: by prefix, then by number. */
export function compareGroupNames(a: string, b: string): number {
  const ma = /^(.*?)(\d+)$/.exec(a);
  const mb = /^(.*?)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Total weight of each unit (§4.7), before the ×2 recalibration factor. */
export function unitTotal(row: CalibrationRow): number {
  if (row.phase === 'pursuit') return WEIGHTS.pursuitTotal;
  if (row.phase === 'head') return WEIGHTS.headPerLocation;
  return WEIGHTS.fixationPerLocation;
}

/**
 * Base weights: each unit's total spread equally over its rows that are kept (not pruned), times
 * the row's factor; 0 for rows that are not kept.
 */
export function unitWeights(rows: readonly CalibrationRow[], keep: ArrayLike<boolean>): Float64Array {
  const counts = new Map<string, number>();
  rows.forEach((row, i) => {
    if (keep[i]) counts.set(row.unit, (counts.get(row.unit) ?? 0) + 1);
  });
  return Float64Array.from(rows, (row, i) => (keep[i] ? (unitTotal(row) * row.factor) / (counts.get(row.unit) as number) : 0));
}

/** n × 2 targets in degrees. */
export function targetMatrix(rows: readonly CalibrationRow[], ids: readonly number[]): Float64Array {
  const Y = new Float64Array(ids.length * 2);
  ids.forEach((id, i) => {
    const t = (rows[id] as CalibrationRow).targetDeg;
    Y[i * 2] = t[0];
    Y[i * 2 + 1] = t[1];
  });
  return Y;
}

export interface Design {
  engine: EngineId;
  /** Dataset row ids, in design order. */
  ids: number[];
  /** n × pIn raw design rows. */
  X: Float64Array;
  n: number;
  pIn: number;
}

/**
 * The raw design of one mapper over the dataset rows with a positive weight: the rows whose
 * engine frame gives a finite design row. The others are lost to this engine only (coverage).
 */
export function buildDesign(spec: MapperSpec, rows: readonly CalibrationRow[], weights: ArrayLike<number>): Design {
  const pIn = spec.names.length;
  const ids: number[] = [];
  const values: Float64Array[] = [];
  rows.forEach((row, i) => {
    if (!((weights[i] as number) > 0)) return;
    const f = row.frame.engines[spec.engine];
    if (!f) return;
    const x = spec.row(f, row.ctx);
    if (!x) return;
    if (x.length !== pIn) throw new RangeError(`buildDesign: ${spec.engine}/${spec.id} gave ${x.length} columns, expected ${pIn}`);
    for (let j = 0; j < pIn; j++) if (!Number.isFinite(x[j] as number)) return;
    ids.push(i);
    values.push(x);
  });
  const X = new Float64Array(ids.length * pIn);
  values.forEach((x, i) => X.set(x, i * pIn));
  return { engine: spec.engine, ids, X, n: ids.length, pIn };
}
