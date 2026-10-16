export const CORE_ABI_VERSION: number;
export const FRAME_WORDS: number;

export interface Engine {
  configure(frameLen: number, hop: number, lpcOrder: number): void;
  push(pcm: Float32Array): number;
  frames_ptr(): number;
  frames_len(): number;
  reset(): void;
  core_version(): string;
  abi_version(): number;
}

export interface LoadOptions {
  wasmBytes?: Uint8Array;
  wasmUrl?: URL;
}

export function loadEngine(sampleRate: number, options?: LoadOptions): Promise<Engine>;
export function framesView(engine: Engine): Float32Array;
