// Details → Results (design §2.17; spec §17.2.1, §4.12): one metric card per estimator from the
// latest Test round (Combined first, then each engine of the session), the target plot, "How we
// judge this" (the stars and zones mapping, heuristic, with its sources), the challenge's
// statistics per zone, and, each on its own page, own versus intersection, the data-loss funnel,
// the cross-validation candidates, the paired differences with the single-session caveat, the
// areas-of-interest advice, the notes from the fit and the approximate-degrees note.
//
// Nothing is computed anew: the reports are the state's (scored again by
// the measurement pages when the geometry changes, §14.1.3), and only the plot's samples are
// predicted, once per fit, validation and geometry.
import { VERDICT } from '../../core/constants.ts';
import { ESTIMATOR_NAMES } from '../../core/calibration/select.ts';
import { viewportDiagonalPx } from '../../core/geometry/screen.ts';
import { allPairedDifferences, SINGLE_SESSION_CAVEAT } from '../../core/metrics/compare.ts';
import { sumFunnels } from '../../core/metrics/funnel.ts';
import { ESTIMATOR_ORDER } from '../../core/metrics/validation.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { CandidateScore, EngineId, EstimatorId, FitResult, Funnel, Recording, SessionGeometry, ValidationReport } from '../../core/types.ts';
import { scoreRecording, type ScoredRecording } from '../../fit/fitClient.ts';
import type { EngineStatus } from '../../vision/protocol.ts';
import { accuracyPxText, degText, metricCard } from '../components/metricCard.ts';
import { targetPlot } from '../components/targetPlot.ts';
import { h } from '../dom.ts';
import { activeCapture, currentValidationRun, type ValidationRun } from '../session.ts';
import { JUDGE_PAGE, registerDetailsTab, rememberDetailsReturn, type DetailsPage, type PageContext } from '../shell/detailsSheet.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { actionRow, checkRow, linkButton, note, num, para, reading, sheetPage, starRow } from './page.ts';

// ----- Computations -------------------------------------------------------------------------

function median(values: readonly number[]): number {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** The engines this session ran for the player: the run set, or the settings' engines, and any fitted. */
export function sessionEngines(fit: FitResult): EngineId[] {
  const { runSet, settings } = getState();
  const wanted = runSet ?? (settings.engines === 'auto' ? [...ENGINE_IDS] : [...settings.engines]);
  return ENGINE_IDS.filter((e) => wanted.includes(e) || fit.fits[e] !== undefined);
}

/** Median per-frame engine time over the validation frames where the engine returned ok. */
export function computeMsP50(rec: Recording, engine: EngineId): number {
  return median(rec.frames.flatMap((f) => (f.engines[engine]?.status === 'ok' ? [f.engines[engine]!.computeMs] : [])));
}

/** Combined, then every engine of the session, in the report order. */
export function estimatorIds(fit: FitResult): EstimatorId[] {
  const engines = sessionEngines(fit);
  return ESTIMATOR_ORDER.filter((id) => id === 'combined' || engines.includes(id as EngineId));
}

export type Missing = { code: 'combined' } | { code: 'unavailable'; reason: string } | { code: 'not-fitted' };

/** Why an estimator has no report: not formed, unavailable on this device, or not fitted; null when it has one. */
export function missingOf(fit: FitResult, id: EstimatorId, status: readonly EngineStatus[]): Missing | null {
  if (id === 'combined') return fit.combined ? null : { code: 'combined' };
  if (fit.fits[id]) return null;
  const s = status.find((x) => x.id === id);
  return s && !s.ok ? { code: 'unavailable', reason: s.reason ?? t('details.none') } : { code: 'not-fitted' };
}

/** The Details card's wording of `missingOf`. */
function missingSentence(m: Missing | null): string | null {
  if (!m) return null;
  return m.code === 'combined' ? t('details.results.missing.combined') : m.code === 'unavailable' ? t('details.results.missing.unavailable', { reason: m.reason }) : t('details.results.missing.notFitted');
}

/** Each engine's best candidate per mapper (lowest CV error), and whether it is the chosen one. */
export function bestCandidates(fit: FitResult): { engine: EngineId; candidate: CandidateScore; chosen: boolean; lambdaRel: number }[] {
  const out: { engine: EngineId; candidate: CandidateScore; chosen: boolean; lambdaRel: number }[] = [];
  for (const engine of ENGINE_IDS) {
    const f = fit.fits[engine];
    if (!f) continue;
    const best = new Map<string, CandidateScore>();
    for (const c of f.candidates) {
      const b = best.get(c.mapper);
      if (!b || c.cv.meanDeg < b.cv.meanDeg) best.set(c.mapper, c);
    }
    for (const c of best.values()) {
      const chosen = c.mapper === f.chosen.mapper;
      out.push({ engine, candidate: c, chosen, lambdaRel: chosen ? f.chosen.lambdaRel : c.lambdaRel });
    }
  }
  return out;
}

/** The stages of the data-loss funnel, from the frames expected to the valid ones (§4.12, §16.2.1). */
export const FUNNEL_STAGES: readonly (keyof Funnel)[] = ['expected', 'delivered', 'processed', 'face', 'open', 'inRange', 'valid'];

/** The funnel of one report, over every validation target. */
export function reportFunnel(r: ValidationReport | null): Funnel | null {
  return r ? sumFunnels(r.targets.map((x) => x.funnel)) : null;
}

/** CV errors are degrees under the fit's geometry: approximate when that was assumed, whatever was measured later. */
export function cvApproximate(fit: FitResult, geometry: SessionGeometry): boolean {
  return fit.fitGeometry?.degreesApproximate ?? geometry.degreesApproximate;
}

let memo: { fit: FitResult; run: ValidationRun; geometry: SessionGeometry; scored: ScoredRecording } | null = null;

/** The validation scored under the current geometry, computed once per fit, validation and geometry. */
export function scoredValidation(fit: FitResult, run: ValidationRun, geometry: SessionGeometry): ScoredRecording {
  if (memo && memo.fit === fit && memo.run === run && memo.geometry === geometry) return memo.scored;
  const scored = scoreRecording(fit, run.recording, geometry, { nominalFps: run.nominalFps, receivedMs: run.receivedMs });
  memo = { fit, run, geometry, scored };
  return scored;
}

// ----- The tab ------------------------------------------------------------------------------

interface ResultsData {
  fit: FitResult;
  run: ValidationRun;
  geometry: SessionGeometry;
  own: ValidationReport[];
  intersection: ValidationReport[];
  diagonalPx: number;
  inUse: EstimatorId;
}

function resultsData(): ResultsData | null {
  const { fit, geometry, validation, estimator } = getState();
  const run = currentValidationRun();
  if (!fit || !geometry || !run) return null;
  let reports = validation ?? [];
  if (reports.length === 0) {
    const scored = scoredValidation(fit, run, geometry);
    reports = [...scored.own, ...scored.intersection];
  }
  return {
    fit,
    run,
    geometry,
    own: reports.filter((r) => r.mode === 'own'),
    intersection: reports.filter((r) => r.mode === 'intersection'),
    diagonalPx: viewportDiagonalPx(run.recording.geometry.screen),
    inUse: estimator ?? fit.selection.estimator,
  };
}

const deg = (v: number, approximate: boolean) => degText(v, approximate);

function cardPages(d: ResultsData): DetailsPage[] {
  const status = activeCapture()?.status ?? [];
  return estimatorIds(d.fit).map((id) => ({
    id: `estimator-${id}`,
    build: (ctx: PageContext) =>
      metricCard({
        estimator: id,
        name: ESTIMATOR_NAMES[id],
        report: d.own.find((r) => r.estimator === id) ?? null,
        missing: missingSentence(missingOf(d.fit, id, status)),
        diagonalPx: d.diagonalPx,
        backend: id === 'combined' ? null : (status.find((x) => x.id === id)?.backend ?? null),
        selected: d.fit.selection.estimator === id,
        reason: d.fit.selection.reason,
        inUse: d.inUse === id,
        onUse: (use) => {
          setState({ estimator: use ? id : d.fit.selection.estimator });
          ctx.refresh();
        },
      }),
  }));
}

/** The estimators the plot shows; the one in use at first. */
const plotShown = new Set<EstimatorId>();
let plotFit: FitResult | null = null;

function plotPage(d: ResultsData): DetailsPage {
  return {
    id: 'plot',
    build: () => {
      const scored = scoredValidation(d.fit, d.run, d.geometry);
      if (plotFit !== d.fit) {
        plotFit = d.fit;
        plotShown.clear();
        plotShown.add(d.inUse);
      }
      const ids = ESTIMATOR_ORDER.filter((id) => scored.samples.has(id));
      const holder = h('div', { class: 'sheet-page__fill plot-holder' });
      const draw = (): void => {
        const colours = getComputedStyle(document.documentElement);
        const series = ids
          .filter((id) => plotShown.has(id))
          .map((id) => ({ estimator: id, colour: colours.getPropertyValue(`--c-${id}`).trim() || 'currentColor', samples: scored.samples.get(id) ?? [] }));
        const names = series.map((s) => ESTIMATOR_NAMES[s.estimator]).join(', ') || t('details.none');
        holder.replaceChildren(targetPlot(d.run.recording, series, t('results.plot.label', { names })));
      };
      draw();
      // One block per series, so that a short window carries them over to the next page.
      const toggles = ids.map((id) =>
        checkRow({
          id: `plot-${id}`,
          label: t('details.results.plot.show', { name: ESTIMATOR_NAMES[id] }),
          swatch: id,
          checked: plotShown.has(id),
          onChange: (on) => {
            if (on) plotShown.add(id);
            else plotShown.delete(id);
            draw();
          },
        }),
      );
      return sheetPage(t('details.results.plot.title'), { cls: 'sheet-page--fill' }, holder, ...toggles, note(t('details.results.plot.note')));
    },
  };
}

/** "How we judge this" (design §2.12, §5.5; spec §17.7.3, §17.9.5): every threshold is a rule of thumb. */
function judgePage(): DetailsPage {
  const pct = (v: number) => Math.round(v * 100);
  const star = (n: number, text: string) => h('div', { class: 'judge-row' }, starRow(n, 3, 16), h('p', { class: 'sheet-page__body' }, text));
  return {
    id: JUDGE_PAGE,
    build: () =>
      sheetPage(
        t('details.results.judge.title'),
        {},
        para(t('details.results.judge.intro')),
        star(3, t('details.results.judge.good', { deg: VERDICT.goodDeg.toFixed(1), loss: pct(VERDICT.goodLoss) })),
        star(2, t('details.results.judge.acceptable', { deg: VERDICT.okDeg.toFixed(1), loss: pct(VERDICT.okLoss) })),
        star(1, t('details.results.judge.poor')),
        star(0, t('details.results.judge.none', { gain: VERDICT.minGain.toFixed(1) })),
        para(t('details.results.judge.approx', { good: pct(VERDICT.goodPctDiag), ok: pct(VERDICT.okPctDiag) })),
        para(t('details.results.judge.zones')),
        para(t('details.results.judge.challenge')),
        note(t('details.results.judge.heuristic')),
        note(t('details.results.judge.sources')),
      ),
  };
}

function challengePage(): DetailsPage {
  return {
    id: 'challenge',
    build: () => {
      const stats = getState().challenge;
      if (!stats || stats.zones.length === 0) return sheetPage(t('details.results.challenge.title'), {}, para(t('details.results.challenge.none')));
      const zones = [...stats.zones].sort((a, b) => a.row - b.row || a.col - b.col);
      return sheetPage(
        t('details.results.challenge.title'),
        {},
        note(t('details.results.challenge.intro', { rounds: stats.rounds, cols: stats.cols, rows: stats.rows })),
        ...zones.map((z) =>
          reading(
            t('details.results.challenge.zone', { col: z.col + 1, row: z.row + 1 }),
            [
              h('span', { class: 'kv__line' }, t('details.results.challenge.hits', { popped: z.popped, bubbles: z.bubbles, pct: z.bubbles > 0 ? Math.round((100 * z.popped) / z.bubbles) : 0 })),
              h('span', { class: 'kv__line kv__line--second' }, t('details.results.challenge.timing', { s: z.medianPopMs === null ? t('details.none') : (z.medianPopMs / 1000).toFixed(1), x: num(z.offsetPx?.[0], 0), y: num(z.offsetPx?.[1], 0) })),
            ],
          ),
        ),
      );
    },
  };
}

function modesPage(d: ResultsData): DetailsPage {
  return {
    id: 'modes',
    build: () =>
      sheetPage(
        t('details.results.modes.title'),
        {},
        note(t('details.results.modes.note')),
        ...estimatorIds(d.fit).map((id) => {
          const own = d.own.find((r) => r.estimator === id);
          const both = d.intersection.find((r) => r.estimator === id);
          return reading(ESTIMATOR_NAMES[id], [
            h('span', { class: 'kv__line' }, t('details.results.modes.own', { value: own ? accuracyPxText(own, d.diagonalPx) : t('details.none') })),
            h('span', { class: 'kv__line kv__line--second' }, t('details.results.modes.both', { value: both ? accuracyPxText(both, d.diagonalPx) : t('details.none') })),
          ]);
        }),
      ),
  };
}

function funnelPage(d: ResultsData): DetailsPage {
  return {
    id: 'funnel',
    build: () => {
      const f = reportFunnel(d.own.find((r) => r.estimator === d.inUse) ?? null);
      return sheetPage(
        t('details.results.funnel.title'),
        {},
        note(t('details.results.funnel.for', { name: ESTIMATOR_NAMES[d.inUse] })),
        ...(f
          ? FUNNEL_STAGES.map((k) => {
              const frac = f.expected > 0 ? Math.min(1, f[k] / f.expected) : 0;
              return reading(t(`results.funnel.${k}`), [
                h('span', { class: 'funnel-bar', 'aria-hidden': 'true' }, h('span', { class: 'funnel-bar__fill', style: `inline-size: ${(100 * frac).toFixed(1)}%` })),
                h('span', null, `${k === 'expected' ? f[k].toFixed(1) : String(f[k])} · ${t('details.results.unit.pct', { value: (100 * frac).toFixed(0) })}`),
              ], { cls: 'kv--funnel' });
            })
          : [para(t('details.none'))]),
        note(t('results.funnel.note')),
      );
    },
  };
}

function cvPage(d: ResultsData): DetailsPage {
  return {
    id: 'cv',
    build: () => {
      const approximate = cvApproximate(d.fit, d.geometry);
      return sheetPage(
        t('details.results.cv.title'),
        {},
        note(t('results.cv.note')),
        ...bestCandidates(d.fit).map(({ engine, candidate, chosen, lambdaRel }) =>
          reading(`${ESTIMATOR_NAMES[engine]} · ${candidate.mapper}`, [
            h('span', { class: 'kv__line' }, `${deg(candidate.cv.meanDeg, approximate)} ± ${num(candidate.cv.seDeg, 2)}${chosen ? ` · ${t('details.results.cv.chosen')}` : ''}`),
            h('span', { class: 'kv__line kv__line--second' }, t('details.results.cv.detail', { lambda: String(lambdaRel), rows: candidate.cv.nRows, coverage: (100 * candidate.cv.coverage).toFixed(0) })),
          ], { cls: chosen ? 'kv--chosen' : '' }),
        ),
      );
    },
  };
}

function pairedPage(d: ResultsData): DetailsPage {
  return {
    id: 'paired',
    build: () => {
      const order = estimatorIds(d.fit);
      const reports = order.flatMap((id) => d.own.filter((r) => r.estimator === id));
      const pairs = allPairedDifferences(reports);
      const approximate = d.own[0]?.degreesApproximate ?? true;
      return sheetPage(
        t('details.results.paired.title'),
        {},
        note(t('details.results.paired.note')),
        ...(pairs.length === 0
          ? [para(t('details.results.paired.none'))]
          : pairs.map((p) =>
              reading(t('details.results.paired.pair', { a: ESTIMATOR_NAMES[p.a], b: ESTIMATOR_NAMES[p.b] }), [
                h('span', { class: 'kv__line' }, t('details.results.paired.mean', { value: deg(p.meanDiffDeg, approximate) })),
                h('span', { class: 'kv__line kv__line--second' }, t('details.results.paired.test', { p: num(p.wilcoxon.pValue, 3), n: p.wilcoxon.n })),
              ]),
            )),
        note(SINGLE_SESSION_CAVEAT),
      );
    },
  };
}

function aoiPage(d: ResultsData): DetailsPage {
  return {
    id: 'aoi',
    build: () => {
      const r = d.own.find((x) => x.estimator === d.inUse) ?? null;
      const n = r?.aoiGrid ?? 0;
      const name = ESTIMATOR_NAMES[d.inUse];
      return sheetPage(
        t('details.results.aoi.title'),
        {},
        para(n > 0 ? t('results.aoi.n', { name, n }) : t('results.aoi.none', { name })),
        note(t('details.results.aoi.note')),
      );
    },
  };
}

function fitPage(d: ResultsData): DetailsPage {
  return {
    id: 'fit',
    build: () =>
      sheetPage(
        t('details.results.fit.title'),
        {},
        reading(t('details.results.fit.estimator'), ESTIMATOR_NAMES[d.inUse]),
        reading(t('details.results.fit.lag'), t('details.results.unit.ms', { value: d.fit.pursuitLagMs.toFixed(0) })),
        reading(t('details.results.fit.time'), t('details.results.unit.s', { value: (d.fit.fitMs / 1000).toFixed(1) })),
        ...d.fit.warnings.map((w) => note(w)),
        note(t('results.optimism')),
      ),
  };
}

function degreesPage(d: ResultsData | null): DetailsPage {
  return {
    id: 'degrees',
    build: () => {
      const approximate = d ? d.geometry.degreesApproximate : (getState().geometry?.degreesApproximate ?? true);
      return sheetPage(
        t('details.results.degrees.title'),
        {},
        para(t(approximate ? 'details.results.degrees.approx' : 'details.results.degrees.exact')),
        actionRow(
          linkButton(t('details.measure'), {
            onClick: () => {
              rememberDetailsReturn();
              location.hash = '#/screen?from=details';
            },
          }),
        ),
      );
    },
  };
}

function nonePage(): DetailsPage {
  const { fit } = getState();
  return {
    id: 'none',
    build: () => sheetPage(t('details.results.none.title'), {}, para(t(fit ? 'details.results.none.untested' : 'details.results.none.body'))),
  };
}

function pages(): DetailsPage[] {
  const d = resultsData();
  if (!d) return [nonePage(), judgePage(), challengePage(), degreesPage(null)];
  return [...cardPages(d), plotPage(d), judgePage(), challengePage(), modesPage(d), funnelPage(d), cvPage(d), pairedPage(d), aoiPage(d), fitPage(d), degreesPage(d)];
}

registerDetailsTab('results', pages);
