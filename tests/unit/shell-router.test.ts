// Routes of spec §17.2: the game's routes, the details deep link, the redirects of the legacy
// routes, guards, and the fixture parameter of the test hooks (§17.2.5).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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

test('the v1 routes redirect to the screens that replaced them, keeping a query (§17.2.2)', () => {
  const expected: Record<string, string> = {
    '#/welcome': '#/',
    '#/camera': '#/ready',
    '#/calibrate': '#/ready',
    '#/validate': '#/ready',
    '#/results': '#/details/results',
    '#/live': '#/look',
    '#/data': '#/details/data',
    '#/about': '#/details/about',
  };
  for (const [from, to] of Object.entries(expected)) assert.deepEqual(resolve(from), { kind: 'redirect', to }, from);
  assert.deepEqual(resolve('#/live?expert=1'), { kind: 'redirect', to: '#/look?expert=1' });
  // Every target is a route that resolves, and no route of the app is a legacy one.
  for (const to of Object.values(expected)) assert.equal(resolve(to).kind, 'route', to);
  for (const r of ROUTES) assert.equal(Object.hasOwn(expected, `#${r.path}`), false, r.path);
});

test('nothing in the app links to a v1 hash (§17.2.2)', () => {
  const root = new URL('../../src/', import.meta.url);
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|css|html)$/.test(f));
  assert.ok(files.length > 50);
  for (const f of files) {
    const text = readFileSync(new URL(f, root), 'utf8');
    assert.equal(/#\/(welcome|camera|calibrate|validate|results|live|data|about)\b/.test(text), false, `${f} names a v1 hash`);
  }
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
