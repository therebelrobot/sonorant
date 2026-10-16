// S5.3 tests: session record building, the history view model, and the A/B model.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMPARE_COPY,
  HISTORY_COPY,
  buildSessionRecords,
  formatDate,
  historyRowSummary,
  summaryReliable,
  toComparisonViewModel,
  toHistoryViewModel,
} from "../src/store/history.js";

const frame = (over = {}) => ({
  t_ms: 0,
  f0_hz: 180,
  f0_confidence: 0.9,
  scale_semitones: -1.5,
  formants: [{ hz: 700, confidence: 0.8 }],
  hnr_db: 10,
  cpp_db: 1,
  spl_db: Number.NaN,
  flags: 32,
  ...over,
});

const goodSummary = (over = {}) => ({
  duration_ms: 3000,
  f0: { median: 180 },
  scale_semitones: { median: -1.5 },
  confidence: { mean_formant: 0.8, voicing_p05: 0.5 },
  ...over,
});

test("buildSessionRecords produces all four row sets", () => {
  const frames = [frame({ t_ms: 0 }), frame({ t_ms: 500 })];
  const records = buildSessionRecords({
    sessionId: "s1",
    utteranceId: "u1",
    startedAt: 1000,
    endedAt: 1500,
    deviceClass: "web",
    appVersion: "0.1.0",
    coreVersion: "0.1.0",
    abiVersion: 1,
    kind: "sustained",
    frames,
  });

  assert.equal(records.session.core_version, "0.1.0");
  assert.equal(records.session.calibration_id, null);
  assert.equal(records.utterance.kind, "sustained");
  assert.equal(records.utterance.duration_ms, 500);

  const summary = JSON.parse(records.utterance.metrics_json);
  assert.equal(summary.core_version, "0.1.0");
  assert.ok(records.metricSeries.length > 0);
  assert.equal(records.measureVersion.core_version, "0.1.0");
});

test("history is newest first and carries kind, duration and confidence", () => {
  const sessions = [
    { id: "s1", started_at: 1000, core_version: "0.1.0" },
    { id: "s2", started_at: 2000, core_version: "0.1.0" },
  ];
  const utterances = [
    {
      id: "u1",
      session_id: "s1",
      kind: "sustained",
      duration_ms: 3000,
      metrics_json: JSON.stringify(goodSummary()),
    },
  ];

  const rows = toHistoryViewModel(sessions, utterances);
  assert.equal(rows[0].id, "s2", "newest first");
  assert.equal(rows[1].id, "s1");
  assert.equal(rows[1].kind, "sustained");
  assert.equal(rows[1].confidence, 0.8);

  const summary = historyRowSummary(rows[1]);
  assert.match(summary, /sustained/);
  assert.match(summary, /confidence: high/);
});

test("dates use Intl", () => {
  const text = formatDate(Date.UTC(2026, 0, 1, 12, 0), { locale: "en-US", timeZone: "UTC" });
  assert.match(text, /2026/);
  assert.match(text, /Jan/);
});

test("a healthy comparison is self-referential with Earlier/Now labels", () => {
  const view = toComparisonViewModel(
    { summary: goodSummary(), hasAudio: true },
    { summary: goodSummary(), hasAudio: true },
  );
  assert.equal(view.heading, "Compare");
  assert.equal(view.labels.earlier, "Earlier");
  assert.equal(view.labels.now, "Now");
  assert.deepEqual(view.caveats, []);
  assert.match(view.lines[0], /^Earlier: 180 Hz/);
  assert.match(view.lines[0], /confidence: high/);
  assert.match(view.normativeNote, /off/);
});

test("missing audio and low confidence are stated, not hidden", () => {
  const noAudio = toComparisonViewModel(
    { summary: goodSummary(), hasAudio: false },
    { summary: goodSummary(), hasAudio: true },
  );
  assert.deepEqual(noAudio.caveats, [COMPARE_COPY.noAudio]);

  const lowConfidence = toComparisonViewModel(
    { summary: goodSummary({ confidence: { mean_formant: 0.3, voicing_p05: 0.2 } }), hasAudio: true },
    { summary: goodSummary(), hasAudio: true },
  );
  assert.ok(lowConfidence.caveats.includes(COMPARE_COPY.lowConfidence));
});

test("summaryReliable uses the 0.6 formant threshold", () => {
  assert.equal(summaryReliable(goodSummary()), true);
  assert.equal(summaryReliable(goodSummary({ confidence: { mean_formant: 0.59 } })), false);
  assert.equal(summaryReliable(null), false);
});

test("history copy matches phase 6", () => {
  assert.equal(HISTORY_COPY.empty, "No sessions yet. Your practice will appear here.");
  assert.equal(HISTORY_COPY.loadError.action, "Reload");
});
