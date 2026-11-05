// A round card of the challenge (design §2.14; the level-card form of §2.6): the track with the
// star current, "Round n of 3", the round's pictogram, name, rule and hint, "16 bubbles · about 1
// minute", the 3 s countdown with Start now, and the Sound toggle. The round starts by itself.
import type { RoundKey } from '../../core/game/params.ts';
import { svg } from '../dom.ts';
import type { TrackModel } from '../shell/levelTrack.ts';
import { t } from '../strings.en-GB.ts';
import { DECOY_PATH } from './decoy.ts';
import { levelCard, type LevelCard } from './levelCard.ts';

/** The round pictograms (design §6.1): Pop, the spiky decoy at 0.3, and Pop with a drift arrow. */
export function roundPictogram(key: RoundKey, size = 48): SVGSVGElement {
  const el = svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'level-card__picto',
  });
  if (key === 'spikes') {
    el.append(svg('path', { d: DECOY_PATH, transform: 'translate(12 12) scale(0.3)', fill: 'currentColor', stroke: 'none' }));
    return el;
  }
  el.append(
    svg('circle', { cx: 12, cy: 12, r: 8 }),
    svg('circle', { cx: 12, cy: 12, r: 2.2, fill: 'currentColor', stroke: 'none' }),
    svg('path', { d: 'M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4' }),
  );
  if (key === 'drifters') el.append(svg('path', { d: 'M17 4.5h3.5V8' }));
  return el;
}

export interface RoundCardOptions {
  track: TrackModel;
  round: number;
  key: RoundKey;
  sound: boolean;
  onSound(on: boolean): void;
  speed: number;
  reducedMotion: boolean;
  tapArea: HTMLElement;
  frozen?: boolean;
}

export function roundCard(o: RoundCardOptions): LevelCard {
  const card = levelCard({
    track: o.track,
    level: o.round,
    levels: 3,
    pictogram: 'pop',
    picto: roundPictogram(o.key),
    count: t('challenge.card.roundOf', { round: o.round }),
    name: t(`challenge.round.${o.key}.name`),
    rule: t(`challenge.round.${o.key}.rule`),
    hint: t(`challenge.round.${o.key}.hint`),
    meta: t('challenge.card.meta'),
    clear: null,
    sound: o.sound,
    onSound: o.onSound,
    speed: o.speed,
    reducedMotion: o.reducedMotion,
    skippable: false,
    tapArea: o.tapArea,
    ...(o.frozen ? { frozen: true } : {}),
  });
  card.el.classList.add('round-card');
  return card;
}
