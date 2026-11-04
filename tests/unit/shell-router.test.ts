// Routes of spec §17.2: the game's routes, the details deep link, the legacy routes kept until
// 018, guards, and the fixture parameter of the test hooks (§17.2.5).
import assert from 'node:assert/strict';
import test from 'node:test';
import { hrefFor, parseHash, resolveRoute, ROUTES, type Route } from '../../src/app/router.ts';
import { fixtureName } from '../../src/app/testHooks.ts';

const resolve = (hash: string) => {
  const { path, params } = parseHash(hash);
  return resolveRoute(path, params);
};
const routeOf = (hash: string) => {
  const r = resolve(hash);
  return r.kind === 'route' ? { id: r.route.id, layout: r.route.layout, mode: r.route.mode, tab: r.tab } : r;
};

test('the game routes, their layouts and modes (design §2.2)', () => {
  assert.deepEqual(routeOf('#/'), { id: 'title', layout: 'game', mode: 'framed', tab: null });
  assert.deepEqual(routeOf(''), { id: 'title', layout: 'game', mode: 'framed', tab: null });
  assert.deepEqual(routeOf('#/ready'), { id: 'ready', layout: 'game', mode: 'immersive', tab: null });
  assert.deepEqual(routeOf('#/warmup'), { id: 'warmup', layout: 'game', mode: 'stimulus', tab: null });
  assert.deepEqual(routeOf('#/complete'), { id: 'complete', layout: 'game', mode: 'framed', tab: null });
  assert.deepEqual(routeOf('#/look?x=1'), { id: 'look', layout: 'game', mode: 'immersive', tab: null });
  assert.deepEqual(routeOf('#/challenge'), { id: 'challenge', layout: 'game', mode: 'stimulus', tab: null });
  assert.deepEqual(routeOf('#/methods'), { id: 'methods', layout: 'document', mode: 'document', tab: null });
  // Opened from Details → Device, restyled into the shell (prompt 017).
  assert.deepEqual(routeOf('#/screen?from=details'), { id: 'screen', layout: 'game', mode: 'framed', tab: null });
  assert.deepEqual(routeOf('#/distance'), { id: 'distance', layout: 'game', mode: 'framed', tab: null });
  assert.deepEqual(routeOf('#/lab'), { id: 'lab', layout: 'game', mode: 'framed', tab: null });
});

test('#/details/<tab> shows the Title with the sheet on that tab; a missing or unknown tab goes to About', () => {
  for (const tab of ['results', 'settings', 'data', 'device', 'about']) {
    assert.deepEqual(routeOf(`#/details/${tab}`), { id: 'details', layout: 'game', mode: 'framed', tab });
  }
  assert.equal(ROUTES.find((r) => r.id === 'details')!.screen, 'title');
  assert.deepEqual(resolve('#/details'), { kind: 'redirect', to: '#/details/about' });
  assert.deepEqual(resolve('#/details/'), { kind: 'redirect', to: '#/details/about' });
  assert.deepEqual(resolve('#/details/nonsense'), { kind: 'redirect', to: '#/details/about' });
  assert.equal(hrefFor('details', 'data'), '#/details/data');
});

test('the old Welcome moves to #/welcome; the other legacy routes stay where they were', () => {
  assert.equal(hrefFor('welcome'), '#/welcome');
  for (const id of ['welcome', 'camera', 'calibrate', 'validate', 'results', 'live', 'data', 'about'] as const) {
    const r = routeOf(hrefFor(id));
    assert.equal((r as { layout: string }).layout, 'legacy', id);
    assert.equal((r as { id: string }).id, id);
  }
  assert.equal(hrefFor('camera'), '#/camera');
  assert.equal(ROUTES.find((r) => r.id === 'calibrate')!.immersive, true);
});

test('an unknown path is not found', () => {
  assert.deepEqual(resolve('#/no-such-page'), { kind: 'not-found' });
});

test('a guard redirects when the state a route needs is missing (§17.2.3)', () => {
  const load = async () => ({ default: { mount() {} } });
  const routes: Route[] = [
    { id: 'title', path: '/', layout: 'game', mode: 'framed', load },
    { id: 'ready', path: '/ready', layout: 'game', mode: 'immersive', load },
    { id: 'complete', path: '/complete', layout: 'game', mode: 'framed', guard: ({ params }) => (params.get('scored') ? null : 'ready'), load },
  ];
  assert.deepEqual(resolveRoute('/complete', new URLSearchParams(''), routes), { kind: 'redirect', to: '#/ready' });
  const ok = resolveRoute('/complete', new URLSearchParams('scored=1'), routes);
  assert.equal(ok.kind === 'route' && ok.route.id, 'complete');
  // The routes of this prompt declare no guard yet.
  assert.deepEqual(ROUTES.filter((r) => r.guard).map((r) => r.id), []);
});

test('the fixture parameter is read after the hash first, then before it', () => {
  assert.equal(fixtureName('?e2e=1&fixture=a', '#/complete'), 'a');
  assert.equal(fixtureName('?e2e=1', '#/complete?fixture=b'), 'b');
  assert.equal(fixtureName('?fixture=a', '#/complete?fixture=b'), 'b');
  assert.equal(fixtureName('?e2e=1', '#/complete'), null);
  assert.equal(fixtureName('?fixture=', ''), null);
});
