// S4.3 tests: the worker's flat f32 frame block decodes at the manifest offsets.

import { test } from "node:test";
import assert from "node:assert/strict";

import { FRAME_WORDS, decodeFrames } from "../src/frames.js";

function oneFrame() {
  const w = new Float32Array(FRAME_WORDS);
  new Uint32Array(w.buffer, w.byteOffset, w.length)[0] = 123; // t_ms is a u32
  w[1] = 180; // f0_hz
  w[2] = 0.9; // voicing
  w[3] = 0.8; // f0_confidence
  w[4] = 700; // formants[0].hz
  w[5] = 90;
  w[6] = 0.7;
  w[19] = 12.5; // hnr_db
  w[24] = -1.5; // scale_semitones
  w[25] = -20; // rms_dbfs
  w[26] = Number.NaN; // spl_db
  w[29] = 32; // flags (UNCALIBRATED)
  return w;
}

test("decodes one frame at the manifest offsets", () => {
  const frames = decodeFrames(oneFrame());
  assert.equal(frames.length, 1);
  const f = frames[0];
  assert.equal(f.t_ms, 123);
  assert.equal(f.f0_hz, 180);
  assert.equal(f.formants[0].hz, 700);
  assert.equal(f.formants[0].confidence, Math.fround(0.7));
  assert.equal(f.hnr_db, 12.5);
  assert.equal(f.scale_semitones, -1.5);
  assert.ok(Number.isNaN(f.spl_db));
  assert.equal(f.flags, 32);
});

test("t_ms is read as a u32, not an f32 bit pattern", () => {
  const w = new Float32Array(FRAME_WORDS);
  new Uint32Array(w.buffer, w.byteOffset, w.length)[0] = 6971;
  const frame = decodeFrames(w)[0];
  assert.equal(frame.t_ms, 6971);
  assert.ok(Number.isInteger(frame.t_ms));
});

test("ignores a trailing partial frame", () => {
  assert.equal(decodeFrames(new Float32Array(FRAME_WORDS)).length, 1);
  assert.equal(decodeFrames(new Float32Array(FRAME_WORDS + 5)).length, 1);
  assert.equal(decodeFrames(new Float32Array(5)).length, 0);
});
