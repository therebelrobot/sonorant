// The demo fixtures are committed build artifacts. This test pins their shape, so
// a regeneration that produces something stale or empty fails CI rather than
// silently degrading the demo page.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface RawFrame {
  t_ms: number;
  f0_hz: number | null;
  f0_confidence: number;
  scale_semitones: number | null;
  spl_db: number | null;
  flags: number;
  formants: unknown[];
}

interface RawFixture {
  frames: RawFrame[];
}

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string): RawFixture =>
  JSON.parse(readFileSync(join(here, "..", "src", "demo", name), "utf8")) as RawFixture;

const finite = (values: Array<number | null>): number[] =>
  values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

test("the reference fixture is a real, sustained vowel", () => {
  const { frames } = load("reference-vowel.frames.json");
  assert.ok(frames.length > 0);
  const f0 = finite(frames.map((f) => f.f0_hz));
  assert.equal(f0.length, frames.length, "every frame is voiced");
  assert.ok(Math.max(...f0) - Math.min(...f0) < 5, "pitch is steady");
});

test("the glide fixture moves pitch and resonance", () => {
  const { frames } = load("synthetic-glide.frames.json");
  assert.ok(frames.length > 50);
  const f0 = finite(frames.map((f) => f.f0_hz));
  const scale = finite(frames.map((f) => f.scale_semitones));
  assert.ok(Math.max(...f0) - Math.min(...f0) > 100, "pitch sweeps");
  assert.ok(Math.max(...scale) - Math.min(...scale) > 2, "resonance moves");
});

test("frames carry the fields the components read", () => {
  for (const name of ["reference-vowel.frames.json", "synthetic-glide.frames.json"]) {
    const { frames } = load(name);
    for (const frame of frames) {
      assert.equal(typeof frame.t_ms, "number", `${name}: t_ms`);
      assert.equal(typeof frame.f0_confidence, "number", `${name}: f0_confidence`);
      assert.ok(Array.isArray(frame.formants), `${name}: formants`);
      assert.equal(typeof frame.flags, "number", `${name}: flags`);
      // A NaN measurement is stored as null, never as 0.
      assert.equal(frame.spl_db, null, `${name}: uncalibrated SPL is null`);
    }
  }
});
