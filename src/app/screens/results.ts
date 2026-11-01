// #/results (specification §7 screen 6): the comparison table for Combined and every engine in
// the run, with the own and intersection tabs, Auto's choice and its reason, the estimator in
// use (switching is instant), the target plot, the data-loss funnel, the CV candidates, the
// areas-of-interest advice and the note on optimism when switching. The stored validation frames
// are scored again under the session's current geometry, so a screen or distance measured after
// calibration changes the degrees and nothing else (§14.1.3).
import { ESTIMATOR_NAMES } from '../../core/calibration/select.ts';
import { viewportDiagonalPx } from '../../core/geometry/screen.ts';
import { sumFunnels } from '../../core/metrics/funnel.ts';
import { ESTIMATOR_ORDER } from '../../core/metrics/validation.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId, EstimatorId, FitResult, Funnel, Recording, ValidationReport } from '../../core/types.ts';
import { scoreRecording, type ScoredRecording } from '../../fit/fitClient.ts';
import { metricTable, type MetricRow } from '../components/metricTable.ts';
import { targetPlot } from '../components/targetPlot.ts';
import { h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { activeCapture, currentValidationRun, type ValidationRun } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';

const CSS = `
.results section { margin-top: var(--space-5); }
.results .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.metric-table, .results .simple-table { border-collapse: collapse; font-variant-numeric: tabular-nums; min-width: 100%; }
.metric-table caption { text-align: left; font-weight: 600; padding-bottom: var(--space-2); }
.metric-table th, .metric-table td, .results .simple-table th, .results .simple-table td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--border); white-space: nowrap; vertical-align: top; }
.metric-table tr.in-use { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.metric-table tr.missing td { color: var(--muted); }
.metric-table .badge { display: inline-block; margin-left: var(--space-2); padding: 0 var(--space-2); border-radius: var(--radius); border: 1px solid var(--accent); font-size: 0.8rem; font-weight: 600; }
.metric-table .backend { color: var(--muted); font-weight: normal; font-size: 0.85rem; }
.metric-table input[type='radio'] { width: 1.5rem; height: 1.5rem; }
.swatch { display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 50%; margin-right: var(--space-2); vertical-align: -0.05rem; }
.swatch-combined { background: var(--c-combined); } .swatch-blazegaze { background: var(--c-blazegaze); } .swatch-peekr { background: var(--c-peekr); }
.swatch-geometric { background: var(--c-geometric); } .swatch-eyepixel { background: var(--c-eyepixel); }
.results [role='tablist'] { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
.results [role='tab'] { min-height: 44px; background: transparent; color: var(--fg); border-color: var(--border); }
.results [role='tab'][aria-selected='true'] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.results .hint { border-left: 4px solid var(--warn); padding: var(--space-2) var(--space-3); background: var(--surface); }
.results .hint button { margin-left: var(--space-2); }
.results .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.results .actions a.button { text-decoration: none; display: inline-flex; align-items: center; min-height: 44px; }
.results .actions a.button.secondary { background: transparent; color: var(--fg); border-color: var(--border); }
.target-plot { width: 100%; max-width: 48rem; height: auto; display: block; }
.target-plot .plot-screen { fill: var(--stimulus-bg); }
.target-plot .plot-target { stroke: var(--c-target); fill: none; }
.target-plot .plot-sample { fill: currentColor; opacity: 0.45; }
.target-plot .plot-centroid { fill: currentColor; stroke: #000; stroke-width: 1; }
.target-plot .plot-offset { stroke: currentColor; }
.results .plot-toggles { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-2); }
.results .plot-toggles label { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 44px; }
.funnel-bar { display: inline-block; height: 0.8rem; background: var(--accent); vertical-align: middle; margin-right: var(--space-2); }
.results .funnel-table th { white-space: normal; min-width: 8rem; }
`;

let hintDismissed = false;

function median(values: readonly number[]): number {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** The engines this session ran for the user: the run set, or the settings' engines. */
function sessionEngines(fit: FitResult): EngineId[] {
  const { runSet, settings } = getState();
  const wanted = runSet ?? (settings.engines === 'auto' ? [...ENGINE_IDS] : [...settings.engines]);
  return ENGINE_IDS.filter((e) => wanted.includes(e) || fit.fits[e] !== undefined);
}

/** Median per-frame engine time over the validation frames where the engine returned ok. */
function computeMsP50(rec: Recording, engine: EngineId): number {
  return median(rec.frames.flatMap((f) => (f.engines[engine]?.status === 'ok' ? [f.engines[engine]!.computeMs] : [])));
}

class Results {
  private readonly root: HTMLElement;
  private readonly ctx: ScreenContext;
  private mode: 'own' | 'intersection' = 'own';
  private shown = new Set<EstimatorId>();
  private fit!: FitResult;
  private run!: ValidationRun;
  private scored!: ScoredRecording;
  private readonly body = h('div');

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.root = root;
    this.ctx = ctx;
    root.append(h('style', null, CSS));
    const { fit, geometry } = getState();
    const run = currentValidationRun();
    const container = h('div', { class: 'results' }, h('h1', null, t('route.results')));
    root.append(container);
    if (fit && geometry && !run) {
      container.append(
        h('p', null, t('results.notValidated')),
        h('p', { class: 'actions' }, h('a', { href: '#/live', class: 'button' }, t('results.toLive')), ' ', h('a', { href: '#/calibrate', class: 'button secondary' }, t('results.toCalibrate'))),
      );
      return;
    }
    if (!fit || !run || !geometry) {
      container.append(h('p', null, t('results.none')), h('p', null, h('a', { href: '#/calibrate', class: 'button' }, t('results.toCalibrate'))));
      return;
    }
    this.fit = fit;
    this.run = run;
    this.scored = scoreRecording(fit, run.recording, geometry, { nominalFps: run.nominalFps, receivedMs: run.receivedMs });
    setState({ validation: [...this.scored.own, ...this.scored.intersection] });
    const inUse = getState().estimator ?? fit.selection.estimator;
    if (getState().estimator === null) setState({ estimator: inUse });
    this.shown.add(inUse);
    container.append(h('p', { class: 'lead' }, t('results.lead')), this.body);
    this.render();
  }

  private reports(): ValidationReport[] {
    return this.mode === 'own' ? this.scored.own : this.scored.intersection;
  }

  private report(id: EstimatorId): ValidationReport | null {
    return this.reports().find((r) => r.estimator === id) ?? null;
  }

  private rows(): MetricRow[] {
    const fit = this.fit;
    const status = activeCapture()?.status ?? [];
    const engines = sessionEngines(fit);
    const ids = ESTIMATOR_ORDER.filter((id) => id === 'combined' || engines.includes(id as EngineId));
    return ids.map((id): MetricRow => {
      if (id === 'combined') {
        const members = fit.combined?.members ?? [];
        return {
          estimator: id,
          name: ESTIMATOR_NAMES.combined,
          missing: fit.combined ? null : t('results.noCombined'),
          backend: null,
          cv: fit.combined?.cv ?? null,
          report: this.report('combined'),
          computeMsP50: members.length > 0 ? members.reduce((s, e) => s + computeMsP50(this.run.recording, e), 0) : Number.NaN,
          selected: fit.selection.estimator === 'combined',
        };
      }
      const s = status.find((x) => x.id === id);
      const fitted = fit.fits[id];
      return {
        estimator: id,
        name: ESTIMATOR_NAMES[id],
        missing: fitted ? null : s && !s.ok ? t('results.unavailable', { reason: s.reason ?? '—' }) : t('results.notFitted'),
        backend: s?.backend ?? null,
        cv: fitted?.cv ?? null,
        report: this.report(id),
        computeMsP50: computeMsP50(this.run.recording, id),
        selected: fit.selection.estimator === id,
      };
    });
  }

  private use(id: EstimatorId): void {
    setState({ estimator: id });
    this.shown.add(id);
    this.render();
    (this.root.querySelector(`input[name='estimator-in-use'][value='${id}']`) as HTMLInputElement | null)?.focus();
  }

  private render(): void {
    const fit = this.fit;
    const inUse = getState().estimator ?? fit.selection.estimator;
    const approximate = this.scored.geometry.degreesApproximate;
    const diagonal = viewportDiagonalPx(this.run.recording.geometry.screen);
    const sections: Node[] = [];

    if (approximate && !hintDismissed) {
      const hint = h(
        'p',
        { class: 'hint' },
        t('results.approx.note'),
        ' ',
        h('a', { href: '#/screen' }, t('results.approx.measure')),
        h('button', { type: 'button', class: 'secondary', onclick: () => { hintDismissed = true; this.render(); } }, t('results.approx.dismiss')),
      );
      sections.push(hint);
    }

    sections.push(
      h('p', { class: 'selection' }, h('strong', null, t('results.selected', { name: ESTIMATOR_NAMES[fit.selection.estimator] })), ' ', fit.selection.reason),
      h('p', null, t('results.inUse', { name: ESTIMATOR_NAMES[inUse] })),
    );

    const tab = (m: 'own' | 'intersection') =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `tab-${m}`,
          'aria-selected': String(this.mode === m),
          'aria-controls': 'results-panel',
          tabindex: this.mode === m ? '0' : '-1',
          onclick: () => {
            this.mode = m;
            this.render();
            (this.root.querySelector(`#tab-${m}`) as HTMLElement | null)?.focus();
          },
          onkeydown: (e: Event) => {
            const k = (e as KeyboardEvent).key;
            if (k === 'ArrowRight' || k === 'ArrowLeft') {
              e.preventDefault();
              this.mode = this.mode === 'own' ? 'intersection' : 'own';
              this.render();
              (this.root.querySelector(`#tab-${this.mode}`) as HTMLElement | null)?.focus();
            }
          },
        },
        t(`results.tab.${m}`),
      );
    sections.push(
      h(
        'section',
        null,
        h('div', { role: 'tablist', 'aria-label': t('results.tabs') }, tab('own'), tab('intersection')),
        h(
          'div',
          { id: 'results-panel', role: 'tabpanel', 'aria-labelledby': `tab-${this.mode}` },
          h('p', { class: 'note' }, t(this.mode === 'own' ? 'results.tab.ownNote' : 'results.tab.intersectionNote')),
          h('div', { class: 'table-wrap' }, metricTable(this.rows(), { diagonalPx: diagonal, cvApproximate: this.cvApproximate(), inUse, onUse: (id) => this.use(id) })),
        ),
        h('p', { class: 'note' }, t('results.optimism')),
        h('p', { class: 'note' }, t('results.heuristic')),
      ),
    );

    sections.push(this.plotSection());
    sections.push(this.funnelSection(inUse));
    sections.push(this.aoiSection(inUse));
    sections.push(this.cvSection());
    if (fit.warnings.length > 0) sections.push(h('section', null, h('h2', null, t('results.warnings')), h('ul', null, ...fit.warnings.map((w) => h('li', null, w)))));
    sections.push(
      h(
        'section',
        null,
        h('p', { class: 'note' }, t('results.lag', { ms: fit.pursuitLagMs.toFixed(0) }), ' ', t('results.fitTime', { s: (fit.fitMs / 1000).toFixed(1) })),
        h('h2', null, t('results.actions')),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', onclick: () => this.ctx.navigate('live') }, t('results.accept')),
          h('button', { type: 'button', class: 'secondary', onclick: () => this.ctx.navigate('validate') }, t('results.revalidate')),
          h('button', { type: 'button', class: 'secondary', onclick: () => this.ctx.navigate('calibrate') }, t('results.recalibrate')),
        ),
      ),
    );
    this.body.replaceChildren(...sections);
  }

  private plotSection(): HTMLElement {
    const ids = [...this.scored.samples.keys()];
    const colours = getComputedStyle(document.documentElement);
    const toggles = ids.map((id) => {
      const box = h('input', {
        type: 'checkbox',
        value: id,
        onchange: (e: Event) => {
          if ((e.target as HTMLInputElement).checked) this.shown.add(id);
          else this.shown.delete(id);
          this.render();
          (this.root.querySelector(`.plot-toggles input[value='${id}']`) as HTMLElement | null)?.focus();
        },
      });
      box.checked = this.shown.has(id);
      return h('label', null, box, h('span', { class: `swatch swatch-${id}`, 'aria-hidden': 'true' }), ESTIMATOR_NAMES[id]);
    });
    const series = ids
      .filter((id) => this.shown.has(id))
      .map((id) => ({ estimator: id, colour: colours.getPropertyValue(`--c-${id}`).trim() || '#000', samples: this.scored.samples.get(id) ?? [] }));
    const label = t('results.plot.label', { names: series.map((s) => ESTIMATOR_NAMES[s.estimator]).join(', ') || t('results.none.value') });
    return h(
      'section',
      null,
      h('h2', null, t('results.plot.title')),
      h('p', { class: 'note' }, t('results.plot.note')),
      h('fieldset', { class: 'plot-toggles' }, h('legend', null, t('results.plot.show')), ...toggles),
      targetPlot(this.run.recording, series, label),
    );
  }

  private funnelSection(inUse: EstimatorId): HTMLElement {
    const r = this.report(inUse);
    const f: Funnel | null = r ? sumFunnels(r.targets.map((x) => x.funnel)) : null;
    const stages: (keyof Funnel)[] = ['expected', 'delivered', 'processed', 'face', 'open', 'inRange', 'valid'];
    const rows = f
      ? stages.map((k) => {
          const frac = f.expected > 0 ? f[k] / f.expected : 0;
          return h(
            'tr',
            null,
            h('th', { scope: 'row' }, t(`results.funnel.${k}`)),
            h('td', null, k === 'expected' ? f[k].toFixed(1) : String(f[k])),
            h('td', null, h('span', { class: 'funnel-bar', style: `width: ${(Math.min(1, frac) * 8).toFixed(2)}rem`, 'aria-hidden': 'true' }), t('results.unit.pct', { value: (100 * frac).toFixed(0) })),
          );
        })
      : [];
    return h(
      'section',
      null,
      h('h2', null, t('results.funnel.title')),
      h('p', null, t('results.funnel.for', { name: ESTIMATOR_NAMES[inUse] })),
      h('div', { class: 'table-wrap' }, h('table', { class: 'simple-table funnel-table' }, h('tbody', null, ...rows))),
      h('p', { class: 'note' }, t('results.funnel.note')),
    );
  }

  private aoiSection(inUse: EstimatorId): HTMLElement {
    const r = this.report(inUse);
    const n = r?.aoiGrid ?? 0;
    const name = ESTIMATOR_NAMES[inUse];
    return h('section', null, h('h2', null, t('results.aoi.title')), h('p', null, n > 0 ? t('results.aoi.n', { name, n }) : t('results.aoi.none', { name })));
  }

  /** CV errors are degrees under the geometry of the fit, so they stay approximate if that was assumed, whatever was measured later. */
  private cvApproximate(): boolean {
    return this.fit.fitGeometry?.degreesApproximate ?? this.scored.geometry.degreesApproximate;
  }

  private cvSection(): HTMLElement {
    const approximate = this.cvApproximate();
    const deg = (v: number) => (Number.isFinite(v) ? `${approximate ? '≈' : ''}${v.toFixed(2)}°` : t('results.none.value'));
    const rows: HTMLTableRowElement[] = [];
    for (const engine of ENGINE_IDS) {
      const f = this.fit.fits[engine];
      if (!f) continue;
      const best = new Map<string, (typeof f.candidates)[number]>();
      for (const c of f.candidates) {
        const b = best.get(c.mapper);
        if (!b || c.cv.meanDeg < b.cv.meanDeg) best.set(c.mapper, c);
      }
      for (const c of best.values()) {
        const chosen = c.mapper === f.chosen.mapper;
        rows.push(
          h(
            'tr',
            { class: chosen ? 'in-use' : null },
            h('td', null, ESTIMATOR_NAMES[engine]),
            h('td', null, c.mapper, chosen ? ` (${t('results.cv.chosen')})` : ''),
            h('td', null, `${deg(c.cv.meanDeg)} ± ${Number.isFinite(c.cv.seDeg) ? c.cv.seDeg.toFixed(2) : '—'}`),
            h('td', null, String(chosen ? f.chosen.lambdaRel : c.lambdaRel)),
            h('td', null, String(c.cv.nRows)),
            h('td', null, `${(100 * c.cv.coverage).toFixed(0)} %`),
          ),
        );
      }
    }
    const headCells = ['engine', 'mapper', 'error', 'lambda', 'rows', 'coverage'].map((k) => h('th', { scope: 'col' }, t(`results.cv.${k}`)));
    return h(
      'section',
      null,
      h('h2', null, t('results.cv.title')),
      h('p', { class: 'note' }, t('results.cv.note')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'simple-table' }, h('thead', null, h('tr', null, ...headCells)), h('tbody', null, ...rows))),
    );
  }
}

const screen: Screen = {
  mount(root, ctx) {
    new Results(root, ctx);
  },
};

export default screen;
