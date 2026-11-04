// One estimator's result as a card (spec §17 prompt 017, design §2.17): accuracy in px and % of
// the screen diagonal first and approximate degrees second (§14.1.4), precision, data loss, rate,
// the verdict as word and glyph, and the "Use this" switch, the instant estimator switch. Auto's
// choice carries its badge and reason. The card is a Details page: its rows are blocks, so the
// sheet can carry them over to a second page on a short window.
import type { EstimatorId, ValidationReport } from '../../core/types.ts';
import { reading, sheetPage, stateBadge, switchRow, type BadgeState } from '../details/page.ts';
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export interface MetricCardInput {
  estimator: EstimatorId;
  name: string;
  /** The Test round's report for this estimator (own frames), or null. */
  report: ValidationReport | null;
  /** Why there is no report (not loaded, not fitted, no Combined), or null. */
  missing: string | null;
  /** The validation viewport's diagonal, CSS px: accuracy in px comes from the % of it. */
  diagonalPx: number;
  backend: string | null;
  /** Auto's choice, and its reason. */
  selected: boolean;
  reason: string | null;
  inUse: boolean;
  /** Called with true to use this estimator, false to go back to Auto's choice. */
  onUse(use: boolean): void;
}

const VERDICT_STATE: Readonly<Record<ValidationReport['verdict'], BadgeState>> = {
  good: 'good',
  acceptable: 'good',
  poor: 'adjust',
  'not-tracking': 'lost',
};

function fixed(v: number, digits: number): string | null {
  return Number.isFinite(v) ? v.toFixed(digits) : null;
}

/** "42 px · 3.1 % of diagonal": the exact units, which never depend on the measurements. */
export function accuracyPxText(r: ValidationReport, diagonalPx: number): string {
  const px = fixed((r.accuracyPctDiag / 100) * diagonalPx, 0);
  const pct = fixed(r.accuracyPctDiag, 1);
  if (px === null || pct === null) return t('details.none');
  return t('details.results.card.accuracyPx', { px, pct });
}

/** Degrees, with "≈" while the screen or the distance is assumed (§14.1.4). */
export function degText(v: number, approximate: boolean, digits = 2): string {
  const value = fixed(v, digits);
  if (value === null) return t('details.none');
  return t(approximate ? 'details.results.unit.approxDeg' : 'details.results.unit.deg', { value });
}

export function verdictWord(verdict: ValidationReport['verdict']): string {
  return t(`details.results.verdict.${verdict}`);
}

export function verdictLine(verdict: ValidationReport['verdict']): HTMLElement {
  return h('span', { class: 'verdict' }, stateBadge(VERDICT_STATE[verdict]), h('span', null, verdictWord(verdict)));
}

export function metricCard(o: MetricCardInput): HTMLElement {
  const r = o.report;
  const head = [
    o.selected ? h('span', { class: 'badge' }, t('details.results.card.auto')) : null,
    o.backend ? h('span', { class: 'metric-card__backend' }, o.backend) : null,
  ];
  if (o.missing !== null || !r) {
    return sheetPage(o.name, { cls: `metric-card metric-card--${o.estimator}`, head }, h('p', { class: 'sheet-page__body' }, o.missing ?? t('details.results.card.notFitted')));
  }
  const approximate = r.degreesApproximate;
  return sheetPage(
    o.name,
    { cls: `metric-card metric-card--${o.estimator}`, head },
    reading(t('details.results.card.verdict'), verdictLine(r.verdict), { cls: 'kv--verdict' }),
    reading(t('details.results.card.accuracy'), [h('span', { class: 'kv__line' }, accuracyPxText(r, o.diagonalPx)), h('span', { class: 'kv__line kv__line--second' }, degText(r.accuracyMeanDeg, approximate))]),
    reading(t('details.results.card.precision'), degText(r.rmsS2SDeg, approximate)),
    reading(t('details.results.card.loss'), Number.isFinite(r.dataLossPct) ? t('details.results.unit.pct', { value: r.dataLossPct.toFixed(0) }) : t('details.none')),
    reading(t('details.results.card.rate'), Number.isFinite(r.samplingHz) ? t('details.results.unit.hz', { value: r.samplingHz.toFixed(1) }) : t('details.none')),
    switchRow({
      id: `use-${o.estimator}`,
      label: t('details.results.card.use'),
      detail: o.inUse ? (o.selected ? t('details.results.card.inUseAuto') : t('details.results.card.inUse')) : null,
      checked: o.inUse,
      // Auto's choice in use has nothing to go back to.
      disabled: o.inUse && o.selected,
      onChange: (on) => o.onUse(on),
    }),
    o.selected && o.reason ? h('p', { class: 'sheet-note' }, t('details.results.card.reason', { reason: o.reason })) : null,
  );
}
