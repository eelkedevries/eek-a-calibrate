// What WorkerHost and InlineHost share (spec §4.2, §6 VisionHost): both talk
// to a VisionCore through the frozen ToVision/FromVision messages, so the two
// hosts run identical code and differ only in how a message travels.
import type { EngineId, FrameMeta, FrameResult } from '../core/types.ts';
import type { EngineStatus, FromVision, ProbeResult, ToVision, VisionConfig, VisionHost, VisionInfo } from './protocol.ts';

export interface HostSelection {
  kind: 'worker' | 'inline';
  /** Why this host runs: the default, a ?host= override, or the worker failure that caused the fallback. */
  reason: string;
}

export interface HostError {
  stage: 'landmarker' | 'host' | EngineId;
  message: string;
  recoverable: boolean;
}

export interface HostStats {
  submitted: number;
  /** Frames refused because one was in flight, or because the host was not ready. */
  refused: number;
  results: number;
  restarts: number;
}

/** VisionHost plus the diagnostics the screens show. */
export interface ManagedVisionHost extends VisionHost {
  readonly selection: HostSelection;
  readonly info: VisionInfo | null;
  readonly engineStatus: readonly EngineStatus[];
  /** True while submit() would refuse a frame (one in flight, not ready, restarting or disposed). */
  readonly busy: boolean;
  onError(cb: (error: HostError) => void): () => void;
  stats(): HostStats;
}

interface Waiter<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

/** A probe needs this long plus a second per frame before it is given up. */
const PROBE_BASE_TIMEOUT_MS = 10_000;

export abstract class MessageHost implements ManagedVisionHost {
  abstract readonly kind: 'worker' | 'inline';
  /** Set by the subclass, then by createVisionHost with the reason for the choice. */
  abstract selection: HostSelection;
  info: VisionInfo | null = null;
  engineStatus: readonly EngineStatus[] = [];

  protected cfg: VisionConfig | null = null;
  protected ready = false;
  protected disposed = false;
  protected inFlight = false;
  protected lastMessageMs = 0;
  protected lastEngineIds: EngineId[] = [];
  protected counters: HostStats = { submitted: 0, refused: 0, results: 0, restarts: 0 };

  private initWaiter: Waiter<VisionInfo> | null = null;
  private engineWaiters: Waiter<EngineStatus[]>[] = [];
  private probeWaiter: (Waiter<ProbeResult> & { timer: ReturnType<typeof setTimeout> }) | null = null;
  private probeQueue: Promise<unknown> = Promise.resolve();
  private readonly resultListeners = new Set<(r: FrameResult) => void>();
  private readonly progressListeners = new Set<(asset: string, loaded: number, total: number) => void>();
  private readonly errorListeners = new Set<(e: HostError) => void>();

  protected abstract send(message: ToVision, transfer?: Transferable[]): void;

  get busy(): boolean {
    return this.inFlight || !this.ready || this.disposed;
  }

  /** Releases the transport (terminates the worker); called once by dispose(). */
  protected abstract release(): void;

  init(cfg: VisionConfig, timeoutMs?: number): Promise<VisionInfo> {
    if (this.disposed) return Promise.reject(new Error('The vision host has been disposed.'));
    this.cfg = cfg;
    this.ready = false;
    this.initWaiter?.reject(new Error('Superseded by a new init.'));
    return new Promise<VisionInfo>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = (): void => {
        if (timer !== null) clearTimeout(timer);
        this.initWaiter = null;
      };
      this.initWaiter = {
        resolve: (info) => {
          done();
          resolve(info);
        },
        reject: (error) => {
          done();
          reject(error);
        },
      };
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => this.initWaiter?.reject(new Error(`the ${this.kind} host did not report ready within ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
      }
      this.lastMessageMs = performance.now();
      this.send({ t: 'init', cfg });
    });
  }

  setEngines(ids: EngineId[]): Promise<EngineStatus[]> {
    if (this.disposed) return Promise.reject(new Error('The vision host has been disposed.'));
    this.lastEngineIds = [...ids];
    return new Promise<EngineStatus[]>((resolve, reject) => {
      this.engineWaiters.push({ resolve, reject });
      this.send({ t: 'engines', ids: [...ids] });
    });
  }

  submit(bitmap: ImageBitmap, meta: FrameMeta): boolean {
    if (!this.ready || this.disposed || this.inFlight) {
      bitmap.close();
      this.counters.refused += 1;
      return false;
    }
    this.inFlight = true;
    this.counters.submitted += 1;
    this.send({ t: 'frame', bitmap, meta }, [bitmap]);
    return true;
  }

  onResult(cb: (r: FrameResult) => void): () => void {
    this.resultListeners.add(cb);
    return () => this.resultListeners.delete(cb);
  }

  onProgress(cb: (asset: string, loaded: number, total: number) => void): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  onError(cb: (error: HostError) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  /** Timing over the next `frames` processed frames (spec §6 ProbeResult); one probe runs at a time. */
  probe(frames: number): Promise<ProbeResult> {
    const run = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((resolve, reject) => {
        if (this.disposed) {
          reject(new Error('The vision host has been disposed.'));
          return;
        }
        const timeoutMs = PROBE_BASE_TIMEOUT_MS + Math.max(1, frames) * 1000;
        const timer = setTimeout(() => {
          this.probeWaiter = null;
          reject(new Error(`the probe did not finish within ${Math.round(timeoutMs / 1000)} s (are frames arriving?)`));
        }, timeoutMs);
        this.probeWaiter = { resolve, reject, timer };
        this.send({ t: 'probe', frames });
      });
    const next = this.probeQueue.then(run, run);
    this.probeQueue = next.catch(() => undefined);
    return next;
  }

  resetSession(): void {
    if (!this.disposed) this.send({ t: 'reset-session' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.send({ t: 'dispose' });
    this.disposed = true;
    this.ready = false;
    this.rejectPending(new Error('The vision host has been disposed.'));
    this.release();
    this.resultListeners.clear();
    this.progressListeners.clear();
    this.errorListeners.clear();
  }

  stats(): HostStats {
    return { ...this.counters };
  }

  protected rejectPending(error: Error): void {
    this.initWaiter?.reject(error);
    for (const waiter of this.engineWaiters.splice(0)) waiter.reject(error);
    if (this.probeWaiter) {
      clearTimeout(this.probeWaiter.timer);
      this.probeWaiter.reject(error);
      this.probeWaiter = null;
    }
    this.inFlight = false;
  }

  protected emitError(error: HostError): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (e) {
        console.error('A vision error listener failed', e);
      }
    }
  }

  /** Handles one message from the core. */
  protected receive(message: FromVision): void {
    this.lastMessageMs = performance.now();
    if (this.disposed) return;
    switch (message.t) {
      case 'ready':
        this.info = message.info;
        this.ready = true;
        this.initWaiter?.resolve(message.info);
        break;
      case 'progress':
        for (const listener of this.progressListeners) listener(message.asset, message.loaded, message.total);
        break;
      case 'engines':
        this.engineStatus = message.status;
        this.engineWaiters.shift()?.resolve(message.status);
        break;
      case 'result': {
        this.inFlight = false;
        this.counters.results += 1;
        const result: FrameResult = { ...message.result, receivedMs: performance.now() };
        for (const listener of this.resultListeners) {
          try {
            listener(result);
          } catch (error) {
            console.error('A vision result listener failed', error);
          }
        }
        break;
      }
      case 'probe':
        if (this.probeWaiter) {
          clearTimeout(this.probeWaiter.timer);
          this.probeWaiter.resolve(message.result);
          this.probeWaiter = null;
        }
        break;
      case 'error':
        if (!message.recoverable && this.initWaiter && !this.ready) {
          this.initWaiter.reject(new Error(message.message));
        }
        this.emitError({ stage: message.stage, message: message.message, recoverable: message.recoverable });
        break;
    }
  }
}
