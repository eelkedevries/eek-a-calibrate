// #/about (specification §7 screen 9): methods and metric formulae, the protocol, the engines with
// their licences and citations (read from each engine's own spec, so the page and the engines
// cannot disagree), limitations and privacy. Every number here is a design value of this app, a
// formula, or carries its source; heuristic thresholds say so. No accuracy figure for this app is
// given: the manual checks with a real camera come first.
import { ENGINE_IDS } from '../../core/types.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { t } from '../strings.en-GB.ts';
import { engineSpecs, megabytes, SETUP_CSS } from './welcome.ts';

const ABOUT_CSS = `
.about section { margin-top: var(--space-4); }
.about dl { display: grid; grid-template-columns: minmax(8rem, max-content) 1fr; gap: var(--space-1) var(--space-3); max-width: var(--measure); }
.about dt { font-weight: 600; }
.about dd { margin: 0; }
.about .formula { font-family: var(--font-mono); font-size: 0.9rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); overflow-x: auto; max-width: var(--measure); white-space: pre; }
.about .engine { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); margin: var(--space-2) 0; max-width: var(--measure); }
.about .engine h3 { margin: 0 0 var(--space-1); }
.about .refs li { margin-bottom: var(--space-1); overflow-wrap: anywhere; }
@media (max-width: 30rem) { .about dl { grid-template-columns: 1fr; } }
`;

/** Paragraph keys `about.<section>.<n>` from 1 up to the first missing one. */
function paragraphs(section: string): HTMLParagraphElement[] {
  const out: HTMLParagraphElement[] = [];
  for (let n = 1; ; n++) {
    const key = `about.${section}.${n}`;
    const text = t(key);
    if (text === key) break;
    out.push(h('p', null, text));
  }
  return out;
}

function formula(key: string): HTMLPreElement {
  return h('pre', { class: 'formula' }, t(key));
}

/** A reference with its link, when it has one on an allowed host (doi.org, arxiv.org, …). */
function reference(n: number): HTMLLIElement | null {
  const key = `about.ref.${n}`;
  const text = t(key);
  if (text === key) return null;
  const url = t(`${key}.url`);
  return h('li', null, text, url === `${key}.url` ? null : h('span', null, ' ', h('a', { href: url, rel: 'noopener noreferrer' }, url)));
}

const METRICS = ['accuracy', 'precision', 'bcea', 'loss', 'rate', 'baseline', 'verdict', 'aoi'] as const;

const screen: Screen = {
  mount(root) {
    const engines = h('div', null, h('p', { role: 'status' }, t('about.engines.loading')));
    const refs: HTMLLIElement[] = [];
    for (let n = 1; n < 100; n++) {
      const r = reference(n);
      if (!r) break;
      refs.push(r);
    }
    root.append(
      h('style', null, SETUP_CSS + ABOUT_CSS),
      h(
        'div',
        { class: 'setup about' },
        h('h1', null, t('route.about')),
        h('p', { class: 'lead' }, t('about.lead')),
        h('section', null, h('h2', null, t('about.methods.title')), ...paragraphs('methods')),
        h(
          'section',
          null,
          h('h2', null, t('about.geometry.title')),
          ...paragraphs('geometry'),
          formula('about.geometry.formula'),
        ),
        h(
          'section',
          null,
          h('h2', null, t('about.metrics.title')),
          h('p', null, t('about.metrics.intro')),
          h('dl', null, ...METRICS.flatMap((m) => [h('dt', null, t(`about.metric.${m}`)), h('dd', null, t(`about.metric.${m}.text`))])),
          formula('about.metrics.formula'),
        ),
        h('section', null, h('h2', null, t('about.protocol.title')), ...paragraphs('protocol')),
        h('section', null, h('h2', null, t('about.filter.title')), ...paragraphs('filter')),
        h('section', null, h('h2', null, t('about.drift.title')), ...paragraphs('drift')),
        h('section', null, h('h2', null, t('about.engines.title')), h('p', null, t('about.engines.intro')), engines, ...paragraphs('frontend')),
        h('section', null, h('h2', null, t('about.limits.title')), h('ul', null, ...paragraphs('limits').map((p) => h('li', null, p.textContent ?? '')))),
        h(
          'section',
          null,
          h('h2', null, t('about.privacy.title')),
          ...paragraphs('privacy'),
          h('p', null, h('a', { href: '#/data' }, t('nav.data')), ' · ', h('a', { href: '#/lab' }, t('nav.lab'))),
        ),
        h('section', null, h('h2', null, t('about.refs.title')), h('ol', { class: 'refs' }, ...refs)),
      ),
    );
    let mounted = true;
    void engineSpecs().then((specs) => {
      if (!mounted) return;
      engines.replaceChildren(
        ...ENGINE_IDS.map((id) => {
          const s = specs[id];
          if (!s) return h('div', { class: 'engine' }, h('h3', null, id), h('p', null, t('welcome.engines.unavailable')));
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
        }),
      );
    });
    return () => {
      mounted = false;
    };
  },
};

export default screen;
