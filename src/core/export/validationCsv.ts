// The derived result tables of specification §4.16: validation.csv, cv.csv and events.csv.
// validation.csv holds every estimator × mode × target row, then one summary row per
// estimator × mode, in one wide table: columns that do not apply to a row are empty. Angles are
// exported positive up, like every exported angle (`toExportDeg`).
import type { EventDetection } from '../events/idt.ts';
import { toExportDeg } from '../geometry/angles.ts';
import { sumFunnels } from '../metrics/funnel.ts';
import { ENGINE_IDS } from '../types.ts';
import type { EstimatorId, FitResult, Funnel, TargetMetrics, ValidationReport } from '../types.ts';
import { csvTable, fmtBool, fmtDeg, fmtInt, fmtMs, fmtPx, fmtSig, relMs, type ExportIdentity } from './csv.ts';

export const VALIDATION_HEADER = [
  'estimator', 'mode', 'row', 'item_id', 'region', 'target_x', 'target_y',
  'expected', 'delivered', 'processed', 'face', 'open', 'in_range', 'valid', 'data_loss_pct',
  'accuracy_deg', 'median_error_deg', 'offset_x_deg', 'offset_y_deg', 'accuracy_px', 'rms_s2s_deg', 'sd_deg', 'bcea68_deg2',
  'accuracy_mean_deg', 'accuracy_median_deg', 'accuracy_p90_deg', 'accuracy_central_deg', 'accuracy_peripheral_deg',
  'sampling_hz', 'latency_ms', 'baseline_deg', 'tracking_gain', 'accuracy_pct_diag', 'aoi_grid', 'verdict', 'degrees_approximate',
] as const;

const SUMMARY_COLUMNS = 13;

function funnelCells(f: Funnel): string[] {
  return [fmtSig(f.expected), fmtInt(f.delivered), fmtInt(f.processed), fmtInt(f.face), fmtInt(f.open), fmtInt(f.inRange), fmtInt(f.valid)];
}

function targetRow(r: ValidationReport, t: TargetMetrics): string[] {
  const offset = toExportDeg(t.offsetDeg);
  return [
    r.estimator, r.mode, 'target', t.itemId, t.region, fmtPx(t.targetPx[0]), fmtPx(t.targetPx[1]),
    ...funnelCells(t.funnel), fmtSig(t.dataLossPct),
    fmtDeg(t.accuracyDeg), fmtDeg(t.medianErrorDeg), fmtDeg(offset[0]), fmtDeg(offset[1]), fmtPx(t.accuracyPx),
    fmtDeg(t.rmsS2SDeg), fmtDeg(t.sdDeg), fmtSig(t.bcea68Deg2),
    ...new Array<string>(SUMMARY_COLUMNS).fill(''),
  ];
}

function summaryRow(r: ValidationReport): string[] {
  const pooled = sumFunnels(r.targets.map((t) => t.funnel));
  return [
    r.estimator, r.mode, 'summary', '', '', '', '',
    ...funnelCells(pooled), fmtSig(r.dataLossPct),
    '', '', '', '', '', fmtDeg(r.rmsS2SDeg), fmtDeg(r.sdDeg), fmtSig(r.bcea68Deg2),
    fmtDeg(r.accuracyMeanDeg), fmtDeg(r.accuracyMedianDeg), fmtDeg(r.accuracyP90Deg), fmtDeg(r.accuracyCentralDeg), fmtDeg(r.accuracyPeripheralDeg),
    fmtSig(r.samplingHz), fmtMs(r.latencyMs), fmtDeg(r.baselineDeg), fmtSig(r.trackingGain), fmtSig(r.accuracyPctDiag),
    fmtInt(r.aoiGrid), r.verdict, fmtBool(r.degreesApproximate),
  ];
}

/** Reports in the order given (scoreValidation's order, own before intersection, say). */
export function validationCsv(reports: readonly ValidationReport[]): string {
  const rows = [...reports.flatMap((r) => r.targets.map((t) => targetRow(r, t))), ...reports.map(summaryRow)];
  return csvTable(VALIDATION_HEADER, rows);
}

export const CV_HEADER = ['engine', 'mapper', 'lambda_rel', 'mean_deg', 'se_deg', 'n_rows', 'n_groups', 'coverage', 'chosen'] as const;

/** Every engine × candidate × λ_rel of the fit, engines in rank order, candidates as stored. */
export function cvCsv(fit: FitResult | null): string {
  const rows: string[][] = [];
  for (const engine of ENGINE_IDS) {
    const f = fit?.fits[engine];
    if (f === undefined) continue;
    for (const c of f.candidates) {
      const chosen = c.mapper === f.chosen.mapper && c.lambdaRel === f.chosen.lambdaRel;
      rows.push([
        engine, c.mapper, fmtSig(c.lambdaRel), fmtDeg(c.cv.meanDeg), fmtDeg(c.cv.seDeg),
        fmtInt(c.cv.nRows), fmtInt(c.cv.nGroups), fmtSig(c.cv.coverage), fmtBool(chosen),
      ]);
    }
  }
  return csvTable(CV_HEADER, rows);
}

export const EVENTS_HEADER = [
  'participant', 'session', 'trial', 'estimator', 'type', 'onset_ms', 'offset_ms', 'duration_ms',
  'centroid_x', 'centroid_y', 'centroid_x_deg', 'centroid_y_deg', 'amplitude_deg', 'n_samples',
  'dispersion_threshold_deg', 'sd2d_deg', 'min_fixation_ms',
] as const;

export interface EventsBlock {
  /** `trialName(...)` of the stream the events were detected in. */
  trial: string;
  estimator: EstimatorId;
  detection: EventDetection;
}

/** The selected estimator's events, block by block, with the thresholds each block used. */
export function eventsCsv(id: ExportIdentity, blocks: readonly EventsBlock[]): string {
  const rows = blocks.flatMap(({ trial, estimator, detection }) =>
    detection.events.map((e) => {
      const deg = e.centroidDeg === null ? null : toExportDeg(e.centroidDeg);
      return [
        id.participant, id.session, trial, estimator, e.type,
        fmtMs(relMs(id, e.onsetMs)), fmtMs(relMs(id, e.offsetMs)), fmtMs(e.offsetMs - e.onsetMs),
        fmtPx(e.centroidPx?.[0]), fmtPx(e.centroidPx?.[1]), fmtDeg(deg?.[0]), fmtDeg(deg?.[1]),
        fmtDeg(e.amplitudeDeg), fmtInt(e.nSamples),
        fmtDeg(detection.thresholds.dispersionDeg), fmtDeg(detection.thresholds.sd2dDeg), fmtMs(detection.thresholds.minFixMs),
      ];
    }),
  );
  return csvTable(EVENTS_HEADER, rows);
}
