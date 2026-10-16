// S5.1 tests: the AnalysisSummary builder (phase 5 §3.4 draft).

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAnalysisSummary, statBlock } from "../src/store/summary.js";

const frame = (over = {}) => ({
  t_ms: 0,
  f0_hz: 180,
  f0_confidence: 0.9,
  scale_semitones: 0,
  formants: [{ hz: 700, confidence: 0.8 }],
  hnr_db: 10,
  cpp_db: 1,
  tilt_db_per_oct: -6,
  h1_h2_db: -3,
  centroid_hz: 1000,
  rms_dbfs: -20,
  spl_db: Number.NaN,
  jitter_local: Number.NaN,
  shimmer_local: Number.NaN,
  flags: 0,
  ...over,
});

test("statBlock computes median/percentiles/mean", () => {
  assert.deepEqual(statBlock([1, 2, 3, 4, 5]), {
    median: 3,
    p05: 1,
    p95: 5,
    mean: 3,
  });
});

test("statBlock returns null for an empty or non-finite block", () => {
  assert.equal(statBlock([]), null);
  assert.equal(statBlock([Number.NaN]), null);
});

test("summary carries core_version, duration, voicing and null SPL when uncalibrated", () => {
  const frames = [
    frame({ t_ms: 0 }),
    frame({ t_ms: 100, f0_hz: 0 }),
    frame({ t_ms: 200 }),
  ];
  const summary = buildAnalysisSummary(frames, { coreVersion: "0.1.0" });

  assert.equal(summary.core_version, "0.1.0");
  assert.equal(summary.duration_ms, 200);
  assert.ok(Math.abs(summary.voiced_fraction - 2 / 3) < 1e-9);
  assert.equal(summary.spl_db, null, "uncalibrated SPL is null, not zero");
  assert.equal(summary.f0.median, 180);
  assert.equal(summary.formants[0].median, 700);
  assert.ok(Math.abs(summary.confidence.mean_formant - 0.8) < 1e-6);
});

test("summary counts flags per bit", () => {
  const frames = [frame({ flags: 32 }), frame({ flags: 32 }), frame({ flags: 1 | 32 })];
  const summary = buildAnalysisSummary(frames, { coreVersion: "0.1.0" });
  assert.equal(summary.flag_counts.UNCALIBRATED, 3);
  assert.equal(summary.flag_counts.CLIPPED, 1);
});

test("summary has null stat blocks for measures with no data", () => {
  const summary = buildAnalysisSummary([frame()], { coreVersion: "0.1.0" });
  assert.equal(summary.jitter_local, null, "not implemented -> no data, not zero");
  assert.equal(summary.shimmer_local, null);
});
