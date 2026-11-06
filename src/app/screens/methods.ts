// Methods, the long read (#/methods; spec §17.2): a document page, the one game route that may
// scroll, because it is a document. It holds the long read of spec §7 row 9: the
// method, screen and distance with the degree formulae, the metrics and their formulae, the
// protocol and how the game presents it, filtering and events, drift, the engines with their
// licences and citations (read from each engine's own spec), the limitations, privacy and the
// references, consistent with docs/methods.md. Every number is a design value, a formula, or
// carries its source; heuristic thresholds say so. No accuracy figure for this app is given.
import './pages.css';
import { ENGINE_IDS } from '../../core/types.ts';
import { ENGINE_SPECS } from '../../engines/specs.ts';
import { megabytes } from '../details/settings.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { detailsReturnHash } from '../shell/detailsSheet.ts';
import { icon } from '../shell/icons.ts';
import { brand } from '../shell/topBar.ts';
import { t } from '../strings.en-GB.ts';

/** Paragraph keys `<prefix>.<n>` from 1 up to the first missing one. */
function paragraphs(prefix: string): HTMLParagraphElement[] {
  const out: HTMLParagraphElement[] = [];
  for (let n = 1; ; n++) {
    const key = `${prefix}.${n}`;
    const text = t(key);
    if (text === key) break;
    out.push(h('p', null, text));
  }
  return out;
}

function formula(key: string): HTMLPreElement {
  return h('pre', { class: 'formula' }, t(key));
}

/** A reference with its link, when it has one. */
function reference(n: number): HTMLLIElement | null {
  const key = `about.ref.${n}`;
  const text = t(key);
  if (text === key) return null;
  const url = t(`${key}.url`);
  return h('li', null, text, url === `${key}.url` ? null : h('span', null, ' ', h('a', { href: url, rel: 'noopener noreferrer' }, url)));
}

const METRICS = ['accuracy', 'precision', 'bcea', 'loss', 'rate', 'baseline', 'verdict', 'aoi'] as const;

function section(titleKey: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', null, h('h2', null, t(titleKey)), ...children);
}

function engines(): HTMLElement[] {
  return ENGINE_IDS.map((id) => {
    const s = ENGINE_SPECS[id];
    return h(
      'div',
      { class: 'engine', 'data-engine': id },
      h('h3', null, s.displayName),
      h(
        'dl',
        null,
        h('dt', null, t('about.engine.role')),
        h('dd', null, t(`about.engine.${id}.role`)),
        h('dt', null, t('about.engine.licence')),
        h('dd', null, s.licence.weights ? t('about.engine.licenceWeights', { code: s.licence.code, weights: s.licence.weights }) : t('about.engine.licenceCode', { code: s.licence.code })),
        h('dt', null, t('about.engine.citation')),
        h('dd', null, s.citation),
        h('dt', null, t('about.engine.source')),
        h('dd', null, h('a', { href: s.sourceUrl, rel: 'noopener noreferrer' }, s.sourceUrl)),
        h('dt', null, t('about.engine.version')),
        h('dd', null, t('about.engine.versionText', { version: s.version, feature: s.featureVersion, size: megabytes(s.downloadBytes) })),
        h('dt', null, t('about.engine.evidence')),
        h('dd', null, t(`about.engine.${id}.evidence`)),
      ),
    );
  });
}

/** The long read's sections. */
export function methodsSections(): HTMLElement[] {
  const refs: HTMLLIElement[] = [];
  for (let n = 1; n < 100; n++) {
    const r = reference(n);
    if (!r) break;
    refs.push(r);
  }
  return [
    section('about.methods.title', ...paragraphs('about.methods')),
    section('methods.game.title', ...paragraphs('methods.game')),
    section('about.geometry.title', ...paragraphs('about.geometry'), formula('about.geometry.formula')),
    section(
      'about.metrics.title',
      h('p', null, t('about.metrics.intro')),
      h('dl', null, ...METRICS.flatMap((m) => [h('dt', null, t(`about.metric.${m}`)), h('dd', null, t(`about.metric.${m}.text`))])),
      formula('about.metrics.formula'),
    ),
    section('about.protocol.title', ...paragraphs('about.protocol')),
    section('about.filter.title', ...paragraphs('about.filter')),
    section('about.drift.title', ...paragraphs('about.drift')),
    section('about.engines.title', h('p', null, t('about.engines.intro')), ...engines(), ...paragraphs('about.frontend')),
    section('about.limits.title', h('ul', null, ...paragraphs('about.limits').map((p) => h('li', null, p.textContent ?? '')))),
    section('about.privacy.title', ...paragraphs('about.privacy')),
    section('about.refs.title', h('ol', { class: 'refs' }, ...refs)),
  ];
}

const screen: Screen = {
  mount(root) {
    const back = detailsReturnHash('about');
    const backLink = (cls: string) => h('a', { class: `btn ${cls}`, href: back }, icon('back'), h('span', null, t('methods.back')));
    root.append(
      h(
        'div',
        { class: 'doc' },
        h('header', { class: 'doc__head' }, brand(), backLink('btn--ghost doc__back')),
        h('main', { class: 'doc__main methods' }, h('h1', { class: 'doc__title' }, t('methods.title')), h('p', { class: 'doc__lead' }, t('methods.lead')), ...methodsSections()),
        h('nav', { class: 'doc__actions', 'aria-label': t('methods.nav') }, backLink('btn--secondary')),
      ),
    );
  },
};

export default screen;
