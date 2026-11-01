// The results table (specification §7 screen 6): one row per estimator, Combined first, with the
// CV error, validation accuracy, precision, data loss, rate, time per frame, gain and verdict.
// While degrees are approximate (§14.1.4) pixels and % of the diagonal come first and degrees
// carry "≈".
import type { CvReport, EstimatorId, ValidationReport } from '../../core/types.ts';
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export interface MetricRow {
  estimator: EstimatorId;
  name: string;
  /** Why there is no fit for this row (unavailable engine, failed fit, no Combined), or null. */
  missing: string | null;
  backend: string | null;
  cv: CvReport | null;
  report: ValidationReport | null;
  computeMsP50: number;
  /** Auto's choice. */
  selected: boolean;
}

const dash = (): string => t('results.none.value');

export function fmt(v: number, digits: number): string {
  return Number.isFinite(v) ? v.toFixed(digits) : dash();
}

export function fmtDeg(v: number, approximate: boolean, digits = 2): string {
  if (!Number.isFinite(v)) return dash();
  return t(approximate ? 'results.unit.approxDeg' : 'results.unit.deg', { value: v.toFixed(digits) });
}

/** Mean accuracy in px, from the % of the diagonal that the report keeps. */
export function accuracyPx(r: ValidationReport, diagonalPx: number): number {
  return (r.accuracyPctDiag / 100) * diagonalPx;
}

/** The accuracy cell: px and % of the diagonal first when degrees are approximate, else degrees first. */
export function accuracyText(r: ValidationReport, diagonalPx: number): string {
  const px = accuracyPx(r, diagonalPx);
  const pxText = Number.isFinite(px) ? t('results.unit.px', { value: px.toFixed(0) }) : dash();
  const diag = Number.isFinite(r.accuracyPctDiag) ? t('results.unit.diag', { value: r.accuracyPctDiag.toFixed(1) }) : dash();
  const deg = fmtDeg(r.accuracyMeanDeg, r.degreesApproximate);
  return r.degreesApproximate ? `${pxText} · ${diag} · ${deg}` : `${deg} · ${pxText} · ${diag}`;
}

export interface TableOptions {
  diagonalPx: number;
  /** The CV errors are degrees under the fit's geometry: approximate when that geometry was assumed. */
  cvApproximate: boolean;
  inUse: EstimatorId | null;
  onUse(id: EstimatorId): void;
}

/** The comparison table; rows without a fit or a report show why. */
export function metricTable(rows: readonly MetricRow[], o: TableOptions): HTMLTableElement {
  const cols = ['estimator', 'cv', 'accuracy', 'median', 'regions', 'rms', 'sd', 'bcea', 'loss', 'hz', 'ms', 'gain', 'verdict', 'use'];
  const head = h('thead', null, h('tr', null, ...cols.map((c) => h('th', { scope: 'col' }, t(`results.col.${c}`)))));
  const body = h(
    'tbody',
    null,
    ...rows.map((row) => {
      const r = row.report;
      const nameCell = h(
        'th',
        { scope: 'row' },
        h('span', { class: `swatch swatch-${row.estimator}`, 'aria-hidden': 'true' }),
        row.name,
        row.backend ? h('span', { class: 'backend' }, ` (${row.backend})`) : null,
        row.selected ? h('span', { class: 'badge' }, t('results.selectedBadge')) : null,
      );
      if (row.missing !== null || !r) {
        return h(
          'tr',
          { 'data-estimator': row.estimator, class: 'missing' },
          nameCell,
          h('td', { colspan: cols.length - 1 }, row.missing ?? t('results.notFitted')),
        );
      }
      const regions = `${fmtDeg(r.accuracyCentralDeg, r.degreesApproximate)} / ${fmtDeg(r.accuracyPeripheralDeg, r.degreesApproximate)}`;
      const use = h('input', { type: 'radio', name: 'estimator-in-use', value: row.estimator, 'aria-label': t('results.use', { name: row.name }), onchange: () => o.onUse(row.estimator) });
      use.checked = o.inUse === row.estimator;
      return h(
        'tr',
        { 'data-estimator': row.estimator, class: o.inUse === row.estimator ? 'in-use' : null },
        nameCell,
        h('td', null, row.cv ? fmtDeg(row.cv.meanDeg, o.cvApproximate) : dash()),
        h('td', null, accuracyText(r, o.diagonalPx)),
        h('td', null, fmtDeg(r.accuracyMedianDeg, r.degreesApproximate)),
        h('td', null, regions),
        h('td', null, fmtDeg(r.rmsS2SDeg, r.degreesApproximate)),
        h('td', null, fmtDeg(r.sdDeg, r.degreesApproximate)),
        h('td', null, Number.isFinite(r.bcea68Deg2) ? t(r.degreesApproximate ? 'results.unit.approxDeg2' : 'results.unit.deg2', { value: r.bcea68Deg2.toFixed(2) }) : dash()),
        h('td', null, Number.isFinite(r.dataLossPct) ? t('results.unit.pct', { value: r.dataLossPct.toFixed(0) }) : dash()),
        h('td', null, Number.isFinite(r.samplingHz) ? t('results.unit.hz', { value: r.samplingHz.toFixed(1) }) : dash()),
        h('td', null, Number.isFinite(row.computeMsP50) ? t('results.unit.ms', { value: row.computeMsP50.toFixed(1) }) : dash()),
        h('td', null, fmt(r.trackingGain, 1)),
        h('td', { class: `verdict verdict-${r.verdict}` }, t(`results.verdict.${r.verdict}`)),
        h('td', null, use),
      );
    }),
  );
  return h('table', { class: 'metric-table' }, h('caption', null, t('results.table.caption')), head, body);
}
