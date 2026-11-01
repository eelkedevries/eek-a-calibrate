// Contract (spec §6, engines/types.ts): every engine's mapper candidates in one
// pure table, imported by the fit worker and the main thread. Each
// src/engines/<id>/mappers.ts exports `mappers`. Frozen (WP1).
import type { MapperTable } from './types.ts';
import { mappers as blazegaze } from './blazegaze/mappers.ts';
import { mappers as peekr } from './peekr/mappers.ts';
import { mappers as geometric } from './geometric/mappers.ts';
import { mappers as eyepixel } from './eyepixel/mappers.ts';

export const MAPPERS: MapperTable = { blazegaze, peekr, geometric, eyepixel };
