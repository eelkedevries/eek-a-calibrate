// The "eyes open" rule and its ±1-frame mask (spec §4.3), as in gaze-lite.
import { OPEN } from '../constants.ts';

/**
 * The instantaneous rule for one frame: both blink blendshapes below
 * OPEN.blinkMax and both lid-opening qualities above OPEN.openQMin. A
 * non-finite input (a missing blendshape, a degenerate eye) fails the rule.
 * This is what `EyeMeasures.open` holds; the neighbouring-frame mask needs the
 * next frame, so consumers apply `maskBlinks` to the frame sequence.
 */
export function eyesOpenRule(blinkL: number, blinkR: number, openQL: number, openQR: number): boolean {
  return blinkL < OPEN.blinkMax && blinkR < OPEN.blinkMax && openQL > OPEN.openQMin && openQR > OPEN.openQMin;
}

/**
 * Masks `maskFrames` frames either side of every closed frame: frame i stays
 * open only if no closed frame lies within `maskFrames` of it.
 *
 * Without `index` the neighbourhood is by position in the array. With `index`
 * (the frames' FrameMeta.index, strictly increasing) it is by capture index,
 * so a dropped frame does not make two distant frames neighbours. Frames
 * beyond either end of the sequence are unknown and mask nothing.
 */
export function maskBlinks(open: readonly boolean[], index?: readonly number[], maskFrames: number = OPEN.maskFrames): boolean[] {
  const n = open.length;
  if (index !== undefined) {
    if (index.length !== n) throw new RangeError(`maskBlinks: ${n} flags but ${index.length} indices`);
    for (let i = 1; i < n; i++) {
      if (!(index[i] > index[i - 1])) throw new RangeError(`maskBlinks: indices must be strictly increasing (position ${i})`);
    }
  }
  if (!(maskFrames >= 0) || !Number.isInteger(maskFrames)) throw new RangeError(`maskBlinks: maskFrames must be a non-negative integer, not ${maskFrames}`);
  const at = (i: number): number => (index ? index[i] : i);

  const out = open.slice();
  let lo = 0;
  for (let c = 0; c < n; c++) {
    if (open[c]) continue;
    // Positions are sorted by `at`, so the masked frames around c form one run.
    while (lo < n && at(lo) < at(c) - maskFrames) lo++;
    for (let i = lo; i < n && at(i) <= at(c) + maskFrames; i++) out[i] = false;
  }
  return out;
}
