// targets.csv (specification §4.16): one row per presentation, in the order given, with the
// item's position or pursuit parameters. `trial` (as in samples.csv) and `aborted` are added so
// that rows from several schedules, and cut-short presentations, can be told apart.
import { layoutToPx, type LayoutGeometry } from '../geometry/screen.ts';
import type { Presentation, Schedule, ScheduleItem } from '../types.ts';
import { csvTable, fmtBool, fmtInt, fmtMs, fmtPx, fmtSig, relMs, type ExportIdentity } from './csv.ts';

export const TARGETS_HEADER = [
  'trial', 'id', 'phase', 'block', 'x_px', 'y_px', 'onset_ms', 'offset_ms', 'frame_uncertainty_ms', 'attempt', 'aborted',
  'pursuit_period_ms', 'pursuit_hold_ms', 'pursuit_discard_ms', 'pursuit_ax', 'pursuit_ay', 'pursuit_phi_x_rad', 'pursuit_phi_y_rad',
] as const;

export interface TargetsBlock {
  /** `trialName(...)` of the schedule's run. */
  trial: string;
  /** A schedule, or a challenge round's bubbles as target items with phase `game` (§17.10.1). */
  schedule: Pick<Schedule, 'items'>;
  presentations: readonly Presentation[];
}

/**
 * Presentations of instruction items are skipped. A presentation whose item is not in its
 * schedule is a bug and throws, rather than writing a row without a position.
 */
export function targetsCsv(id: ExportIdentity, blocks: readonly TargetsBlock[], screen: LayoutGeometry): string {
  const rows: string[][] = [];
  for (const block of blocks) {
    const items = new Map<string, ScheduleItem>(block.schedule.items.map((it) => [it.id, it]));
    for (const p of block.presentations) {
      const item = items.get(p.itemId);
      if (item === undefined) throw new RangeError(`targetsCsv: presentation of unknown item '${p.itemId}' in ${block.trial}`);
      if (item.kind === 'instruction') continue;
      const pursuit = item.kind === 'pursuit' ? item : null;
      const px = item.kind === 'target' ? layoutToPx(item.xNorm, item.yNorm, screen) : null;
      rows.push([
        block.trial,
        item.id,
        item.phase,
        fmtInt(item.block),
        px ? fmtPx(px[0]) : '',
        px ? fmtPx(px[1]) : '',
        fmtMs(relMs(id, p.onsetMs)),
        fmtMs(relMs(id, p.offsetMs)),
        fmtMs(p.frameIntervalMs),
        fmtInt(p.attempt),
        fmtBool(p.aborted),
        fmtMs(pursuit?.periodMs),
        fmtMs(pursuit?.holdMs),
        fmtMs(pursuit?.discardMs),
        fmtSig(pursuit?.ax),
        fmtSig(pursuit?.ay),
        fmtSig(pursuit?.phiX),
        fmtSig(pursuit?.phiY),
      ]);
    }
  }
  return csvTable(TARGETS_HEADER, rows);
}
