// The default host (spec §4.2): the vision core in a module worker. A worker
// that dies (an uncaught crash, or silence while a frame is in flight for
// HOST_INIT_TIMEOUT_MS) is replaced by a fresh one with the same configuration
// and engine selection; consumers keep the same host object throughout.
import { HOST_INIT_TIMEOUT_MS } from '../core/constants.ts';
import { MessageHost, type HostSelection } from './hostBase.ts';
import type { FromVision, ToVision, VisionInfo } from './protocol.ts';

/** More restarts than this within RESTART_WINDOW_MS means the worker cannot run here. */
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 60_000;
const WATCHDOG_INTERVAL_MS = 1000;

export class WorkerHost extends MessageHost {
  readonly kind = 'worker' as const;
  selection: HostSelection = { kind: 'worker', reason: 'default' };
  private worker: Worker | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private restarting = false;
  private failed = false;
  private readonly restartTimes: number[] = [];

  constructor() {
    super();
    this.spawn();
    this.watchdog = setInterval(() => this.checkAlive(), WATCHDOG_INTERVAL_MS);
  }

  private spawn(): void {
    const worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module', name: 'eek-a-calibrate vision' });
    worker.onmessage = (event: MessageEvent<FromVision>) => {
      if (worker === this.worker) this.receive(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      if (worker !== this.worker) return;
      event.preventDefault();
      const message = event.message || 'the vision worker failed to start or threw an uncaught error';
      if (!this.ready && !this.restarting) {
        this.rejectPending(new Error(message));
        return;
      }
      this.emitError({ stage: 'host', message, recoverable: true });
    };
    worker.onmessageerror = () => {
      if (worker === this.worker) this.emitError({ stage: 'host', message: 'a message from the vision worker could not be read', recoverable: true });
    };
    this.worker = worker;
  }

  protected send(message: ToVision, transfer?: Transferable[]): void {
    if (!this.worker) {
      if (message.t === 'frame') message.bitmap.close();
      return;
    }
    this.worker.postMessage(message, transfer ?? []);
  }

  protected release(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private checkAlive(): void {
    if (this.disposed || this.restarting || this.failed || !this.ready || !this.inFlight) return;
    if (performance.now() - this.lastMessageMs > HOST_INIT_TIMEOUT_MS) {
      void this.restart(`no answer for ${Math.round(HOST_INIT_TIMEOUT_MS / 1000)} s`);
    }
  }

  /** Test hook (failures.spec.ts): kills the worker as a crash would, then recovers. */
  simulateCrash(): void {
    if (this.disposed || this.restarting) return;
    this.worker?.terminate();
    void this.restart('simulated crash');
  }

  private async restart(reason: string): Promise<VisionInfo | null> {
    if (this.disposed || this.restarting || !this.cfg) return null;
    this.restarting = true;
    const now = performance.now();
    this.restartTimes.push(now);
    while (this.restartTimes.length > 0 && now - this.restartTimes[0] > RESTART_WINDOW_MS) this.restartTimes.shift();
    this.counters.restarts += 1;

    this.ready = false;
    this.worker?.terminate();
    this.worker = null;
    this.rejectPending(new Error(`The vision worker restarted (${reason}).`));

    if (this.restartTimes.length > MAX_RESTARTS) {
      this.failed = true;
      this.restarting = false;
      this.emitError({ stage: 'host', message: `The vision worker stopped (${reason}) and has restarted too often; it was not restarted again.`, recoverable: false });
      return null;
    }
    this.emitError({ stage: 'host', message: `The vision worker stopped (${reason}); it is being restarted.`, recoverable: true });
    try {
      this.spawn();
      const info = await this.init(this.cfg, HOST_INIT_TIMEOUT_MS);
      if (this.lastEngineIds.length > 0) await this.setEngines(this.lastEngineIds);
      return info;
    } catch (error) {
      this.failed = true;
      this.emitError({ stage: 'host', message: `The vision worker could not be restarted: ${error instanceof Error ? error.message : String(error)}`, recoverable: false });
      return null;
    } finally {
      this.restarting = false;
    }
  }
}
