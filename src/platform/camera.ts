// Camera capture (spec §4.1): the request ladder with its error messages, the
// camera picker data, the hidden source <video> that drives the frame clock
// and the mirrored preview. Images never leave this device and are never
// stored. The ladder decision is a pure function (`ladderStep`) so that it is
// unit-tested in Node; nothing touches the DOM at import time.
import { t } from '../app/strings.en-GB.ts';
import { CAMERA_FPS, CAMERA_LADDER } from '../core/constants.ts';
import { sha256Hex } from './assets.ts';

/** One rung of the ladder: an ideal resolution, or `null` for the final `{video: true}`. */
export type CameraRung = { readonly width: number; readonly height: number } | null;

export const CAMERA_RUNGS: readonly CameraRung[] = [...CAMERA_LADDER.map(([width, height]) => ({ width, height })), null];

export type CameraErrorCode = 'insecure' | 'unsupported' | 'denied' | 'not-found' | 'device-unavailable' | 'in-use' | 'overconstrained' | 'failed';

export type LadderStep = { readonly action: 'retry'; readonly rung: number } | { readonly action: 'fail'; readonly code: CameraErrorCode };

/**
 * What to do after rung `rung` failed with a DOMException named `errorName`.
 * Only OverconstrainedError moves down the ladder (it is never reported as
 * "no camera"); permission, missing-device and busy-device errors stop at
 * once, since a smaller request cannot fix them. An OverconstrainedError on a
 * chosen device's `deviceId` means that camera has gone: no rung can fix it,
 * and it is reported as such, not as "no camera".
 */
export function ladderStep(rung: number, errorName: string, constraint?: string): LadderStep {
  switch (errorName) {
    case 'OverconstrainedError':
      if (constraint === 'deviceId') return { action: 'fail', code: 'device-unavailable' };
      return rung + 1 < CAMERA_RUNGS.length ? { action: 'retry', rung: rung + 1 } : { action: 'fail', code: 'overconstrained' };
    case 'NotAllowedError':
    case 'SecurityError':
      return { action: 'fail', code: 'denied' };
    case 'NotFoundError':
      return { action: 'fail', code: 'not-found' };
    case 'NotReadableError':
      return { action: 'fail', code: 'in-use' };
    default:
      return { action: 'fail', code: 'failed' };
  }
}

/** The getUserMedia constraints for one rung; a chosen device replaces `facingMode`. */
export function cameraConstraints(rung: CameraRung, deviceId?: string): MediaStreamConstraints {
  const device: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : {};
  if (rung === null) return { audio: false, video: deviceId ? device : true };
  return {
    audio: false,
    video: {
      ...(deviceId ? device : { facingMode: 'user' }),
      width: { ideal: rung.width },
      height: { ideal: rung.height },
      frameRate: { ideal: CAMERA_FPS, max: CAMERA_FPS },
    },
  };
}

export function cameraErrorMessage(code: CameraErrorCode, detail?: string): string {
  const message = t(`camera.error.${code}`);
  return code === 'failed' && detail ? `${message} (${detail})` : message;
}

export class CameraError extends Error {
  readonly code: CameraErrorCode;
  constructor(code: CameraErrorCode, detail?: string, options?: { cause?: unknown }) {
    super(cameraErrorMessage(code, detail), options);
    this.name = 'CameraError';
    this.code = code;
  }
}

export interface LadderAttempt {
  rung: CameraRung;
  error: string | null;
}

/** Walks the ladder until a stream opens. `getUserMedia` is injectable for tests. */
export async function requestCameraStream(
  opts: { deviceId?: string; getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> } = {},
): Promise<{ stream: MediaStream; rung: number; attempts: LadderAttempt[] }> {
  const gum = opts.getUserMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
  const attempts: LadderAttempt[] = [];
  let rung = 0;
  for (;;) {
    try {
      const stream = await gum(cameraConstraints(CAMERA_RUNGS[rung], opts.deviceId));
      attempts.push({ rung: CAMERA_RUNGS[rung], error: null });
      return { stream, rung, attempts };
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      const constraint = (error as { constraint?: string }).constraint;
      attempts.push({ rung: CAMERA_RUNGS[rung], error: name });
      const step = ladderStep(rung, name, constraint);
      if (step.action === 'fail') throw new CameraError(step.code, error instanceof Error ? `${error.name}: ${error.message}` : String(error), { cause: error });
      rung = step.rung;
    }
  }
}

export interface CameraInfo {
  /** Index into CAMERA_RUNGS of the request that succeeded. */
  rung: number;
  width: number;
  height: number;
  frameRate: number | null;
  label: string;
  /** First 12 hex characters of sha256(deviceId); null when the browser hides the id. */
  deviceIdHash: string | null;
  attempts: LadderAttempt[];
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** Cameras for the picker. Labels and ids are only meaningful once permission has been granted. */
export async function listCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput' && d.deviceId !== '')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || t('camera.unnamed', { n: i + 1 }) }));
}

function makeVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.disablePictureInPicture = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.srcObject = stream;
  return video;
}

async function startVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve, reject) => {
      const done = (): void => {
        video.removeEventListener('loadedmetadata', done);
        video.removeEventListener('error', fail);
        resolve();
      };
      const fail = (): void => {
        video.removeEventListener('loadedmetadata', done);
        video.removeEventListener('error', fail);
        reject(new CameraError('failed', 'the video element could not play the camera stream'));
      };
      video.addEventListener('loadedmetadata', done);
      video.addEventListener('error', fail);
    });
  }
  await video.play();
}

/**
 * A running camera. `source` is the hidden video the frame clock reads; it is
 * fixed at 2×2 CSS px with opacity 0.01 and never transformed or display:none,
 * because a hidden, transformed or occluded video throttles or stops frame
 * delivery [IMPL §7, GL]. Previews are separate videos on the same stream,
 * mirrored with CSS.
 */
export class CameraSession {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly source: HTMLVideoElement;
  readonly info: CameraInfo;
  private readonly previews = new Set<HTMLVideoElement>();
  private readonly endedListeners = new Set<() => void>();
  private stopped = false;

  constructor(stream: MediaStream, source: HTMLVideoElement, info: CameraInfo) {
    this.stream = stream;
    this.track = stream.getVideoTracks()[0];
    this.source = source;
    this.info = info;
    this.track.addEventListener('ended', () => {
      if (this.stopped) return;
      for (const listener of this.endedListeners) listener();
    });
  }

  get running(): boolean {
    return !this.stopped && this.track.readyState === 'live';
  }

  /** A new mirrored preview video on the same stream; the caller places it. */
  createPreview(className = 'camera-preview'): HTMLVideoElement {
    const video = makeVideo(this.stream);
    video.className = className;
    video.style.transform = 'scaleX(-1)';
    this.previews.add(video);
    void video.play().catch(() => undefined);
    return video;
  }

  releasePreview(video: HTMLVideoElement): void {
    video.pause();
    video.srcObject = null;
    video.remove();
    this.previews.delete(video);
  }

  /** Called when the browser or the user ends the track (unplugged camera, revoked permission). */
  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const track of this.stream.getTracks()) track.stop();
    for (const video of [...this.previews]) this.releasePreview(video);
    this.source.pause();
    this.source.srcObject = null;
    this.source.remove();
    this.endedListeners.clear();
  }
}

/** Opens the camera through the ladder and starts the hidden source video. */
export async function openCamera(opts: { deviceId?: string } = {}): Promise<CameraSession> {
  if (!globalThis.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');

  const { stream, rung, attempts } = await requestCameraStream({ deviceId: opts.deviceId });
  const track = stream.getVideoTracks()[0];
  if (!track) {
    for (const tr of stream.getTracks()) tr.stop();
    throw new CameraError('not-found');
  }

  const source = makeVideo(stream);
  source.className = 'camera-source';
  Object.assign(source.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '2px',
    height: '2px',
    opacity: '0.01',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });
  document.body.append(source);
  try {
    await startVideo(source);
  } catch (error) {
    for (const tr of stream.getTracks()) tr.stop();
    source.srcObject = null;
    source.remove();
    throw error instanceof CameraError ? error : new CameraError('failed', error instanceof Error ? error.message : String(error), { cause: error });
  }

  const settings = track.getSettings();
  const deviceId = settings.deviceId ?? '';
  let deviceIdHash: string | null = null;
  if (deviceId !== '') {
    try {
      deviceIdHash = (await sha256Hex(new TextEncoder().encode(deviceId))).slice(0, 12);
    } catch {
      deviceIdHash = null;
    }
  }
  const info: CameraInfo = {
    rung,
    width: settings.width ?? source.videoWidth,
    height: settings.height ?? source.videoHeight,
    frameRate: typeof settings.frameRate === 'number' ? settings.frameRate : null,
    label: track.label,
    deviceIdHash,
    attempts,
  };
  return new CameraSession(stream, source, info);
}
