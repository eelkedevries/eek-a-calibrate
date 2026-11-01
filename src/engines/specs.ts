// Every engine's static spec (spec §16.4), without its code: the main thread reads names,
// licences, sizes and feature versions from here, so showing the engine list or starting a fit
// downloads no engine module. The registry's modules export the same objects.
import type { EngineId } from '../core/types.ts';
import { spec as blazegaze } from './blazegaze/spec.ts';
import { spec as eyepixel } from './eyepixel/spec.ts';
import { spec as geometric } from './geometric/spec.ts';
import { spec as peekr } from './peekr/spec.ts';
import type { EngineSpec } from './types.ts';

export const ENGINE_SPECS: Readonly<Record<EngineId, EngineSpec>> = { blazegaze, peekr, geometric, eyepixel };
