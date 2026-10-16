// S8.2 tests: the native shell-out path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { countFrames, runNativeFile } from "../src/native.js";

function fakeChild({ code = 0, stdout = "", stderr = "" } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (stdout) child.stdout.emit("data", stdout);
    if (stderr) child.stderr.emit("data", stderr);
    child.emit("close", code);
  });
  return child;
}

test("counts frames from the native CSV (header plus rows)", () => {
  assert.equal(countFrames("t_ms,f0_hz\n0,150\n11,150\n"), 2);
  assert.equal(countFrames(""), 0);
});

test("resolves with the native stdout on success", async () => {
  const csv = await runNativeFile("x.wav", { spawnFn: () => fakeChild({ stdout: "t_ms\n0\n" }) });
  assert.match(csv, /t_ms/);
});

test("rejects with the native stderr on failure", async () => {
  await assert.rejects(
    runNativeFile("x.wav", {
      spawnFn: () => fakeChild({ code: 1, stderr: "sonorant-cli: could not read input file: x" }),
    }),
    /could not read input file/,
  );
});
