// Details → Settings (design §2.17, §2.11; spec §17.2.1, §17.4.6, §17.5.5, §17.6.5, §17.8.1):
// warm-up length, engines (Auto or chosen, with their download sizes), glasses, sound, read
// instructions aloud (local voices only), Limited head movement, theme, camera (with two or more
// cameras) and Expert mode. Each change is stored in `prefs` (§17.10.3) and applied at once
// where it can be: the theme repaints, the warm-up length and engines apply from the next
// warm-up, and a camera change from the camera's next start (the screen beneath keeps its camera).
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId, Preset } from '../../core/types.ts';
import { ENGINE_SPECS } from '../../engines/specs.ts';
import type { EngineSpec } from '../../engines/types.ts';
import { listCameras, type CameraDevice } from '../../platform/camera.ts';
import { activeCapture, setPreferredCamera } from '../session.ts';
import { registerDetailsTab, type DetailsPage, type PageContext } from '../shell/detailsSheet.ts';
import { getState, setPrefs, type Glasses, type Theme } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { checkRow, choiceRow, note, para, sheetPage, switchRow } from './page.ts';

export function megabytes(bytes: number): string {
  return bytes >= 100_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : bytes > 0 ? `${Math.round(bytes / 1000)} kB` : t('details.settings.noDownload');
}

/** Every engine's spec, from the static table (§16.2.4): no engine code is downloaded to show it. */
export async function engineSpecs(): Promise<Partial<Record<EngineId, EngineSpec>>> {
  return { ...ENGINE_SPECS };
}

/** The engines a choice keeps: the geometric engine always runs, because the shared frame checks come from it (§4.6.1). */
export function chosenEngines(chosen: Iterable<EngineId>): EngineId[] {
  const set = new Set(chosen);
  return ENGINE_IDS.filter((id) => set.has(id) || id === 'geometric');
}

/**
 * Voices that may read the instructions: only voices on this device (`localService`), so that no
 * text is sent to a speech service (§17.5.5), and only English ones.
 */
export function localVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  try {
    return speechSynthesis.getVoices().filter((v) => v.localService && v.lang.toLowerCase().startsWith('en'));
  } catch {
    return [];
  }
}

const PRESETS: readonly Preset[] = ['quick', 'standard', 'thorough'];
const GLASSES: readonly Glasses[] = ['none', 'glasses', 'contacts', 'undisclosed'];

let cameras: CameraDevice[] = [];
let listing: Promise<void> | null = null;
let refreshTab: (() => void) | null = null;

/** Lists the cameras once per opening of the tab; a change of their number rebuilds the tab. */
function updateCameras(): void {
  listing ??= listCameras()
    .then((found) => {
      const changed = found.length !== cameras.length || found.some((c, i) => c.deviceId !== cameras[i]?.deviceId);
      cameras = found;
      if (changed) refreshTab?.();
    })
    .catch(() => undefined)
    .finally(() => {
      listing = null;
    });
}

if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => refreshTab?.());

function warmupPage(): DetailsPage {
  return {
    id: 'warmup',
    build: (ctx: PageContext) => {
      refreshTab = ctx.refresh;
      const current = getState().settings.preset;
      return sheetPage(
        t('details.settings.warmup.title'),
        {},
        choiceRow({
          name: 'warmup',
          legend: t('details.settings.warmup.title'),
          options: PRESETS.map((p) => ({ value: p, label: t(`details.settings.warmup.${p}`) })),
          value: current,
          onChange: (value) => {
            void setPrefs({ warmup: value });
            ctx.refresh();
          },
        }),
        para(t(`details.settings.warmup.${current}.detail`)),
        note(t('details.settings.warmup.note')),
      );
    },
  };
}

function enginesPage(): DetailsPage {
  return {
    id: 'engines',
    build: (ctx: PageContext) => {
      const engines = getState().settings.engines;
      const auto = engines === 'auto';
      const chosen = new Set<EngineId>(auto ? ENGINE_IDS : engines);
      return sheetPage(
        t('details.settings.engines.title'),
        {},
        choiceRow({
          name: 'engine-mode',
          legend: t('details.settings.engines.title'),
          options: [
            { value: 'auto', label: t('details.settings.engines.auto') },
            { value: 'choose', label: t('details.settings.engines.choose') },
          ],
          value: auto ? 'auto' : 'choose',
          onChange: (value) => {
            void setPrefs({ engines: value === 'auto' ? 'auto' : chosenEngines(chosen) });
            ctx.refresh();
          },
        }),
        note(t(auto ? 'details.settings.engines.autoNote' : 'details.settings.engines.chooseNote')),
        ...ENGINE_IDS.map((id) => {
          const spec = ENGINE_SPECS[id];
          return checkRow({
            id: `engine-${id}`,
            label: spec.displayName,
            detail: id === 'geometric' ? t('details.settings.engines.always') : t('details.settings.engines.size', { size: megabytes(spec.downloadBytes) }),
            checked: chosen.has(id),
            disabled: auto || id === 'geometric',
            onChange: (on) => {
              if (on) chosen.add(id);
              else chosen.delete(id);
              void setPrefs({ engines: chosenEngines(chosen) });
            },
          });
        }),
        note(t('details.settings.engines.next')),
      );
    },
  };
}

function glassesPage(): DetailsPage {
  return {
    id: 'glasses',
    build: () =>
      sheetPage(
        t('details.settings.glasses.title'),
        {},
        choiceRow({
          name: 'glasses',
          legend: t('details.settings.glasses.title'),
          grid: true,
          options: GLASSES.map((g) => ({ value: g, label: t(`details.settings.glasses.${g}`) })),
          value: getState().prefs.glasses,
          onChange: (value) => void setPrefs({ glasses: value }),
        }),
        note(t('details.settings.glasses.note')),
      ),
  };
}

function playPage(): DetailsPage {
  return {
    id: 'play',
    build: () => {
      const prefs = getState().prefs;
      const voices = localVoices().length > 0;
      return sheetPage(
        t('details.settings.play.title'),
        {},
        switchRow({ id: 'pref-sound', label: t('details.settings.sound'), detail: t('details.settings.sound.detail'), checked: prefs.sound, onChange: (on) => void setPrefs({ sound: on }) }),
        switchRow({
          id: 'pref-speech',
          label: t('details.settings.speech'),
          detail: t(voices ? 'details.settings.speech.detail' : 'details.settings.speech.unavailable'),
          checked: voices && prefs.speech,
          disabled: !voices,
          onChange: (on) => void setPrefs({ speech: on }),
        }),
        switchRow({ id: 'pref-limited', label: t('details.settings.limited'), detail: t('details.settings.limited.detail'), checked: prefs.limitedHead, onChange: (on) => void setPrefs({ limitedHead: on }) }),
      );
    },
  };
}

function lookPage(): DetailsPage {
  return {
    id: 'look',
    build: () => {
      const prefs = getState().prefs;
      const theme: Theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      return sheetPage(
        t('details.settings.look.title'),
        {},
        choiceRow({
          name: 'theme',
          legend: t('details.settings.theme'),
          options: [
            { value: 'dark', label: t('details.settings.theme.dark') },
            { value: 'light', label: t('details.settings.theme.light') },
          ],
          value: theme,
          onChange: (value) => void setPrefs({ theme: value }),
        }),
        note(t('details.settings.theme.note')),
        switchRow({ id: 'pref-expert', label: t('details.settings.expert'), detail: t('details.settings.expert.detail'), checked: prefs.expert, onChange: (on) => void setPrefs({ expert: on }) }),
      );
    },
  };
}

function cameraPage(): DetailsPage {
  return {
    id: 'camera',
    build: (ctx: PageContext) => {
      const running = activeCapture()?.camera.info;
      const stored = getState().prefs.camera;
      const current = cameras.find((c) => c.deviceId === stored?.deviceId) ?? cameras.find((c) => running && c.label === running.label) ?? null;
      return sheetPage(
        t('details.settings.camera.title'),
        {},
        choiceRow({
          name: 'camera',
          legend: t('details.settings.camera.title'),
          grid: true,
          options: cameras.map((c) => ({ value: c.deviceId, label: c.label })),
          value: current?.deviceId ?? null,
          onChange: (value) => {
            const camera = cameras.find((c) => c.deviceId === value);
            if (!camera) return;
            void setPrefs({ camera: { deviceId: camera.deviceId, label: camera.label } });
            setPreferredCamera(camera.deviceId, { stopRunning: false });
            ctx.refresh();
          },
        }),
        note(t('details.settings.camera.note')),
      );
    },
  };
}

function pages(): DetailsPage[] {
  updateCameras();
  const list = [warmupPage(), enginesPage(), glassesPage(), playPage(), lookPage()];
  if (cameras.length >= 2) list.push(cameraPage());
  return list;
}

registerDetailsTab('settings', pages);
