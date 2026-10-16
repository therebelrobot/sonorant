// S4.1 tests: the mandatory constraints are applied, the secure-context check is
// honest, and the denied copy is guidance with a Try again action.
// Run with `node --test` from apps/web.

import { test } from "node:test";
import assert from "node:assert/strict";

import { COPY, MIC_CONSTRAINTS, isSecure, openMicrophone } from "../src/capture.js";

test("microphone constraints are the mandatory ones (TDD §6.1)", () => {
  assert.deepEqual(MIC_CONSTRAINTS, {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
});

test("isSecure reflects the window and defaults to false", () => {
  assert.equal(isSecure({ isSecureContext: true }), true);
  assert.equal(isSecure({ isSecureContext: false }), false);
  assert.equal(isSecure({}), false);
});

test("openMicrophone passes exactly the mandatory constraints", async () => {
  let seen;
  const fakeWindow = {
    navigator: {
      mediaDevices: {
        getUserMedia: async (constraints) => {
          seen = constraints;
          return { id: "stream" };
        },
      },
    },
  };
  const stream = await openMicrophone(fakeWindow);
  assert.deepEqual(seen, MIC_CONSTRAINTS);
  assert.equal(stream.id, "stream");
});

test("copy matches phase 6 and denied offers a way forward", () => {
  assert.equal(COPY.insecure.action, "Reload");
  assert.match(COPY.insecure.body, /HTTPS/);
  assert.match(COPY.insecure.body, /Nothing is recorded/);

  assert.equal(COPY.permission.action, "Allow microphone");
  assert.match(COPY.permission.body, /on your device/);

  assert.equal(COPY.denied.action, "Try again");
  assert.match(COPY.denied.body, /browser settings/);
  assert.match(COPY.denied.body, /Nothing has been recorded/);
});
