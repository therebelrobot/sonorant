// S5.4 tests: trend series, core_version boundaries, distribution and the text
// alternative.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TREND_COPY,
  buildTrendSeries,
  channelLabel,
  segmentDistribution,
  trendDirection,
  trendPoints,
  trendStopsAt,
  trendTextAlternative,
} from "../src/store/trends.ts";

const point = (t_ms, value, coreVersion = "0.1.0", confidence = 0.8) => ({
  t_ms,
  value,
  confidence,
  coreVersion,
});

test("series splits at a core_version change and marks a boundary", () => {
  const series = buildTrendSeries({
    channel: "scale",
    points: [point(0, -1, "0.1.0"), point(100, -2, "0.1.0"), point(200, 3, "0.2.0")],
  });
  assert.equal(series.segments.length, 2);
  assert.equal(series.boundaries.length, 1);
  assert.equal(series.boundaries[0].fromVersion, "0.1.0");
  assert.equal(series.boundaries[0].toVersion, "0.2.0");
});

test("direction ignores wobble relative to the span", () => {
  assert.equal(trendDirection([1, 2, 3]), "up");
  assert.equal(trendDirection([3, 2, 1]), "down");
  assert.equal(trendDirection([0, 5, 0.2]), "steady");
});

test("distribution gives percentiles", () => {
  const d = segmentDistribution([point(0, 1), point(1, 2), point(2, 3)]);
  assert.equal(d.min, 1);
  assert.equal(d.max, 3);
  assert.equal(d.p50, 2);
  assert.equal(segmentDistribution([]), null);
});

test("text alternative states direction, range and confidence", () => {
  const series = buildTrendSeries({
    channel: "scale",
    points: [point(0, -2, "0.1.0", 0.9), point(1, 1, "0.1.0", 0.9)],
  });
  const alt = trendTextAlternative(series);
  assert.match(alt.summary, /Resonance \(semitones\) trend is up/);
  assert.match(alt.summary, /-2\.0 to 1\.0/);
  assert.match(alt.summary, /confidence: high/);
  assert.equal(alt.boundaryNote, null);
});

test("a boundary is reported, and the chart stops when it cannot continue", () => {
  const thin = buildTrendSeries({
    channel: "scale",
    points: [point(0, -1, "0.1.0"), point(1, -1, "0.1.0"), point(2, 5, "0.2.0")],
  });
  const alt = trendTextAlternative(thin);
  assert.equal(alt.boundaryNote, TREND_COPY.boundaryBody);
  assert.equal(alt.stoppedNote, TREND_COPY.stopped);
  assert.ok(trendStopsAt(thin));

  const enough = buildTrendSeries({
    channel: "scale",
    points: [
      point(0, -1, "0.1.0"),
      point(1, -1, "0.1.0"),
      point(2, 5, "0.2.0"),
      point(3, 6, "0.2.0"),
    ],
  });
  assert.equal(trendTextAlternative(enough).stoppedNote, null);
});

test("too few points yields the empty message", () => {
  const alt = trendTextAlternative(buildTrendSeries({ channel: "f0", points: [point(0, 180)] }));
  assert.equal(alt.summary, TREND_COPY.empty);
});

test("trendPoints places points at wall-clock time with the session's core_version", () => {
  const sessions = [{ id: "s1", core_version: "0.1.0", started_at: 1000 }];
  const utterances = [{ id: "u1", session_id: "s1" }];
  const rows = [
    { utterance_id: "u1", channel: "scale", t_ms: 5, value: -1, confidence: 0.7 },
    { utterance_id: "u1", channel: "f0", t_ms: 5, value: 180, confidence: 0.7 },
  ];
  const points = trendPoints(sessions, utterances, rows, "scale");
  assert.equal(points.length, 1);
  assert.equal(points[0].coreVersion, "0.1.0");
  assert.equal(points[0].value, -1);
  assert.equal(points[0].t_ms, 1005);
});

test("channel labels name the measure in text", () => {
  assert.equal(channelLabel("scale"), "Resonance (semitones)");
  assert.equal(channelLabel("f0"), "Pitch (Hz)");
});
