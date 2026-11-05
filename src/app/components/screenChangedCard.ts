// "The screen changed" (spec §17.6.7, design §2.16): leaving fullscreen, resizing the window,
// zooming or turning the device invalidates the level (§4.7), so the card offers only "Warm up
// again", which returns to the Level 1 card with home kept. After a turn of the phone it says
// "Turn the phone back, or warm up again".
import { t } from '../strings.en-GB.ts';
import { cardDialog, type CardDialog } from './pauseCard.ts';

export function screenChangedCard(o: { rotated: boolean; onWarmUp(): void }): CardDialog {
  return cardDialog({
    title: t('warmup.changed.title'),
    body: t(o.rotated ? 'warmup.changed.rotated' : 'warmup.changed.body'),
    role: 'alertdialog',
    className: 'changed-card stim-dialog--end',
    actions: [{ label: t('warmup.changed.action'), kind: 'primary', onSelect: o.onWarmUp }],
  });
}
