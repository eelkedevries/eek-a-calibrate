// game.csv (spec §17.10.1): one row per bubble or decoy of every challenge round, in the order
// they ended: the trial (`game-<nnn>`, as in samples.csv), the round and its name, the item's id
// and kind, its zone (column and row from 1, left and top first), its centre at onset (CSS px),
// onset and offset, the outcome, the time to pop (round time, pauses excluded), the score change,
// the streak after it, and the offset of the median filtered gaze over the 400 ms before the pop
// from the bubble's centre (CSS px, y down).
import type { ItemRecord } from '../game/stats.ts';
import type { RoundKey } from '../game/params.ts';
import { csvTable, fmtInt, fmtMs, fmtPx, relMs, type ExportIdentity } from './csv.ts';

export const GAME_HEADER = [
  'participant', 'session', 'trial', 'round', 'round_name', 'id', 'kind', 'zone_col', 'zone_row', 'x_px', 'y_px', 'onset_ms', 'offset_ms',
  'outcome', 'time_to_pop_ms', 'score_change', 'streak', 'offset_x_px', 'offset_y_px',
] as const;

export const ROUND_NAMES: Readonly<Record<RoundKey, string>> = { pop: 'Pop!', spikes: 'Mind the spikes', drifters: 'Drifters' };

export interface GameCsvBlock {
  trial: string;
  round: number;
  key: RoundKey;
  records: readonly ItemRecord[];
}

export function gameCsv(id: ExportIdentity, blocks: readonly GameCsvBlock[]): string {
  const rows: string[][] = [];
  for (const b of blocks) {
    for (const r of b.records) {
      rows.push([
        id.participant,
        id.session,
        b.trial,
        fmtInt(b.round),
        ROUND_NAMES[b.key],
        r.id,
        r.kind,
        fmtInt(r.col + 1),
        fmtInt(r.row + 1),
        fmtPx(r.x),
        fmtPx(r.y),
        fmtMs(relMs(id, r.onsetMs)),
        fmtMs(relMs(id, r.offsetMs)),
        r.outcome,
        fmtMs(r.timeToPopMs),
        fmtInt(r.scoreChange),
        fmtInt(r.streak),
        fmtPx(r.offsetPx?.[0]),
        fmtPx(r.offsetPx?.[1]),
      ]);
    }
  }
  return csvTable(GAME_HEADER, rows);
}
