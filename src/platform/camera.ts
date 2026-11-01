// Camera capture (spec §4.1, §14.2.2): the request ladder (desktop or mobile)
// with its error messages, the camera picker data, the hidden source <video>
// that drives the frame clock, the mirrored preview, and the camera-change
// event for a change of the delivered track settings. Images never leave this
// device and are never stored. The decisions are pure functions (`cameraRungs`,
// `ladderStep`, `settingsChange`) so that they are unit-tested in Node; nothing
// touches the DOM at import time. Portrait frames are normal: nothing here
// assumes that the delivered width exceeds the height.
import { t } from '../app/strings.en-GB.ts';
import { CAMERA_FPS, CAMERA_LADDER, CAMERA_LADDER_MOBILE } from '../core/constants.ts';
import { sha256Hex } from './assets.ts';
import { detectDeviceClass } from './capabilities.ts';

/** One rung of the ladder: an ideal resolution, or `null` for the final `{video: true}`. */
export type CameraRung = { readonly width: number; readonly height: number } | null;

export type CameraLadder = 'desktop' | 'mobile';

function rungsOf(ladder: readonly (readonly [number, number])[]): readonly CameraRung[] {
  return Object.freeze([...ladder.map(([width, height]) => Object.freeze({ width, height })), null]);
}

/** The desktop ladder: 1280×720, 960×540, 640×480, then `{video: true}`. */
export const CAMERA_RUNGS: readonly CameraRung[] = rungsOf(CAMERA_LADDER);
/** The mobile ladder (§14.2.2): 960×540, 640×480, then `{video: true}`. */
export const CAMERA_RUNGS_MOBILE: readonly CameraRung[] = rungsOf(CAMERA_LADDER_MOBILE);

export function cameraRungs(ladder: CameraLadder): readonly CameraRung[] {
  return ladder === 'mobile' ? CAMERA_RUNGS_MOBILE : CAMERA_RUNGS;
}

export type CameraErrorCode = 'insecure' | 'unsupported' | 'denied' | 'not-found' | 'device-unavailable' | 'in-use' | 'overconstrained' | 'failed';

export type LadderStep = { readonly action: 'retry'; readonly rung: number } | { readonly action: 'fail'; readonly code: CameraErrorCode };

/**
 * What to do after rung `rung` of `rungs` failed with a DOMException named
 * `errorName`. Only OverconstrainedError moves down the ladder (it is never
 * reported as "no camera"); permission, missing-device and busy-device errors
 * stop at once, since a smaller request cannot fix them. An
 * OverconstrainedError on a chosen device's `deviceId` means that camera has
 * gone: no rung can fix it, and it is reported as such, not as "no camera".
 */
export function ladderStep(rung: number, errorName: string, constraint?: string, rungs: readonly CameraRung[] = CAMERA_RUNGS): LadderStep {
  switch (errorName) {
    case 'OverconstrainedError':
      if (constraint === 'deviceId') return { action: 'fail', code: 'device-unavailable' };
      return rung + 1 < rungs.length ? { action: 'retry', rung: rung + 1 } : { action: 'fail', code: 'overconstrained' };
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

/** Walks the ladder (desktop by default) until a stream opens. `getUserMedia` is injectable for tests. */
export async function requestCameraStream(
  opts: { deviceId?: string; ladder?: CameraLadder; getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> } = {},
): Promise<{ stream: MediaStream; rung: number; attempts: LadderAttempt[] }> {
  const gum = opts.getUserMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
  const rungs = cameraRungs(opts.ladder ?? 'desktop');
  const attempts: LadderAttempt[] = [];
  let rung = 0;
  for (;;) {
    try {
      const stream = await gum(cameraConstraints(rungs[rung], opts.deviceId));
      attempts.push({ rung: rungs[rung], error: null });
      return { stream, rung, attempts };
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      const constraint = (error as { constraint?: string }).constraint;
      attempts.push({ rung: rungs[rung], error: name });
      const step = ladderStep(rung, name, constraint, rungs);
      if (step.action === 'fail') throw new CameraError(step.code, error instanceof Error ? `${error.name}: ${error.message}` : String(error), { cause: error });
      rung = step.rung;
    }
  }
}

export interface CameraInfo {
  /** The ladder that was walked: 'mobile' on a phone or small tablet (§14.2.1). */
  ladder: CameraLadder;
  /** Index into cameraRungs(ladder) of the request that succeeded. */
  rung: number;
  /** track.getSettings() when the camera opened (spec §4.1); later changes arrive through CameraSession.onChange. */
  width: number;
  height: number;
  frameRate: number | null;
  label: string;
  /** First 12 hex characters of sha256(deviceId); null when the browser hides the id. */
  deviceIdHash: string | null;
  attempts: LadderAttempt[];
}

/**
 * What the camera delivers: the frame size the frame clock sees (the source video's intrinsic
 * size, as every FrameMeta carries it; 0 while unknown) and the track's frame rate.
 */
export interface DeliveredSettings {
  readonly width: number;
  readonly height: number;
  readonly frameRate: number | null;
}

export type SettingsField = 'width' | 'height' | 'frameRate';

/** Frame rates closer than this (fps) are the same rate: 29.97 against 30 is no camera change. */
export const FRAME_RATE_TOLERANCE = 0.5;
/** How often the delivered settings are re-read, for browsers that fire no event for a change. */
export const SETTINGS_POLL_MS = 1000;

function usableSize(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

/**
 * The fields in which `next` differs from `prev` (§14.2.2: phones may switch resolution on
 * rotation). A frame rate counts only when both are known. Empty when nothing changed, and when
 * `next` has no usable size: a stream that is being reconfigured reports 0 × 0 for a moment,
 * and the size it settles on is compared when it arrives.
 */
export function settingsChange(prev: DeliveredSettings, next: DeliveredSettings): SettingsField[] {
  if (!(usableSize(next.width) && usableSize(next.height))) return [];
  const fields: SettingsField[] = [];
  if (next.width !== prev.width) fields.push('width');
  if (next.height !== prev.height) fields.push('height');
  if (prev.frameRate !== null && next.frameRate !== null && Math.abs(next.frameRate - prev.frameRate) > FRAME_RATE_TOLERANCE) {
    fields.push('frameRate');
  }
  return fields;
}

/** A change of the delivered settings, which the screens treat as a camera change. */
export interface CameraChange {
  readonly previous: DeliveredSettings;
  readonly current: DeliveredSettings;
  readonly fields: readonly SettingsField[];
  /** Main-thread performance.now() when the change was seen. */
  readonly atMs: number;
}

function readDeliveredSettings(track: MediaStreamTrack, video: HTMLVideoElement): DeliveredSettings {
  const frameRate = track.getSettings().frameRate;
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    frameRate: typeof frameRate === 'number' && Number.isFinite(frameRate) && frameRate > 0 ? frameRate : null,
  };
}

/** Runs every listener even if one throws; the error is still reported, asynchronously. */
function notifyAll<T>(listeners: Iterable<(value: T) => void>, value: T): void {
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }
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
 *
 * The delivered settings are re-read on the source video's `resize`, on the
 * track's `configurationchange` where the browser fires it, and every
 * SETTINGS_POLL_MS; each change reaches the `onChange` listeners once.
 */
export class CameraSession {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly source: HTMLVideoElement;
  readonly info: CameraInfo;
  private readonly previews = new Set<HTMLVideoElement>();
  private readonly endedListeners = new Set<() => void>();
  private readonly changeListeners = new Set<(change: CameraChange) => void>();
  private delivered: DeliveredSettings;
  private pollTimer: ReturnType<typeof setInterval> | null;
  private readonly checkSettings = (): void => this.recheck();
  private readonly onTrackEnded = (): void => {
    this.stopWatching();
    if (this.stopped) return;
    notifyAll(this.endedListeners, undefined);
  };
  private stopped = false;

  constructor(stream: MediaStream, source: HTMLVideoElement, info: CameraInfo) {
    this.stream = stream;
    this.track = stream.getVideoTracks()[0];
    this.source = source;
    this.info = info;
    this.delivered = readDeliveredSettings(this.track, source);
    this.track.addEventListener('ended', this.onTrackEnded);
    this.track.addEventListener('configurationchange', this.checkSettings);
    source.addEventListener('resize', this.checkSettings);
    this.pollTimer = setInterval(this.checkSettings, SETTINGS_POLL_MS);
  }

  get running(): boolean {
    return !this.stopped && this.track.readyState === 'live';
  }

  /** The settings the camera delivers now (frame size and frame rate). */
  get settings(): DeliveredSettings {
    return this.delivered;
  }

  /**
   * Called when the delivered frame size or frame rate changes, for example when a phone
   * switches resolution on rotation (§14.2.2). Screens treat it as a camera change.
   */
  onChange(listener: (change: CameraChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private recheck(): void {
    if (!this.running) return;
    const next = readDeliveredSettings(this.track, this.source);
    const fields = settingsChange(this.delivered, next);
    if (fields.length === 0) return;
    const change: CameraChange = { previous: this.delivered, current: next, fields, atMs: performance.now() };
    this.delivered = next;
    notifyAll(this.changeListeners, change);
  }

  private stopWatching(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.track.removeEventListener('configurationchange', this.checkSettings);
    this.source.removeEventListener('resize', this.checkSettings);
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
    this.stopWatching();
    this.track.removeEventListener('ended', this.onTrackEnded);
    for (const track of this.stream.getTracks()) track.stop();
    for (const video of [...this.previews]) this.releasePreview(video);
    this.source.pause();
    this.source.srcObject = null;
    this.source.remove();
    this.endedListeners.clear();
    this.changeListeners.clear();
  }
}

/**
 * Opens the camera through the ladder and starts the hidden source video. The ladder is the
 * mobile one on a phone or small tablet (detectDeviceClass) unless `ladder` says otherwise.
 */
export async function openCamera(opts: { deviceId?: string; ladder?: CameraLadder } = {}): Promise<CameraSession> {
  if (!globalThis.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');

  const ladder = opts.ladder ?? (detectDeviceClass().mobile ? 'mobile' : 'desktop');
  const { stream, rung, attempts } = await requestCameraStream({ deviceId: opts.deviceId, ladder });
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
    ladder,
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
