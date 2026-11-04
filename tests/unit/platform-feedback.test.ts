// platform/feedback.ts's pure parts (design §3.10): the haptic patterns, the sounds as data, the
// voice choice (local en-GB only) and the 2.5 s limit on speech.
import assert from 'node:assert/strict';
import test from 'node:test';
import { HAPTICS, pickVoice, SOUND_VOLUME, SOUNDS, soundLength, SpeechThrottle, speechAvailable, speak, vibrate } from '../../src/platform/feedback.ts';

test('the haptic patterns of design §3.10', () => {
  assert.equal(HAPTICS.ready, 20);
  assert.deepEqual(HAPTICS.pause, [30, 60, 30]);
  assert.equal(HAPTICS.pop, 15);
  // Nothing to vibrate in Node: it says so instead of failing.
  assert.equal(vibrate(HAPTICS.ready), false);
});

test('sounds are short, quiet tones made in the page', () => {
  assert.ok(SOUND_VOLUME > 0 && SOUND_VOLUME <= 0.1);
  for (const [name, tones] of Object.entries(SOUNDS)) {
    assert.ok(tones.length > 0, name);
    for (const t of tones) {
      assert.ok(t.gain > 0 && t.gain <= 1);
      assert.ok(t.fromHz >= 200 && t.fromHz <= 2000 && t.toHz >= 200 && t.toHz <= 2000);
    }
  }
  assert.equal(SOUNDS.pause.length, 2, 'the pause is a two-tone');
  assert.ok(soundLength('pop') < 0.2);
  assert.ok(soundLength('chime') < 0.6);
});

test('only a local British English voice is used', () => {
  const voices = [
    { name: 'Cloud UK', lang: 'en-GB', localService: false },
    { name: 'Local US', lang: 'en-US', localService: true, default: true },
    { name: 'Local UK', lang: 'en-GB', localService: true },
    { name: 'Local UK 2', lang: 'en_GB', localService: true, default: true },
  ];
  assert.equal(pickVoice(voices)?.name, 'Local UK 2');
  assert.equal(pickVoice(voices.slice(0, 3))?.name, 'Local UK');
  assert.equal(pickVoice(voices.slice(0, 2)), null);
  assert.equal(pickVoice([]), null);
  // Without speechSynthesis (Node) the setting is unavailable and nothing is spoken.
  assert.equal(speechAvailable(), false);
  assert.equal(speak('Ready'), false);
});

test('speech at most once per 2.5 s', () => {
  const th = new SpeechThrottle();
  assert.equal(th.allow(0), true);
  assert.equal(th.allow(2000), false);
  assert.equal(th.allow(2500), true);
  assert.equal(th.allow(4000), false);
  assert.equal(th.allow(5000), true);
});
