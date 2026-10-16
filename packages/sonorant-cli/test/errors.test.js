// S8.3 tests: every failure maps to a plain-text message with a non-zero exit.

import { test } from "node:test";
import assert from "node:assert/strict";

import { UNSUPPORTED, inputError, mapError } from "../src/errors.js";

test("a wasm hash mismatch maps to the phase-6 copy", () => {
  const mapped = mapError(
    new Error("sonorant: wasm hash mismatch (expected a, got b). Reinstall the package."),
  );
  assert.match(mapped, /did not match its expected checksum/);
  assert.match(mapped, /Reinstall the tool/);
});

test("an ABI mismatch maps to the phase-6 copy", () => {
  const mapped = mapError(new Error("sonorant: CORE_ABI_VERSION mismatch (loader 1, core 2)."));
  assert.match(mapped, /do not match/);
  assert.match(mapped, /Update both to the same version/);
});

test("other failures keep their cause, prefixed", () => {
  assert.equal(mapError(new Error("boom")), "sonorant-cli: boom");
});

test("input and unsupported copy match phase 6", () => {
  assert.equal(inputError("/x/y.wav"), "sonorant-cli: could not read input file: /x/y.wav");
  assert.equal(UNSUPPORTED, "sonorant-cli: this file format is not supported.");
});
