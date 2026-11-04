// All user-facing copy, in formal British English (spec §7, §17.3.6), merged from one module per
// screen or shell part under strings/. Keys are flat and dotted (`<screen>.<item>`) and belong to
// exactly one module: a key defined twice throws here, so the unit tests fail on it.
// Placeholders are written `{name}`.
//
// Anti-fabrication: no accuracy figure may appear here unless it carries a
// source from spec Appendix B or is labelled heuristic.
import { strings as about } from './strings/about.ts';
import { strings as calibrate } from './strings/calibrate.ts';
import { strings as camera } from './strings/camera.ts';
import { strings as challenge } from './strings/challenge.ts';
import { strings as complete } from './strings/complete.ts';
import { strings as components } from './strings/components.ts';
import { strings as data } from './strings/data.ts';
import { strings as details } from './strings/details.ts';
import { strings as distance } from './strings/distance.ts';
import { strings as drift } from './strings/drift.ts';
import { strings as guard } from './strings/guard.ts';
import { strings as lab } from './strings/lab.ts';
import { strings as live } from './strings/live.ts';
import { strings as look } from './strings/look.ts';
import { strings as meters } from './strings/meters.ts';
import { strings as methods } from './strings/methods.ts';
import { strings as ready } from './strings/ready.ts';
import { strings as results } from './strings/results.ts';
import { strings as screen } from './strings/screen.ts';
import { strings as shell } from './strings/shell.ts';
import { strings as site } from './strings/site.ts';
import { strings as stimulus } from './strings/stimulus.ts';
import { strings as title } from './strings/title.ts';
import { strings as track } from './strings/track.ts';
import { strings as validate } from './strings/validate.ts';
import { strings as warmup } from './strings/warmup.ts';
import { strings as welcome } from './strings/welcome.ts';

export type StringTable = Readonly<Record<string, string>>;

/** The modules behind `t()`, by file name under strings/. */
export const STRING_MODULES: Readonly<Record<string, StringTable>> = {
  shell,
  track,
  details,
  title,
  ready,
  guard,
  warmup,
  complete,
  look,
  challenge,
  methods,
  // The legacy screens' copy, until prompt 018 removes them.
  site,
  stimulus,
  calibrate,
  validate,
  results,
  camera,
  lab,
  components,
  welcome,
  meters,
  screen,
  distance,
  drift,
  live,
  data,
  about,
};

/** Merges string modules into one table; a key defined in two modules is an error. */
export function mergeStrings(modules: Readonly<Record<string, StringTable>>): Record<string, string> {
  const merged: Record<string, string> = {};
  const owner = new Map<string, string>();
  for (const [name, table] of Object.entries(modules)) {
    for (const [key, value] of Object.entries(table)) {
      const first = owner.get(key);
      if (first !== undefined) throw new Error(`String key "${key}" is defined in strings/${first}.ts and strings/${name}.ts`);
      owner.set(key, name);
      merged[key] = value;
    }
  }
  return merged;
}

export const STRINGS: Readonly<Record<string, string>> = mergeStrings(STRING_MODULES);

/** Looks up a string and fills `{name}` placeholders. A missing key is returned as is, so it shows up in review. */
export function t(key: string, vars?: Readonly<Record<string, string | number>>): string {
  const template = Object.hasOwn(STRINGS, key) ? STRINGS[key] : undefined;
  if (template === undefined) return key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
