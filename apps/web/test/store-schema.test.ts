// S5.1 tests: the local store row shapes (TDD §7.1).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  measureVersionRow,
  metricSeriesRows,
  sessionRow,
  utteranceRow,
} from "../src/store/schema.ts";

const frame = (over = {}) => ({
  t_ms: 0,
  f0_hz: 180,
  f0_confidence: 0.9,
  scale_semitones: 0,
  formants: [{ hz: 700, confidence: 0.8 }],
  hnr_db: 10,
  cpp_db: 1,
  spl_db: Number.NaN,
  flags: 32,
  ...over,
});

test("session row carries app/core/abi/schema versions", () => {
  const row = sessionRow({
    id: "s1",
    startedAt: 1,
    deviceClass: "web",
    appVersion: "0.1.0",
    coreVersion: "0.1.0",
    abiVersion: 1,
  });
  assert.equal(row.app_version, "0.1.0");
  assert.equal(row.core_version, "0.1.0");
  assert.equal(row.abi_version, 1);
  assert.equal(row.schema_version, SCHEMA_VERSION);
  assert.equal(row.calibration_id, null, "uncalibrated session stores null");
});

test("utterance row carries kind, duration and metrics_json", () => {
  const row = utteranceRow({
    id: "u1",
    sessionId: "s1",
    kind: "sustained",
    durationMs: 3000,
    metricsJson: "{}",
    createdAt: 2,
  });
  assert.equal(row.kind, "sustained");
  assert.equal(row.duration_ms, 3000);
  assert.equal(row.metrics_json, "{}");
});

test("metric series rows carry value and confidence per channel", () => {
  const frames = [frame({ t_ms: 0 }), frame({ t_ms: 50 }), frame({ t_ms: 200 })];
  const rows = metricSeriesRows({ utteranceId: "u1", frames });

  assert.ok(rows.length > 0);
  assert.ok(
    rows.every(
      (r) => Number.isFinite(r.value) && Number.isFinite(r.confidence) && r.utterance_id === "u1",
    ),
  );
  assert.ok(rows.some((r) => r.channel === "f0"));
  assert.ok(!rows.some((r) => r.channel === "spl"), "no SPL rows when uncalibrated");
});

test("SPL rows appear only for a calibrated, finite value", () => {
  const frames = [frame({ t_ms: 0, spl_db: 60 })];

  const uncalibrated = metricSeriesRows({ utteranceId: "u1", frames, calibrated: false });
  assert.ok(!uncalibrated.some((r) => r.channel === "spl"));

  const calibrated = metricSeriesRows({ utteranceId: "u1", frames, calibrated: true });
  const spl = calibrated.filter((r) => r.channel === "spl");
  assert.equal(spl.length, 1);
  assert.equal(spl[0].value, 60);
});

test("measure_version row keys by core_version", () => {
  const row = measureVersionRow({ coreVersion: "0.1.0", introducedAt: 1 });
  assert.equal(row.core_version, "0.1.0");
  assert.equal(row.notes, null);
});

test("the stability channel is a windowed resonance steadiness", () => {
  const frames = Array.from({ length: 12 }, (_, i) =>
    frame({ t_ms: i * 10, scale_semitones: i % 2 === 0 ? -1 : 1 }),
  );
  const rows = metricSeriesRows({ utteranceId: "u1", frames });
  const stability = rows.filter((r) => r.channel === "stability");

  assert.ok(stability.length > 0, "stability rows are produced once the window fills");
  assert.ok(stability.every((r) => r.value >= 0 && Number.isFinite(r.value)), "a standard deviation");
  assert.ok(stability.every((r) => Number.isFinite(r.confidence)));
  assert.ok(stability[0].t_ms >= 90, "no row before the window is full");
});

test("a steady resonance reads near zero stability; a moving one does not", () => {
  const steady = Array.from({ length: 12 }, (_, i) => frame({ t_ms: i * 10, scale_semitones: 0 }));
  const moving = Array.from({ length: 12 }, (_, i) =>
    frame({ t_ms: i * 10, scale_semitones: i % 2 === 0 ? -2 : 2 }),
  );
  const stabilityOf = (frames) =>
    metricSeriesRows({ utteranceId: "u1", frames }).find((r) => r.channel === "stability")?.value ?? -1;

  assert.equal(stabilityOf(steady), 0);
  assert.ok(stabilityOf(moving) > 1, "alternating ±2 semitones is clearly unsteady");
});

test("no stability rows without a measurable formant scale", () => {
  const frames = Array.from({ length: 12 }, (_, i) => frame({ t_ms: i * 10, formants: [] }));
  const rows = metricSeriesRows({ utteranceId: "u1", frames });
  assert.ok(!rows.some((r) => r.channel === "stability"));
});
