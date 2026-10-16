// S4.3 tests: the pad model maps and classifies correctly.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FLAG_LABELS,
  PITCH_MAX_HZ,
  PITCH_MIN_HZ,
  RESONANCE_MAX_SEMITONES,
  RESONANCE_MIN_SEMITONES,
  activeFlags,
  confidenceBand,
  isTrustworthy,
  mapPitch,
  mapResonance,
  padPoint,
  prefersReducedMotion,
} from "../src/pad/pad-model.js";

const frame = (over = {}) => ({
  f0_hz: 200,
  scale_semitones: 0,
  f0_confidence: 0.9,
  formants: [
    { hz: 700, confidence: 0.8 },
    { hz: 1200, confidence: 0.8 },
  ],
  flags: 0,
  ...over,
});

test("pitch maps logarithmically and clamps", () => {
  assert.equal(mapPitch(PITCH_MIN_HZ), 0);
  assert.equal(mapPitch(PITCH_MAX_HZ), 1);
  assert.equal(mapPitch(10), 0, "below range clamps");
  assert.equal(mapPitch(99999), 1, "above range clamps");
  const midpoint = PITCH_MIN_HZ * Math.sqrt(PITCH_MAX_HZ / PITCH_MIN_HZ);
  assert.ok(Math.abs(mapPitch(midpoint) - 0.5) < 1e-6, "log midpoint is 0.5");
});

test("resonance maps linearly and clamps", () => {
  assert.equal(mapResonance(RESONANCE_MIN_SEMITONES), 0);
  assert.equal(mapResonance(RESONANCE_MAX_SEMITONES), 1);
  assert.equal(mapResonance(0), 0.5);
});

test("padPoint handles unvoiced/NaN frames without throwing", () => {
  assert.deepEqual(padPoint({ f0_hz: Number.NaN, scale_semitones: Number.NaN }), {
    x: 0,
    y: 0.5,
  });
});

test("confidenceBand follows the thresholds", () => {
  assert.equal(confidenceBand(0.9), "high");
  assert.equal(confidenceBand(0.6), "medium");
  assert.equal(confidenceBand(0.3), "low");
  assert.equal(confidenceBand(Number.NaN), "low");
});

test("trust requires both formant and voicing confidence", () => {
  assert.equal(isTrustworthy(frame()), true);
  assert.equal(isTrustworthy(frame({ formants: [{ hz: 700, confidence: 0.4 }] })), false);
  assert.equal(isTrustworthy(frame({ f0_confidence: 0.2 })), false);
  assert.equal(isTrustworthy(frame({ formants: [] })), false);
});

test("activeFlags returns text labels in bit order", () => {
  assert.deepEqual(activeFlags(1 | 32), ["Clipped", "Not calibrated"]);
  assert.deepEqual(activeFlags(0), []);
  assert.equal(FLAG_LABELS[16], "Formant unstable");
});

test("prefersReducedMotion reads matchMedia", () => {
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(prefersReducedMotion({}), false);
});
