// Details → About (design §2.17, §3.2; spec §17.2.1, Appendix B): what the game does in three
// sentences, privacy, the expectation line with its sources, the advised distances, the engines
// and the face landmarker with their licences and citations (read from each engine's own spec,
// so the page and the engines cannot disagree), and the link to Methods, the long read. No
// accuracy figure for this app is given.
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId } from '../../core/types.ts';
import { ENGINE_SPECS } from '../../engines/specs.ts';
import { h } from '../dom.ts';
import { registerDetailsTab, rememberDetailsReturn, type DetailsPage } from '../shell/detailsSheet.ts';
import { t } from '../strings.en-GB.ts';
import { actionRow, linkButton, note, para, reading, sheetPage } from './page.ts';
import { megabytes } from './settings.ts';

function aboutPage(): DetailsPage {
  return {
    id: 'about',
    build: () => sheetPage(t('details.about.title'), {}, para(t('details.about.1')), para(t('details.about.2')), para(t('details.about.3'))),
  };
}

function privacyPage(): DetailsPage {
  return {
    id: 'privacy',
    build: () => sheetPage(t('details.about.privacy.title'), {}, para(h('strong', null, t('details.about.privacy.line'))), para(t('details.about.privacy.stored')), note(t('details.about.privacy.export'))),
  };
}

function expectPage(): DetailsPage {
  return {
    id: 'expect',
    build: () => sheetPage(t('details.about.expect.title'), {}, para(t('details.about.expect.line')), para(t('details.about.expect.own')), note(t('details.about.expect.sources'))),
  };
}

function advisedPage(): DetailsPage {
  return {
    id: 'advised',
    build: () =>
      sheetPage(
        t('details.about.advised.title'),
        {},
        reading(t('details.advised.portrait'), t('details.advised.portrait.value')),
        reading(t('details.advised.landscape'), t('details.advised.landscape.value')),
        reading(t('details.advised.webcam'), t('details.advised.webcam.value')),
        note(t('details.advised.note')),
      ),
  };
}

function enginePage(id: EngineId): DetailsPage {
  return {
    id: `engine-${id}`,
    build: () => {
      const s = ENGINE_SPECS[id];
      const licence = s.licence.weights ? t('about.engine.licenceWeights', { code: s.licence.code, weights: s.licence.weights }) : t('about.engine.licenceCode', { code: s.licence.code });
      return sheetPage(
        s.displayName,
        {},
        para(t(`about.engine.${id}.role`)),
        // Plain paragraphs, so that a long citation can continue on the next page.
        note(t('details.about.engine.licence', { licence })),
        note(t('details.about.engine.version', { version: t('about.engine.versionText', { version: s.version, feature: s.featureVersion, size: megabytes(s.downloadBytes) }) })),
        note(t('details.about.engine.citation', { citation: s.citation })),
        reading(t('about.engine.source'), h('a', { href: s.sourceUrl, rel: 'noopener noreferrer', class: 'link' }, s.sourceUrl), { cls: 'kv--text kv--stack' }),
        note(t('details.about.engine.evidence', { evidence: t(`about.engine.${id}.evidence`) })),
      );
    },
  };
}

function frontendPage(): DetailsPage {
  return {
    id: 'frontend',
    build: () => sheetPage(t('details.about.frontend.title'), {}, para(t('about.frontend.1')), note(t('about.engines.intro'))),
  };
}

function methodsPage(): DetailsPage {
  return {
    id: 'methods',
    build: () =>
      sheetPage(
        t('details.about.methods.title'),
        {},
        para(t('details.about.methods.body')),
        actionRow(
          linkButton(t('details.about.methods.open'), {
            onClick: () => {
              rememberDetailsReturn();
              location.hash = '#/methods';
            },
          }),
        ),
      ),
  };
}

registerDetailsTab('about', () => [aboutPage(), privacyPage(), expectPage(), advisedPage(), ...ENGINE_IDS.map(enginePage), frontendPage(), methodsPage()]);
