// Runtime access to assets-manifest.json (spec §8.1): URLs under BASE_URL, the
// .gz copies production serves, and fetches that report progress and check the
// manifest's size and sha256, so a tampered model makes only the engine that
// needs it unavailable (spec §10.4 failures.spec.ts).
//
// The manifest reaches the browser as a file (a Vite ?url import made by the
// vision host), never inlined into JavaScript: its `source` fields name model
// CDNs that the shipped code must not mention. Nothing here runs at import
// time, so the module also loads in Node for the unit tests.
import type { AssetId } from '../engines/types.ts';

/** Manifest ids: the engines' AssetIds plus the BlazeGaze weight shard, which model.json references. */
export type ManifestAssetId = AssetId | 'blazegaze-weights';

export interface AssetEntry {
  readonly id: string;
  /** Published path relative to BASE_URL; may contain [hash] for files emitted by Vite ?url imports. */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly gz: boolean;
}

export interface AssetManifest {
  readonly entries: ReadonlyMap<string, AssetEntry>;
}

export interface AssetConfig {
  baseUrl: string;
  /** Request the .gz copy of entries that have one (production builds). */
  gz: boolean;
  /** URLs for entries whose path contains [hash], keyed by id: the ORT files, from the vision core's `?url` imports (visionCore.ts). */
  hashed?: Readonly<Partial<Record<string, string>>>;
}

export type AssetErrorKind = 'unknown-asset' | 'http' | 'size' | 'integrity' | 'unavailable';

export class AssetError extends Error {
  readonly kind: AssetErrorKind;
  readonly asset: string;
  constructor(kind: AssetErrorKind, asset: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AssetError';
    this.kind = kind;
    this.asset = asset;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Validates the parsed manifest JSON and keeps only what the runtime needs. */
export function parseManifest(json: unknown): AssetManifest {
  const assets = (json as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) throw new Error('assets-manifest: no "assets" array');
  const entries = new Map<string, AssetEntry>();
  for (const raw of assets as Record<string, unknown>[]) {
    const { id, path, sha256, bytes, gz } = raw ?? {};
    if (typeof id !== 'string' || id === '') throw new Error('assets-manifest: an entry has no id');
    if (typeof path !== 'string' || path === '' || path.startsWith('/')) throw new Error(`assets-manifest: ${id} has an invalid path`);
    if (typeof sha256 !== 'string' || !HEX64.test(sha256)) throw new Error(`assets-manifest: ${id} has an invalid sha256`);
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) throw new Error(`assets-manifest: ${id} has an invalid size`);
    if (typeof gz !== 'boolean') throw new Error(`assets-manifest: ${id} has no gz flag`);
    if (entries.has(id)) throw new Error(`assets-manifest: duplicate id ${id}`);
    entries.set(id, Object.freeze({ id, path, sha256, bytes, gz }));
  }
  return { entries };
}

export function assetEntry(manifest: AssetManifest, id: string): AssetEntry {
  const entry = manifest.entries.get(id);
  if (!entry) throw new AssetError('unknown-asset', id, `Unknown asset "${id}" (not in assets-manifest.json).`);
  return entry;
}

function joinBase(baseUrl: string, path: string): string {
  return baseUrl.endsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}

/**
 * The URL to request: BASE_URL + path, with ".gz" appended when the config
 * asks for compressed copies and the entry has one. The host serves a
 * ".wasm.gz" as gzip-encoded application/wasm, so callers use it like the
 * plain file; `plainUrl` gives the uncompressed URL for the one retry the
 * spec allows (§4.2).
 */
export function resolveAssetUrl(manifest: AssetManifest, id: string, cfg: AssetConfig): string {
  const entry = assetEntry(manifest, id);
  let url: string;
  if (entry.path.includes('[hash]')) {
    const hashed = cfg.hashed?.[id];
    if (!hashed) throw new AssetError('unknown-asset', id, `No build URL for the hashed asset "${id}".`);
    url = hashed;
  } else {
    url = joinBase(cfg.baseUrl, entry.path);
  }
  return cfg.gz && entry.gz ? `${url}.gz` : url;
}

export function plainUrl(url: string): string {
  return url.endsWith('.gz') ? url.slice(0, -3) : url;
}

export function isGzUrl(url: string): boolean {
  return url.endsWith('.gz');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SHA-256 is unavailable: this page is not in a secure context (https or localhost).');
  const digest = await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type ProgressFn = (loaded: number, total: number) => void;

/**
 * Reads a response body to the end, reporting progress against `total` (the
 * manifest size: Content-Length is the compressed size when the host gzips).
 * Throws once more than `limit` bytes arrive.
 */
export async function readBody(response: Response, total: number, onProgress?: ProgressFn, limit = Infinity): Promise<Uint8Array> {
  const body = response.body;
  if (!body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.(bytes.length, total);
    return bytes;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.(0, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (loaded > limit) {
      await reader.cancel().catch(() => undefined);
      throw new RangeError(`received more than ${limit} bytes`);
    }
    onProgress?.(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Throws AssetError('size' | 'integrity') unless `bytes` are exactly the manifest's file. */
export async function verifyAsset(entry: AssetEntry, bytes: Uint8Array): Promise<void> {
  if (bytes.length !== entry.bytes) {
    throw new AssetError('size', entry.id, `${entry.id}: received ${bytes.length} bytes, the manifest says ${entry.bytes}.`);
  }
  const hash = await sha256Hex(bytes);
  if (hash !== entry.sha256) {
    throw new AssetError('integrity', entry.id, `${entry.id}: the file does not match its manifest hash (got ${hash.slice(0, 12)}…).`);
  }
}

export interface FetchAssetOptions {
  onProgress?: ProgressFn;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/** Fetches one manifest entry and verifies it. Use for files the app reads as bytes (models). */
export async function fetchVerified(manifest: AssetManifest, id: string, cfg: AssetConfig, opts: FetchAssetOptions = {}): Promise<Uint8Array> {
  const entry = assetEntry(manifest, id);
  const url = resolveAssetUrl(manifest, id, cfg);
  const doFetch = opts.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, { signal: opts.signal, credentials: 'same-origin' });
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    throw new AssetError('http', id, `${id}: the request for ${url} failed (${errorText(error)}).`, { cause: error });
  }
  if (!response.ok) throw new AssetError('http', id, `${id}: ${url} answered ${response.status} ${response.statusText}.`.trim());
  let bytes: Uint8Array;
  try {
    bytes = await readBody(response, entry.bytes, opts.onProgress, entry.bytes);
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    throw new AssetError('size', id, `${id}: ${errorText(error)}.`, { cause: error });
  }
  await verifyAsset(entry, bytes);
  return bytes;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The session's manifest and configuration. The vision core sets them once
// during init; engines then reach their files through assetUrl/fetchAsset.
let current: { manifest: AssetManifest; cfg: AssetConfig } | null = null;

export function configureAssets(manifest: AssetManifest, cfg: AssetConfig): void {
  current = { manifest, cfg };
}

function session(): { manifest: AssetManifest; cfg: AssetConfig } {
  if (!current) throw new AssetError('unavailable', '', 'The asset manifest has not been loaded yet.');
  return current;
}

export function assetUrl(id: ManifestAssetId): string {
  const { manifest, cfg } = session();
  return resolveAssetUrl(manifest, id, cfg);
}

export function fetchAsset(id: ManifestAssetId, opts: FetchAssetOptions = {}): Promise<Uint8Array> {
  const { manifest, cfg } = session();
  return fetchVerified(manifest, id, cfg, opts);
}

export function assetInfo(id: ManifestAssetId): AssetEntry {
  return assetEntry(session().manifest, id);
}

/** Loads and parses the manifest file. */
export async function loadManifest(url: string, fetchFn: typeof fetch = fetch): Promise<AssetManifest> {
  const response = await fetchFn(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`assets-manifest: ${url} answered ${response.status}.`);
  return parseManifest(await response.json());
}
