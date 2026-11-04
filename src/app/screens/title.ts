// The Title (design §2.4, §2.16; spec §17.4.1–§17.4.4; boards Main and desktop-title): framed,
// dark. The top bar with the mark and wordmark; "Pop with your eyes" and its pitch; the hero card
// with the emblem and the level map of the chosen warm-up length (and a slim bar while the face
// model downloads, which starts as the Title loads); the set-up chooser; Play, with "Skip
// warm-up" beside it when a calibration is stored for this screen; the meta line. Play asks for
// the camera inside its tap; a refusal shows "Camera blocked" and "Try again" in its place.
import type { Setup } from '../../core/position/thresholds.ts';
import { CameraError } from '../../platform/camera.ts';
import { listProfiles, type ProfileRecord } from '../../platform/storage.ts';
import { levelMap, heroEmblem } from '../components/levelMap.ts';
import { setupChooser } from '../components/setupChooser.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { addCleanup } from '../shell/appShell.ts';
import { contentFits, fitGuard } from '../shell/fitGuard.ts';
import { icon } from '../shell/icons.ts';
import { topBar } from '../shell/topBar.ts';
import { currentSetup, onLoad, prestartVision, setWarmupMode, startPlay } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerFixture } from '../testHooks.ts';

/** Test fixtures (§17.2.5): a stored warm-up, a refused camera and a browser that cannot play. */
let fixture: 'skip' | 'blocked' | 'unsupported' | null = null;
registerFixture('title-skip', () => void (fixture = 'skip'));
registerFixture('title-blocked', () => void (fixture = 'blocked'));
registerFixture('title-unsupported', () => void (fixture = 'unsupported'));

/** The hero drops its emblem below this inner height (design §2.4). */
const EMBLEM_MIN_PX = 160;

/** What the game needs from the browser before Play can work (design §2.16). */
function canPlay(): boolean {
  return globalThis.isSecureContext === true && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof WebAssembly === 'object';
}

/**
 * A stored calibration for this screen (spec §17.4.4): same origin and pixel ratio, made at this
 * window's size or the screen's (fullscreen) size in either orientation. Whether it also matches
 * the camera is checked once the camera is open (Get ready).
 */
export function storedForThisScreen(profiles: readonly ProfileRecord[]): boolean {
  const sizes = new Set([`${innerWidth}x${innerHeight}`, `${window.screen.width}x${window.screen.height}`, `${window.screen.height}x${window.screen.width}`]);
  return profiles.some((p) => {
    const [size, dpr] = p.parts.viewport.split('@');
    return p.parts.origin === location.origin && Number(dpr) === devicePixelRatio && sizes.has(size ?? '');
  });
}

const screen: Screen = {
  mount(root, ctx) {
    const { settings } = getState();
    const play = h('button', { type: 'button', class: 'btn btn--primary title-play' }, icon('play'), h('span', null, t('title.play')));
    const skip = h('button', { type: 'button', class: 'btn btn--secondary title-skip', hidden: true }, t('title.skip'));
    const actions = h('div', { class: 'actions title-buttons' }, skip, play);
    const meta = h(
      'p',
      { class: 'title-meta' },
      h('span', { class: 'title-meta__item' }, icon('clock', 16), h('span', null, t(`title.meta.${settings.preset}`))),
      h('span', { class: 'title-meta__item' }, icon('lock', 16), h('span', null, t('title.meta.local'))),
    );
    const chooser = setupChooser({
      value: currentSetup(),
      onChange: (setup: Setup) => setState({ settings: { ...getState().settings, setup } }),
    });
    const notice = h('div', { class: 'title-notice', role: 'alert', hidden: true });
    const bar = h('span', { class: 'hero__bar' });
    const progress = h('div', { class: 'hero__progress', role: 'progressbar', 'aria-label': t('title.progress'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', hidden: true }, bar);
    const hero = h('section', { class: 'stage hero', 'aria-label': t('title.hero') }, heroEmblem(), levelMap(settings.preset), progress);
    const side = h(
      'div',
      { class: 'side title-side' },
      h('div', { class: 'title-head' }, h('h1', { class: 'title-head__name' }, t('title.name')), h('p', { class: 'title-head__pitch' }, t('title.pitch'))),
      chooser.el,
      notice,
      h('div', { class: 'title-actions' }, actions, meta),
    );
    root.append(topBar({ variant: 'title', detailsTab: 'about' }), h('main', { class: 'app__main' }, hero, side));

    // Blocking gaps show only the message in the Play slot (design §2.16).
    const showNotice = (title: string | null, body: string, retry: boolean) => {
      notice.replaceChildren(...(title ? [h('p', { class: 'title-notice__title' }, title)] : []), h('p', { class: 'title-notice__body' }, body));
      notice.hidden = false;
      chooser.el.hidden = true;
      meta.hidden = true;
      skip.hidden = true;
      play.hidden = !retry;
      play.replaceChildren(h('span', null, t(retry ? 'title.retry' : 'title.play')));
      side.dataset.notice = '';
    };
    if (fixture === 'unsupported' || !canPlay()) {
      showNotice(null, t('title.unsupported'), false);
      play.remove();
    } else if (fixture === 'blocked') {
      showNotice(t('title.blocked.title'), t('title.blocked.body'), true);
    }

    // The face model starts downloading now; the bar shows it until the host is ready.
    addCleanup(
      onLoad((s) => {
        const face = s.assets['face-landmarker'];
        const fraction = s.hostReady ? 1 : face && face.total > 0 ? face.loaded / face.total : 0;
        progress.hidden = s.hostReady || s.hostError !== null || s.events === 0;
        bar.style.inlineSize = `${(100 * fraction).toFixed(1)}%`;
        progress.setAttribute('aria-valuenow', String(Math.round(100 * fraction)));
      }),
    );
    if (canPlay()) void prestartVision().catch(() => undefined);

    // "Skip warm-up" only when a calibration is stored for this screen; never in the first run.
    if (fixture === 'skip') skip.hidden = false;
    else if (canPlay() && fixture === null) {
      void listProfiles()
        .then((profiles) => {
          if (play.isConnected && notice.hidden) skip.hidden = !storedForThisScreen(profiles);
        })
        .catch(() => undefined);
    }

    let busy = false;
    const go = (mode: 'full' | 'restore') => {
      if (busy) return;
      busy = true;
      play.setAttribute('aria-busy', 'true');
      setWarmupMode(mode);
      // Inside the tap: the camera first, then (iOS) device motion, Web Audio and the wake lock.
      startPlay().then(
        () => {
          busy = false;
          if (play.isConnected) ctx.navigate('ready');
        },
        (error: unknown) => {
          busy = false;
          play.removeAttribute('aria-busy');
          if (!play.isConnected) return;
          const denied = error instanceof CameraError && (error.code === 'denied' || error.code === 'insecure');
          showNotice(t(denied ? 'title.blocked.title' : 'title.failed.title'), denied ? t('title.blocked.body') : error instanceof Error ? error.message : String(error), true);
          play.focus();
        },
      );
    };
    play.addEventListener('click', () => go('full'));
    skip.addEventListener('click', () => go('restore'));

    // The hero drops the emblem below 160 px of inner height, then the map's names.
    queueMicrotask(() => {
      if (!hero.isConnected) return;
      addCleanup(
        fitGuard(hero, {
          maxTier: 2,
          fits: (el) => {
            const tier = Number(el.dataset.fit);
            const style = getComputedStyle(el);
            const inner = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            return (tier > 0 || inner >= EMBLEM_MIN_PX) && contentFits(el);
          },
        }),
      );
      // A short side column (a phone held sideways) drops the pitch, then the meta line.
      addCleanup(fitGuard(side, { maxTier: 2, fits: contentFits }));
    });
  },
};

export default screen;
