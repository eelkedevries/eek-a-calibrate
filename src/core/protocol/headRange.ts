// The head range (specification §4.10), a "virtual chinrest": the pose, distance and eye position
// seen in accepted calibration frames, widened by fixed margins. Outside it a frame is flagged
// OUT_OF_RANGE (flagged, never deleted).
import { HEAD_RANGE } from '../constants.ts';
import { percentiles } from '../maths/stats.ts';
import type { HeadRange, Vec2 } from '../types.ts';

export interface HeadSample {
  yawDeg: number;
  pitchDeg: number;
  lnDistRatio: number;
  eyeMid: Vec2;
}

function band(values: number[], margin: number, what: string): Vec2 {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) throw new RangeError(`computeHeadRange: no finite ${what} in the calibration frames`);
  const [lo, hi] = percentiles(finite, [HEAD_RANGE.pLow, HEAD_RANGE.pHigh]) as [number, number];
  return [lo - margin, hi + margin];
}

/** [P2.5 − margin, P97.5 + margin] of each quantity over the accepted calibration frames. */
export function computeHeadRange(samples: readonly HeadSample[]): HeadRange {
  return {
    yawDeg: band(samples.map((s) => s.yawDeg), HEAD_RANGE.angleMarginDeg, 'yaw'),
    pitchDeg: band(samples.map((s) => s.pitchDeg), HEAD_RANGE.angleMarginDeg, 'pitch'),
    lnDistRatio: band(samples.map((s) => s.lnDistRatio), HEAD_RANGE.lnDistMargin, 'distance ratio'),
    eyeMidX: band(samples.map((s) => s.eyeMid[0]), HEAD_RANGE.eyeMidMargin, 'eye position (x)'),
    eyeMidY: band(samples.map((s) => s.eyeMid[1]), HEAD_RANGE.eyeMidMargin, 'eye position (y)'),
  };
}

const within = (v: number, r: Vec2): boolean => v >= r[0] && v <= r[1];

/** True when every quantity lies inside its band; a non-finite quantity is out of range. */
export function inHeadRange(range: HeadRange, s: HeadSample): boolean {
  return (
    within(s.yawDeg, range.yawDeg) &&
    within(s.pitchDeg, range.pitchDeg) &&
    within(s.lnDistRatio, range.lnDistRatio) &&
    within(s.eyeMid[0], range.eyeMidX) &&
    within(s.eyeMid[1], range.eyeMidY)
  );
}
