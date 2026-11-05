// The export zip (specification §4.16), built with fflate. Entries are flat, in a fixed order,
// deflated at a fixed level and stamped with a fixed time, so identical state gives identical
// bytes; only session.json's `exportedAt` changes between exports.
import { zipSync, type Zippable } from 'fflate';
import type { FitResult, SessionGeometry, ValidationReport } from '../types.ts';
import { utf8, type ExportIdentity } from './csv.ts';
import { geometryYaml } from './geometryYaml.ts';
import { readmeText } from './readme.ts';
import { samplesCsv, type SampleRow } from './samplesCsv.ts';
import { datasetJson, sessionJson, type DatasetBlock, type SessionMeta } from './sessionJson.ts';
import { targetsCsv, type TargetsBlock } from './targetsCsv.ts';
import { cvCsv, eventsCsv, validationCsv, type EventsBlock } from './validationCsv.ts';
import { gameCsv, type GameCsvBlock } from './gameCsv.ts';

export const EXPORT_FILES = [
  'README.txt',
  'samples.csv',
  'targets.csv',
  'validation.csv',
  'cv.csv',
  'events.csv',
  'game.csv',
  'geometry.yaml',
  'session.json',
  'dataset.json',
] as const;
export type ExportFileName = (typeof EXPORT_FILES)[number];

const DEFLATE_LEVEL = 6;

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
}

/** Zips flat entries in the order given. Names must be unique and contain no path. */
export function zipFiles(entries: readonly ZipEntry[]): Uint8Array {
  const files: Zippable = {};
  for (const { name, data } of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new RangeError(`zipFiles: invalid entry name '${name}'`);
    if (Object.hasOwn(files, name)) throw new RangeError(`zipFiles: duplicate entry '${name}'`);
    files[name] = typeof data === 'string' ? utf8(data) : data;
  }
  // fflate writes the DOS time from the local-time getters, so a Date built from local fields
  // at call time gives 1980-01-01 00:00 (the DOS epoch) whatever the time zone.
  return zipSync(files, { level: DEFLATE_LEVEL, mtime: new Date(1980, 0, 1, 0, 0, 0) });
}

function namePart(s: string): string {
  const safe = s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return safe === '' ? 'none' : safe;
}

/**
 * `eek-a-calibrate_<pid>_<session>_<yyyymmdd-hhmm>.zip`, local time. Characters other than
 * letters, digits, `.`, `_` and `-` become `-`; an empty part becomes `none`.
 */
export function exportZipName(participant: string, session: string, exportedAt: Date): string {
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${exportedAt.getFullYear()}${p2(exportedAt.getMonth() + 1)}${p2(exportedAt.getDate())}-${p2(exportedAt.getHours())}${p2(exportedAt.getMinutes())}`;
  return `eek-a-calibrate_${namePart(participant)}_${namePart(session)}_${stamp}.zip`;
}

export interface ExportInput {
  identity: ExportIdentity;
  exportedAt: Date;
  geometry: SessionGeometry;
  samples: readonly SampleRow[];
  targets: readonly TargetsBlock[];
  validations: readonly ValidationReport[];
  fit: FitResult | null;
  events: readonly EventsBlock[];
  session: SessionMeta;
  /** dataset.json is written only when this is given (off by default). */
  dataset?: readonly DatasetBlock[];
  /** game.csv is written only when challenge rounds were played (§17.10.1). */
  game?: readonly GameCsvBlock[];
}

export interface ExportBundle {
  name: string;
  files: { name: ExportFileName; text: string }[];
  zip: Uint8Array;
}

/** Every export file, then the zip. Throws, writing nothing, when any file cannot be written. */
export function buildExport(input: ExportInput): ExportBundle {
  const { identity: id } = input;
  const names = EXPORT_FILES.filter((n) => (n !== 'dataset.json' || input.dataset !== undefined) && (n !== 'game.csv' || input.game !== undefined));
  const text: Record<ExportFileName, () => string> = {
    'README.txt': () =>
      readmeText({ participant: id.participant, session: id.session, appVersion: input.session.app.version, appCommit: input.session.app.commit, files: names }),
    'samples.csv': () => samplesCsv(id, input.samples, input.geometry),
    'targets.csv': () => targetsCsv(id, input.targets, input.geometry.screen),
    'validation.csv': () => validationCsv(input.validations),
    'cv.csv': () => cvCsv(input.fit),
    'events.csv': () => eventsCsv(id, input.events),
    'game.csv': () => gameCsv(id, input.game ?? []),
    'geometry.yaml': () => geometryYaml(input.geometry),
    'session.json': () =>
      sessionJson({ ...input.session, identity: id, exportedAt: input.exportedAt, geometry: input.geometry, fit: input.fit, validations: input.validations }),
    'dataset.json': () => datasetJson(id, input.dataset ?? []),
  };
  const files = names.map((name) => ({ name, text: text[name]() }));
  return {
    name: exportZipName(id.participant, id.session, input.exportedAt),
    files,
    zip: zipFiles(files.map((f) => ({ name: f.name, data: f.text }))),
  };
}
