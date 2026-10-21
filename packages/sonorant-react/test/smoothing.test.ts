// Tests for the standard display-smoothing pipeline. Pure functions, no React and
// no DOM — this is where the display contract from
// `docs/rules/visualization-smoothing.md` is pinned down.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SMOOTHING_DEFAULTS,
  isDisplayable,
  smoothSeries,
  withDefaults,
} from "../src/smoothing.ts";

const RANGE = [0, 10] as const;
const MIN_CONF = 0.5;

/** Shorthand: a frame at `t_ms` with a value and a good confidence. */
function input(t_ms: number, value: number, confidence = 0.9) {
  return { t_ms, value, confidence };
}

/** Every stage off, so a test can isolate one. */
const RAW = {
  mode: "smooth" as const,
  range: RANGE,
  minConfidence: MIN_CONF,
  medianWindowMs: 0,
  emaTimeConstantMs: 0,
  slewSpanPerSecond: 0,
  holdMs: 100,
  fadeMs: 200,
};

const at = (i: number, out: ReturnType<typeof smoothSeries>) => out[i]!;

test("withDefaults fills every option", () => {
  assert.deepEqual(withDefaults(), SMOOTHING_DEFAULTS);
  assert.equal(withDefaults({ emaTimeConstantMs: 250 }).emaTimeConstantMs, 250);
  // Untouched options still come back as the defaults.
  assert.equal(withDefaults({ emaTimeConstantMs: 250 }).medianWindowMs, 60);
});

test("isDisplayable rejects unvoiced, low-confidence and out-of-range values", () => {
  const opts = { range: RANGE, minConfidence: MIN_CONF };
  assert.equal(isDisplayable(5, 0.9, opts), true);
  assert.equal(isDisplayable(5, MIN_CONF, opts), true, "the threshold is inclusive");
  assert.equal(isDisplayable(Number.NaN, 0.9, opts), false, "NaN is a gap");
  assert.equal(isDisplayable(5, Number.NaN, opts), false, "no confidence is a gap");
  assert.equal(isDisplayable(5, 0.49, opts), false, "below the threshold is a gap");
  assert.equal(isDisplayable(-1, 0.9, opts), false, "below the range is a gap");
  assert.equal(isDisplayable(11, 0.9, opts), false, "above the range is a gap");
});

test("mode 'none' draws raw values and marks non-displayable frames stale", () => {
  const out = smoothSeries(
    [input(0, 5), input(10, Number.NaN), input(20, 12), input(30, 7, 0.1)],
    { ...RAW, mode: "none" },
  );
  assert.equal(at(0, out).value, 5);
  assert.equal(at(0, out).stale, false);
  assert.ok(Number.isNaN(at(1, out).value), "NaN stays NaN");
  assert.equal(at(1, out).stale, true);
  assert.ok(Number.isNaN(at(2, out).value), "an out-of-range value is a gap, not clamped to 10");
  assert.equal(at(2, out).stale, true);
  assert.ok(Number.isNaN(at(3, out).value), "low confidence is a gap");
});

test("the rolling median rejects an isolated spike", () => {
  const frames = [1, 1, 1, 1, 1, 1, 50, 1, 1].map((v, i) => input(i * 10, v));
  const out = smoothSeries(frames, { ...RAW, medianWindowMs: 60 });
  // Every frame reads 1: the single 50 never wins the median.
  for (let i = 0; i < frames.length; i++) {
    assert.equal(at(i, out).value, 1, `frame ${i} should be 1, got ${at(i, out).value}`);
  }
});

test("the slew limit bounds the drawn rate of change", () => {
  // span 10, 1 span/second, 100 ms frames => at most 1.0 per frame.
  const frames = [0, 10, 10, 10, 10].map((v, i) => input(i * 100, v));
  const out = smoothSeries(frames, { ...RAW, slewSpanPerSecond: 1 });
  const values = out.map((p) => p.value);
  assert.deepEqual(values, [0, 1, 2, 3, 4]);
});

test("the EMA smooths toward the value with the given time constant", () => {
  // tau 100 ms, a 100 ms step => alpha = 1 - e^-1.
  const out = smoothSeries([input(0, 0), input(100, 10)], { ...RAW, emaTimeConstantMs: 100 });
  assert.equal(at(0, out).value, 0);
  assert.ok(Math.abs(at(1, out).value - 6.3212) < 1e-3, `got ${at(1, out).value}`);
});

test("smoothing is frame-rate independent: it follows t_ms, not the frame count", () => {
  const alpha = 1 - Math.exp(-100 / 100); // one 100 ms step
  const coarse = smoothSeries([input(0, 0), input(100, 1)], { ...RAW, emaTimeConstantMs: 100 });
  const fine = smoothSeries(
    Array.from({ length: 11 }, (_, i) => input(i * 10, i === 0 ? 0 : 1)),
    { ...RAW, emaTimeConstantMs: 100 },
  );
  // Ten 10 ms steps and one 100 ms step land in the same place.
  assert.ok(Math.abs(at(1, coarse).value - at(10, fine).value) < 1e-6);
  assert.ok(Math.abs(at(1, coarse).value - alpha) < 1e-6);
});

test("a gap holds the last value, then fades it out to nothing", () => {
  const frames = [
    input(0, 5),
    input(10, 5),
    input(20, Number.NaN),
    input(120, Number.NaN), // age 100 = holdMs, still held
    input(130, Number.NaN), // age 110, within hold + fade
    input(330, Number.NaN), // age 310 > hold + fade (300) => gone
  ];
  const out = smoothSeries(frames, RAW);
  assert.equal(at(2, out).value, 5);
  assert.equal(at(2, out).stale, true);
  assert.equal(at(3, out).value, 5, "held through holdMs");
  assert.equal(at(4, out).value, 5, "still held into the fade");
  assert.ok(Number.isNaN(at(5, out).value), "faded out to nothing");
  assert.equal(at(5, out).stale, true, "a faded point is still stale, never data");
});

test("a gap at the very start has nothing to hold", () => {
  const out = smoothSeries([input(0, Number.NaN), input(10, Number.NaN)], RAW);
  assert.ok(Number.isNaN(at(0, out).value));
  assert.equal(at(0, out).stale, true);
});

test("after a long gap the smoother restarts rather than gliding from stale state", () => {
  const frames = [
    input(0, 5),
    input(1000, 5), // gap far beyond hold + fade
  ];
  const out = smoothSeries(frames, { ...RAW, emaTimeConstantMs: 120 });
  // New data is new data: no discontinuous glide out of a faded value.
  assert.equal(at(1, out).value, 5);
  assert.equal(at(1, out).stale, false);
});

test("the pipeline leaves a steady signal where it found it", () => {
  const frames = Array.from({ length: 40 }, (_, i) => input(i * 11.6, 3));
  const out = smoothSeries(frames, {
    range: RANGE,
    minConfidence: MIN_CONF,
  });
  const last = at(out.length - 1, out).value;
  assert.ok(Math.abs(last - 3) < 1e-9, `a steady input should stay put, got ${last}`);
  assert.equal(at(out.length - 1, out).stale, false);
});
