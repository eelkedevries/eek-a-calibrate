// The frame clock (spec §4.1). requestVideoFrameCallback on the hidden source
// video stamps every new camera frame in the main-thread performance.now()
// domain, makes an ImageBitmap of it and submits it to the vision host, which
// takes at most one frame at a time. A frame that arrives while the host is
// busy is dropped without a snapshot (unless a tap needs every frame). If rVFC
// goes quiet for RVFC_STALL_MS while the video plays, a rAF poll takes over
// until rVFC callbacks return.
//
// The decision logic (FrameDeduper, captureStamp) is pure and unit-tested in
// Node; the DOM-facing FrameClock and watchPauseConditions use it.
import { RVFC_STALL_MS } from '../core/constants.ts';
import type { FrameMeta } from '../core/types.ts';
import { isFullscreen, onFullscreenChange } from './fullscreen.ts';

export type ClockSource = FrameMeta['clock'];

/** tCaptureMs from captureTime, else expectedDisplayTime, else the callback's `now`. */
export function captureStamp(metadata: { captureTime?: number; expectedDisplayTime?: number }, now: number): { tCaptureMs: number; clock: ClockSource } {
  const capture = metadata.captureTime;
  if (typeof capture === 'number' && Number.isFinite(capture) && capture > 0) return { tCaptureMs: capture, clock: 'captureTime' };
  const display = metadata.expectedDisplayTime;
  if (typeof display === 'number' && Number.isFinite(display) && display > 0) return { tCaptureMs: display, clock: 'expectedDisplayTime' };
  return { tCaptureMs: now, clock: 'callback' };
}

export interface FrameDecision {
  /** True for a frame not seen before. */
  isNew: boolean;
  /** Camera frames skipped since the previous new frame (Δ counter − 1). */
  cameraGap: number;
  /** The counter went backwards (a new stream on the element): the frame counts as new with no gap. */
  reset: boolean;
  /** The value reported as FrameMeta.presentedFrames. */
  presentedFrames: number;
}

/**
 * New-frame detection. In rVFC mode a frame is new only if presentedFrames
 * increased. In poll mode it is new when getVideoPlaybackQuality's
 * totalVideoFrames increased or, where that is unavailable, when currentTime
 * changed (with no gap information). Switching mode resets the baseline,
 * since the two counters are unrelated.
 */
export class FrameDeduper {
  private mode: 'rvfc' | 'poll' | null = null;
  private lastCount: number | null = null;
  private lastTime: number | null = null;
  private synthetic = 0;

  rvfc(presentedFrames: number): FrameDecision {
    if (this.mode !== 'rvfc') this.switchTo('rvfc');
    return this.count(presentedFrames);
  }

  poll(totalVideoFrames: number | null, currentTime: number): FrameDecision {
    if (this.mode !== 'poll') this.switchTo('poll');
    if (totalVideoFrames !== null && Number.isFinite(totalVideoFrames)) return this.count(totalVideoFrames);
    if (this.lastTime !== null && currentTime === this.lastTime) {
      return { isNew: false, cameraGap: 0, reset: false, presentedFrames: this.synthetic };
    }
    this.lastTime = currentTime;
    this.synthetic += 1;
    return { isNew: true, cameraGap: 0, reset: false, presentedFrames: this.synthetic };
  }

  reset(): void {
    this.mode = null;
    this.lastCount = null;
    this.lastTime = null;
  }

  private switchTo(mode: 'rvfc' | 'poll'): void {
    this.reset();
    this.mode = mode;
  }

  private count(value: number): FrameDecision {
    const last = this.lastCount;
    if (last === null) {
      this.lastCount = value;
      return { isNew: true, cameraGap: 0, reset: false, presentedFrames: value };
    }
    if (value > last) {
      this.lastCount = value;
      return { isNew: true, cameraGap: value - last - 1, reset: false, presentedFrames: value };
    }
    if (value < last) {
      this.lastCount = value;
      return { isNew: true, cameraGap: 0, reset: true, presentedFrames: value };
    }
    return { isNew: false, cameraGap: 0, reset: false, presentedFrames: value };
  }
}

export interface FrameSink {
  /** False when busy; the sink then closes the bitmap (VisionHost.submit). */
  submit(bitmap: ImageBitmap, meta: FrameMeta): boolean;
  /** True while submit() would refuse a frame (ManagedVisionHost.busy); absent means unknown. */
  readonly busy?: boolean;
}

/**
 * Whether a new frame needs an ImageBitmap: not when the sink says it is busy and no tap needs
 * every frame, since the bitmap would be made only to be closed unused. The frame then counts as
 * dropped, as a refused one does.
 */
export function needsSnapshot(sinkBusy: boolean | undefined, hasTap: boolean): boolean {
  return hasTap || sinkBusy !== true;
}

export interface FrameClockStats {
  /** New frames seen (FrameMeta.index runs over these). */
  delivered: number;
  submitted: number;
  /** New frames the host refused, or that arrived while it was busy, because a frame was in flight. */
  dropped: number;
  /** Frames whose ImageBitmap could not be made. */
  failed: number;
  /** Sum of cameraGap: frames the camera produced that the clock never saw. */
  cameraGapFrames: number;
  mode: 'rvfc' | 'poll' | 'stopped';
  /** Times the clock fell back to polling. */
  pollFallbacks: number;
  lastClock: ClockSource | null;
  lastCaptureMs: number | null;
}

export interface FrameClockOptions {
  /**
   * Called synchronously with each new frame's bitmap before it is submitted
   * (and transferred). The bitmap must not be closed or kept; draw it if a
   * copy is needed (the diagnostics screen does this).
   */
  tap?(bitmap: ImageBitmap, meta: FrameMeta): void;
  /** After each new frame: whether the sink took it. */
  onFrame?(meta: FrameMeta, submitted: boolean): void;
  onModeChange?(mode: 'rvfc' | 'poll', atMs: number): void;
  onError?(error: unknown): void;
}

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class FrameClock {
  private readonly video: RvfcVideo;
  private readonly sink: FrameSink;
  private readonly opts: FrameClockOptions;
  private readonly dedupe = new FrameDeduper();
  private running = false;
  private rvfcHandle: number | null = null;
  private rafHandle: number | null = null;
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private lastCallbackMs = 0;
  private mode: 'rvfc' | 'poll' = 'rvfc';
  private nextIndex = 0;
  private readonly counters: Omit<FrameClockStats, 'mode' | 'lastClock' | 'lastCaptureMs'> = {
    delivered: 0,
    submitted: 0,
    dropped: 0,
    failed: 0,
    cameraGapFrames: 0,
    pollFallbacks: 0,
  };
  private lastClock: ClockSource | null = null;
  private lastCaptureMs: number | null = null;

  constructor(video: HTMLVideoElement, sink: FrameSink, opts: FrameClockOptions = {}) {
    this.video = video as RvfcVideo;
    this.sink = sink;
    this.opts = opts;
  }

  get hasVideoFrameCallback(): boolean {
    return typeof this.video.requestVideoFrameCallback === 'function';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.dedupe.reset();
    this.lastCallbackMs = performance.now();
    if (this.hasVideoFrameCallback) {
      this.mode = 'rvfc';
      this.armRvfc();
      this.stallTimer = setInterval(() => this.checkStall(), Math.max(50, RVFC_STALL_MS / 5));
    } else {
      this.enterPoll(performance.now());
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rvfcHandle !== null) this.video.cancelVideoFrameCallback?.(this.rvfcHandle);
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    if (this.stallTimer !== null) clearInterval(this.stallTimer);
    this.rvfcHandle = null;
    this.rafHandle = null;
    this.stallTimer = null;
  }

  stats(): FrameClockStats {
    return { ...this.counters, mode: this.running ? this.mode : 'stopped', lastClock: this.lastClock, lastCaptureMs: this.lastCaptureMs };
  }

  private armRvfc(): void {
    this.rvfcHandle = this.video.requestVideoFrameCallback!((now, metadata) => this.onVideoFrame(now, metadata));
  }

  private onVideoFrame(now: number, metadata: VideoFrameCallbackMetadata): void {
    if (!this.running) return;
    this.armRvfc();
    this.lastCallbackMs = performance.now();
    if (this.mode === 'poll') {
      if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
      this.mode = 'rvfc';
      this.opts.onModeChange?.('rvfc', now);
    }
    const decision = this.dedupe.rvfc(metadata.presentedFrames);
    if (!decision.isNew) return;
    const stamp = captureStamp(metadata, now);
    this.emit(decision, stamp.tCaptureMs, stamp.clock, metadata.width, metadata.height);
  }

  private checkStall(): void {
    if (!this.running || this.mode !== 'rvfc') return;
    const now = performance.now();
    // A hidden tab or a paused video delivers no frames by design; that is a pause, not a stall.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      this.lastCallbackMs = now;
      return;
    }
    if (this.video.paused || this.video.ended || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.lastCallbackMs = now;
      return;
    }
    if (now - this.lastCallbackMs > RVFC_STALL_MS) this.enterPoll(now);
  }

  private enterPoll(atMs: number): void {
    this.mode = 'poll';
    this.counters.pollFallbacks += 1;
    this.opts.onModeChange?.('poll', atMs);
    const tick = (now: number): void => {
      if (!this.running || this.mode !== 'poll') return;
      this.rafHandle = requestAnimationFrame(tick);
      const quality = typeof this.video.getVideoPlaybackQuality === 'function' ? this.video.getVideoPlaybackQuality() : null;
      const decision = this.dedupe.poll(quality ? quality.totalVideoFrames : null, this.video.currentTime);
      if (!decision.isNew) return;
      this.emit(decision, now, 'poll', this.video.videoWidth, this.video.videoHeight);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private emit(decision: FrameDecision, tCaptureMs: number, clock: ClockSource, width: number, height: number): void {
    const videoW = width > 0 ? width : this.video.videoWidth;
    const videoH = height > 0 ? height : this.video.videoHeight;
    if (!(videoW > 0 && videoH > 0)) return;
    const meta: FrameMeta = {
      index: this.nextIndex++,
      tCaptureMs,
      clock,
      presentedFrames: decision.presentedFrames,
      cameraGap: decision.cameraGap,
      videoW,
      videoH,
    };
    this.counters.delivered += 1;
    this.counters.cameraGapFrames += decision.cameraGap;
    this.lastClock = clock;
    this.lastCaptureMs = tCaptureMs;
    if (!needsSnapshot(this.sink.busy, this.opts.tap !== undefined)) {
      this.counters.dropped += 1;
      this.opts.onFrame?.(meta, false);
      return;
    }
    let pending: Promise<ImageBitmap>;
    try {
      pending = createImageBitmap(this.video);
    } catch (error) {
      this.fail(meta, error);
      return;
    }
    pending.then(
      (bitmap) => {
        if (!this.running) {
          bitmap.close();
          return;
        }
        if (bitmap.width !== videoW || bitmap.height !== videoH) {
          // The stream changed size between the callback and the snapshot.
          meta.videoW = bitmap.width;
          meta.videoH = bitmap.height;
        }
        try {
          this.opts.tap?.(bitmap, meta);
        } catch (error) {
          this.opts.onError?.(error);
        }
        const taken = this.sink.submit(bitmap, meta);
        if (taken) this.counters.submitted += 1;
        else this.counters.dropped += 1;
        this.opts.onFrame?.(meta, taken);
      },
      (error: unknown) => this.fail(meta, error),
    );
  }

  private fail(meta: FrameMeta, error: unknown): void {
    this.counters.failed += 1;
    this.opts.onError?.(error);
    this.opts.onFrame?.(meta, false);
  }
}

export type PauseReason = 'hidden' | 'fullscreen-exit' | 'resize' | 'dpr';

/**
 * Reports the conditions that pause an active phase (spec §4.1): the tab
 * becoming hidden, leaving fullscreen, a window or visual-viewport resize, and
 * a devicePixelRatio change. Timestamps are main-thread performance.now().
 */
export function watchPauseConditions(onPause: (reason: PauseReason, atMs: number) => void): () => void {
  const cleanups: (() => void)[] = [];
  const fire = (reason: PauseReason) => onPause(reason, performance.now());

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') fire('hidden');
  };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  let wasFullscreen = isFullscreen();
  cleanups.push(
    onFullscreenChange((now) => {
      if (wasFullscreen && !now) fire('fullscreen-exit');
      wasFullscreen = now;
    }),
  );

  const onResize = (): void => fire('resize');
  window.addEventListener('resize', onResize);
  cleanups.push(() => window.removeEventListener('resize', onResize));
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', onResize);
    cleanups.push(() => vv.removeEventListener('resize', onResize));
  }

  // A resolution query matches only the current ratio, so it is re-armed after each change.
  let dprQuery: MediaQueryList | null = null;
  const onDpr = (): void => {
    fire('dpr');
    armDpr();
  };
  const armDpr = (): void => {
    dprQuery?.removeEventListener('change', onDpr);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', onDpr);
  };
  armDpr();
  cleanups.push(() => dprQuery?.removeEventListener('change', onDpr));

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}
