// S6-wiring tests: the store rows map to and from the archive bundle.

import { test } from "node:test";
import assert from "node:assert/strict";

import { EMPTY_BUNDLE_JSON, fromBundle, metricSeriesId, toBundle } from "../src/store/bundle.js";

test("rows map to keyed records and back", () => {
  const sessions = [{ id: "s1", core_version: "0.1.0" }];
  const utterances = [{ id: "u1", session_id: "s1", kind: "sustained" }];
  const series = [{ utterance_id: "u1", channel: "scale", t_ms: 100, value: -1, confidence: 0.7 }];

  const bundle = toBundle(sessions, utterances, series);
  assert.equal(bundle.sessions[0].id, "s1");
  assert.deepEqual(bundle.sessions[0].data, sessions[0]);
  assert.equal(bundle.metric_series[0].id, "u1:scale:100");

  const back = fromBundle(bundle);
  assert.deepEqual(back.sessions, sessions);
  assert.deepEqual(back.utterances, utterances);
  assert.deepEqual(back.metric_series, series);
});

test("metric_series ids are stable and unique per point", () => {
  const a = metricSeriesId({ utterance_id: "u", channel: "f0", t_ms: 0 });
  const b = metricSeriesId({ utterance_id: "u", channel: "f0", t_ms: 100 });
  assert.notEqual(a, b);
  assert.equal(a, "u:f0:0");
});

test("an empty bundle is valid JSON with all three collections", () => {
  const parsed = JSON.parse(EMPTY_BUNDLE_JSON);
  assert.deepEqual(Object.keys(parsed).sort(), ["metric_series", "sessions", "utterances"]);
});
