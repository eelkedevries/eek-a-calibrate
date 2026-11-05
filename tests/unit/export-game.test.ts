// The challenge's export (spec §17.10.1): game.csv's columns and rows, the game-<nnn> trials,
// targets.csv rows for bubbles, the README line, the game member of session.json and the drift
// log's source; identical state still gives identical bytes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { GAME_HEADER, gameCsv, type GameCsvBlock } from '../../src/core/export/gameCsv.ts';
import { FILE_DESCRIPTIONS, readmeText } from '../../src/core/export/readme.ts';
import { trialName } from '../../src/core/export/samplesCsv.ts';
import { sessionJson, type SessionMeta } from '../../src/core/export/sessionJson.ts';
import { TARGETS_HEADER, targetsCsv } from '../../src/core/export/targetsCsv.ts';
import { buildExport, EXPORT_FILES } from '../../src/core/export/zip.ts';
import { makeBoard } from '../../src/core/game/board.ts';
import { ROUNDS } from '../../src/core/game/params.ts';
import { roundSeed } from '../../src/core/game/placement.ts';
import { Round } from '../../src/core/game/round.ts';
import type { SessionGeometry, TargetItem } from '../../src/core/types.ts';

const START = 5000;
const ID = { participant: 'P01', session: 'S1', sessionStartMs: START };
const SCREEN = { viewportWpx: 390, viewportHpx: 844, screenWpx: 390, screenHpx: 844, dpr: 3, fullscreen: false, pxPerMm: 96 / 25.4, pxPerMmSource: 'assumed' as const };
const GEOMETRY: SessionGeometry = { screen: SCREEN, distance: { focalPx: 600, focalSource: 'assumed-fov', blindSpotMm: null, blindSpotSdMm: null, irisMm: 11.7 }, refDistanceMm: 350, degreesApproximate: true };

/** Round 2 played at a fixed seed with the gaze always on the spike, then on the bubble. */
function playedRound(): GameCsvBlock {
  const board = makeBoard({ x: 16, y: 24, w: 358, h: 796 }, 1, 3);
  const r = new Round({ def: ROUNDS[1]!, seed: roundSeed(9090, 1), board, bubbleR: 39, pxPerDeg: 20, idPrefix: 'G001' });
  for (let t = START; r.phase !== 'done' && t < START + 200_000; t += 16) {
    const target = r.decoy && r.decoy.bonkedClock === null ? r.decoy.centre : r.bubble?.centre;
    r.setGaze(target ? [target[0] + 3, target[1] - 4] : null, t);
    r.tick(t, false);
  }
  return { trial: trialName('game', 1), round: 2, key: 'spikes', records: r.records };
}

test('game.csv: one row per bubble or spike, with the columns of §17.10.1', () => {
  const block = playedRound();
  const csv = gameCsv(ID, [block]);
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines[0], GAME_HEADER.join(','));
  const rows = lines.slice(1).map((l) => l.split(','));
  assert.equal(rows.length, 32);
  for (const row of rows) assert.equal(row.length, GAME_HEADER.length);
  const col = (name: string) => GAME_HEADER.indexOf(name as (typeof GAME_HEADER)[number]);
  const bubbles = rows.filter((r) => r[col('kind')] === 'bubble');
  const spikes = rows.filter((r) => r[col('kind')] === 'decoy');
  assert.equal(bubbles.length, 16);
  assert.equal(spikes.length, 16);
  assert.ok(rows.every((r) => r[col('trial')] === 'game-001' && r[col('round')] === '2' && r[col('round_name')] === 'Mind the spikes'));
  assert.ok(spikes.every((r) => r[col('outcome')] === 'bonked' && Number(r[col('score_change')]) <= 0));
  assert.ok(bubbles.every((r) => r[col('outcome')] === 'popped'));
  const pop = bubbles[0]!;
  assert.ok(Number(pop[col('time_to_pop_ms')]) > 0);
  assert.equal(pop[col('offset_x_px')], '3.00');
  assert.equal(pop[col('offset_y_px')], '-4.00');
  assert.ok(['1'].includes(pop[col('zone_col')]!) && ['1', '2', '3'].includes(pop[col('zone_row')]!));
  assert.ok(Number(pop[col('onset_ms')]) >= 0 && Number(pop[col('offset_ms')]) > Number(pop[col('onset_ms')]));
  // Identical state, identical bytes.
  assert.equal(gameCsv(ID, [structuredClone(block)]), csv);
});

test('game-<nnn> trials, bubble rows in targets.csv with phase game, and the README line', () => {
  assert.equal(trialName('game', 1), 'game-001');
  assert.equal(trialName('game', 12), 'game-012');
  const items: TargetItem[] = [{ kind: 'target', id: 'G001-B01', phase: 'game', block: 1, xNorm: 0.5, yNorm: 0.25, groupId: 'zone-0-0', settleMs: 0, sampleMs: 4000, maxSampleMs: 4000 }];
  const csv = targetsCsv(ID, [{ trial: 'game-001', schedule: { items }, presentations: [{ itemId: 'G001-B01', onsetMs: START + 100, offsetMs: START + 1300, attempt: 1, frameIntervalMs: Number.NaN, aborted: false }] }], SCREEN);
  const [header, row] = csv.trimEnd().split('\n');
  assert.equal(header, TARGETS_HEADER.join(','));
  assert.deepEqual(row!.split(',').slice(0, 8), ['game-001', 'G001-B01', 'game', '1', '195.00', '211.00', '100.000', '1300.000']);
  assert.ok(FILE_DESCRIPTIONS['game.csv']);
  const readme = readmeText({ participant: 'P01', session: 'S1', appVersion: '0', appCommit: 'x', files: ['README.txt', 'samples.csv', 'game.csv'] });
  assert.match(readme, /game\.csv +every challenge bubble/);
  assert.match(readme, /game-<nnn>/);
});

test('session.json carries the game member and the drift log source; buildExport writes game.csv when rounds were played', () => {
  const meta: SessionMeta = {
    app: { version: '0', commit: 'x' },
    assets: {},
    environment: { userAgent: 'test', capabilities: {} },
    host: { kind: 'worker', delegate: 'CPU', backends: {} },
    camera: { settings: {}, clock: 'captureTime' },
    protocol: { preset: 'quick', seeds: { session: 1 }, schedules: [] },
    pursuitLagMs: null,
    driftLog: [{ tMs: START + 10, offsetDeg: [1, 0], applied: true }, { tMs: START + 20, offsetDeg: [0.5, 0.5], applied: false, source: 'game' }],
    game: { setup: 'propped', rounds: [{ trial: 'game-001', seed: 7, score: 1820 }] },
    licences: {},
  };
  const json = JSON.parse(sessionJson({ ...meta, identity: ID, exportedAt: new Date(0), geometry: GEOMETRY, fit: null, validations: [] }));
  assert.deepEqual(json.driftLog.map((e: { source: string }) => e.source), ['check', 'game']);
  assert.equal(json.game.rounds[0].seed, 7);
  const bundle = buildExport({ identity: ID, exportedAt: new Date(0), geometry: GEOMETRY, samples: [], targets: [], validations: [], fit: null, events: [], session: meta, game: [playedRound()] });
  assert.deepEqual(bundle.files.map((f) => f.name), EXPORT_FILES.filter((n) => n !== 'dataset.json'));
  assert.ok(bundle.files.findIndex((f) => f.name === 'game.csv') > bundle.files.findIndex((f) => f.name === 'events.csv'));
  const again = buildExport({ identity: ID, exportedAt: new Date(0), geometry: GEOMETRY, samples: [], targets: [], validations: [], fit: null, events: [], session: meta, game: [playedRound()] });
  assert.deepEqual(again.zip, bundle.zip);
  assert.equal(strFromU8(unzipSync(bundle.zip)['game.csv'] as Uint8Array).split('\n')[0], GAME_HEADER.join(','));
});
