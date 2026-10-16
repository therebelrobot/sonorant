// sonorant-cli (npm) — Ink orchestration CLI (TDD §3). No acoustic maths.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { render } from "ink";
import React, { createElement as h } from "react";

import { analyse } from "./analyse.js";
import { ResultView } from "./app.js";
import { summarize } from "./summary.js";
import { parseWav } from "./wav.js";

const require = createRequire(import.meta.url);

/** The wasm artifact shipped by the `sonorant` package. */
export function wasmPath() {
  const entry = require.resolve("sonorant");
  return join(dirname(entry), "..", "pkg", "sonorant_ffi_bg.wasm");
}

export async function main(argv) {
  const [command, input] = argv;
  if (command !== "analyse" || !input) {
    throw new Error("usage: sonorant-cli analyse <file.wav>");
  }

  const wav = parseWav(new Uint8Array(await readFile(input)));
  const wasmBytes = new Uint8Array(await readFile(wasmPath()));
  const frames = await analyse({ wasmBytes, sampleRate: wav.sampleRate, samples: wav.samples });
  const { status, lines } = summarize(frames);

  render(h(ResultView, { status, lines }));
}
