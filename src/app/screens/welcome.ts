// #/ Welcome (specification §7 screen 0, §14): what the app does, privacy, realistic expectations
// with their sources, the capability check, the preset, the engines (Auto, or Advanced with
// checkboxes and download sizes), the participant and session fields, and, under Advanced, the
// optional screen and distance measurement. The default flow goes on to the camera (§14.1.1).
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId, Preset } from '../../core/types.ts';
import { ENGINE_SPECS } from '../../engines/specs.ts';
import type { EngineSpec } from '../../engines/types.ts';
import { detectCapabilities, detectDeviceClass, type CapabilityReport } from '../../platform/capabilities.ts';
import { listProfiles } from '../../platform/storage.ts';
import { BANNER_CSS, banner } from '../components/banner.ts';
import { h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { getState, setState, type Settings } from '../state.ts';
import { t } from '../strings.en-GB.ts';

export const SETUP_CSS = `
.setup section { margin-top: var(--space-4); }
.setup fieldset { border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-3); margin: var(--space-3) 0; max-width: var(--measure); }
.setup legend { font-weight: 600; padding: 0 var(--space-1); }
.setup .choice { display: flex; gap: var(--space-2); align-items: flex-start; min-height: 44px; padding: var(--space-1) 0; }
.setup .choice input { width: 1.4rem; height: 1.4rem; margin-top: 0.15rem; flex: none; }
.setup .choice small { display: block; color: var(--muted); }
.setup .field { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); margin: var(--space-2) 0; max-width: 24rem; }
.setup .field input, .setup .field select { width: 100%; min-width: 0; text-overflow: ellipsis; font: inherit; min-height: 44px; padding: var(--space-1) var(--space-2); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--fg); }
.setup .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin-top: var(--space-4); }
.setup .actions button, .setup .actions .button { min-height: 44px; }
.setup a.button { display: inline-flex; align-items: center; text-decoration: none; }
.setup a.button.secondary { background: transparent; color: var(--fg); border-color: var(--border); }
.setup details { margin: var(--space-3) 0; max-width: var(--measure); }
.setup summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; font-weight: 600; }
.capabilities { list-style: none; padding: 0; display: grid; gap: var(--space-1); max-width: var(--measure); }
.capabilities li { display: grid; grid-template-columns: 4.5rem 1fr; gap: var(--space-2); }
.capabilities .cap-state { font-weight: 600; }
.capabilities .cap-state.yes { color: var(--ok); }
.capabilities .cap-state.no { color: var(--danger); }
.sources { font-size: 0.9rem; color: var(--muted); }
.setup .table-wrap { overflow-x: auto; max-width: var(--measure); }
.setup .simple-table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
.setup .simple-table th, .setup .simple-table td { text-align: left; padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--border); }
`;

const CAPABILITIES: readonly (keyof CapabilityReport)[] = ['secureContext', 'getUserMedia', 'videoFrameCallback', 'wasmSimd', 'webgl2', 'offscreenCanvas', 'moduleWorker', 'fullscreen'];
/** Without these the camera cannot be used at all. */
const REQUIRED: ReadonlySet<keyof CapabilityReport> = new Set(['secureContext', 'getUserMedia']);
const PRESETS: readonly Preset[] = ['quick', 'standard', 'thorough'];

export function megabytes(bytes: number): string {
  return bytes >= 100_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : bytes > 0 ? `${Math.round(bytes / 1000)} kB` : t('welcome.engines.noDownload');
}

/** Every engine's spec, from the static table (§16.2.4): no engine code is downloaded to show it. */
export async function engineSpecs(): Promise<Partial<Record<EngineId, EngineSpec>>> {
  return { ...ENGINE_SPECS };
}

function updateSettings(patch: Partial<Settings>): void {
  setState({ settings: { ...getState().settings, ...patch } });
}

function capabilityList(report: CapabilityReport): HTMLUListElement {
  return h(
    'ul',
    { class: 'capabilities' },
    ...CAPABILITIES.map((k) =>
      h(
        'li',
        null,
        h('span', { class: `cap-state ${report[k] ? 'yes' : 'no'}` }, t(report[k] ? 'welcome.cap.yes' : 'welcome.cap.no')),
        h('span', null, t(`welcome.cap.${k}`), report[k] ? null : h('small', { class: 'note' }, ' ', t(`welcome.cap.${k}.missing`))),
      ),
    ),
  );
}

function presetChoice(current: Preset): HTMLFieldSetElement {
  return h(
    'fieldset',
    null,
    h('legend', null, t('welcome.preset.legend')),
    ...PRESETS.map((p) => {
      const input = h('input', { type: 'radio', name: 'preset', value: p, onchange: () => updateSettings({ preset: p }) });
      input.checked = p === current;
      return h('label', { class: 'choice' }, input, h('span', null, t(`welcome.preset.${p}`), h('small', null, t(`welcome.preset.${p}.detail`))));
    }),
  );
}

function engineChoice(settings: Settings): HTMLElement {
  const auto = h('input', { type: 'radio', name: 'engine-mode', value: 'auto' });
  const manual = h('input', { type: 'radio', name: 'engine-mode', value: 'manual' });
  const chosen = new Set<EngineId>(settings.engines === 'auto' ? ENGINE_IDS : settings.engines);
  chosen.add('geometric');
  auto.checked = settings.engines === 'auto';
  manual.checked = !auto.checked;
  const boxes = new Map<EngineId, HTMLInputElement>();
  const list = h('div', { class: 'engine-boxes' });
  const status = h('p', { class: 'note', role: 'status' }, t('welcome.engines.loading'));
  const summary = h('p', null, t(settings.engines === 'auto' ? 'welcome.engines.autoNow' : 'welcome.engines.manualNow'));
  const apply = (): void => {
    if (auto.checked) updateSettings({ engines: 'auto' });
    else updateSettings({ engines: ENGINE_IDS.filter((e) => chosen.has(e)) });
    summary.textContent = t(auto.checked ? 'welcome.engines.autoNow' : 'welcome.engines.manualNow');
  };
  for (const id of ENGINE_IDS) {
    const box = h('input', {
      type: 'checkbox',
      value: id,
      onchange: () => {
        if (box.checked) chosen.add(id);
        else chosen.delete(id);
        manual.checked = true;
        apply();
      },
    });
    box.checked = chosen.has(id);
    // The geometric engine always runs: the shared frame checks come from it (§4.6.1).
    if (id === 'geometric') box.disabled = true;
    boxes.set(id, box);
  }
  auto.addEventListener('change', apply);
  manual.addEventListener('change', apply);

  let loaded = false;
  const details = h(
    'details',
    {
      ontoggle: () => {
        if (!details.open || loaded) return;
        loaded = true;
        void engineSpecs().then((specs) => {
          list.replaceChildren(
            ...ENGINE_IDS.map((id) => {
              const spec = specs[id];
              const box = boxes.get(id) as HTMLInputElement;
              const name = spec?.displayName ?? id;
              const detail = spec
                ? t('welcome.engines.detail', { size: megabytes(spec.downloadBytes), licence: spec.licence.code })
                : t('welcome.engines.unavailable');
              return h('label', { class: 'choice' }, box, h('span', null, name, h('small', null, detail, id === 'geometric' ? ` · ${t('welcome.engines.always')}` : '')));
            }),
          );
          status.textContent = '';
        });
      },
    },
    h('summary', null, t('welcome.advanced')),
    h(
      'fieldset',
      null,
      h('legend', null, t('welcome.engines.legend')),
      h('label', { class: 'choice' }, auto, h('span', null, t('welcome.engines.auto'), h('small', null, t('welcome.engines.autoDetail')))),
      h('label', { class: 'choice' }, manual, h('span', null, t('welcome.engines.manual'), h('small', null, t('welcome.engines.manualDetail')))),
      list,
      status,
    ),
    h(
      'section',
      null,
      h('h3', null, t('welcome.geometry.title')),
      h('p', null, t('welcome.geometry.body')),
      h('p', null, h('a', { href: '#/screen?from=welcome', class: 'button secondary' }, t('results.approx.measure'))),
    ),
  );
  return h('section', null, h('h2', null, t('welcome.engines.title')), summary, details);
}

function identityFields(settings: Settings): HTMLFieldSetElement {
  const field = (key: 'pid' | 'session', value: string) => {
    const id = `welcome-${key}`;
    const input = h('input', {
      id,
      type: 'text',
      maxlength: 64,
      autocomplete: 'off',
      spellcheck: 'false',
      value,
      oninput: () => updateSettings({ [key]: input.value.trim().slice(0, 64) } as Partial<Settings>),
    });
    return h('div', { class: 'field' }, h('label', { for: id }, t(`welcome.${key}`)), input);
  };
  return h('fieldset', null, h('legend', null, t('welcome.identity.legend')), h('p', { class: 'note' }, t('welcome.identity.note')), field('pid', settings.pid), field('session', settings.session));
}

const screen: Screen = {
  mount(root: HTMLElement, ctx: ScreenContext) {
    const { settings } = getState();
    const caps = detectCapabilities();
    const mobile = detectDeviceClass().mobile;
    const blocked = [...REQUIRED].some((k) => !caps[k]);
    const start = h('button', { type: 'button', disabled: blocked, onclick: () => ctx.navigate('camera') }, t('welcome.start'));
    const stored = h('div');
    root.append(
      h('style', null, SETUP_CSS + BANNER_CSS),
      h(
        'div',
        { class: 'setup' },
        h('h1', null, t('welcome.title')),
        h('p', { class: 'lead' }, t('welcome.lead')),
        h('p', null, t('welcome.how')),
        h('section', null, h('h2', null, t('welcome.privacy.title')), h('p', null, h('strong', null, t('app.privacy'))), h('p', null, t('welcome.privacy.body'))),
        h(
          'section',
          null,
          h('h2', null, t('welcome.expect.title')),
          h('ul', null, h('li', null, t('welcome.expect.accuracy')), h('li', null, t('welcome.expect.rate')), h('li', null, t('welcome.expect.aoi')), h('li', null, t('welcome.expect.own'))),
          h('p', { class: 'sources' }, t('welcome.expect.sources'), ' ', h('a', { href: '#/about' }, t('welcome.expect.more'))),
        ),
        mobile ? h('section', null, h('h2', null, t('welcome.mobile.title')), h('p', null, t('calibrate.steps.mobile'))) : null,
        h(
          'section',
          null,
          h('h2', null, t('welcome.cap.title')),
          blocked ? banner('error', t('welcome.cap.blocked')) : null,
          capabilityList(caps),
        ),
        h('section', null, h('h2', null, t('welcome.preset.title')), presetChoice(settings.preset)),
        engineChoice(settings),
        h('section', null, h('h2', null, t('welcome.identity.title')), identityFields(settings)),
        stored,
        h('div', { class: 'actions' }, start),
      ),
    );
    let mounted = true;
    void listProfiles()
      .then((profiles) => {
        if (mounted && profiles.length > 0) stored.append(banner('info', [t('welcome.stored', { n: profiles.length }), ' ', h('a', { href: '#/data' }, t('nav.data'))]));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  },
};

export default screen;
