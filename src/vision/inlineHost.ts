// The fallback host (spec §4.2): the same vision core on the main thread, on
// the classic SIMD (or no-SIMD) WebAssembly pair. Messages are delivered as
// macrotasks, in order, so the page can paint between frames.
import { createScratchCanvas } from '../platform/capabilities.ts';
import { MessageHost, type HostSelection } from './hostBase.ts';
import type { ToVision } from './protocol.ts';
import { VisionCore } from './visionCore.ts';

export class InlineHost extends MessageHost {
  readonly kind = 'inline' as const;
  selection: HostSelection = { kind: 'inline', reason: 'created directly' };
  private readonly core: VisionCore;

  constructor() {
    super();
    this.core = new VisionCore({
      kind: 'inline',
      post: (message) => this.receive(message),
      createCanvas: createScratchCanvas,
    });
  }

  protected send(message: ToVision): void {
    setTimeout(() => this.core.handle(message), 0);
  }

  protected release(): void {
    // The core disposes itself on the 'dispose' message that dispose() sends.
  }
}
