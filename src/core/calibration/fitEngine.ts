// Per-engine fitting (specification §4.8.2–§4.8.5) and the whole calibration fit: pruning, the
// pursuit lag, every engine's mapper candidates with exact grouped leave-one-location-out
// cross-validation and the robust refit, the choice within each engine, Combined, Auto selection
// and the head range. DOM-free; the fit worker runs it, and so does Node.
import { FIT_BUDGET_MS, LAG, ROBUST } from '../constants.ts';
import { angularSeparationDeg, pxToDeg } from '../geometry/angles.ts';
import { layoutToPx } from '../geometry/screen.ts';
import { oofFromResiduals, type CvScoreOptions } from '../maths/groupedLoo.ts';
import { ridgeFit, ridgeFitFromGram, ridgeInverse, leveragesOfFit, residuals, resolveLambda, withIntercept } from '../maths/ridge.ts';
import { hardReject, huberReweight, residualNorms, selectLambda, type RidgeProblem } from '../maths/robust.ts';
import { fitFeatureTransform, normaliseWeights, transformRows } from '../maths/standardise.ts';
import { percentile } from '../maths/stats.ts';
import { computeHeadRange } from '../protocol/headRange.ts';
import { estimatePursuitLag, type LagEstimate, type LagSample } from '../protocol/lag.ts';
import { pursuitPoint } from '../protocol/pursuit.ts';
import { ENGINE_RANK } from '../types.ts';
import type { CandidateScore, CvReport, EngineFit, EngineId, FitResult, MapperSpec, MappingState, PursuitItem, Recording } from '../types.ts';
import { buildDataset, buildDesign, referenceDistanceMm, targetMatrix, unitWeights, type CalibrationRow, type Dataset } from './dataset.ts';
import { fitProvisional, pruneByResidual, pruneFixationRows, type ProvisionalModel } from './prune.ts';
import { mappingState } from './restore.ts';
import { selectEstimator } from './select.ts';
import { fitCombined, type MemberInput } from './stack.ts';

export const FIT_SCHEMA = 'eek-a-calibrate/fit@1';

export interface CandidateFit {
  spec: MapperSpec;
  state: MappingState;
  /** CV at the chosen λ with the robust weights (slightly optimistic, §4.8.3). */
  cv: CvReport;
  /** One entry per λ of the grid that gave a finite score, from the re-selection on the robust weights. */
  scores: CandidateScore[];
  /** Dataset row ids of the training rows, and their out-of-fold predictions (n × 2). */
  ids: number[];
  oof: Float64Array;
  /** Rows given weight 0 by hard rejection. */
  rejected: number;
}

/**
 * Fits one mapper candidate on the dataset rows with a positive weight that its engine covers:
 * the §4.8.2 standardisation (floors, the seeded PCA block), the intercept-first design, then the
 * §4.8.3 robust refit. Hard-rejected rows are left out of the robust CV score (§15.2.1), so the
 * re-selection of λ and the reported CV use an explicit score mask.
 */
export function fitCandidate(spec: MapperSpec, ds: Dataset, weights: ArrayLike<number>, nAccepted: number, seed: number, featureVersion: string): CandidateFit {
  const design = buildDesign(spec, ds.rows, weights);
  const { ids, X, n, pIn } = design;
  if (n < 3) throw new RangeError(`${spec.engine}/${spec.id}: only ${n} calibration rows`);
  const w = normaliseWeights(ids.map((id) => weights[id] as number));
  const t = fitFeatureTransform(X, w, n, pIn, spec, seed);
  const q = t.pOut + 1;
  const Z = withIntercept(transformRows(t, X, n), n, t.pOut);
  const Y = targetMatrix(ds.rows, ids);
  const groups = Int32Array.from(ids, (id) => ds.group[id] as number);
  const cv: CvScoreOptions = {
    fixation: Uint8Array.from(ids, (id) => ds.fixation[id] as number),
    groupName: (g) => ds.groupNames[g] as string,
    coverage: nAccepted > 0 ? n / nAccepted : 0,
  };
  const absolute = spec.absoluteLambda === true;
  const problem: RidgeProblem = {
    Z, Y, w, n, p: q, groups, unpenalised: [0], lambdaRel: spec.lambdaRel, absoluteLambda: absolute, ang: angularSeparationDeg, cv,
  };

  // (1) λ* on the base weights; (2) Huber IRLS at λ*; (3) hard rejection.
  const base = selectLambda(problem, w);
  let fit = ridgeFitFromGram(base.gram, base.cross, q, base.lambda, [0]);
  let robust = w;
  for (let pass = 0; pass < ROBUST.irlsPasses; pass++) {
    robust = huberReweight(residualNorms(residuals(Z, Y, fit.B, n, q), n), w, ROBUST.huberK).weights;
    fit = ridgeFit(Z, Y, robust, n, q, resolveLambda(base.lambdaRel, robust, absolute), [0]);
  }
  const hard = hardReject(residualNorms(residuals(Z, Y, fit.B, n, q), n), groups, robust, ROBUST.hardRejectZ);
  const score = Uint8Array.from(hard.rejected, (r) => (r ? 0 : 1));

  // (4) λ re-selected with the robust weights held fixed; (5) the final fit.
  const sel = selectLambda({ ...problem, cv: { ...cv, score } }, hard.weights);
  const final = ridgeFitFromGram(sel.gram, sel.cross, q, sel.lambda, [0]);
  const A = ridgeInverse(final);
  const lev = leveragesOfFit(final, Z, n);
  const h95 = percentile(Array.from(lev).filter((_, i) => (hard.weights[i] as number) > 0), 95);
  if (!(h95 > 0)) throw new RangeError(`${spec.engine}/${spec.id}: no positive leverage`);
  return {
    spec,
    state: mappingState(spec, featureVersion, t, { lambdaRel: sel.lambdaRel, B: final.B, A, h95 }),
    cv: sel.cv,
    scores: sel.candidates.filter((c) => c.cv !== null && Number.isFinite(c.cv.meanDeg)).map((c) => ({ mapper: spec.id, lambdaRel: c.lambdaRel, cv: c.cv as CvReport })),
    ids,
    oof: oofFromResiduals(Y, sel.residuals),
    rejected: hard.rejected.reduce((s, r) => s + r, 0),
  };
}

/**
 * The choice within an engine (§4.8.4): the lowest meanDeg, unless a candidate of lower
 * complexity lies within one SE of it (one-standard-error rule); among those, the lowest
 * complexity, then the lower meanDeg. Returns an index into `candidates`, or −1 if none is finite.
 */
export function chooseCandidate(candidates: readonly { complexity: number; cv: CvReport }[]): number {
  let best = -1;
  candidates.forEach((c, i) => {
    if (Number.isFinite(c.cv.meanDeg) && (best < 0 || c.cv.meanDeg < (candidates[best] as { cv: CvReport }).cv.meanDeg)) best = i;
  });
  if (best < 0) return -1;
  const b = candidates[best] as { complexity: number; cv: CvReport };
  const limit = b.cv.meanDeg + (Number.isFinite(b.cv.seDeg) ? b.cv.seDeg : 0);
  let chosen = best;
  candidates.forEach((c, i) => {
    if (!(Number.isFinite(c.cv.meanDeg) && c.cv.meanDeg <= limit)) return;
    const cur = candidates[chosen] as { complexity: number; cv: CvReport };
    if (c.complexity < cur.complexity || (c.complexity === cur.complexity && c.cv.meanDeg < cur.cv.meanDeg)) chosen = i;
  });
  return chosen;
}

export type MapperCatalogue = Readonly<Partial<Record<EngineId, readonly MapperSpec[]>>>;

export interface FitCalibrationOptions {
  seed: number;
  /** The engines to fit; their order does not matter (they are fitted in rank order). */
  engines: readonly EngineId[];
  /** The fit budget (§4.8.4); FIT_BUDGET_MS by default. */
  maxMs?: number;
  /** Every engine's mapper candidates (engines/mappers.ts MAPPERS, passed in: core imports nothing outside core). */
  mappers: MapperCatalogue;
  featureVersions?: Partial<Record<EngineId, string>>;
  /** A millisecond clock for fitMs and the budget; performance.now by default. */
  now?: () => number;
}

export type FitProgress = (stage: string, fraction: number) => void;

/** The expensive candidate that is dropped first when the budget runs out (§4.8.4). */
const LAST_CANDIDATE = 'emb-ridge';

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Accepted pursuit frames over the delivered pursuit frames outside the hold and discard. Frames
 * the vision host refused count as not accepted: with too few processed frames the lag is not
 * estimated from them.
 */
function pursuitAcceptance(recs: readonly Recording[]): { frames: number; accepted: number } {
  let frames = 0;
  let accepted = 0;
  for (const rec of recs) {
    for (const f of rec.frames) {
      const label = f.label;
      if (!label || label.phase !== 'pursuit' || label.reject === 'settle') continue;
      frames++;
      if (label.accepted) accepted++;
    }
  }
  return { frames, accepted };
}

function lagSamples(ds: Dataset, recs: readonly Recording[], keep: readonly boolean[], model: ProvisionalModel): LagSample[] {
  const out: LagSample[] = [];
  for (const row of ds.rows) {
    if (row.phase !== 'pursuit' || !keep[row.id]) continue;
    const pred = model.predict(row);
    if (!pred) continue;
    const rec = recs[row.rec] as Recording;
    const item = rec.schedule.items.find((it) => it.id === row.itemId) as PursuitItem;
    const screen = rec.geometry.screen;
    const t = row.frame.meta.tCaptureMs;
    out.push({
      predDeg: pred,
      weight: 1,
      targetDegAt: (lagMs) => {
        const p = pursuitPoint(item, t - lagMs - row.onsetMs - item.holdMs);
        return pxToDeg(layoutToPx(p[0], p[1], screen), screen, row.distanceMm);
      },
    });
  }
  return out;
}

/**
 * The calibration fit of §4.8–§4.10 on one calibration recording (plus any quick-recalibration
 * recordings, whose rows weigh ×2). Deterministic for a given input and seed, except `fitMs` and
 * the budget, which follow the clock. Throws when nothing can be fitted.
 */
export function fitCalibration(recs: readonly Recording[], opts: FitCalibrationOptions, onProgress: FitProgress = () => {}): FitResult {
  const now = opts.now ?? (() => performance.now());
  const t0 = now();
  const maxMs = opts.maxMs ?? FIT_BUDGET_MS;
  const warnings: string[] = [];
  const rec = recs[0];
  if (!rec) throw new RangeError('fitCalibration: no recording');
  const refDistanceMm = positive(rec.geometry.refDistanceMm) ? rec.geometry.refDistanceMm : referenceDistanceMm(recs);
  if (!positive(refDistanceMm)) throw new RangeError('No accepted calibration frame had a measurable viewing distance (no iris was found), so nothing can be fitted.');
  onProgress('prepare', 0.02);

  // Pruning and the lag (§4.8.1, §4.8.6), on the geometric engine's signals.
  const ds0 = buildDataset(recs, LAG.fallbackMs, refDistanceMm);
  if (ds0.rows.length === 0) throw new RangeError('No calibration frame was accepted, so nothing can be fitted.');
  const keep = ds0.rows.map(() => true);
  const geoLinear = opts.mappers.geometric?.find((m) => m.id === 'geo-linear') ?? null;
  let provisional: ProvisionalModel | null = null;
  let pruned = 0;
  // The pruning signals come from the geometric engine's frames, which the vision host computes
  // whether or not the geometric engine is among those fitted.
  const hasGeometric = ds0.rows.some((r) => r.frame.engines.geometric?.status === 'ok');
  if (geoLinear && hasGeometric) {
    pruned += pruneFixationRows(ds0.rows, geoLinear, keep);
    try {
      provisional = fitProvisional(geoLinear, ds0.rows, keep, opts.seed);
      pruned += pruneByResidual(ds0.rows, 'head', provisional, keep);
    } catch (error) {
      warnings.push(`The provisional fixation fit failed (${error instanceof Error ? error.message : String(error)}); head and pursuit rows were not pruned.`);
    }
  } else {
    warnings.push('No geometric engine frames were recorded, so no rows were pruned and the pursuit lag is the default.');
  }

  const hasPursuit = recs.some((r) => r.schedule.items.some((it) => it.kind === 'pursuit'));
  let lag: LagEstimate = { lagMs: LAG.fallbackMs, source: 'fallback', reason: hasPursuit ? 'no provisional fit' : 'no pursuit block', curve: [] };
  if (hasPursuit && provisional) {
    const acc = pursuitAcceptance(recs);
    lag = estimatePursuitLag(lagSamples(ds0, recs, keep, provisional), acc.frames > 0 ? acc.accepted / acc.frames : 0);
  }
  if (hasPursuit && lag.source === 'fallback') warnings.push(`The pursuit lag is the default ${LAG.fallbackMs} ms: ${lag.reason}.`);
  onProgress('lag', 0.08);

  const ds = lag.lagMs === LAG.fallbackMs ? ds0 : buildDataset(recs, lag.lagMs, refDistanceMm);
  if (ds.rows.length !== ds0.rows.length) throw new Error('fitCalibration: the dataset changed size when the lag was applied');
  if (provisional) pruned += pruneByResidual(ds.rows, 'pursuit', provisional, keep);
  const weights = unitWeights(ds.rows, keep);
  const nAccepted = keep.filter(Boolean).length;

  // Every engine's candidates, the expensive one last so that the budget drops it first.
  const engines = [...new Set(opts.engines)].filter((e) => opts.mappers[e] !== undefined).sort((a, b) => ENGINE_RANK[a] - ENGINE_RANK[b]);
  const jobs = engines.flatMap((engine) => (opts.mappers[engine] ?? []).map((spec) => ({ engine, spec })));
  jobs.sort((a, b) => Number(a.spec.id === LAST_CANDIDATE) - Number(b.spec.id === LAST_CANDIDATE));
  const byEngine = new Map<EngineId, CandidateFit[]>();
  jobs.forEach(({ engine, spec }, k) => {
    onProgress(`fit ${engine}/${spec.id}`, 0.1 + (0.8 * k) / Math.max(1, jobs.length));
    if (spec.id === LAST_CANDIDATE && now() - t0 > maxMs) {
      warnings.push(`The ${spec.id} candidate of ${engine} was dropped: the fit had already taken ${Math.round(now() - t0)} ms of its ${maxMs} ms budget.`);
      return;
    }
    try {
      const fit = fitCandidate(spec, ds, weights, nAccepted, opts.seed, opts.featureVersions?.[engine] ?? 'unknown');
      const list = byEngine.get(engine) ?? [];
      list.push(fit);
      byEngine.set(engine, list);
    } catch (error) {
      warnings.push(`${engine}/${spec.id} could not be fitted: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const fits: Partial<Record<EngineId, EngineFit>> = {};
  const members: MemberInput[] = [];
  for (const engine of engines) {
    const cands = byEngine.get(engine) ?? [];
    // Candidates in the catalogue's order, whatever order the budget fitted them in.
    const order = (opts.mappers[engine] ?? []).map((s) => s.id);
    cands.sort((a, b) => order.indexOf(a.spec.id) - order.indexOf(b.spec.id));
    const i = chooseCandidate(cands.map((c) => ({ complexity: c.spec.complexity, cv: c.cv })));
    if (i < 0) {
      warnings.push(`${engine} was not fitted: no candidate gave a finite cross-validated error.`);
      continue;
    }
    const chosen = cands[i] as CandidateFit;
    fits[engine] = {
      engine,
      chosen: chosen.state,
      cv: chosen.cv,
      candidates: cands.flatMap((c) => c.scores),
      oofDeg: Array.from(chosen.oof),
      rowFrameIndex: chosen.ids.map((id) => (ds.rows[id] as CalibrationRow).frame.meta.index),
      nPruned: pruned,
    };
    members.push({ engine, ids: chosen.ids, oof: chosen.oof, cv: chosen.cv });
  }
  if (members.length === 0) throw new RangeError(`No engine could be fitted. ${warnings.join(' ')}`.trim());
  onProgress('combine', 0.92);

  let combined: FitResult['combined'] = null;
  try {
    combined = fitCombined(members, ds, weights, nAccepted).model;
  } catch (error) {
    warnings.push(`Combined was not formed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const selection = selectEstimator(fits, combined, rec.geometry.degreesApproximate);
  const kept = ds.rows.filter((r) => keep[r.id]);
  const headRange = computeHeadRange(
    kept.map((r) => ({ yawDeg: r.frame.yawDeg as number, pitchDeg: r.frame.pitchDeg as number, lnDistRatio: r.ctx.lnDistRatio, eyeMid: r.ctx.eyeMidNorm })),
  );
  const fitMs = now() - t0;
  if (fitMs > maxMs) warnings.push(`The fit took ${Math.round(fitMs)} ms, more than its ${maxMs} ms budget.`);
  onProgress('done', 1);
  return {
    schema: FIT_SCHEMA,
    seed: opts.seed,
    pursuitLagMs: lag.lagMs,
    refDistanceMm,
    fits,
    combined,
    headRange,
    selection,
    fitMs,
    warnings,
    fitGeometry: { ...rec.geometry, screen: { ...rec.geometry.screen }, distance: { ...rec.geometry.distance }, refDistanceMm },
  };
}
