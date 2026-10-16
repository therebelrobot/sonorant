// sonorant — npm WASM core wrapper (TDD §3).
//
// Ships the wasm core and a typed loader. No acoustic maths lives in JavaScript:
// this file only loads the core, checks its integrity and ABI, and exposes a
// Float32Array view over the frames the core produced.

import initWasm, { Engine } from "../pkg/sonorant_ffi.js";
import { CORE_ABI_VERSION, FRAME_WORDS } from "./abi.js";
import { EXPECTED_WASM_SHA256 } from "./wasm-hash.js";

export { CORE_ABI_VERSION, FRAME_WORDS };

/** The wasm instance's linear memory, captured at load. */
let wasmMemory;

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadBytes(options) {
  if (options.wasmBytes) return options.wasmBytes;
  const url = options.wasmUrl ?? new URL("../pkg/sonorant_ffi_bg.wasm", import.meta.url);
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Load the core, verify the wasm hash, instantiate it, and return an `Engine`
 * whose ABI version matches this loader. Throws on any mismatch (TDD §12, §9.5).
 *
 * @param {number} sampleRate
 * @param {{ wasmBytes?: Uint8Array, wasmUrl?: URL }} [options]
 */
export async function loadEngine(sampleRate, options = {}) {
  const bytes = await loadBytes(options);
  const actual = await sha256Hex(bytes);
  if (actual !== EXPECTED_WASM_SHA256) {
    throw new Error(
      `sonorant: wasm hash mismatch (expected ${EXPECTED_WASM_SHA256}, got ${actual}). Reinstall the package.`,
    );
  }
  const wasm = await initWasm({ module_or_path: bytes });
  wasmMemory = wasm.memory;

  const engine = new Engine(sampleRate);
  if (engine.abi_version() !== CORE_ABI_VERSION) {
    throw new Error(
      `sonorant: CORE_ABI_VERSION mismatch (loader ${CORE_ABI_VERSION}, core ${engine.abi_version()}). Update both to the same version.`,
    );
  }
  return engine;
}

/**
 * A Float32Array view over the frames the last `push` produced. Re-create it after
 * each push: the engine's buffer, and the wasm memory, may move.
 */
export function framesView(engine) {
  return new Float32Array(
    wasmMemory.buffer,
    engine.frames_ptr(),
    engine.frames_len() * FRAME_WORDS,
  );
}
