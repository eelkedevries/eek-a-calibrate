// Dense linear algebra on row-major Float64Array matrices: element (i, j) of an r × c matrix is
// at index i·c + j. Functions never modify their inputs unless the name says "InPlace".

/** Thrown when a matrix that must be invertible (or positive definite) is not, numerically. */
export class SingularMatrixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SingularMatrixError';
  }
}

export function assertLength(name: string, a: ArrayLike<number>, expected: number): void {
  if (a.length !== expected) throw new RangeError(`${name}: expected length ${expected}, got ${a.length}`);
}

export function assertFinite(name: string, a: ArrayLike<number>): void {
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) throw new RangeError(`${name}: non-finite value ${a[i]} at index ${i}`);
  }
}

/**
 * Cholesky factor L (lower triangular, A = L·Lᵀ) of a symmetric positive-definite n × n matrix.
 * Only the lower triangle of `a` is read. A pivot at or below n·ε times its diagonal entry is
 * indistinguishable from zero in double precision, so it is reported as singular. `out`, when
 * given, receives L instead of a new array.
 */
export function cholesky(a: Float64Array, n: number, out?: Float64Array): Float64Array {
  assertLength('cholesky', a, n * n);
  const L = out ?? new Float64Array(n * n);
  if (out) {
    assertLength('cholesky (out)', out, n * n);
    out.fill(0);
  }
  const relTol = Number.EPSILON * Math.max(n, 10);
  for (let j = 0; j < n; j++) {
    const rowJ = j * n;
    let s = a[rowJ + j] as number;
    for (let k = 0; k < j; k++) {
      const v = L[rowJ + k] as number;
      s -= v * v;
    }
    const diag = a[rowJ + j] as number;
    if (!(s > relTol * Math.abs(diag)) || !Number.isFinite(s)) {
      throw new SingularMatrixError(`cholesky: matrix is not positive definite (pivot ${s} at ${j})`);
    }
    const ljj = Math.sqrt(s);
    L[rowJ + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      const rowI = i * n;
      // Four independent accumulators keep the floating-point adder busy instead of waiting on
      // one dependency chain; this loop dominates every ridge and grouped-LOO fit.
      let t0 = 0;
      let t1 = 0;
      let t2 = 0;
      let t3 = 0;
      let k = 0;
      for (; k + 3 < j; k += 4) {
        t0 += (L[rowI + k] as number) * (L[rowJ + k] as number);
        t1 += (L[rowI + k + 1] as number) * (L[rowJ + k + 1] as number);
        t2 += (L[rowI + k + 2] as number) * (L[rowJ + k + 2] as number);
        t3 += (L[rowI + k + 3] as number) * (L[rowJ + k + 3] as number);
      }
      for (; k < j; k++) t0 += (L[rowI + k] as number) * (L[rowJ + k] as number);
      L[rowI + j] = ((a[rowI + j] as number) - (t0 + t1 + (t2 + t3))) / ljj;
    }
  }
  return L;
}

/** Solves L·Y = B in place for Y (B is n × m), L lower triangular. */
export function forwardSubstituteInPlace(L: Float64Array, n: number, b: Float64Array, m: number): void {
  for (let i = 0; i < n; i++) {
    const rowL = i * n;
    for (let c = 0; c < m; c++) {
      let s = b[i * m + c] as number;
      for (let k = 0; k < i; k++) s -= (L[rowL + k] as number) * (b[k * m + c] as number);
      b[i * m + c] = s / (L[rowL + i] as number);
    }
  }
}

/** Solves Lᵀ·X = B in place for X (B is n × m), L lower triangular. */
export function backSubstituteTransposedInPlace(L: Float64Array, n: number, b: Float64Array, m: number): void {
  for (let i = n - 1; i >= 0; i--) {
    for (let c = 0; c < m; c++) {
      let s = b[i * m + c] as number;
      for (let k = i + 1; k < n; k++) s -= (L[k * n + i] as number) * (b[k * m + c] as number);
      b[i * m + c] = s / (L[i * n + i] as number);
    }
  }
}

/** Solves (L·Lᵀ)·X = B for X, given the Cholesky factor L; B is n × m and is not modified. */
export function choleskySolve(L: Float64Array, n: number, b: Float64Array, m: number): Float64Array {
  assertLength('choleskySolve', b, n * m);
  const x = b.slice();
  forwardSubstituteInPlace(L, n, x, m);
  backSubstituteTransposedInPlace(L, n, x, m);
  return x;
}

/** (L·Lᵀ)⁻¹ from the Cholesky factor L; the result is symmetric. */
export function choleskyInverse(L: Float64Array, n: number): Float64Array {
  const eye = new Float64Array(n * n);
  for (let i = 0; i < n; i++) eye[i * n + i] = 1;
  const inv = choleskySolve(L, n, eye, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      const v = 0.5 * ((inv[i * n + j] as number) + (inv[j * n + i] as number));
      inv[i * n + j] = v;
      inv[j * n + i] = v;
    }
  }
  return inv;
}

/**
 * Solves A·X = B for a general square A (n × n) by LU decomposition with partial pivoting; B is
 * n × m. Throws SingularMatrixError when a pivot is negligible relative to the largest entry of A.
 */
export function luSolve(a: Float64Array, n: number, b: Float64Array, m: number): Float64Array {
  assertLength('luSolve (A)', a, n * n);
  assertLength('luSolve (B)', b, n * m);
  const lu = a.slice();
  const x = b.slice();
  let scale = 0;
  for (let i = 0; i < lu.length; i++) scale = Math.max(scale, Math.abs(lu[i] as number));
  const tol = Number.EPSILON * Math.max(n, 10) * scale;
  for (let k = 0; k < n; k++) {
    let piv = k;
    let best = Math.abs(lu[k * n + k] as number);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(lu[i * n + k] as number);
      if (v > best) {
        best = v;
        piv = i;
      }
    }
    if (!(best > tol)) throw new SingularMatrixError(`luSolve: matrix is singular (pivot ${best} at ${k})`);
    if (piv !== k) {
      for (let j = 0; j < n; j++) {
        const t = lu[k * n + j] as number;
        lu[k * n + j] = lu[piv * n + j] as number;
        lu[piv * n + j] = t;
      }
      for (let c = 0; c < m; c++) {
        const t = x[k * m + c] as number;
        x[k * m + c] = x[piv * m + c] as number;
        x[piv * m + c] = t;
      }
    }
    const pivot = lu[k * n + k] as number;
    for (let i = k + 1; i < n; i++) {
      const f = (lu[i * n + k] as number) / pivot;
      if (f === 0) continue;
      lu[i * n + k] = f;
      for (let j = k + 1; j < n; j++) lu[i * n + j] = (lu[i * n + j] as number) - f * (lu[k * n + j] as number);
      for (let c = 0; c < m; c++) x[i * m + c] = (x[i * m + c] as number) - f * (x[k * m + c] as number);
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let c = 0; c < m; c++) {
      let s = x[i * m + c] as number;
      for (let j = i + 1; j < n; j++) s -= (lu[i * n + j] as number) * (x[j * m + c] as number);
      x[i * m + c] = s / (lu[i * n + i] as number);
    }
  }
  return x;
}

/**
 * out (r × c) = A·Bᵀ for A r × k and B c × k, both row-major, so every entry is a contiguous dot
 * product; 2 × 2 register blocking halves the loads per multiply-add.
 */
export function multiplyABtInto(a: Float64Array, r: number, b: Float64Array, c: number, k: number, out: Float64Array): void {
  assertLength('multiplyABtInto (A)', a, r * k);
  assertLength('multiplyABtInto (B)', b, c * k);
  assertLength('multiplyABtInto (out)', out, r * c);
  for (let i = 0; i < r; i += 2) {
    const i1 = i + 1 < r ? i + 1 : i;
    const ai = i * k;
    const ai1 = i1 * k;
    for (let j = 0; j < c; j += 2) {
      const j1 = j + 1 < c ? j + 1 : j;
      const bj = j * k;
      const bj1 = j1 * k;
      let s00 = 0;
      let s01 = 0;
      let s10 = 0;
      let s11 = 0;
      for (let t = 0; t < k; t++) {
        const x0 = a[ai + t] as number;
        const x1 = a[ai1 + t] as number;
        const y0 = b[bj + t] as number;
        const y1 = b[bj1 + t] as number;
        s00 += x0 * y0;
        s01 += x0 * y1;
        s10 += x1 * y0;
        s11 += x1 * y1;
      }
      out[i * c + j] = s00;
      out[i * c + j1] = s01;
      out[i1 * c + j] = s10;
      out[i1 * c + j1] = s11;
    }
  }
}

/** C = A·B with A r × k and B k × c. */
export function matMul(a: Float64Array, b: Float64Array, r: number, k: number, c: number): Float64Array {
  assertLength('matMul (A)', a, r * k);
  assertLength('matMul (B)', b, k * c);
  const out = new Float64Array(r * c);
  for (let i = 0; i < r; i++) {
    for (let t = 0; t < k; t++) {
      const v = a[i * k + t] as number;
      if (v === 0) continue;
      const rowB = t * c;
      const rowO = i * c;
      for (let j = 0; j < c; j++) out[rowO + j] = (out[rowO + j] as number) + v * (b[rowB + j] as number);
    }
  }
  return out;
}

export function transpose(a: Float64Array, r: number, c: number): Float64Array {
  assertLength('transpose', a, r * c);
  const out = new Float64Array(r * c);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[j * r + i] = a[i * c + j] as number;
  return out;
}

/**
 * Eigen-decomposition of a symmetric n × n matrix by the cyclic Jacobi method. Returns the
 * eigenvalues in descending order and the matching unit eigenvectors as the columns of
 * `vectors` (n × n). Deterministic; throws if it has not converged after 100 sweeps.
 */
export function symmetricEigen(a: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  assertLength('symmetricEigen', a, n * n);
  const A = a.slice();
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  let frob = 0;
  for (let i = 0; i < A.length; i++) frob += (A[i] as number) * (A[i] as number);
  frob = Math.sqrt(frob);
  let converged = n < 2 || frob === 0;
  for (let sweep = 0; sweep < 100 && !converged; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += (A[p * n + q] as number) ** 2;
    if (Math.sqrt(off) <= 1e-15 * frob) {
      converged = true;
      break;
    }
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q] as number;
        if (apq === 0) continue;
        const app = A[p * n + p] as number;
        const aqq = A[q * n + q] as number;
        const theta = (aqq - app) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        A[p * n + p] = app - t * apq;
        A[q * n + q] = aqq + t * apq;
        A[p * n + q] = 0;
        A[q * n + p] = 0;
        for (let r = 0; r < n; r++) {
          if (r !== p && r !== q) {
            const arp = A[r * n + p] as number;
            const arq = A[r * n + q] as number;
            const nrp = c * arp - s * arq;
            const nrq = s * arp + c * arq;
            A[r * n + p] = nrp;
            A[p * n + r] = nrp;
            A[r * n + q] = nrq;
            A[q * n + r] = nrq;
          }
          const vrp = V[r * n + p] as number;
          const vrq = V[r * n + q] as number;
          V[r * n + p] = c * vrp - s * vrq;
          V[r * n + q] = s * vrp + c * vrq;
        }
      }
    }
  }
  if (!converged) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += (A[p * n + q] as number) ** 2;
    if (Math.sqrt(off) > 1e-12 * frob) throw new Error('symmetricEigen: Jacobi iteration did not converge');
  }
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (i, j) => (A[j * n + j] as number) - (A[i * n + i] as number) || i - j,
  );
  const values = new Float64Array(n);
  const vectors = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const src = order[k] as number;
    values[k] = A[src * n + src] as number;
    for (let r = 0; r < n; r++) vectors[r * n + k] = V[r * n + src] as number;
  }
  return { values, vectors };
}

/**
 * Orthonormalises the rows of an r × c matrix in place by modified Gram–Schmidt, run twice
 * ("twice is enough") for numerical orthogonality. A row that is numerically dependent on the
 * rows before it becomes a zero row; returns the number of non-zero rows.
 */
export function orthonormaliseRowsInPlace(m: Float64Array, r: number, c: number): number {
  assertLength('orthonormaliseRowsInPlace', m, r * c);
  let rank = 0;
  for (let i = 0; i < r; i++) {
    const ri = i * c;
    let norm0 = 0;
    for (let t = 0; t < c; t++) norm0 += (m[ri + t] as number) ** 2;
    norm0 = Math.sqrt(norm0);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < i; j++) {
        const rj = j * c;
        let d0 = 0;
        let d1 = 0;
        let t = 0;
        for (; t + 1 < c; t += 2) {
          d0 += (m[ri + t] as number) * (m[rj + t] as number);
          d1 += (m[ri + t + 1] as number) * (m[rj + t + 1] as number);
        }
        if (t < c) d0 += (m[ri + t] as number) * (m[rj + t] as number);
        const dot = d0 + d1;
        if (dot === 0) continue;
        for (let t = 0; t < c; t++) m[ri + t] = (m[ri + t] as number) - dot * (m[rj + t] as number);
      }
    }
    let norm = 0;
    for (let t = 0; t < c; t++) norm += (m[ri + t] as number) ** 2;
    norm = Math.sqrt(norm);
    if (!(norm > 1e-12 * norm0) || norm0 === 0) {
      m.fill(0, ri, ri + c);
      continue;
    }
    for (let t = 0; t < c; t++) m[ri + t] = (m[ri + t] as number) / norm;
    rank++;
  }
  return rank;
}
