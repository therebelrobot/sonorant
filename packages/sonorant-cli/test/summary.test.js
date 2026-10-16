// S8.1 tests: the status is a word, and the summary states the numbers.

import { test } from "node:test";
import assert from "node:assert/strict";

import { STATUS, overallStatus, summarize } from "../src/summary.js";

const frame = (over = {}) => ({
  t_ms: 0,
  f0_hz: 150,
  f0_confidence: 0.9,
  flags: 0,
  ...over,
});

test("status is a word, never colour alone", () => {
  assert.equal(overallStatus([frame()]), STATUS.OK);
  assert.equal(overallStatus([frame({ flags: 1 })]), STATUS.WARNING, "clipped");
  assert.equal(overallStatus([frame({ f0_hz: 0 })]), STATUS.ERROR, "unvoiced");
  assert.equal(overallStatus([]), STATUS.ERROR);
});

test("summary states frames, voiced fraction and pitch", () => {
  const { status, lines } = summarize([frame({ t_ms: 0 }), frame({ t_ms: 100, f0_hz: 0 })]);
  assert.equal(status, STATUS.OK);
  const text = lines.join(" ");
  assert.match(text, /2 frame\(s\), 50% voiced/);
  assert.match(text, /150 Hz/);
});

test("the error summary explains itself", () => {
  assert.match(summarize([]).lines.join(" "), /No frames/);
  assert.match(summarize([frame({ f0_hz: 0 })]).lines.join(" "), /No voiced frames/);
});
