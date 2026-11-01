// Host selection (spec §4.2): `createVisionHost`, declared in protocol.ts.
// `?host=worker|inline` overrides the choice. Otherwise the worker host is
// tried; if it raises an error or does not report ready within
// HOST_INIT_TIMEOUT_MS it is disposed and the inline host starts. The kind and
// the reason are recorded on the host (`selection`) and logged.
import { HOST_INIT_TIMEOUT_MS } from '../core/constants.ts';
import { defaultDelegate } from '../platform/capabilities.ts';
import type { HostSelection, ManagedVisionHost, MessageHost } from './hostBase.ts';
import type { VisionConfig } from './protocol.ts';
import { WorkerHost } from './workerHost.ts';

export type { HostError, HostSelection, HostStats, ManagedVisionHost } from './hostBase.ts';

const live = new Set<MessageHost>();

/** The configuration for this build: base path, gzip in production, phones and tablets on the CPU delegate. */
export function defaultVisionConfig(opts: { e2e: boolean; force: 'cpu' | null; delegate?: 'GPU' | 'CPU' | null }): VisionConfig {
  const dev = import.meta.env.DEV;
  // `?delegate=` overrides the choice. Test mode defaults to the CPU delegate, which runs at
  // realistic frame rates where the GPU is only emulated in software.
  const delegate = opts.delegate ?? (opts.e2e ? 'CPU' : defaultDelegate());
  const cfg: VisionConfig = { baseUrl: import.meta.env.BASE_URL, dev, gz: !dev, delegate, e2e: opts.e2e };
  if (opts.force === 'cpu') cfg.forceBackend = 'tfjs-cpu';
  return cfg;
}

function track<T extends MessageHost>(host: T, selection: HostSelection): T {
  host.selection = selection;
  live.add(host);
  const dispose = host.dispose.bind(host);
  host.dispose = () => {
    live.delete(host);
    dispose();
  };
  console.info(`Vision host: ${selection.kind} (${selection.reason})`);
  return host;
}

async function startInline(cfg: VisionConfig, reason: string): Promise<ManagedVisionHost> {
  const { InlineHost } = await import('./inlineHost.ts');
  const host = new InlineHost();
  try {
    await host.init(cfg);
  } catch (error) {
    host.dispose();
    throw error;
  }
  return track(host, { kind: 'inline', reason });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createVisionHost(cfg: VisionConfig, prefer?: 'worker' | 'inline'): Promise<ManagedVisionHost> {
  if (prefer === 'inline') return startInline(cfg, 'requested with ?host=inline');
  if (typeof Worker !== 'function') {
    if (prefer === 'worker') throw new Error('This browser has no Web Workers.');
    return startInline(cfg, 'this browser has no Web Workers');
  }
  let worker: WorkerHost | null = null;
  try {
    worker = new WorkerHost();
    await worker.init(cfg, HOST_INIT_TIMEOUT_MS);
    return track(worker, { kind: 'worker', reason: prefer === 'worker' ? 'requested with ?host=worker' : 'default' });
  } catch (error) {
    worker?.dispose();
    if (prefer === 'worker') throw error;
    const reason = `the worker host failed: ${describe(error)}`;
    console.warn(`Vision host: falling back to the inline host, because ${reason}`);
    return startInline(cfg, reason);
  }
}

/** Kills every live worker host's worker as a crash would; each restarts itself. Returns how many were crashed. */
export function crashWorkerHosts(): number {
  let n = 0;
  for (const host of live) {
    if (host instanceof WorkerHost) {
      host.simulateCrash();
      n += 1;
    }
  }
  return n;
}
