// Native shell-out path (S8.2). For batch and conformance work, the CLI shells out
// to the native Rust `sonorant-cli` binary, which drives the same `Analyzer`
// contract; the CLI parses its CSV output. No acoustic maths here.

import { spawn } from "node:child_process";

/** The native binary to use. Overridable for tests and non-PATH installs. */
export function nativeBinary(env = process.env) {
  return env.SONORANT_NATIVE_CLI ?? "sonorant-cli";
}

/** Run the native analyser on one file; resolves with its CSV stdout. */
export function runNativeFile(file, { binary = nativeBinary(), spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(binary, [file], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${binary} exited with code ${code}`));
    });
  });
}

/** Frames in the native CSV output: a header row, then one row per frame. */
export function countFrames(csv) {
  const lines = csv.split("\n").filter((line) => line.trim().length);
  return Math.max(0, lines.length - 1);
}
