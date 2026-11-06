// Contrast of the interface's colour roles (spec §17.12, prompt 018; WCAG 2.2 1.4.3 and 1.4.11),
// computed from the token values in src/app/style.css: every text role on the surfaces it is set
// on is at least 4.5 : 1, and every UI role (control edges, focus rings, state badges, the ink
// drawn on the grey stage) at least 3 : 1, in the dark identity and the light theme. A token with
// alpha is composited over the surface beneath it. The grey stage is never themed. Marks on the
// grey below 3 : 1 are listed with the stronger cue that carries the same information, so that a
// change to one of them is noticed here; design §10 keeps their check on real screens open.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type Rgb = [number, number, number];

const css = readFileSync(new URL('../../src/app/style.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector}{`);
  assert.ok(start >= 0, `${selector} in style.css`);
  const body = css.slice(start + selector.length + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const DARK = block(':root');
const LIGHT = { ...DARK, ...block(':root[data-theme="light"]') };

function resolve(theme: Record<string, string>, name: string): string {
  const v = theme[name];
  assert.ok(v !== undefined, `${name} is defined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? resolve(theme, ref[1]!) : v;
}

function parse(value: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return { rgb: [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb, alpha: 1 };
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(value);
  assert.ok(rgb, `a colour: ${value}`);
  return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha: rgb[4] === undefined ? 1 : Number(rgb[4]) };
}

/** The token as an opaque colour over `under` (alpha composited in sRGB, as browsers paint it). */
function colour(theme: Record<string, string>, name: string, under?: Rgb): Rgb {
  const { rgb, alpha } = parse(resolve(theme, name));
  if (alpha >= 1) return rgb;
  assert.ok(under, `${name} has alpha and needs a surface`);
  return rgb.map((c, i) => Math.round(c * alpha + under![i]! * (1 - alpha))) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = { dark: DARK, light: LIGHT } as const;
const SURFACES = ['--color-background', '--color-surface'] as const;
const TEXT = 4.5;
const UI = 3;

test('text roles reach 4.5 : 1 on the background and on surfaces, in both themes', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const surface of SURFACES) {
      const bg = colour(theme, surface);
      for (const fg of ['--color-text', '--color-muted-text', '--color-link', '--color-error', '--color-success', '--color-warning', '--color-info']) {
        const r = contrast(colour(theme, fg, bg), bg);
        assert.ok(r >= TEXT, `${name}: ${fg} on ${surface} is ${r.toFixed(2)} : 1`);
      }
    }
    const accent = colour(theme, '--color-accent');
    assert.ok(contrast(colour(theme, '--color-accent-ink'), accent) >= TEXT, `${name}: the primary button's label`);
  }
});

test('the faint role is for UI only: no rule sets text in it, and it reaches 3 : 1 as a control edge and an empty star', () => {
  for (const file of ['src/app/style.css', 'src/app/details.css', 'src/app/screens/game.css', 'src/app/screens/play.css', 'src/app/screens/pages.css']) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.equal(/(?<![\w-])color:\s*var\(--color-faint\)/.test(text), false, `${file} sets text in --color-faint`);
  }
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const surface of SURFACES) {
      const bg = colour(theme, surface);
      for (const ui of ['--control-boundary', '--star-off', '--color-focus']) {
        const r = contrast(colour(theme, ui, bg), bg);
        assert.ok(r >= UI, `${name}: ${ui} on ${surface} is ${r.toFixed(2)} : 1`);
      }
    }
  }
});

test('on the grey stage: the chips carry 4.5 : 1 text, and the ink, focus ring, arcs and decoy reach 3 : 1', () => {
  const grey = colour(DARK, '--stage');
  assert.deepEqual(grey, [128, 128, 128]);
  const chip = colour(DARK, '--stage-chip', grey);
  for (const fg of ['--stage-chip-text', '--stage-chip-muted']) {
    const r = contrast(colour(DARK, fg), chip);
    assert.ok(r >= TEXT, `${fg} on a chip over the grey is ${r.toFixed(2)} : 1`);
  }
  for (const ui of ['--state-good', '--state-adjust', '--state-lost', '--stage-focus', '--gaze']) {
    const r = contrast(colour(DARK, ui), chip);
    assert.ok(r >= UI, `${ui} on a chip is ${r.toFixed(2)} : 1`);
  }
  // The pips done, the arcs reached, the bubble's edge and core, and the firefly's core.
  for (const ui of ['--stage-ink', '--pip-on', '--arc-on', '--bubble-edge', '--bubble-core', '--arc-off', '--decoy', '--stage-focus']) {
    const r = contrast(colour(DARK, ui, grey), grey);
    assert.ok(r >= UI, `${ui} on the grey is ${r.toFixed(2)} : 1`);
  }
  // The chip itself stands out from the grey, and the lit zone's halo edge from its fill.
  assert.ok(contrast(chip, grey) >= UI);
  const lit = colour(DARK, '--stage-lit', grey);
  assert.ok(contrast(colour(DARK, '--halo', lit), lit) >= UI, 'the lit zone has a 3 : 1 edge');
  // The stage is the same in the light theme.
  for (const name of ['--stage', '--stage-ink', '--stage-chip', '--stage-chip-text', '--stage-chip-muted', '--stage-focus']) {
    assert.equal(resolve(LIGHT, name), resolve(DARK, name), name);
  }
});

test('marks on the grey under 3 : 1 each sit beside a stronger cue for the same information', () => {
  const grey = colour(DARK, '--stage');
  const below: Record<string, { ratio: number; carriedBy: string }> = {
    // Remaining pips: the done pips in --pip-on and the progress bar's value carry the progress.
    '--pip-off': { ratio: 1.5, carriedBy: '--pip-on' },
    // Unlit zone outlines: the lit zone's fill and its --halo edge mark the zone looked at.
    '--stage-line': { ratio: 1.69, carriedBy: '--halo' },
    // The dashed ring of the bubble's full size: the bubble's edge and core are what to look at.
    '--bubble-ghost': { ratio: 1.75, carriedBy: '--bubble-edge' },
    // The lit zone's fill: its --halo edge.
    '--stage-lit': { ratio: 1.35, carriedBy: '--halo' },
    // The firefly's light disc: its core in --bubble-core.
    '--firefly-light': { ratio: 2.01, carriedBy: '--bubble-core' },
  };
  for (const [name, { ratio, carriedBy }] of Object.entries(below)) {
    const r = contrast(colour(DARK, name, grey), grey);
    assert.ok(Math.abs(r - ratio) < 0.01, `${name} on the grey is ${r.toFixed(2)} : 1 (listed as ${ratio})`);
    assert.ok(contrast(colour(DARK, carriedBy, grey), grey) >= UI, `${carriedBy} carries what ${name} shows`);
  }
});
