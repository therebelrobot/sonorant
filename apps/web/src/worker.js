// Analysis Worker (TDD §6.1): receive PCM chunks and drive the wasm core.
// Runs on a normal thread, so a slow frame here is not an audio glitch.
//
// The `./vendor/sonorant/...` path is produced by the apps/web build, which copies
// the `sonorant` package (src + pkg) into `dist/vendor/`.

import { loadEngine, framesView, FRAME_WORDS } from "./vendor/sonorant/src/index.js";
import { PCM, FRAMES, READY, ERROR } from "./protocol.js";

let engine = null;
let sampleRate = 44100;

async function ensureEngine(rate) {
  if (!engine || rate !== sampleRate) {
    sampleRate = rate;
    engine = await loadEngine(rate);
    engine.configure(2048, 512, 24);
  }
}

self.addEventListener("message", async (event) => {
  const data = event.data;
  if (!data || data.type !== PCM) return;
  try {
    await ensureEngine(data.sampleRate ?? sampleRate);
    const count = engine.push(data.samples);
    if (count > 0) {
      // Copy out so the Float32Array can be transferred to the main thread.
      const frames = framesView(engine).slice();
      self.postMessage({ type: FRAMES, frames, count, words: FRAME_WORDS }, [frames.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: ERROR, message: String(error) });
  }
});

self.postMessage({ type: READY });
