// sonorant-cli (npm) — Ink orchestration CLI (TDD §3). No acoustic maths.
//
// Two routes through the same `Analyzer` contract:
//   analyse <wav>          the WASM core, via the `sonorant` wrapper
//   batch  <wav...>        the native Rust binary, shelled out to

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { render } from "ink";

import { analyse } from "./analyse.ts";
import { ResultView } from "./app.tsx";
import { CliError, UNSUPPORTED, UsageError, inputError, mapError } from "./errors.ts";
import { countFrames, runNativeFile } from "./native.ts";
import { summarize } from "./summary.ts";
import { parseWav } from "./wav.ts";

export const VERSION = "0.6.1";

const USAGE = `sonorant-cli — voice analysis

USAGE:
    sonorant-cli analyse <file.wav>              analyse with the WASM core
    sonorant-cli batch <file.wav> [<file.wav>...] [--quiet]
                                                 batch analyser (native binary)
    sonorant-cli --help                          print this help
    sonorant-cli --version                       print the version`;

const require = createRequire(import.meta.url);

/** The wasm artifact shipped by the `sonorant` package. */
export function wasmPath() {
  const entry = require.resolve("sonorant");
  return join(dirname(entry), "..", "pkg", "sonorant_ffi_bg.wasm");
}

async function analyseCommand(args, io, deps) {
  const input = args.find((arg) => !arg.startsWith("-"));
  if (!input) throw new UsageError("usage: sonorant-cli analyse <file.wav>");

  let bytes;
  try {
    bytes = new Uint8Array(await deps.readFile(input));
  } catch {
    throw new CliError(inputError(input));
  }

  let wav;
  try {
    wav = parseWav(bytes);
  } catch {
    throw new CliError(UNSUPPORTED);
  }

  let frames;
  try {
    const wasmBytes = new Uint8Array(await deps.readFile(wasmPath()));
    frames = await deps.analyse({ wasmBytes, sampleRate: wav.sampleRate, samples: wav.samples });
  } catch (error) {
    throw new CliError(mapError(error));
  }

  const { status, lines } = summarize(frames);
  render(<ResultView status={status} lines={lines} />);
}

async function batchCommand(args, io, deps) {
  const quiet = args.includes("--quiet");
  const files = args.filter((arg) => !arg.startsWith("-"));
  if (files.length === 0) {
    throw new UsageError("usage: sonorant-cli batch <file.wav> [<file.wav>...] [--quiet]");
  }

  for (let i = 0; i < files.length; i++) {
    if (!quiet) io.log(`Analysing ${i + 1} of ${files.length}: ${files[i]}...`);
    let csv;
    try {
      csv = await deps.runNative(files[i]);
    } catch (error) {
      throw new CliError(mapError(error));
    }
    io.log(`${files[i]}: ok (${countFrames(csv)} frame(s))`);
  }
}

export async function main(
  argv: string[],
  deps: {
    io?: { log: (message: string) => void };
    readFile?: (path: string) => Promise<Uint8Array>;
    analyse?: (input: unknown) => Promise<unknown[]>;
    runNative?: (file: string) => Promise<string>;
  } = {},
) {
  const io = deps.io ?? console;
  const resolved = {
    readFile,
    analyse,
    runNative: (file) => runNativeFile(file),
    ...deps,
    io,
  };

  const [command, ...args] = argv;
  if (command === "--help" || command === "-h") {
    io.log(USAGE);
    return;
  }
  if (!command) throw new UsageError(USAGE);
  if (command === "--version" || command === "-V") {
    io.log(`sonorant-cli ${VERSION}`);
    return;
  }
  if (command === "analyse") return analyseCommand(args, io, resolved);
  if (command === "batch") return batchCommand(args, io, resolved);

  throw new UsageError(`unknown command: ${command}`);
}
