// The preferences of Details → Settings (design §2.17, spec §17.10.3): read back defensively,
// and the address wins over them for the warm-up length and the engines.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PREFS, normalisePrefs, parseSettings, queryKeys, settingsFromPrefs } from '../../src/app/state.ts';

test('missing or malformed preferences take their defaults', () => {
  assert.deepEqual(normalisePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(normalisePrefs('nonsense'), DEFAULT_PREFS);
  assert.deepEqual(normalisePrefs({ warmup: 'long', theme: 'pink', sound: 'yes', engines: ['none'], camera: { deviceId: '' }, glasses: 'monocle', setup: 'tripod' }), DEFAULT_PREFS);
  assert.equal(DEFAULT_PREFS.sound, true);
  assert.equal(DEFAULT_PREFS.warmup, 'standard');
  assert.equal(DEFAULT_PREFS.theme, 'dark');
});

test('valid preferences are read back as stored', () => {
  const stored = {
    warmup: 'thorough',
    engines: ['eyepixel', 'geometric', 'nonsense'],
    glasses: 'contacts',
    sound: false,
    speech: true,
    limitedHead: true,
    theme: 'light',
    camera: { deviceId: 'abc', label: 'Front camera' },
    expert: true,
    setup: 'in-hand',
  };
  assert.deepEqual(normalisePrefs(stored), {
    warmup: 'thorough',
    // In the engines' rank order, unknown ids dropped.
    engines: ['geometric', 'eyepixel'],
    glasses: 'contacts',
    sound: false,
    speech: true,
    limitedHead: true,
    theme: 'light',
    camera: { deviceId: 'abc', label: 'Front camera' },
    expert: true,
    setup: 'in-hand',
  });
});

test('the address keeps its warm-up length and engines; otherwise the preferences apply', () => {
  const prefs = normalisePrefs({ warmup: 'quick', engines: ['geometric'] });
  const plain = { search: '', hash: '#/' };
  const settings = parseSettings(plain, 1);
  assert.deepEqual(settingsFromPrefs(settings, prefs, queryKeys(plain)), { ...settings, preset: 'quick', engines: ['geometric'] });
  const chosen = { search: '?preset=thorough', hash: '#/details/settings?engines=all' };
  const fromAddress = parseSettings(chosen, 1);
  assert.deepEqual([...queryKeys(chosen)].sort(), ['engines', 'preset']);
  const merged = settingsFromPrefs(fromAddress, prefs, queryKeys(chosen));
  assert.equal(merged.preset, 'thorough');
  assert.deepEqual(merged.engines, ['blazegaze', 'peekr', 'geometric', 'eyepixel']);
  // Sound, speech and the set-up choice reach the settings the game reads, unless the address set them.
  const game = normalisePrefs({ sound: false, speech: true, setup: 'in-hand' });
  assert.deepEqual(settingsFromPrefs(settings, game, queryKeys(plain)), { ...settings, sound: false, speech: true, setup: 'in-hand' });
  const muted = { search: '?sound=1&setup=webcam', hash: '#/' };
  const kept = settingsFromPrefs(parseSettings(muted, 1), game, queryKeys(muted));
  assert.equal(kept.sound, true);
  assert.equal(kept.setup, 'webcam');
  assert.equal(kept.speech, true);
});
