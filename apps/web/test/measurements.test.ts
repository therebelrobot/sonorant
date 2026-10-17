// Tests for the measurements panel view model (pure, no DOM).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  flagLabel,
  formatMeasure,
  measurementLines,
  measurementRows,
} from "../src/store/measurements.ts";

const block = (median, p05, p95) => ({ median, p05, p95, mean: median });

const summary = (over = {}) => ({
  core_version: "0.3.0",
  duration_ms: 3000,
  voiced_fraction: 0.9,
  f0: block(180, 175, 185),
  formants: [block(700, 690, 710), block(1200, 1180, 1220), block(2600, 2550, 2650), null, null],
  scale_semitones: block(-1.4, -2, -1),
  hnr_db: block(18.2, 16, 20),
  cpp_db: block(11.5, 10, 13),
  tilt_db_per_oct: block(-7.1, -8, -6),
  h1_h2_db: block(4.2, 3, 5),
  centroid_hz: block(1650, 1600, 1700),
  rms_dbfs: block(-24.3, -26, -23),
  spl_db: null,
  jitter_local: block(0.42, 0.3, 0.6),
  shimmer_local: block(2.1, 1.8, 2.5),
  confidence: { mean_formant: 0.82, voicing_p05: 0.9 },
  flag_counts: { UNCALIBRATED: 22 },
  ...over,
});

test("rows appear only for measures with data", () => {
  const keys = measurementRows(summary()).map((row) => row.key);

  assert.ok(keys.includes("f0"));
  assert.ok(keys.includes("jitter_local"));
  assert.ok(!keys.includes("spl_db"), "an uncalibrated session has no sound level");
  assert.ok(!keys.includes("formants[4]"), "an absent formant is omitted, not zeroed");
});

test("sound level appears when the session is calibrated", () => {
  const rows = measurementRows(summary({ spl_db: block(64.2, 62, 66) }), { calibrated: true });
  assert.ok(rows.some((row) => row.key === "spl_db"));
});

test("values carry units, a range and a note where it matters", () => {
  const rows = measurementRows(summary());

  const pitch = rows.find((row) => row.key === "f0");
  assert.equal(pitch.label, "Pitch");
  assert.equal(pitch.units, "Hz");
  assert.equal(pitch.value, "180");
  assert.equal(pitch.range, "175–185");

  const jitter = rows.find((row) => row.key === "jitter_local");
  assert.equal(jitter.value, "0.42");
  assert.equal(jitter.units, "%");
  assert.match(jitter.note, /lower is steadier/);
});

test("a measure with no finite value is omitted rather than zeroed", () => {
  const rows = measurementRows(summary({ jitter_local: null, shimmer_local: null }));
  assert.ok(!rows.some((row) => row.key === "jitter_local"));
  assert.ok(!rows.some((row) => row.key === "shimmer_local"));
});

test("nothing to show is an empty list, not an error", () => {
  assert.deepEqual(measurementRows(null), []);
  assert.deepEqual(measurementLines(null), []);
});

test("lines carry duration, voicing, confidence, flags and the caveat", () => {
  const lines = measurementLines(summary());
  const text = lines.join(" ");

  assert.match(text, /3\.0 s/);
  assert.match(text, /90% voiced/);
  assert.match(text, /Confidence:/);
  assert.match(text, /Not calibrated × 22/, "flag names are shown in plain language");
  assert.match(text, /no calibration/);
});

test("formatMeasure uses the reader's locale", () => {
  assert.equal(formatMeasure(1234.5, 1, { locale: "de-DE" }), "1.234,5");
  assert.equal(formatMeasure(180, 0), "180");
});

test("flagLabel falls back to the enum name for an unknown flag", () => {
  assert.equal(flagLabel("CLIPPED"), "Clipped");
  assert.equal(flagLabel("SOMETHING_NEW"), "SOMETHING_NEW");
});
