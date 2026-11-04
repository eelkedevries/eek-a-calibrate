// The card match's layout (spec §4.4, prompt 017): the outline lies at true size in the page's
// stage, across when the largest card fits, else upright, cut at the stage's foot when taller.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardLayout } from '../../src/app/components/cardMatch.ts';

test('a desktop stage holds the card across, up to 7 CSS px per mm', () => {
  assert.deepEqual(cardLayout(800, 554), { orientation: 'across', maxLongPx: 599 });
});

test('a phone stage holds it upright, cut at the foot when the card is taller than the stage', () => {
  // 360 × 640 portrait: about 328 × 207 px of stage.
  const portrait = cardLayout(328, 207);
  assert.equal(portrait.orientation, 'upright-partial');
  // The width limits the card: its short side may span the stage less the margins.
  assert.equal(portrait.maxLongPx, Math.floor((328 - 32) * (85.6 / 53.98)));
  // 844 × 390 sideways: about 404 × 342 px of stage, still too short for the card's long side.
  assert.equal(cardLayout(404, 342).orientation, 'upright-partial');
  // A tall, narrow stage shows the whole card upright.
  assert.equal(cardLayout(420, 900).orientation, 'upright');
});

test('the slider can always move', () => {
  assert.ok(cardLayout(50, 50).maxLongPx > 120);
});
