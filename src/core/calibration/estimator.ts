// Prediction-time handling (specification §4.10, §14.1.3): every fitted engine and Combined as
// an Estimator that turns a recorded frame into a GazeSample with flags and an advisory
// confidence.
//
// Geometry. Each mapping regresses degrees under the geometry it was fitted with
// (FitResult.fitGeometry). Its predictions are first placed in CSS px with that geometry and the
// frame's distance; those pixels never change. Degrees are then reported under the session's
// current geometry, which may have been measured after calibration. Frames passed to an estimator
// carry distances computed with the current geometry's focal length; D_t scales with f_px, so the
// fit-time distance is D_t·f_fit/f_now and lnDistRatio is unchanged.
import { OFFSCREEN_FRACTION } from '../constants.ts';
import { angularSeparationDeg, degToPx, pxToDeg } from '../geometry/angles.ts';
import { combineAvailable } from '../maths/simplex.ts';
import { inHeadRange } from '../protocol/headRange.ts';
import { ENGINE_IDS, Flags } from '../types.ts';
import type { EngineId, EstimatorId, FitResult, GazeSample, MappedGaze, RecordedFrame, RowContext, SessionGeometry, Vec2 } from '../types.ts';
import { rowContext } from './dataset.ts';
import type { MapperCatalogue } from './fitEngine.ts';
import { restoreMapping, type RestoredMapping } from './restore.ts';

export interface Estimator {
  readonly id: EstimatorId;
  estimate(f: RecordedFrame, baseFlags: number): GazeSample;
}

/** The spread at which the agreement term of the confidence falls to e^−½ (§4.10). */
export const AGREEMENT_SCALE_DEG = 2;

/**
 * Flags that follow from the frame alone: DROPPED for a frame the vision host refused, else
 * NO_FACE without a face and BLINK with the eyes closed (after the ±1-frame mask), plus HIDDEN and
 * NOT_FULLSCREEN when the label recorded them.
 */
export function frameBaseFlags(f: RecordedFrame): number {
  const reject = f.label?.reject ?? null;
  let flags = 0;
  if (reject === 'dropped') flags |= Flags.DROPPED;
  else if (f.yawDeg === null) flags |= Flags.NO_FACE;
  else if (!f.open) flags |= Flags.BLINK;
  if (reject === 'hidden') flags |= Flags.HIDDEN;
  if (reject === 'not-fullscreen') flags |= Flags.NOT_FULLSCREEN;
  return flags;
}

interface FrameOutputs {
  /** Fit-geometry degrees of each fitted engine, null where its mapper gave nothing. */
  engines: Partial<Record<EngineId, MappedGaze | null>>;
  ctx: RowContext | null;
  inRange: boolean;
  fitDistanceMm: number;
  reportDistanceMm: number;
}

function sameGeometry(a: SessionGeometry, b: SessionGeometry): boolean {
  const s = a.screen;
  const t = b.screen;
  return s.viewportWpx === t.viewportWpx && s.viewportHpx === t.viewportHpx && s.pxPerMm === t.pxPerMm && a.distance.focalPx === b.distance.focalPx;
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * The estimators of a fit: one per fitted engine, and Combined when the fit has it. They share a
 * per-frame cache, so each engine's mapping runs once per frame whichever estimators are asked.
 * `geometry` is the session's current geometry (FitResult.fitGeometry when it is absent).
 */
export class EstimatorSet {
  readonly fit: FitResult;
  readonly fitGeometry: SessionGeometry;
  readonly geometry: SessionGeometry;
  readonly mappings: ReadonlyMap<EngineId, RestoredMapping>;
  private readonly cache = new WeakMap<RecordedFrame, FrameOutputs>();
  private readonly same: boolean;
  private readonly focalRatio: number;
  private drift: Vec2 = [0, 0];

  constructor(fit: FitResult, mappers: MapperCatalogue, geometry?: SessionGeometry | null) {
    if (!fit.fitGeometry) throw new RangeError('EstimatorSet: the fit has no fitGeometry');
    this.fit = fit;
    this.fitGeometry = fit.fitGeometry;
    this.geometry = geometry ?? fit.fitGeometry;
    this.same = sameGeometry(this.fitGeometry, this.geometry);
    this.focalRatio = this.fitGeometry.distance.focalPx / this.geometry.distance.focalPx;
    if (!(this.focalRatio > 0 && Number.isFinite(this.focalRatio))) throw new RangeError('EstimatorSet: invalid focal lengths');
    const mappings = new Map<EngineId, RestoredMapping>();
    for (const engine of ENGINE_IDS) {
      const ef = fit.fits[engine];
      if (!ef) continue;
      const spec = mappers[engine]?.find((m) => m.id === ef.chosen.mapper);
      if (!spec) throw new RangeError(`EstimatorSet: no mapper ${engine}/${ef.chosen.mapper}`);
      mappings.set(engine, restoreMapping(ef.chosen, spec));
    }
    this.mappings = mappings;
  }

  /** Estimator ids: Combined first when present, then the engines in rank order. */
  ids(): EstimatorId[] {
    return [...(this.fit.combined ? (['combined'] as EstimatorId[]) : []), ...this.mappings.keys()];
  }

  /** The drift offset (§4.13), degrees under the current geometry, added to every corrected θ. */
  setDrift(offsetDeg: Vec2): void {
    if (!Number.isFinite(offsetDeg[0]) || !Number.isFinite(offsetDeg[1])) throw new RangeError('setDrift: the offset must be finite');
    this.drift = [offsetDeg[0], offsetDeg[1]];
  }

  get driftDeg(): Vec2 {
    return this.drift;
  }

  estimator(id: EstimatorId): Estimator {
    if (id === 'combined' ? !this.fit.combined : !this.mappings.has(id)) throw new RangeError(`EstimatorSet: ${id} was not fitted`);
    return { id, estimate: (f, baseFlags) => this.estimate(id, f, baseFlags) };
  }

  private outputs(f: RecordedFrame): FrameOutputs {
    const cached = this.cache.get(f);
    if (cached) return cached;
    const fitRef = this.fit.refDistanceMm;
    const reportDistanceMm = positive(f.distanceMm) ? f.distanceMm : (this.geometry.refDistanceMm ?? fitRef / this.focalRatio);
    const fitDistanceMm = reportDistanceMm * this.focalRatio;
    const ctx = rowContext({ ...f, distanceMm: fitDistanceMm }, fitRef);
    const engines: Partial<Record<EngineId, MappedGaze | null>> = {};
    for (const [engine, m] of this.mappings) engines[engine] = ctx ? m.predictFrame(f.engines[engine], ctx) : null;
    const inRange =
      ctx !== null &&
      inHeadRange(this.fit.headRange, { yawDeg: f.yawDeg as number, pitchDeg: f.pitchDeg as number, lnDistRatio: ctx.lnDistRatio, eyeMid: ctx.eyeMidNorm });
    const out: FrameOutputs = { engines, ctx, inRange, fitDistanceMm, reportDistanceMm };
    this.cache.set(f, out);
    return out;
  }

  /** Fit-geometry degrees → CSS px (fixed) → current-geometry degrees. */
  private report(degFit: Vec2, o: FrameOutputs): { px: Vec2; deg: Vec2 } {
    const px = degToPx(degFit, this.fitGeometry.screen, o.fitDistanceMm);
    return { px, deg: this.same ? degFit : pxToDeg(px, this.geometry.screen, o.reportDistanceMm) };
  }

  private estimate(id: EstimatorId, f: RecordedFrame, baseFlags: number): GazeSample {
    const o = this.outputs(f);
    let flags = baseFlags;
    if (o.ctx === null) flags |= Flags.NO_FACE;
    else if (!o.inRange) flags |= Flags.OUT_OF_RANGE;

    const perEngineDeg: Partial<Record<EngineId, Vec2>> = {};
    const reported = new Map<EngineId, { px: Vec2; deg: Vec2 }>();
    for (const [engine, g] of Object.entries(o.engines) as [EngineId, MappedGaze | null][]) {
      if (!g) continue;
      const r = this.report(g.deg, o);
      reported.set(engine, r);
      perEngineDeg[engine] = r.deg;
    }

    let degFit: Vec2 | null = null;
    let hTerm = 0;
    let extrapolated = false;
    const combined = this.fit.combined;
    if (id === 'combined' && combined) {
      const preds = combined.members.map((e) => o.engines[e]?.deg ?? null);
      degFit = combineAvailable(
        combined.members.map((e) => combined.wx[e] ?? 0),
        combined.members.map((e) => combined.wy[e] ?? 0),
        preds,
      );
      // The leverage term of Combined: the members' terms weighted by their mean axis weight.
      let wSum = 0;
      combined.members.forEach((e) => {
        const g = o.engines[e];
        const m = this.mappings.get(e);
        if (!g || !m) return;
        const w = ((combined.wx[e] ?? 0) + (combined.wy[e] ?? 0)) / 2;
        if (w > 0 && g.extrapolated) extrapolated = true;
        hTerm += w * Math.exp(-0.5 * (g.leverage / m.state.h95) ** 2);
        wSum += w;
      });
      hTerm = wSum > 0 ? hTerm / wSum : 0;
    } else if (id !== 'combined') {
      const g = o.engines[id];
      const m = this.mappings.get(id);
      if (g && m) {
        degFit = g.deg;
        extrapolated = g.extrapolated;
        hTerm = Math.exp(-0.5 * (g.leverage / m.state.h95) ** 2);
      }
    }

    const base = {
      frameIndex: f.meta.index,
      tCaptureMs: f.meta.tCaptureMs,
      estimator: id,
      perEngineDeg,
      distanceMm: positive(f.distanceMm) ? f.distanceMm : null,
      filteredPx: null,
    };
    if (degFit === null) {
      return { ...base, rawDeg: null, correctedDeg: null, rawPx: null, correctedPx: null, flags: flags | Flags.ENGINE_ERROR, confidence: 0 };
    }
    if (extrapolated) flags |= Flags.EXTRAPOLATED;
    const raw = this.report(degFit, o);
    const drift = this.drift;
    const correctedDeg: Vec2 = [raw.deg[0] + drift[0], raw.deg[1] + drift[1]];
    const correctedPx = drift[0] === 0 && drift[1] === 0 ? raw.px : degToPx(correctedDeg, this.geometry.screen, o.reportDistanceMm);
    const W = this.geometry.screen.viewportWpx;
    const H = this.geometry.screen.viewportHpx;
    const [x, y] = correctedPx;
    if (!(x >= -OFFSCREEN_FRACTION * W && x <= (1 + OFFSCREEN_FRACTION) * W && y >= -OFFSCREEN_FRACTION * H && y <= (1 + OFFSCREEN_FRACTION) * H)) {
      flags |= Flags.OFFSCREEN;
    }

    // Agreement: the RMS angle of the Combined members' predictions from the Combined prediction.
    let agreement = 1;
    if (combined) {
      const members = combined.members.filter((e) => o.engines[e]);
      const centre = id === 'combined' ? degFit : combineAvailable(
        combined.members.map((e) => combined.wx[e] ?? 0),
        combined.members.map((e) => combined.wy[e] ?? 0),
        combined.members.map((e) => o.engines[e]?.deg ?? null),
      );
      if (members.length >= 2 && centre) {
        const ss = members.reduce((s, e) => s + angularSeparationDeg((o.engines[e] as MappedGaze).deg, centre) ** 2, 0);
        agreement = Math.exp(-0.5 * (Math.sqrt(ss / members.length) / AGREEMENT_SCALE_DEG) ** 2);
      }
    }

    return {
      ...base,
      rawDeg: raw.deg,
      correctedDeg,
      rawPx: raw.px,
      correctedPx,
      flags,
      confidence: hTerm * agreement,
    };
  }
}
