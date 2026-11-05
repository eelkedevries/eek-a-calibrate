// The challenge's board (spec §17.9.1, design §5.3, §5.4): the safe rectangle less a 4 % margin
// on each side of each axis, split into the zones of Warm-up complete (cols × rows) with 16 px
// gutters; Free look draws the same zones. The zone the gaze falls in is found by snapping to the
// nearest zone, so a point in a gutter or past the board's edge still lights one.
import type { Vec2 } from '../types.ts';
import { BOARD, BUBBLE_SIZE } from './params.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone {
  /** row × cols + col. */
  index: number;
  col: number;
  row: number;
  rect: Rect;
}

export interface Board {
  rect: Rect;
  cols: number;
  rows: number;
  gutterPx: number;
  zones: Zone[];
}

function checkGrid(cols: number, rows: number): void {
  if (!(Number.isInteger(cols) && Number.isInteger(rows) && cols >= 1 && rows >= 1)) throw new RangeError(`board: the grid needs whole columns and rows of at least 1, got ${cols} × ${rows}`);
}

export function boardRect(safe: Rect, marginFrac: number = BOARD.marginFrac): Rect {
  if (!(safe.w > 0 && safe.h > 0)) throw new RangeError(`boardRect: the safe rectangle is empty (${safe.w} × ${safe.h})`);
  const mx = marginFrac * safe.w;
  const my = marginFrac * safe.h;
  return { x: safe.x + mx, y: safe.y + my, w: safe.w - 2 * mx, h: safe.h - 2 * my };
}

export function makeBoard(safe: Rect, cols: number, rows: number, gutterPx: number = BOARD.gutterPx): Board {
  checkGrid(cols, rows);
  const rect = boardRect(safe);
  const zw = Math.max(0, (rect.w - (cols - 1) * gutterPx) / cols);
  const zh = Math.max(0, (rect.h - (rows - 1) * gutterPx) / rows);
  const zones: Zone[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      zones.push({ index: row * cols + col, col, row, rect: { x: rect.x + col * (zw + gutterPx), y: rect.y + row * (zh + gutterPx), w: zw, h: zh } });
    }
  }
  return { rect, cols, rows, gutterPx, zones };
}

function axisCell(v: number, start: number, size: number, gutter: number, n: number): number {
  // The boundary between two zones lies in the middle of their gutter.
  const k = Math.floor((v - start + gutter / 2) / (size + gutter));
  return Math.min(n - 1, Math.max(0, k));
}

/** The zone nearest to a point of the viewport; null for a point that is not finite. */
export function zoneAtPoint(board: Board, p: Vec2): Zone | null {
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  const first = board.zones[0] as Zone;
  const col = axisCell(p[0], board.rect.x, first.rect.w, board.gutterPx, board.cols);
  const row = axisCell(p[1], board.rect.y, first.rect.h, board.gutterPx, board.rows);
  return board.zones[row * board.cols + col] ?? null;
}

export function zoneCentre(z: Zone): Vec2 {
  return [z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h / 2];
}

/** The zone shrunk by `r` on every side (where a bubble of radius r stays inside it), never negative. */
export function innerRect(z: Zone, r: number): Rect {
  const w = Math.max(0, z.rect.w - 2 * r);
  const h = Math.max(0, z.rect.h - 2 * r);
  return { x: z.rect.x + (z.rect.w - w) / 2, y: z.rect.y + (z.rect.h - h) / 2, w, h };
}

/** As CSS clamp(72 px, 40 % of the zone's short side, 20 % of the screen's short side): the minimum wins. */
export function bubbleDiameterPx(zone: Rect, screenShortPx: number): number {
  const v = BUBBLE_SIZE.zoneFrac * Math.min(zone.w, zone.h);
  return Math.max(BUBBLE_SIZE.minPx, Math.min(v, BUBBLE_SIZE.screenFrac * screenShortPx));
}
