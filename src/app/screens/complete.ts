// Warm-up complete (spec §17.7; design §2.12; boards phone-level-complete and
// desktop-level-complete): framed and dark, still inside the presentation span. The Test round
// becomes a game result: the zone map with a ✓ or ✗ for each Test-round bubble, the stars, one
// headline, one sentence, one tip (the cause) and "Rule of thumb · How we judge this" (Details →
// Results), and the outcome's actions (design §2.12's table). On arrival the zones light up one
// after another, then the stars fill, then the actions fade in (all at once under reduced motion),
// with one chime when sound is on. Guard: no scored Test round → Get ready.
import type { Cause } from '../../core/warmup/cause.ts';
import { challengeUnlocked } from '../../core/warmup/stars.ts';
import { VAL_JITTER } from '../../core/protocol/layouts.ts';
import { playSound } from '../../platform/feedback.ts';
import { starsRow } from '../components/starsRow.ts';
import { zoneMap, type ZoneMap } from '../components/zoneMap.ts';
import { h } from '../dom.ts';
import { endSpan, setNextRound, setWarmupMode, setWarmupResult, startSpan, warmupResult, type WarmupResult } from '../game/gameState.ts';
import { measuredScale, reducedMotion } from '../game/warmupRunner.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { addCleanup } from '../shell/appShell.ts';
import { openHowWeJudge } from '../shell/detailsSheet.ts';
import { contentFits, fitGuard } from '../shell/fitGuard.ts';
import { icon, type IconName } from '../shell/icons.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { topBar } from '../shell/topBar.ts';
import { currentSetup } from '../session.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerFixture } from '../testHooks.ts';
import './game.css';

// ----- Fixtures (test mode, §17.2.5): each outcome with example marks on this window ----------------

const FIXTURES = ['great', 'good', 'rough', 'rough-two', 'failed', 'restore', 'quick'] as const;
type FixtureName = (typeof FIXTURES)[number];
for (const name of FIXTURES) registerFixture(`complete-${name}`, () => setWarmupResult(fixtureResult(name)));

function fixtureResult(name: FixtureName): WarmupResult {
  const w = innerWidth;
  const hgt = innerHeight;
  const portrait = w < (5 / 4) * hgt;
  const zones = name === 'failed' ? { cols: 1, rows: 1 } : name === 'rough-two' ? (portrait ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 }) : portrait ? { cols: 1, rows: 3 } : { cols: 3, rows: 1 };
  const verdict = name === 'great' || name === 'quick' ? 'good' : name === 'good' ? 'acceptable' : name === 'failed' ? 'not-tracking' : 'poor';
  const outcome = name === 'great' || name === 'quick' ? 'great' : name === 'good' ? 'good' : name === 'failed' ? 'failed' : 'rough';
  const stars = { great: 3, quick: 3, good: 2, rough: 1, 'rough-two': 1, failed: 0, restore: 1 }[name];
  const misses = new Set(name === 'failed' ? [0, 1, 2, 4, 5, 7, 8, 10, 11] : [3, 8]);
  const marks = [0.15, 0.5, 0.85].flatMap((y, r) =>
    [0.15, 0.38, 0.62, 0.85].map((x, c) => {
      const k = 4 * r + c;
      const targetPx = [(x + (k % 3 === 0 ? VAL_JITTER / 2 : 0)) * w, y * hgt] as const;
      return { itemId: `V-val-${k}`, targetPx, gazePx: misses.has(k) ? null : targetPx, zone: null, hit: !misses.has(k) };
    }),
  );
  const cause: Cause | null = name === 'great' || name === 'quick' ? null : name === 'failed' ? 'face-lost' : name === 'good' ? 'dark' : 'backlit';
  return {
    mode: name === 'restore' ? 'restore' : name === 'quick' ? 'quick-warmup' : 'full',
    preset: getState().settings.preset,
    levels: [],
    estimator: 'combined',
    verdict,
    zones,
    needDeg: 4,
    stars,
    outcome,
    cause,
    marks,
    viewport: { w, h: hgt },
    restoreRejected: name === 'restore',
    log: [],
    atMs: performance.now(),
  };
}

// ----- Copy for an outcome (design §2.12) --------------------------------------------------------

type ActionId = 'try' | 'again' | 'anyway' | 'getReady' | 'back';

interface Copy {
  headline: string;
  sentence: string;
  tip: string;
  tipIcon: IconName;
  primary: ActionId;
  secondary: ActionId | null;
}

const LIGHT_CAUSES: ReadonlySet<Cause> = new Set(['backlit', 'dark', 'glare']);

function tipFor(cause: Cause | null): { text: string; icon: IconName } {
  if (!cause) return { text: t('complete.tip.none'), icon: 'info' };
  const variant = cause === 'face-lost' || cause === 'far' ? `.${currentSetup() === 'webcam' ? 'webcam' : 'phone'}` : '';
  return { text: t(`complete.tip.${cause}${variant}`), icon: LIGHT_CAUSES.has(cause) ? 'sun' : 'info' };
}

export function copyFor(r: WarmupResult): Copy {
  const n = r.zones.cols * r.zones.rows;
  const tip = tipFor(r.cause);
  if (r.restoreRejected) {
    return { headline: t('complete.headline.restore'), sentence: t('complete.sentence.restore'), tip: tip.text, tipIcon: tip.icon, primary: 'again', secondary: null };
  }
  if (r.outcome === 'failed') {
    return {
      headline: t('complete.headline.failed'),
      sentence: t(`complete.sentence.failed.${r.cause ?? 'none'}`),
      tip: t(`complete.tip.failed.${currentSetup() === 'webcam' ? 'webcam' : 'phone'}`),
      tipIcon: 'sun',
      primary: 'getReady',
      secondary: null,
    };
  }
  const headline = t('complete.headline.zones', { n });
  if (r.outcome === 'rough') {
    let sentence = t('complete.sentence.more');
    if (n === 2) sentence = t(r.zones.cols === 2 ? 'complete.sentence.leftRight' : 'complete.sentence.topBottom');
    return { headline, sentence, tip: tip.text, tipIcon: tip.icon, primary: r.mode === 'quick-warmup' ? 'back' : 'again', secondary: r.mode === 'quick-warmup' ? 'again' : 'anyway' };
  }
  const great = r.outcome === 'great';
  return {
    headline,
    sentence: t('complete.sentence.zones', { n }),
    tip: great ? t('complete.tip.great') : tip.text,
    tipIcon: great ? 'check' : tip.icon,
    primary: r.mode === 'quick-warmup' ? 'back' : 'try',
    secondary: 'again',
  };
}

/** The secondary's icon when the action row is too narrow for its label (design §4.1 rule 8). */
const ACTION_ICON: Readonly<Record<ActionId, IconName>> = { try: 'crosshair', again: 'back', anyway: 'play', getReady: 'back', back: 'play' };

const ACTION_LABEL: Readonly<Record<ActionId, string>> = {
  try: 'complete.action.try',
  again: 'complete.action.again',
  anyway: 'complete.action.anyway',
  getReady: 'complete.action.getReady',
  back: 'complete.action.back',
};

// ----- The screen -------------------------------------------------------------------------------

class CompleteScreen {
  private readonly ctx: ScreenContext;
  private readonly root: HTMLElement;
  private map: ZoneMap | null = null;
  private busy = false;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.root = root;
    this.ctx = ctx;
    const result = warmupResult();
    if (!result) {
      location.replace('#/ready');
      return;
    }
    this.render(result);
  }

  private render(r: WarmupResult): void {
    const copy = copyFor(r);
    const n = r.zones.cols * r.zones.rows;
    const unlocked = challengeUnlocked(n) && r.outcome !== 'failed' && !r.restoreRejected;
    const preset = r.mode === 'full' ? r.preset : 'quick';
    const track = trackModel(preset, { screen: 'complete', unlocked });
    this.map = zoneMap({ cols: r.outcome === 'failed' ? 0 : r.zones.cols, rows: r.outcome === 'failed' ? 0 : r.zones.rows, marks: r.marks, viewport: r.viewport });
    const judge = h('button', { type: 'button', class: 'link-btn complete__judge' }, t('complete.judge'));
    judge.addEventListener('click', () => openHowWeJudge(judge));
    const actions = h('div', { class: 'actions complete__actions' });
    if (copy.secondary) actions.append(this.button(copy.secondary, 'secondary'));
    actions.append(this.button(copy.primary, 'primary'));
    const motion = !reducedMotion();
    this.root.dataset.arrive = motion ? 'animate' : 'still';
    this.root.style.setProperty('--zones', String(Math.max(0, r.outcome === 'failed' ? 0 : n)));
    this.root.append(
      topBar({ variant: 'bar', track, detailsTab: 'results' }),
      h(
        'main',
        { class: 'app__main' },
        h('section', { class: 'stage complete-stage' }, this.map.el),
        h(
          'div',
          { class: 'side' },
          h(
            'div',
            { class: 'panel complete-panel' },
            starsRow(r.stars),
            h('h1', { class: 'panel__title complete__headline' }, copy.headline),
            h('p', { class: 'complete__sentence' }, copy.sentence),
            h('p', { class: 'complete__tip' }, icon(copy.tipIcon, 16), h('span', null, copy.tip)),
            judge,
          ),
          actions,
        ),
      ),
    );
    // The actions' fit guard: the secondary becomes a 56 px icon button, then leaves (design §4.1 rule 11).
    addCleanup(fitGuard(actions, { maxTier: 2, fits: contentFits }));
    if (getState().settings.sound) playSound('chime');
  }

  private button(id: ActionId, kind: 'primary' | 'secondary'): HTMLButtonElement {
    const label = t(ACTION_LABEL[id]);
    const b =
      kind === 'secondary'
        ? h('button', { type: 'button', class: 'btn btn--secondary', 'data-action': id, 'aria-label': label }, icon(ACTION_ICON[id], 20), h('span', { class: 'btn__label' }, label))
        : h('button', { type: 'button', class: 'btn btn--primary', 'data-action': id }, label);
    b.addEventListener('click', () => void this.act(id));
    return b;
  }

  private async act(id: ActionId): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    switch (id) {
      case 'again': {
        // Back to the Level 1 card in the same presentation (a fresh handle, measured again); a
        // restored or quick warm-up turns into the full one.
        setWarmupMode('full');
        const el = this.root;
        try {
          await startSpan(el, measuredScale(getState().geometry));
          this.ctx.navigate('warmup');
        } catch {
          await endSpan();
          this.ctx.navigate('ready');
        }
        break;
      }
      case 'getReady':
        await endSpan();
        this.ctx.navigate('ready');
        break;
      case 'back':
        this.ctx.navigate('challenge');
        break;
      case 'try':
        this.ctx.navigate('look');
        break;
      case 'anyway':
        setNextRound(1);
        this.ctx.navigate('challenge');
        break;
    }
    this.busy = false;
  }

  unmount(): void {
    this.map?.dispose();
    delete this.root.dataset.arrive;
    this.root.style.removeProperty('--zones');
  }
}

const screen: Screen = {
  mount(root, ctx) {
    const s = new CompleteScreen(root, ctx);
    return () => s.unmount();
  },
};

export default screen;
