// WP4 (spec §10.1): the camera-ladder decision function, the constraints of
// each rung and the ladder walk with an injected getUserMedia.
// WP11 (§14.2.2): the mobile ladder and the camera-change decision.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMERA_LADDER, CAMERA_LADDER_MOBILE } from '../../src/core/constants.ts';
import {
  CAMERA_RUNGS,
  CAMERA_RUNGS_MOBILE,
  CameraError,
  cameraConstraints,
  cameraErrorMessage,
  cameraRungs,
  FRAME_RATE_TOLERANCE,
  ladderStep,
  requestCameraStream,
  settingsChange,
} from '../../src/platform/camera.ts';

function domError(name: string, constraint?: string): Error {
  const error = new Error(`${name} for the test`);
  error.name = name;
  if (constraint) (error as Error & { constraint: string }).constraint = constraint;
  return error;
}

test('the ladder is 1280×720, 960×540, 640×480, then {video: true}', () => {
  assert.deepEqual(
    CAMERA_RUNGS,
    [...CAMERA_LADDER.map(([width, height]) => ({ width, height })), null],
  );
  assert.deepEqual(CAMERA_RUNGS.slice(0, 3), [
    { width: 1280, height: 720 },
    { width: 960, height: 540 },
    { width: 640, height: 480 },
  ]);
});

test('only OverconstrainedError moves down the ladder, and it is never "no camera"', () => {
  assert.deepEqual(ladderStep(0, 'OverconstrainedError'), { action: 'retry', rung: 1 });
  assert.deepEqual(ladderStep(2, 'OverconstrainedError'), { action: 'retry', rung: 3 });
  assert.deepEqual(ladderStep(3, 'OverconstrainedError'), { action: 'fail', code: 'overconstrained' });
  assert.deepEqual(ladderStep(1, 'OverconstrainedError', 'deviceId'), { action: 'fail', code: 'device-unavailable' });
  assert.doesNotMatch(cameraErrorMessage('device-unavailable'), /no camera/i);
  assert.deepEqual(ladderStep(0, 'NotAllowedError'), { action: 'fail', code: 'denied' });
  assert.deepEqual(ladderStep(0, 'SecurityError'), { action: 'fail', code: 'denied' });
  assert.deepEqual(ladderStep(2, 'NotFoundError'), { action: 'fail', code: 'not-found' });
  assert.deepEqual(ladderStep(1, 'NotReadableError'), { action: 'fail', code: 'in-use' });
  assert.deepEqual(ladderStep(0, 'AbortError'), { action: 'fail', code: 'failed' });
  assert.deepEqual(ladderStep(0, 'TypeError'), { action: 'fail', code: 'failed' });
});

test('each rung asks for the front camera at up to 30 fps; a chosen device replaces facingMode', () => {
  assert.deepEqual(cameraConstraints({ width: 960, height: 540 }), {
    audio: false,
    video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 } },
  });
  assert.deepEqual(cameraConstraints(null), { audio: false, video: true });
  assert.deepEqual(cameraConstraints({ width: 640, height: 480 }, 'abc'), {
    audio: false,
    video: { deviceId: { exact: 'abc' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
  });
  assert.deepEqual(cameraConstraints(null, 'abc'), { audio: false, video: { deviceId: { exact: 'abc' } } });
});

test('the ladder walk retries overconstrained requests and stops at the first other error', async () => {
  const fakeStream = { id: 'stream' } as unknown as MediaStream;
  const seen: MediaStreamConstraints[] = [];
  const result = await requestCameraStream({
    getUserMedia: async (c) => {
      seen.push(c);
      if (seen.length < 3) throw domError('OverconstrainedError', 'width');
      return fakeStream;
    },
  });
  assert.equal(result.stream, fakeStream);
  assert.equal(result.rung, 2);
  assert.deepEqual(result.attempts.map((a) => a.error), ['OverconstrainedError', 'OverconstrainedError', null]);
  assert.deepEqual((seen[2].video as MediaTrackConstraints).width, { ideal: 640 });

  for (const [name, code, text] of [
    ['NotAllowedError', 'denied', 'Camera permission denied'],
    ['NotFoundError', 'not-found', 'No camera found'],
    ['NotReadableError', 'in-use', 'Camera in use by another application'],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      requestCameraStream({
        getUserMedia: async () => {
          calls += 1;
          throw domError(name);
        },
      }),
      (error: unknown) => error instanceof CameraError && error.code === code && error.message.startsWith(text),
    );
    assert.equal(calls, 1, name);
  }

  let calls = 0;
  await assert.rejects(
    requestCameraStream({
      getUserMedia: async () => {
        calls += 1;
        throw domError('OverconstrainedError');
      },
    }),
    (error: unknown) => error instanceof CameraError && error.code === 'overconstrained' && !/no camera/i.test(error.message),
  );
  assert.equal(calls, 4);
});

test('the mobile ladder is 960×540, 640×480, then {video: true} (§14.2.2)', () => {
  assert.deepEqual(CAMERA_LADDER_MOBILE, [[960, 540], [640, 480]]);
  assert.deepEqual(CAMERA_RUNGS_MOBILE, [{ width: 960, height: 540 }, { width: 640, height: 480 }, null]);
  assert.equal(cameraRungs('mobile'), CAMERA_RUNGS_MOBILE);
  assert.equal(cameraRungs('desktop'), CAMERA_RUNGS);
  // Front camera on every rung; the delivered frame may still be portrait.
  assert.deepEqual(cameraConstraints(CAMERA_RUNGS_MOBILE[0]), {
    audio: false,
    video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 } },
  });
});

test('the mobile ladder has its own length: overconstrained after {video: true} fails, never "no camera"', () => {
  assert.deepEqual(ladderStep(0, 'OverconstrainedError', undefined, CAMERA_RUNGS_MOBILE), { action: 'retry', rung: 1 });
  assert.deepEqual(ladderStep(1, 'OverconstrainedError', undefined, CAMERA_RUNGS_MOBILE), { action: 'retry', rung: 2 });
  assert.deepEqual(ladderStep(2, 'OverconstrainedError', undefined, CAMERA_RUNGS_MOBILE), { action: 'fail', code: 'overconstrained' });
  // The desktop ladder is one rung longer.
  assert.deepEqual(ladderStep(2, 'OverconstrainedError'), { action: 'retry', rung: 3 });
  assert.deepEqual(ladderStep(1, 'OverconstrainedError', 'deviceId', CAMERA_RUNGS_MOBILE), { action: 'fail', code: 'device-unavailable' });
  assert.deepEqual(ladderStep(0, 'NotAllowedError', undefined, CAMERA_RUNGS_MOBILE), { action: 'fail', code: 'denied' });
});

test('the mobile ladder walk', async () => {
  const fakeStream = { id: 'stream' } as unknown as MediaStream;
  const seen: MediaStreamConstraints[] = [];
  const result = await requestCameraStream({
    ladder: 'mobile',
    getUserMedia: async (c) => {
      seen.push(c);
      if (seen.length < 3) throw Object.assign(new Error('too big'), { name: 'OverconstrainedError', constraint: 'width' });
      return fakeStream;
    },
  });
  assert.equal(result.rung, 2);
  assert.deepEqual(seen.map((c) => (c.video === true ? 'any' : (c.video as MediaTrackConstraints).width)), [{ ideal: 960 }, { ideal: 640 }, 'any']);
  assert.deepEqual(result.attempts.map((a) => a.rung), [...CAMERA_RUNGS_MOBILE]);

  let calls = 0;
  await assert.rejects(
    requestCameraStream({
      ladder: 'mobile',
      getUserMedia: async () => {
        calls += 1;
        throw Object.assign(new Error('never'), { name: 'OverconstrainedError' });
      },
    }),
    (error: unknown) => error instanceof CameraError && error.code === 'overconstrained',
  );
  assert.equal(calls, 3);
});

test('a change of the delivered frame size or frame rate is a camera change (§14.2.2)', () => {
  const landscape = { width: 640, height: 480, frameRate: 30 };
  assert.deepEqual(settingsChange(landscape, { ...landscape }), []);
  // A phone turned upright switches to a portrait frame.
  assert.deepEqual(settingsChange(landscape, { width: 480, height: 640, frameRate: 30 }), ['width', 'height']);
  assert.deepEqual(settingsChange(landscape, { width: 960, height: 480, frameRate: 30 }), ['width']);
  assert.deepEqual(settingsChange(landscape, { width: 640, height: 480, frameRate: 15 }), ['frameRate']);
  assert.deepEqual(settingsChange(landscape, { width: 480, height: 640, frameRate: 24 }), ['width', 'height', 'frameRate']);
  // 29.97 against 30 is the same rate; an unknown rate on either side is no change.
  assert.deepEqual(settingsChange(landscape, { ...landscape, frameRate: 30 - FRAME_RATE_TOLERANCE + 0.03 }), []);
  assert.deepEqual(settingsChange(landscape, { ...landscape, frameRate: null }), []);
  assert.deepEqual(settingsChange({ ...landscape, frameRate: null }, { ...landscape, frameRate: 15 }), []);
  // A stream being reconfigured reports 0 × 0 for a moment: wait for the size it settles on.
  assert.deepEqual(settingsChange(landscape, { width: 0, height: 0, frameRate: 30 }), []);
  assert.deepEqual(settingsChange(landscape, { width: Number.NaN, height: 480, frameRate: 15 }), []);
});
