// S4.4 tests: every displayed value carries a confidence; unreliable results are
// framed as such; the summary stands alone as the accessible equivalent.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SUMMARY_COPY,
  levelLine,
  pitchLine,
  resonanceLine,
  summarize,
  summaryText,
} from "../src/pad/summary.js";

const voiced = (over = {}) => ({
  f0_hz: 180,
  f0_confidence: 0.9,
  scale_semitones: 0,
  formants: [{ hz: 700, confidence: 0.8 }],
  spl_db: Number.NaN,
  ...over,
});

test("a displayed value always carries a confidence", () => {
  assert.match(pitchLine(voiced()), /confidence: high/);
  assert.match(resonanceLine(voiced()), /confidence: high/);
});

test("an unvoiced frame is never shown as a value", () => {
  const line = pitchLine(voiced({ f0_hz: 0 }));
  assert.equal(line, SUMMARY_COPY.unvoiced);
  assert.ok(!line.includes("confidence"), "no value, so no confidence to show");
});

test("resonance phrasing reflects direction", () => {
  assert.match(resonanceLine(voiced({ scale_semitones: 2 })), /2 semitones above your baseline/);
  assert.match(resonanceLine(voiced({ scale_semitones: -2 })), /2 semitones below your baseline/);
  assert.match(resonanceLine(voiced({ scale_semitones: 0 })), /at your baseline/);
});

test("uncalibrated level is stated, never faked", () => {
  assert.equal(levelLine(voiced(), { calibrated: false }), SUMMARY_COPY.uncalibrated);
});

test("low voicing confidence gives the voicing-specific caveat", () => {
  const summary = summarize(voiced({ f0_confidence: 0.2 }));
  assert.equal(summary.reliable, false);
  assert.equal(summary.caveat, SUMMARY_COPY.notEnoughVoice);
});

test("low formant confidence gives the not-reliable caveat", () => {
  const summary = summarize(voiced({ formants: [{ hz: 700, confidence: 0.3 }] }));
  assert.equal(summary.reliable, false);
  assert.equal(summary.caveat, SUMMARY_COPY.notReliable);
});

test("a reliable frame has no caveat and a complete text alternative", () => {
  const summary = summarize(voiced());
  assert.equal(summary.reliable, true);
  assert.equal(summary.caveat, null);

  const text = summaryText(voiced());
  assert.match(text, /^Summary:/);
  assert.match(text, /Pitch: 180 Hz/);
  assert.match(text, /Resonance:/);
  assert.match(text, /not calibrated/);
});
