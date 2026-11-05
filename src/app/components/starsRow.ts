// The stars row of Warm-up complete (design §2.12, §6.1): three stars, filled in --star-on up to
// the count and outlined in --star-off after it (never gold), 28 px on phones and 32 px on
// larger screens; role="img" with "2 of 3 stars". Each star can fill in turn on arrival.
import { h, svg } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

const STAR = 'M12 3.6L14.3 9.6L20.7 10L15.7 14L17.4 20.2L12 16.7L6.6 20.2L8.3 14L3.3 10L9.7 9.6Z';

export function starsRow(count: number): HTMLElement {
  const n = Math.max(0, Math.min(3, Math.round(count)));
  const label = n === 1 ? t('complete.stars1') : t('complete.stars', { n });
  return h(
    'div',
    { class: 'stars', role: 'img', 'aria-label': label },
    ...[0, 1, 2].map((k) =>
      svg(
        'svg',
        { class: 'star', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', 'data-on': k < n ? '' : null, style: `--k:${k}` },
        svg('path', { d: STAR, 'stroke-linejoin': 'round' }),
      ),
    ),
  );
}
