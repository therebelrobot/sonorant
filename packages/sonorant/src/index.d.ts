export const CORE_ABI_VERSION: number;
export const FRAME_WORDS: number;

export interface Engine {
  configure(frameLen: number, hop: number, lpcOrder: number): void;
  push(pcm: Float32Array): number;
  frames_ptr(): number;
  frames_len(): number;
  reset(): void;
  free(): void;
  core_version(): string;
  abi_version(): number;
}

export interface DecodedFrame {
  t_ms: number;
  f0_hz: number;
  f0_confidence: number;
  formants: Array<{ hz: number; bandwidth_hz: number; confidence: number }>;
  flags: number;
  [key: string]: unknown;
}

export function decodeFrames(words: Float32Array): DecodedFrame[];

export interface LoadOptions {
  wasmBytes?: Uint8Array;
  wasmUrl?: URL;
}

export function loadEngine(sampleRate: number, options?: LoadOptions): Promise<Engine>;
export function framesView(engine: Engine): Float32Array;

export interface ExportOptions extends LoadOptions {
  bundleJson: string;
  coreVersion: string;
  abiVersion: number;
  createdAt: string;
  passphrase?: string | null;
}
export interface ImportOptions extends LoadOptions {
  bytes: Uint8Array;
  existingJson: string;
  passphrase?: string | null;
}
export function exportArchive(options: ExportOptions): Promise<Uint8Array>;
export function describeArchive(bytes: Uint8Array, options?: LoadOptions): Promise<string>;
export function importArchive(options: ImportOptions): Promise<{ bundle: unknown; report: { added: number; skipped: number; conflicted: number; conflicts: string[]; line: string } }>;
