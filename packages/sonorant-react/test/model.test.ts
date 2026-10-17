// Tests for the pure view-model. No React, no DOM — the components are thin over
// these functions, so this is where the display logic is pinned down.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FLAGS,
  activeFlags,
  buildTrendSeries,
  confidenceBand,
  isTrustworthy,
  mapPitch,
  mapResonance,
  padPoint,
  segmentDistribution,
  summarize,
  summaryText,
  trendDirection,
  trendStopsAt,
  trendTextAlternative,
} from "../src/model.ts";

function frame(overrides = {}) {
  return {
    t_ms: 0,
    f0_hz: 150,
    voicing: 1,
    f0_confidence: 0.9,
    formants: [{ hz: 700, bandwidth_hz: 90, confidence: 0.8 }],
    hnr_db: 20,
    scale_semitones: 0,
    flags: 0,
    ...overrides,
  };
}

test("mapPitch is logarithmic and clamped", () => {
  assert.equal(mapPitch(60), 0);
  assert.equal(mapPitch(1200), 1);
  // An octave is the same distance wherever it starts.
  const a = mapPitch(150) - mapPitch(75);
  const b = mapPitch(300) - mapPitch(150);
  assert.ok(Math.abs(a - b) < 1e-9);
  // Out of range clamps rather than overflows.
  assert.equal(mapPitch(10), 0);
  assert.equal(mapPitch(5000), 1);
});

test("mapResonance spans -6..6 semitones", () => {
  assert.equal(mapResonance(-6), 0);
  assert.equal(mapResonance(6), 1);
  assert.equal(mapResonance(0), 0.5);
});

test("padPoint falls to the minimum for NaN coordinates", () => {
  const p = padPoint(frame({ f0_hz: Number.NaN, scale_semitones: Number.NaN }));
  assert.equal(p.x, 0);
  assert.equal(p.y, 0.5); // NaN resonance -> 0 semitones
});

test("activeFlags names the set bits in order, as text", () => {
  assert.deepEqual(activeFlags(0), []);
  assert.deepEqual(activeFlags(FLAGS.CLIPPED | FLAGS.UNCALIBRATED), ["Clipped", "Not calibrated"]);
});

test("confidenceBand bands the thresholds", () => {
  assert.equal(confidenceBand(0.4), "low");
  assert.equal(confidenceBand(0.5), "medium");
  assert.equal(confidenceBand(0.74), "medium");
  assert.equal(confidenceBand(0.75), "high");
  assert.equal(confidenceBand(Number.NaN), "low");
});

test("isTrustworthy needs formant and voicing confidence", () => {
  assert.equal(isTrustworthy(frame()), true);
  assert.equal(isTrustworthy(frame({ formants: [{ hz: 700, bandwidth_hz: 90, confidence: 0.4 }] })), false);
  assert.equal(isTrustworthy(frame({ f0_confidence: 0.2 })), false);
});

test("summarize never shows an unvoiced frame as a value", () => {
  const s = summarize(frame({ f0_hz: -1 }));
  assert.ok((s.lines[0] ?? "").includes("not detected"));
  const weak = summarize(frame({ f0_confidence: 0.1 }));
  assert.equal(weak.reliable, false);
  assert.ok(weak.caveat);
});

test("summaryText joins the heading, lines and caveat", () => {
  const text = summaryText(frame());
  assert.ok(text.startsWith("Summary:"));
  assert.ok(text.includes("Pitch: 150 Hz"));
});

test("buildTrendSeries splits at core_version boundaries", () => {
  const series = buildTrendSeries({
    channel: "scale",
    points: [
      { t_ms: 0, value: 0, confidence: 0.9, coreVersion: "0.4.0" },
      { t_ms: 1, value: 1, confidence: 0.9, coreVersion: "0.4.0" },
      { t_ms: 2, value: 2, confidence: 0.9, coreVersion: "0.5.0" },
      { t_ms: 3, value: 3, confidence: 0.9, coreVersion: "0.5.0" },
    ],
  });
  assert.equal(series.segments.length, 2);
  assert.equal(series.boundaries.length, 1);
  assert.equal(series.boundaries[0]?.fromVersion, "0.4.0");
  assert.equal(series.boundaries[0]?.toVersion, "0.5.0");
});

test("trendDirection reads the ends, ignoring wobble", () => {
  assert.equal(trendDirection([1]), "steady");
  assert.equal(trendDirection([0, 1, 2, 3]), "up");
  assert.equal(trendDirection([3, 2, 1, 0]), "down");
  assert.equal(trendDirection([1, 1.001, 1]), "steady");
});

test("segmentDistribution returns the percentiles", () => {
  const d = segmentDistribution([
    { t_ms: 0, value: 1, confidence: 1, coreVersion: "x" },
    { t_ms: 1, value: 2, confidence: 1, coreVersion: "x" },
    { t_ms: 2, value: 3, confidence: 1, coreVersion: "x" },
  ]);
  assert.equal(d?.min, 1);
  assert.equal(d?.max, 3);
  assert.equal(d?.p50, 2);
  assert.equal(segmentDistribution([]), null);
});

test("the trend stops when a boundary leaves too few points", () => {
  const series = buildTrendSeries({
    channel: "scale",
    points: [
      { t_ms: 0, value: 0, confidence: 0.9, coreVersion: "0.4.0" },
      { t_ms: 1, value: 1, confidence: 0.9, coreVersion: "0.4.0" },
      { t_ms: 2, value: 2, confidence: 0.9, coreVersion: "0.5.0" },
    ],
  });
  assert.ok(trendStopsAt(series));
  const alt = trendTextAlternative(series);
  assert.ok(alt.stoppedNote);
  assert.ok(alt.boundaryNote);
});

test("trendTextAlternative is empty-safe", () => {
  const alt = trendTextAlternative(buildTrendSeries({ channel: "scale", points: [] }));
  assert.ok(alt.summary.includes("Not enough sessions"));
});
