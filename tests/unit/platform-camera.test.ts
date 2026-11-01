// WP4 (spec §10.1): the camera-ladder decision function, the constraints of
// each rung and the ladder walk with an injected getUserMedia.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMERA_LADDER } from '../../src/core/constants.ts';
import { CAMERA_RUNGS, CameraError, cameraConstraints, cameraErrorMessage, ladderStep, requestCameraStream } from '../../src/platform/camera.ts';

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
