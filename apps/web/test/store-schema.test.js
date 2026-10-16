// S5.1 tests: the local store row shapes (TDD §7.1).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  measureVersionRow,
  metricSeriesRows,
  sessionRow,
  utteranceRow,
} from "../src/store/schema.js";

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
