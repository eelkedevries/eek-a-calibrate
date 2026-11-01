// session.json (schema eek-a-calibrate/session@1) and the optional dataset.json (specification
// §4.16), written as canonical JSON so that identical state gives identical bytes: object keys
// sorted, whatever order the state was built in (fits arrive from a worker in any order).
import * as constants from '../constants.ts';
import { allPairedDifferences } from '../metrics/compare.ts';
import type {
  BackendId,
  EngineId,
  FitResult,
  FrameMeta,
  Preset,
  Recording,
  Schedule,
  SessionGeometry,
  ValidationReport,
  Vec2,
} from '../types.ts';
import { relMs, type ExportIdentity } from './csv.ts';

export const SESSION_SCHEMA = 'eek-a-calibrate/session@1';
export const DATASET_SCHEMA = 'eek-a-calibrate/dataset@1';

function canonical(value: unknown, path: string, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? (value === 0 ? 0 : value) : null;
  if (typeof value !== 'object') throw new TypeError(`canonicalJson: cannot serialise ${typeof value} at ${path}`);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map || value instanceof Set) throw new TypeError(`canonicalJson: convert the ${value.constructor.name} at ${path} to an object or array first`);
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>, (v, i) => canonical(v, `${path}[${i}]`, seen));
  }
  if (seen.has(value)) throw new TypeError(`canonicalJson: cycle at ${path}`);
  seen.add(value);
  let out: unknown;
  if (Array.isArray(value)) {
    out = value.map((v, i) => {
      if (v === undefined) throw new TypeError(`canonicalJson: undefined at ${path}[${i}]`);
      return canonical(v, `${path}[${i}]`, seen);
    });
  } else {
    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) obj[key] = canonical(v, `${path}.${key}`, seen);
    }
    out = obj;
  }
  seen.delete(value);
  return out;
}

/**
 * Deterministic JSON with two-space indentation and a final newline. Object keys are sorted
 * (except the top level when `keepTopOrder` is set), typed arrays become arrays, Dates ISO
 * strings, NaN and ±Infinity null, −0 0, and undefined members are dropped. Functions, symbols,
 * bigints, Maps, Sets, undefined array entries and cycles throw instead of vanishing.
 */
export function canonicalJson(value: unknown, keepTopOrder = false): string {
  let normalised: unknown;
  if (keepTopOrder && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const top: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) if (v !== undefined) top[key] = canonical(v, key, new Set([value]));
    normalised = top;
  } else {
    normalised = canonical(value, '$', new Set());
  }
  return `${JSON.stringify(normalised, null, 2)}\n`;
}

export interface DriftLogEntry {
  /** Capture-clock time of the check. */
  tMs: number;
  /** The measured offset o = mean(Ḡ − T), internal degrees (y down). */
  offsetDeg: Vec2;
  /** Applied as the translation correction, or a quick recalibration was prompted instead. */
  applied: boolean;
}

/** Everything in session.json that is not shared with the other files. */
export interface SessionMeta {
  app: { version: string; commit: string };
  /** sha256 of every runtime and model file, by asset id or path. */
  assets: Readonly<Record<string, string>>;
  environment: { userAgent: string; capabilities: unknown };
  host: { kind: 'worker' | 'inline'; delegate: 'GPU' | 'CPU'; backends: Partial<Record<EngineId, BackendId>>; info?: unknown };
  camera: { settings: unknown; clock: FrameMeta['clock'] | 'mixed' };
  /** How the screen scale and distance were obtained and how uncertain they are, beyond `SessionGeometry`. */
  geometryUncertainty?: unknown;
  protocol: { preset: Preset; seeds: Readonly<Record<string, number>>; schedules: readonly Schedule[] };
  /** τ, ms; null without a pursuit block. */
  pursuitLagMs: number | null;
  /** Row weights as used, when they differ from Appendix A's WEIGHTS. */
  weights?: unknown;
  driftLog: readonly DriftLogEntry[];
  /** Session-specific thresholds (θ_D used for events, say); Appendix A is always included. */
  thresholds?: Readonly<Record<string, unknown>>;
  licences: unknown;
}

export interface SessionJsonInput extends SessionMeta {
  identity: ExportIdentity;
  exportedAt: Date;
  geometry: SessionGeometry;
  fit: FitResult | null;
  validations: readonly ValidationReport[];
}

/**
 * session.json. `exportedAt` is the only member that changes between two exports of the same
 * state. Paired engine differences are derived from `validations`; `thresholds.appendixA` holds
 * every constant of `constants.ts`. Drift-log times are written as `timeMs`, relative to session
 * start like every other exported time stamp.
 */
export function sessionJson(input: SessionJsonInput): string {
  return canonicalJson(
    {
      schema: SESSION_SCHEMA,
      exportedAt: input.exportedAt.toISOString(),
      app: input.app,
      participant: input.identity.participant,
      session: input.identity.session,
      sessionStartMs: input.identity.sessionStartMs,
      assets: input.assets,
      environment: input.environment,
      host: input.host,
      camera: input.camera,
      geometry: { ...input.geometry, uncertainty: input.geometryUncertainty ?? null },
      protocol: input.protocol,
      pursuitLagMs: input.pursuitLagMs,
      weights: input.weights ?? constants.WEIGHTS,
      fit: input.fit,
      selection: input.fit?.selection ?? null,
      validations: input.validations,
      pairedDifferences: allPairedDifferences(input.validations),
      driftLog: input.driftLog.map((e) => ({ timeMs: relMs(input.identity, e.tMs), offsetDeg: e.offsetDeg, applied: e.applied })),
      thresholds: { appendixA: { ...constants }, session: input.thresholds ?? {} },
      licences: input.licences,
    },
    true,
  );
}

export interface DatasetBlock {
  /** `trialName(...)`. */
  trial: string;
  recording: Recording;
}

/**
 * dataset.json (off by default): the derived per-frame features and labels of each recording,
 * for offline refitting. A `RecordedFrame` holds no image and no landmarks, so none can leak.
 */
export function datasetJson(id: ExportIdentity, blocks: readonly DatasetBlock[]): string {
  return canonicalJson(
    {
      schema: DATASET_SCHEMA,
      participant: id.participant,
      session: id.session,
      blocks: blocks.map(({ trial, recording }) => ({
        trial,
        recordingId: recording.id,
        scheduleKind: recording.schedule.kind,
        seed: recording.schedule.seed,
        geometry: recording.geometry,
        frames: recording.frames.map((f) => ({
          frameIndex: f.meta.index,
          timeMs: relMs(id, f.meta.tCaptureMs),
          clock: f.meta.clock,
          distanceMm: f.distanceMm,
          headDeg: [f.yawDeg, f.pitchDeg, f.rollDeg],
          eyeMidNorm: f.eyeMidNorm,
          open: f.open,
          label: f.label,
          engines: Object.fromEntries(
            Object.entries(f.engines).map(([engine, e]) => [engine, { status: e.status, x: e.x, prior: e.prior, weight: e.weight }]),
          ),
        })),
      })),
    },
    true,
  );
}
