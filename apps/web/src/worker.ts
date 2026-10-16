// Analysis Worker (TDD §6.1, §7): receive PCM, drive the wasm core, and — only
// when the member turned recording on — write the audio to OPFS.
//
// The `./vendor/sonorant/...` path is produced by the apps/web build.

import { FRAME_WORDS, framesView, loadEngine } from "./vendor/sonorant/src/index.js";
import {
  describeArchive,
  exportArchive,
  importArchive,
} from "./vendor/sonorant/src/index.js";
import { createRecorder } from "./store/recorder.ts";
import { opfsWavSink } from "./store/opfs.ts";
import {
  ARCHIVE_DESCRIBE,
  ARCHIVE_ERROR,
  ARCHIVE_EXPORT,
  ARCHIVE_IMPORT,
  ARCHIVE_RESULT,
  ERROR,
  FRAMES,
  PCM,
  READY,
  RECORDING,
  RECORD_START,
  RECORD_STOP,
  VERSIONS,
} from "./protocol.ts";

let engine = null;
let sampleRate = 44100;
let recorder = null;
let announcedVersions = false;

function recorderFor(rate) {
  if (!recorder) {
    recorder = createRecorder({
      openSink: (name) => opfsWavSink(name, rate),
      onStateChange: ({ state, detail }) =>
        self.postMessage({ type: RECORDING, state, detail }),
    });
  }
  return recorder;
}

async function ensureEngine(rate) {
  if (!engine || rate !== sampleRate) {
    sampleRate = rate;
    engine = await loadEngine(rate);
    engine.configure(2048, 512, 24);
  }
}

self.addEventListener("message", async (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === RECORD_START) {
    sampleRate = data.sampleRate ?? sampleRate;
    await recorderFor(sampleRate).start(`session-${Date.now()}.wav`);
    return;
  }

  if (data.type === RECORD_STOP) {
    if (recorder) await recorder.stop();
    return;
  }

  // The archive runs here, not on the page: the page's CSP is connect-src 'none',
  // so only the worker may fetch the wasm artifact.
  if (data.type === ARCHIVE_DESCRIBE || data.type === ARCHIVE_EXPORT || data.type === ARCHIVE_IMPORT) {
    try {
      let value;
      if (data.type === ARCHIVE_DESCRIBE) {
        value = await describeArchive(new Uint8Array(data.bytes));
      } else if (data.type === ARCHIVE_EXPORT) {
        value = await exportArchive(data.payload);
      } else {
        value = await importArchive({ ...data.payload, bytes: new Uint8Array(data.bytes) });
      }
      self.postMessage({ type: ARCHIVE_RESULT, id: data.id, value });
    } catch (error) {
      self.postMessage({ type: ARCHIVE_ERROR, id: data.id, message: String(error?.message ?? error) });
    }
    return;
  }

  if (data.type !== PCM) return;

  try {
    await ensureEngine(data.sampleRate ?? sampleRate);
    if (!announcedVersions) {
      announcedVersions = true;
      try {
        self.postMessage({
          type: VERSIONS,
          coreVersion: engine.core_version(),
          abiVersion: engine.abi_version(),
        });
      } catch {
        // Versions are informational; never let them stop analysis.
      }
    }
    // Recording is off by default: this is a no-op unless the member turned it on.
    if (recorder) await recorder.push(data.samples);

    const count = engine.push(data.samples);
    if (count > 0) {
      const frames = framesView(engine).slice();
      self.postMessage({ type: FRAMES, frames, count, words: FRAME_WORDS }, [frames.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: ERROR, message: String(error) });
  }
});

self.postMessage({ type: READY });
