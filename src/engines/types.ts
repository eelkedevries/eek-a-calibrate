// ===== src/engines/types.ts =====
// Contract: specification §6, written verbatim by WP1 (001_scaffold_and_contracts.md).
// Frozen: changing anything here needs a specification version bump.
import type { BackendId, EngineFrame, EngineId, FaceObservation, FrameMeta, MapperId, MapperSpec } from '../core/types.ts';
export type Capability = 'webgl2' | 'wasm-simd' | 'offscreen-canvas';
export type AssetId = 'face-landmarker' | 'mp-module-js' | 'mp-module-wasm' | 'mp-simd-js' | 'mp-simd-wasm'
  | 'mp-nosimd-js' | 'mp-nosimd-wasm' | 'tfjs-wasm' | 'tfjs-wasm-simd' | 'blazegaze-model' | 'peekr-model' | 'ort-wasm' | 'ort-mjs';
export interface RuntimeEnv { baseUrl: string; dev: boolean; inWorker: boolean; crossOriginIsolated: boolean; cores: number;
  webgl2: boolean; wasmSimd: boolean; offscreenCanvas: boolean; e2e: boolean; }
export interface EngineSpec {
  id: EngineId; displayName: string; rank: number; family: 'appearance-fewshot' | 'appearance-cnn' | 'geometric' | 'eye-pixel';
  version: string; featureVersion: string; featureDim: number; licence: { code: string; weights: string | null };
  citation: string; sourceUrl: string; assets: readonly AssetId[]; requires: readonly Capability[];
  frameBudgetMs: number; mappers: readonly MapperId[]; inCombinedByDefault: boolean; downloadBytes: number;
}
export interface FrameImage {
  readonly width: number; readonly height: number; readonly bitmap: ImageBitmap;
  readonly roi: ImageData; readonly roiX: number; readonly roiY: number;
  crop(sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): ImageData;
}
export interface EngineInput { meta: FrameMeta; face: FaceObservation; image: FrameImage; }
export interface EngineContext { env: RuntimeEnv; assetUrl(id: AssetId): string; onProgress(loaded: number, total: number): void; signal: AbortSignal; }
export interface GazeEngine {
  readonly spec: EngineSpec; readonly backend: BackendId;
  warmUp(): Promise<void>; resetSession(): void; extract(input: EngineInput): Promise<EngineFrame>; dispose(): void;
}
export interface EngineModule {
  spec: EngineSpec;
  probe(env: RuntimeEnv): { ok: true } | { ok: false; reason: string };
  create(ctx: EngineContext): Promise<GazeEngine>;
}
export type MapperTable = Readonly<Record<EngineId, readonly MapperSpec[]>>;
// registry.ts: export const ENGINE_LOADERS: Record<EngineId, () => Promise<EngineModule>> (dynamic import per folder)
// mappers.ts:  export const MAPPERS: MapperTable   (pure; imported by the fit worker and the main thread)
