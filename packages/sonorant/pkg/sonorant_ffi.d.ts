/* tslint:disable */
/* eslint-disable */

export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    abi_version(): number;
    configure(frame_len: number, hop: number, lpc_order: number): void;
    core_version(): string;
    frames_len(): number;
    /**
     * Pointer to the first `f32` of the contiguous frame array. Read
     * `frames_len() * FRAME_WORDS` words as a `Float32Array` over
     * `memory.buffer`.
     */
    frames_ptr(): number;
    constructor(sample_rate: number);
    /**
     * Consume PCM and return how many frames are now readable via
     * [`Engine::frames_ptr`] / [`Engine::frames_len`].
     */
    push(pcm: Float32Array): number;
    reset(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_abi_version: (a: number) => number;
    readonly engine_configure: (a: number, b: number, c: number, d: number) => void;
    readonly engine_core_version: (a: number) => [number, number];
    readonly engine_frames_len: (a: number) => number;
    readonly engine_frames_ptr: (a: number) => number;
    readonly engine_new: (a: number) => number;
    readonly engine_push: (a: number, b: number, c: number) => number;
    readonly engine_reset: (a: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
