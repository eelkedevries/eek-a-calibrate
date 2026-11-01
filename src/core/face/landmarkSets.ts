// MediaPipe Face Landmarker indices and the layout of FaceObservation arrays
// (spec §4.3). 478 points: the 468-point mesh plus 10 iris points.
//
// Anatomical names: "R" is the subject's right eye, which appears on the image
// left of an unmirrored frame; "L" is the subject's left eye.
//
// `FaceObservation.landmarks` is a Float32Array of LANDMARK_COUNT × 3 values,
// interleaved (x, y, z) per point. x and y are normalised to the video width
// and height of the unmirrored frame (0 = left/top, 1 = right/bottom; points
// may lie slightly outside [0, 1]); z is MediaPipe's relative depth, on
// roughly the same scale as x. Landmark `visibility` is never used: MediaPipe
// 0.10.35 always reports it as 0 [PG].

export const LANDMARK_COUNT = 478;
export const LANDMARK_STRIDE = 3;
export const MESH_COUNT = 468;

export interface EyeIndices {
  readonly outer: number;
  readonly inner: number;
  readonly top: number;
  readonly bottom: number;
  readonly iris: number;
  /** Iris ring in the order image-right, top, image-left, bottom. */
  readonly ring: readonly [number, number, number, number];
}

export const EYE_R: EyeIndices = { outer: 33, inner: 133, top: 159, bottom: 145, iris: 468, ring: [469, 470, 471, 472] };
export const EYE_L: EyeIndices = { outer: 263, inner: 362, top: 386, bottom: 374, iris: 473, ring: [474, 475, 476, 477] };

/** gaze-lite's 4-point EAR, per eye: outer corner, inner corner, top lid, bottom lid. */
export const EAR4_R = [EYE_R.outer, EYE_R.inner, EYE_R.top, EYE_R.bottom] as const;
export const EAR4_L = [EYE_L.outer, EYE_L.inner, EYE_L.top, EYE_L.bottom] as const;

/** Soukupová–Čech 6-point EAR in WebEyeTrack's order p1…p6: EAR = (‖p2−p6‖+‖p3−p5‖)/(2‖p1−p4‖). */
export const EAR6_R = [133, 158, 160, 33, 144, 153] as const;
export const EAR6_L = [362, 385, 387, 263, 373, 380] as const;

/** gaze-lite's 16-point lid contours (the eye-pixel boxes). */
export const CONTOUR_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
export const CONTOUR_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;

/**
 * Left–right mirror pairs used to reproduce Peekr's legacy FaceMesh input
 * (spec §2.2 item 3, §4.6.3), verified on the canonical face model (x → −x).
 * Each pair is [subject-right point, subject-left point].
 */
export const PEEKR_MIRROR_PAIRS = [
  [130, 359],
  [27, 257],
  [243, 463],
  [23, 253],
] as const;

/**
 * The 52 blendshape categories of face_blendshapes.tflite, in model order.
 * `FaceObservation.blendshapes[i]` holds the score of BLENDSHAPE_NAMES[i]
 * (NaN when MediaPipe did not report that category for the frame).
 */
export const BLENDSHAPE_NAMES = [
  '_neutral',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
] as const;

export type BlendshapeName = (typeof BLENDSHAPE_NAMES)[number];
export const BLENDSHAPE_COUNT = BLENDSHAPE_NAMES.length;

export const BLENDSHAPE_INDEX: Readonly<Record<BlendshapeName, number>> = Object.freeze(
  Object.fromEntries(BLENDSHAPE_NAMES.map((name, i) => [name, i])) as Record<BlendshapeName, number>,
);

/** The score of one blendshape, or NaN when it is absent. */
export function blendshape(scores: ArrayLike<number>, name: BlendshapeName): number {
  const value = scores[BLENDSHAPE_INDEX[name]];
  return value === undefined ? Number.NaN : value;
}

export function lmX(landmarks: ArrayLike<number>, i: number): number {
  return landmarks[i * LANDMARK_STRIDE];
}

export function lmY(landmarks: ArrayLike<number>, i: number): number {
  return landmarks[i * LANDMARK_STRIDE + 1];
}

export function lmZ(landmarks: ArrayLike<number>, i: number): number {
  return landmarks[i * LANDMARK_STRIDE + 2];
}
