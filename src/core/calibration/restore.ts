// A mapping state (specification §6 MappingState) turned back into a predictor. Training and
// prediction share this one path, so a state predicts identically before and after a JSON round
// trip and in either thread.
import { leverage, predictRow } from '../maths/ridge.ts';
import { clipRow, transformRow, type FeatureTransform } from '../maths/standardise.ts';
import type { EngineFrame, MappedGaze, MapperSpec, MappingState, RowContext } from '../types.ts';

export const MAPPING_SCHEMA = 'eek-a-calibrate/mapping@1';

/** The serialisable state of a fitted mapping: plain arrays, so it survives JSON and structured clone. */
export function mappingState(
  spec: MapperSpec,
  featureVersion: string,
  t: FeatureTransform,
  fit: { lambdaRel: number; B: ArrayLike<number>; A: ArrayLike<number>; h95: number },
): MappingState {
  return {
    schema: MAPPING_SCHEMA,
    engine: spec.engine,
    mapper: spec.id,
    featureVersion,
    lambdaRel: fit.lambdaRel,
    mu: Array.from(t.mu),
    scale: Array.from(t.scale),
    zMin: Array.from(t.zMin),
    zMax: Array.from(t.zMax),
    pca: t.pca ? { mean: Array.from(t.pca.mean), components: Array.from(t.pca.components), k: t.pca.k, commonScale: t.pca.commonScale } : null,
    B: Array.from(fit.B),
    A: Array.from(fit.A),
    h95: fit.h95,
  };
}

/** The output columns whose clipping sets EXTRAPOLATED, as `fitFeatureTransform` derives them. */
export function primaryOutColumns(spec: Pick<MapperSpec, 'primary' | 'pca'>, pIn: number): Int32Array {
  const start = spec.pca ? spec.pca.start : pIn;
  const end = spec.pca ? spec.pca.end : pIn;
  const k = spec.pca ? spec.pca.k : 0;
  const out: number[] = [];
  for (const j of spec.primary) {
    if (j >= start && j < end) for (let s = 0; s < k; s++) out.push(start + s);
    else out.push(j < start ? j : j - (end - start) + k);
  }
  return Int32Array.from(new Set(out)).sort();
}

function expectLength(what: string, a: readonly number[], n: number): void {
  if (!Array.isArray(a) || a.length !== n) throw new RangeError(`mapping state: ${what} has ${Array.isArray(a) ? a.length : 'no'} entries, expected ${n}`);
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw new RangeError(`mapping state: ${what}[${i}] is not finite`);
}

/** The feature transform of a state, checked against its mapper. */
export function transformFromState(state: MappingState, spec: MapperSpec): FeatureTransform {
  if (state.schema !== MAPPING_SCHEMA) throw new RangeError(`mapping state: unknown schema ${String(state.schema)}`);
  if (state.engine !== spec.engine || state.mapper !== spec.id) {
    throw new RangeError(`mapping state: ${state.engine}/${state.mapper} does not match the mapper ${spec.engine}/${spec.id}`);
  }
  const pIn = spec.names.length;
  const start = spec.pca ? spec.pca.start : pIn;
  const end = spec.pca ? spec.pca.end : pIn;
  const k = spec.pca ? spec.pca.k : 0;
  const pOut = pIn - (end - start) + k;
  expectLength('mu', state.mu, pIn);
  expectLength('scale', state.scale, pIn);
  expectLength('zMin', state.zMin, pOut);
  expectLength('zMax', state.zMax, pOut);
  if (spec.pca) {
    const pca = state.pca;
    if (!pca || pca.k !== k) throw new RangeError(`mapping state: ${spec.id} needs a PCA block of ${k} components`);
    expectLength('pca.mean', pca.mean, end - start);
    expectLength('pca.components', pca.components, k * (end - start));
    if (!(pca.commonScale > 0)) throw new RangeError('mapping state: the PCA common scale must be positive');
  } else if (state.pca !== null) {
    throw new RangeError(`mapping state: ${spec.id} has no PCA block`);
  }
  return {
    pIn,
    pOut,
    mu: Float64Array.from(state.mu),
    scale: Float64Array.from(state.scale),
    pca: state.pca
      ? { d: end - start, k, mean: Float64Array.from(state.pca.mean), components: Float64Array.from(state.pca.components), commonScale: state.pca.commonScale }
      : null,
    pcaStart: start,
    pcaEnd: end,
    zMin: Float64Array.from(state.zMin),
    zMax: Float64Array.from(state.zMax),
    primaryOut: primaryOutColumns(spec, pIn),
  };
}

export interface RestoredMapping {
  readonly spec: MapperSpec;
  readonly state: MappingState;
  readonly transform: FeatureTransform;
  /** θ (degrees) for one raw design row, with the clipping flag and the leverage; null when the row is not finite. */
  predictRaw(x: ArrayLike<number>): MappedGaze | null;
  /** The same from an engine frame and its context; null when the mapper cannot build a row. */
  predictFrame(f: EngineFrame | undefined, ctx: RowContext): MappedGaze | null;
}

/**
 * Restores a mapping: standardise (and project the PCA block), clip to the calibration range
 * (§4.8.2; a clipped primary column sets `extrapolated`), prepend the intercept, then θ = z̃ᵀB and
 * the leverage h = z̃ᵀAz̃.
 */
export function restoreMapping(state: MappingState, spec: MapperSpec): RestoredMapping {
  const transform = transformFromState(state, spec);
  const q = transform.pOut + 1;
  expectLength('B', state.B, q * 2);
  expectLength('A', state.A, q * q);
  if (!(state.h95 > 0)) throw new RangeError('mapping state: h95 must be positive');
  const B = Float64Array.from(state.B);
  const A = Float64Array.from(state.A);
  const zt = new Float64Array(q);
  const z = zt.subarray(1);
  zt[0] = 1;

  const predictRaw = (x: ArrayLike<number>): MappedGaze | null => {
    if (x.length !== transform.pIn) throw new RangeError(`${spec.engine}/${spec.id}: a row of ${x.length} values, expected ${transform.pIn}`);
    for (let j = 0; j < x.length; j++) if (!Number.isFinite(x[j] as number)) return null;
    transformRow(transform, x, z);
    for (let j = 0; j < z.length; j++) if (!Number.isFinite(z[j] as number)) return null;
    const extrapolated = clipRow(z, transform.zMin, transform.zMax, transform.primaryOut);
    const deg = predictRow(B, zt, q);
    if (!Number.isFinite(deg[0]) || !Number.isFinite(deg[1])) return null;
    return { deg, extrapolated, leverage: leverage(A, zt, q) };
  };

  return {
    spec,
    state,
    transform,
    predictRaw,
    predictFrame(f, ctx) {
      if (!f || f.status !== 'ok') return null;
      const row = spec.row(f, ctx);
      return row ? predictRaw(row) : null;
    },
  };
}

