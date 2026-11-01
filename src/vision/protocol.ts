// ===== src/vision/protocol.ts =====
// Contract: specification §6, written verbatim by WP1 (001_scaffold_and_contracts.md).
// Frozen: changing anything here needs a specification version bump.
// createVisionHost is declared here and implemented by WP4 in src/vision/host.ts.
import type { BackendId, EngineId, FrameMeta, FrameResult } from '../core/types.ts';
export interface VisionConfig { baseUrl: string; dev: boolean; gz: boolean; delegate: 'GPU' | 'CPU'; e2e: boolean; forceBackend?: BackendId; }
export interface VisionInfo { kind: 'worker' | 'inline'; delegate: 'GPU' | 'CPU'; wasmVariant: 'module' | 'simd' | 'nosimd';
  mediapipe: '0.10.35'; modelSha256: string; initMs: number; }
export interface EngineStatus { id: EngineId; ok: boolean; backend?: BackendId; reason?: string; loadMs?: number; }
export interface ProbeResult { frames: number; landmarkerP50Ms: number; landmarkerP90Ms: number; prepP50Ms: number;
  engines: Partial<Record<EngineId, { p50Ms: number; p90Ms: number; okFrames: number }>>; totalP50Ms: number; }
export type ToVision =
  | { t: 'init'; cfg: VisionConfig }
  | { t: 'engines'; ids: EngineId[] }
  | { t: 'frame'; bitmap: ImageBitmap; meta: FrameMeta }       // bitmap transferred
  | { t: 'probe'; frames: number }
  | { t: 'reset-session' }
  | { t: 'dispose' };
export type FromVision =
  | { t: 'ready'; info: VisionInfo }
  | { t: 'progress'; asset: string; loaded: number; total: number }
  | { t: 'engines'; status: EngineStatus[] }
  | { t: 'result'; result: Omit<FrameResult, 'receivedMs'> }   // typed-array buffers transferred
  | { t: 'probe'; result: ProbeResult }
  | { t: 'error'; stage: 'landmarker' | 'host' | EngineId; message: string; recoverable: boolean };
export interface VisionHost {
  readonly kind: 'worker' | 'inline';
  init(cfg: VisionConfig): Promise<VisionInfo>;
  setEngines(ids: EngineId[]): Promise<EngineStatus[]>;
  submit(bitmap: ImageBitmap, meta: FrameMeta): boolean;       // false ⇒ busy; bitmap closed by host
  onResult(cb: (r: FrameResult) => void): () => void;
  onProgress(cb: (asset: string, loaded: number, total: number) => void): () => void;
  probe(frames: number): Promise<ProbeResult>;
  resetSession(): void;
  dispose(): void;
}
export declare function createVisionHost(cfg: VisionConfig, prefer?: 'worker' | 'inline'): Promise<VisionHost>;
