// S8.3 tests: the CLI's process-level error handling and exit codes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/sonorant-cli.js", import.meta.url));
const thisPackage = fileURLToPath(new URL("../package.json", import.meta.url));

const run = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });

test("a missing input file exits 1 with a plain-text message", () => {
  const result = run(["analyse", "/no/such/file.wav"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not read input file/);
});

test("an unsupported file exits 1", () => {
  const result = run(["analyse", thisPackage]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not supported/);
});

test("no command exits 2 with usage", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /sonorant-cli analyse <file\.wav>/);
});

test("an unknown command exits 2", () => {
  const result = run(["frobnicate"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown command/);
});

test("--version prints the version and exits 0", () => {
  const result = run(["--version"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /sonorant-cli \d+\.\d+\.\d+/);
});
