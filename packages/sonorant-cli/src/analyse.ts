// Drive the Rust core through the shared contract via the `sonorant` WASM
// wrapper. All acoustic maths happens in the core; this only moves PCM and reads
// frames (AGENTS.md rule 1).

import { decodeFrames, framesView, loadEngine } from "sonorant";

export async function analyse({
  wasmBytes,
  sampleRate,
  samples,
  frameLen = 2048,
  hop = 512,
  lpcOrder = 24,
}) {
  const engine = await loadEngine(sampleRate, { wasmBytes });
  engine.configure(frameLen, hop, lpcOrder);
  engine.push(samples);
  const frames = decodeFrames(framesView(engine));
  engine.free?.();
  return frames;
}
