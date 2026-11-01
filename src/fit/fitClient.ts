// The fit client (specification §6): fitRecording runs the calibration fit in the fit worker
// (inline where no worker can run, as in Node), restoreEstimators turns a FitResult back into
// estimators, and scoreRecording scores a validation recording with them (§4.12, §14.1.3).
import { EstimatorSet, frameBaseFlags, type Estimator } from '../core/calibration/estimator.ts';
import type { FitCalibrationOptions } from '../core/calibration/fitEngine.ts';
import { FIT_BUDGET_MS } from '../core/constants.ts';
import { scoreValidation } from '../core/metrics/validation.ts';
import type { EngineId, EstimatorId, FitResult, GazeSample, RecordedFrame, Recording, SessionGeometry, ValidationReport } from '../core/types.ts';
import { MAPPERS } from '../engines/mappers.ts';

export type { Estimator };
export { EstimatorSet, frameBaseFlags };

export interface FitOptions {
  seed: number;
  engines: EngineId[];
  maxMs: number;
  /** Each engine's featureVersion, stored in its mapping state; read from the engine modules when absent. */
  featureVersions?: Partial<Record<EngineId, string>>;
  /** Quick-recalibration recordings (§4.13), fitted with the calibration at weight ×2. */
  recalibration?: readonly Recording[];
}

export type WorkerFitOptions = Omit<FitCalibrationOptions, 'mappers' | 'now'>;

export interface FitRequest {
  id: number;
  recs: Recording[];
  opts: WorkerFitOptions;
}

export type FitResponse =
  | { t: 'progress'; id: number; stage: string; fraction: number }
  | { t: 'result'; id: number; result: FitResult }
  | { t: 'error'; id: number; message: string };

type Progress = (stage: string, fraction: number) => void;

/** The worker could not be started at all, as opposed to a fit that failed inside it. */
class WorkerStartError extends Error {}

let nextId = 1;

async function engineFeatureVersions(ids: readonly EngineId[]): Promise<Partial<Record<EngineId, string>>> {
  const { ENGINE_LOADERS } = await import('../engines/registry.ts');
  const out: Partial<Record<EngineId, string>> = {};
  for (const id of ids) {
    try {
      out[id] = (await ENGINE_LOADERS[id]()).spec.featureVersion;
    } catch {
      out[id] = 'unknown';
    }
  }
  return out;
}

function runInWorker(recs: Recording[], opts: WorkerFitOptions, onProgress: Progress): Promise<FitResult> {
  return new Promise<FitResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./fit.worker.ts', import.meta.url), { type: 'module', name: 'eek-a-calibrate fit' });
    } catch (error) {
      reject(new WorkerStartError(error instanceof Error ? error.message : String(error)));
      return;
    }
    const id = nextId++;
    let heard = false;
    const finish = (): void => worker.terminate();
    worker.onmessage = (event: MessageEvent<FitResponse>) => {
      const m = event.data;
      if (m.id !== id) return;
      heard = true;
      if (m.t === 'progress') onProgress(m.stage, m.fraction);
      else if (m.t === 'result') {
        finish();
        resolve(m.result);
      } else {
        finish();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      finish();
      const message = event.message || 'the fit worker failed';
      reject(heard ? new Error(message) : new WorkerStartError(message));
    };
    worker.postMessage({ id, recs, opts } satisfies FitRequest);
  });
}

async function runInline(recs: Recording[], opts: WorkerFitOptions, onProgress: Progress): Promise<FitResult> {
  const { fitCalibration } = await import('../core/calibration/fitEngine.ts');
  return fitCalibration(recs, { ...opts, mappers: MAPPERS }, onProgress);
}

/**
 * Fits every engine in `opts.engines` to the calibration recording (§4.8–§4.10). Runs in the fit
 * worker; if the worker cannot start, the same code runs inline on this thread (and in Node).
 * Rejects with the reason when nothing can be fitted.
 */
export async function fitRecording(rec: Recording, opts: FitOptions, onProgress: Progress = () => {}): Promise<FitResult> {
  const featureVersions = opts.featureVersions ?? (await engineFeatureVersions(opts.engines));
  const recs = [rec, ...(opts.recalibration ?? [])];
  const workerOpts: WorkerFitOptions = { seed: opts.seed, engines: [...opts.engines], maxMs: Number.isFinite(opts.maxMs) ? opts.maxMs : FIT_BUDGET_MS, featureVersions };
  if (typeof Worker === 'function') {
    try {
      return await runInWorker(recs, workerOpts, onProgress);
    } catch (error) {
      if (!(error instanceof WorkerStartError)) throw error;
      console.warn(`The fit worker could not start (${error.message}); fitting on the main thread instead.`);
    }
  }
  return runInline(recs, workerOpts, onProgress);
}

/** The estimators of a fit under the session's current geometry (fitGeometry when absent). */
export function restoreEstimators(fit: FitResult, geometry: SessionGeometry | null): Map<EstimatorId, Estimator> {
  const set = new EstimatorSet(fit, MAPPERS, geometry);
  return new Map(set.ids().map((id) => [id, set.estimator(id)]));
}

/** The same as one EstimatorSet, for callers that also set the drift offset (Live). */
export function restoreEstimatorSet(fit: FitResult, geometry: SessionGeometry | null): EstimatorSet {
  return new EstimatorSet(fit, MAPPERS, geometry);
}

export interface ScoredRecording {
  own: ValidationReport[];
  intersection: ValidationReport[];
  /** The raw samples of every estimator, frame by frame. */
  samples: Map<EstimatorId, GazeSample[]>;
  /** The geometry the reports are in. */
  geometry: SessionGeometry;
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Scores a validation recording with every estimator of the fit, in both modes (§4.12). Degrees
 * are reported under `geometry` (the session's current one), so a screen or distance measured
 * after calibration re-scores the stored frames without refitting (§14.1.3): the targets keep the
 * viewport they were shown in, the pixel predictions do not change, and the frames' distances are
 * rescaled from the recording's focal length to the current one.
 */
export function scoreRecording(
  fit: FitResult,
  rec: Recording,
  geometry: SessionGeometry,
  opts: { nominalFps: number; receivedMs?: ReadonlyMap<number, number> },
): ScoredRecording {
  if (!fit.fitGeometry) throw new RangeError('scoreRecording: the fit has no fitGeometry');
  const ratio = geometry.distance.focalPx / rec.geometry.distance.focalPx;
  if (!(ratio > 0 && Number.isFinite(ratio))) throw new RangeError('scoreRecording: invalid focal lengths');
  const g: SessionGeometry = {
    screen: { ...rec.geometry.screen, pxPerMm: geometry.screen.pxPerMm, pxPerMmSource: geometry.screen.pxPerMmSource },
    distance: { ...geometry.distance },
    refDistanceMm: (fit.refDistanceMm * geometry.distance.focalPx) / fit.fitGeometry.distance.focalPx,
    degreesApproximate: geometry.degreesApproximate,
  };
  const frames: RecordedFrame[] = ratio === 1 ? rec.frames : rec.frames.map((f) => ({ ...f, distanceMm: positive(f.distanceMm) ? f.distanceMm * ratio : f.distanceMm }));
  const scored: Recording = { ...rec, geometry: g, frames };
  const set = new EstimatorSet(fit, MAPPERS, g);
  const samples = new Map<EstimatorId, GazeSample[]>();
  for (const id of set.ids()) {
    const est = set.estimator(id);
    samples.set(id, frames.map((f) => est.estimate(f, frameBaseFlags(f))));
  }
  const options = opts.receivedMs ? { receivedMs: opts.receivedMs } : {};
  return {
    own: scoreValidation(scored, samples, g, 'own', opts.nominalFps, options),
    intersection: scoreValidation(scored, samples, g, 'intersection', opts.nominalFps, options),
    samples,
    geometry: g,
  };
}
