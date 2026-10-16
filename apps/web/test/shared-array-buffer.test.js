// S4.2: SharedArrayBuffer is feature-detected, never required (TDD §6.1).

import { test } from "node:test";
import assert from "node:assert/strict";

import { sharedArrayBufferSupported } from "../src/shared-array-buffer.js";

test("detects SharedArrayBuffer without requiring it", () => {
  assert.equal(sharedArrayBufferSupported({ SharedArrayBuffer: function () {} }), true);
  assert.equal(sharedArrayBufferSupported({}), false);
  assert.equal(sharedArrayBufferSupported(undefined ?? {}), false);
});
