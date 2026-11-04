// Shared builders for the position-guard tests: a FaceObservation from the recorded landmark
// fixture, and Signals that are "all clear" for a class unless a test overrides a field.
import type { FaceObservation } from '../../src/core/types.ts';
import { faceGeometry, type Signals } from '../../src/core/position/signals.ts';
import type { ClassRanges } from '../../src/core/position/thresholds.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

export const FIXTURE = loadLandmarkFixture();

export function fixtureFace(overrides: Partial<FaceObservation> = {}): FaceObservation {
  const c = FIXTURE.computed;
  return {
    landmarks: FIXTURE.landmarks,
    blendshapes: FIXTURE.blendshapes,
    matrix: FIXTURE.matrix,
    pose: { yawDeg: c.pose.yawDeg, pitchDeg: c.pose.pitchDeg, rollDeg: c.pose.rollDeg, R: c.pose.R, t: c.pose.t as unknown as readonly [number, number, number], scale: c.pose.scale },
    eyes: {
      earL: c.eyes.earL as number,
      earR: c.eyes.earR as number,
      openQL: c.eyes.openQL as number,
      openQR: c.eyes.openQR as number,
      blinkL: c.eyes.blinkL as number,
      blinkR: c.eyes.blinkR as number,
      irisDiamPx: c.eyes.irisDiamPx as number,
      eyeMidNorm: c.eyes.eyeMidNorm as unknown as readonly [number, number],
      interOcularPx: c.eyes.interOcularPx as number,
      open: c.eyes.open as boolean,
    },
    quality: { ...c.quality, centring: c.quality.centring as unknown as readonly [number, number] },
    landmarkerMs: 10,
    delegate: 'CPU',
    ...overrides,
  };
}

/** Signals with every measure in the middle of the class's ranges. */
export function clearSignals(r: ClassRanges, overrides: Partial<Signals> = {}): Signals {
  return {
    tMs: 0,
    delivering: true,
    frameLuma: 120,
    face: true,
    faceNow: true,
    faceLostMs: 0,
    faceCount: 1,
    geometry: faceGeometry(fixtureFace(), FIXTURE.videoW, FIXTURE.videoH),
    scale: r.face.target,
    irisPx: r.irisFloorPx * 1.5,
    margins: { x: 0.25, y: 0.25 },
    centring: [0, 0],
    yawDeg: r.pose.yaw,
    pitchDeg: r.pose.pitch,
    rollDeg: 0,
    eyeMid: [0.5, 0.45],
    lumaMean: 130,
    backlight: 1.1,
    glare: 0,
    eyesClosedMs: 0,
    eyesLidsClosed: false,
    headDegS: 2,
    tiltDeg: r.tilt ? 80 : Number.NaN,
    phoneRollDeg: r.tilt ? 0 : Number.NaN,
    rotationDegS: r.tilt ? 1 : Number.NaN,
    handHeld: false,
    fps: 30,
    ...overrides,
  };
}
