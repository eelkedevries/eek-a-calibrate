// Contract (spec §6, engines/types.ts): one dynamic import per engine folder, so
// an engine's runtime is downloaded only once it is selected. Each
// src/engines/<id>/index.ts default-exports its EngineModule. Frozen (WP1).
import type { EngineId } from '../core/types.ts';
import type { EngineModule } from './types.ts';

export const ENGINE_LOADERS: Record<EngineId, () => Promise<EngineModule>> = {
  blazegaze: () => import('./blazegaze/index.ts').then((m) => m.default),
  peekr: () => import('./peekr/index.ts').then((m) => m.default),
  geometric: () => import('./geometric/index.ts').then((m) => m.default),
  eyepixel: () => import('./eyepixel/index.ts').then((m) => m.default),
};
