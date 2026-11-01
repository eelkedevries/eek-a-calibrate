// The vision worker (spec §4.2): a module worker running the vision core on
// the module WebAssembly pair. A dedicated worker takes its CSP from its own
// response headers, and a violation inside it never reaches the page, so the
// worker reports violations (and anything uncaught) as console errors, which
// the end-to-end tests see.
import type { ToVision } from './protocol.ts';
import { VisionCore } from './visionCore.ts';

const scope = self as unknown as Worker;

const core = new VisionCore({
  kind: 'worker',
  post: (message, transfer) => scope.postMessage(message, transfer ?? []),
  createCanvas: (width, height) => new OffscreenCanvas(width, height),
});

scope.onmessage = (event: MessageEvent<ToVision>) => {
  core.handle(event.data);
  if (event.data.t === 'dispose') {
    // Let the core release the engines and the landmarker, then end the worker.
    setTimeout(() => self.close(), 0);
  }
};

self.addEventListener('securitypolicyviolation', (event) => {
  console.error(`Content-Security-Policy violation in the vision worker: ${event.violatedDirective} blocked ${event.blockedURI || '(inline)'}`);
});

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  console.error(`Unhandled rejection in the vision worker: ${reason}`);
  scope.postMessage({ t: 'error', stage: 'host', message: `unhandled rejection: ${reason}`, recoverable: true });
});
