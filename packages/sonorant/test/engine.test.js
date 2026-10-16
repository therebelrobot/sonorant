// S3.3 tests: the npm wrapper loads the wasm, checks its hash, and drives frames.
// Run with `node --test` from packages/sonorant.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { loadEngine, framesView, FRAME_WORDS } from "../src/index.js";

const wasmUrl = new URL("../pkg/sonorant_ffi_bg.wasm", import.meta.url);

async function wasmBytes() {
  return new Uint8Array(await readFile(wasmUrl));
}

function sine(f0, seconds = 0.5, sampleRate = 44100) {
  const pcm = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = 0.5 * Math.sin((2 * Math.PI * f0 * i) / sampleRate);
  }
  return pcm;
}

test("loads the core, checks the ABI, and emits frames", async () => {
  const engine = await loadEngine(44100, { wasmBytes: await wasmBytes() });
  assert.equal(engine.abi_version(), 1);
  assert.ok(engine.core_version().length > 0);

  engine.configure(2048, 512, 24);
  const produced = engine.push(sine(150));
  assert.ok(produced > 0, "expected frames");

  const view = framesView(engine);
  assert.equal(view.length, engine.frames_len() * FRAME_WORDS);

  const f0 = view[1]; // word 1 is f0_hz
  assert.ok(Math.abs(f0 - 150) / 150 < 0.05, `measured f0 ${f0}`);
});

test("a tampered wasm fails the hash check before instantiation", async () => {
  const bytes = await wasmBytes();
  bytes[8] ^= 0xff;
  await assert.rejects(() => loadEngine(44100, { wasmBytes: bytes }), /hash mismatch/);
});
