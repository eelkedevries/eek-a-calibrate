// The Test round's marks on Warm-up complete (spec §17.7.4, design §2.12): a bubble is a hit
// (✓) when the mean gaze on it, Ḡ in px, lies in the zone that holds its target, and a miss (✗)
// otherwise, including a bubble without a valid sample. Ḡ is the mean over the target's
// sampling window of the selected estimator's valid samples, each turned into px at its own
// viewing distance, as scoreValidation computes the target's pixel accuracy.
import { degToPx } from '../geometry/angles.ts';
import { zoneAt, type ZoneGrid } from '../game/zones.ts';
import { isValidSample } from '../metrics/funnel.ts';
import { targetWindows } from '../metrics/validation.ts';
import type { GazeSample, Recording, SessionGeometry, Vec2 } from '../types.ts';

export interface MarkTarget {
  itemId: string;
  targetPx: Vec2;
  /** Ḡ, or null without a valid sample. */
  gazePx: Vec2 | null;
}

export interface Mark extends MarkTarget {
  /** The zone [col, row] of the target. */
  zone: Vec2 | null;
  hit: boolean;
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Ḡ in px for every presented target of a Test round, in schedule order. `g` is the geometry the
 * samples were scored under (ScoredRecording.geometry); frames without a distance use its D_ref.
 */
export function meanGazeTargets(rec: Recording, samples: readonly GazeSample[], g: SessionGeometry): MarkTarget[] {
  const byFrame = new Map(samples.map((s) => [s.frameIndex, s]));
  const frames = [...rec.frames].sort((a, b) => a.meta.tCaptureMs - b.meta.tCaptureMs);
  return targetWindows(rec, g.screen).map((w) => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const f of frames) {
      if (f.meta.tCaptureMs < w.startMs || f.meta.tCaptureMs >= w.endMs) continue;
      const s = byFrame.get(f.meta.index);
      if (!isValidSample(s)) continue;
      const d = positive(s.distanceMm) ? s.distanceMm : positive(f.distanceMm) ? f.distanceMm : g.refDistanceMm;
      if (!positive(d)) continue;
      const p = degToPx(s.rawDeg, g.screen, d);
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      sx += p[0];
      sy += p[1];
      n += 1;
    }
    return { itemId: w.item.id, targetPx: w.targetPx, gazePx: n > 0 ? ([sx / n, sy / n] as Vec2) : null };
  });
}

/** Hit or miss for each target on the zone grid of a viewport of `viewport` px. */
export function testMarks(targets: readonly MarkTarget[], grid: Pick<ZoneGrid, 'cols' | 'rows'>, viewport: { w: number; h: number }): Mark[] {
  return targets.map((t) => {
    const zone = zoneAt(t.targetPx, grid, viewport);
    const gazeZone = t.gazePx ? zoneAt(t.gazePx, grid, viewport) : null;
    const hit = zone !== null && gazeZone !== null && zone[0] === gazeZone[0] && zone[1] === gazeZone[1];
    return { ...t, zone, hit };
  });
}
