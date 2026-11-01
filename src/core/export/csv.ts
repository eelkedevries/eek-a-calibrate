// CSV writing and number formats for every export file (specification §4.16): `\n` line
// endings, UTF-8 without a byte-order mark (it would hide the first header from eek-a-gaze's
// synonym match), an empty field for NaN or not applicable, and fixed decimals: ms 3, px 2,
// deg 4, mm 1; everything else 6 significant figures (C's %.6g, the format eek-a-gaze writes).
import type { Ms } from '../types.ts';

export type Num = number | null | undefined;

/** Who and when, shared by every file of one export. */
export interface ExportIdentity {
  participant: string;
  session: string;
  /** Session start on the capture clock (`performance.now()` domain); exported times are relative to it. */
  sessionStartMs: Ms;
}

function isBlank(v: Num): v is null | undefined {
  return v === null || v === undefined || Number.isNaN(v);
}

function infinity(v: number): string {
  return v > 0 ? 'inf' : '-inf';
}

/** Fixed decimals; '' for null or NaN, 'inf'/'-inf' for infinities, never "-0.00". */
export function fmtFixed(v: Num, decimals: number): string {
  if (isBlank(v)) return '';
  if (!Number.isFinite(v)) return infinity(v);
  const s = v.toFixed(decimals);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

export const fmtMs = (v: Num): string => fmtFixed(v, 3);
export const fmtPx = (v: Num): string => fmtFixed(v, 2);
export const fmtDeg = (v: Num): string => fmtFixed(v, 4);
export const fmtMm = (v: Num): string => fmtFixed(v, 1);

/**
 * C's `%.{sig}g`: style e when the decimal exponent X (after rounding) is below −4 or at least
 * `sig`, else style f with sig − 1 − X decimals; trailing zeros removed; exponents signed with
 * at least two digits (1e-05).
 */
export function fmtSig(v: Num, sig = 6): string {
  if (isBlank(v)) return '';
  if (!Number.isFinite(v)) return infinity(v);
  if (v === 0) return '0';
  const [mantissa, exp] = v.toExponential(sig - 1).split('e') as [string, string];
  const x = Number(exp);
  const strip = (s: string): string => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  if (x < -4 || x >= sig) {
    const ax = Math.abs(x);
    return `${strip(mantissa)}e${x < 0 ? '-' : '+'}${ax < 10 ? '0' : ''}${ax}`;
  }
  return strip(v.toFixed(sig - 1 - x));
}

/** An integer column; '' for null or NaN. A non-integer value is a bug and throws. */
export function fmtInt(v: Num): string {
  if (isBlank(v)) return '';
  if (!Number.isSafeInteger(v)) throw new RangeError(`fmtInt: not an integer: ${v}`);
  return String(v === 0 ? 0 : v);
}

export function fmtBool(v: boolean | null | undefined): string {
  return v === null || v === undefined ? '' : v ? '1' : '0';
}

/** RFC 4180 quoting when the field holds a comma, a quote, CR or LF. */
export function csvField(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Header and rows of formatted cells (quoted here where needed); every row must have the header's width. */
export function csvTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header.map(csvField).join(',')];
  rows.forEach((row, i) => {
    if (row.length !== header.length) throw new RangeError(`csvTable: row ${i} has ${row.length} cells, the header ${header.length}`);
    lines.push(row.map(csvField).join(','));
  });
  return `${lines.join('\n')}\n`;
}

/** Time relative to session start, ms. */
export function relMs(id: ExportIdentity, tMs: Num): Num {
  return isBlank(tMs) ? tMs : tMs - id.sessionStartMs;
}

const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}
