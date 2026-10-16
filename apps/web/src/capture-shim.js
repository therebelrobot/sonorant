// Main-thread capture shim (TDD §6.1): microphone -> AudioWorklet -> Worker.
//
// Capture happens in the audio callback; analysis and recording happen on the
// Worker. This module only wires the two together and detects SharedArrayBuffer.

import {
  ARCHIVE_DESCRIBE,
  ARCHIVE_ERROR,
  ARCHIVE_EXPORT,
  ARCHIVE_IMPORT,
  ARCHIVE_RESULT,
  ERROR,
  FRAMES,
  PCM,
  RECORDING,
  RECORD_START,
  RECORD_STOP,
  VERSIONS,
} from "./protocol.js";
import { sharedArrayBufferSupported } from "./shared-array-buffer.js";

export const WORKLET_URL = "worklet/capture-processor.js";
export const WORKER_URL = "worker.js";

/**
 * Start the live pipeline for a granted `MediaStream`.
 * Returns `{ sampleRate, sharedArrayBuffer, setRecording(on), stop() }`.
 */
export async function startCapture(
  stream,
  { onFrames, onRecording, onVersions, onError, context: providedContext } = {},
  scope = globalThis,
) {
  const AudioContextCtor = scope.AudioContext ?? scope.webkitAudioContext;
  // Prefer a context the caller created inside the user gesture; an AudioContext
  // created after an await starts suspended and its worklet never runs.
  const context = providedContext ?? new AudioContextCtor();
  if (context.state === "suspended") await context.resume();
  await context.audioWorklet.addModule(new URL(WORKLET_URL, import.meta.url));

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "sonorant-capture");
  const worker = new scope.Worker(new URL(WORKER_URL, import.meta.url), { type: "module" });

  const pending = new Map();
  let nextArchiveId = 0;
  const archiveRequest = (type, payload) => {
    const id = (nextArchiveId += 1);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      // No transfer: the same bytes may be described and then imported.
      worker.postMessage({ type, id, ...payload });
    });
  };

  worker.addEventListener("message", (event) => {
    const data = event.data;
    if (data && (data.type === ARCHIVE_RESULT || data.type === ARCHIVE_ERROR)) {
      const entry = pending.get(data.id);
      if (entry) {
        pending.delete(data.id);
        if (data.type === ARCHIVE_RESULT) entry.resolve(data.value);
        else entry.reject(new Error(data.message));
      }
      return;
    }
    if (data && data.type === FRAMES) onFrames?.(data.frames, data.count);
    else if (data && data.type === RECORDING) onRecording?.(data.state, data.detail);
    else if (data && data.type === VERSIONS) onVersions?.(data);
    else if (data && data.type === ERROR) onError?.(data.message);
  });

  node.port.onmessage = (event) => {
    const data = event.data;
    if (data && data.type === PCM) {
      worker.postMessage(
        { type: PCM, samples: data.samples, sampleRate: context.sampleRate },
        [data.samples.buffer],
      );
    }
  };

  // Analysis only: do NOT connect the node to the destination (no playback).
  source.connect(node);

  return {
    sampleRate: context.sampleRate,
    sharedArrayBuffer: sharedArrayBufferSupported(scope),
    describeArchive: (bytes) => archiveRequest(ARCHIVE_DESCRIBE, { bytes }),
    exportArchive: (payload) => archiveRequest(ARCHIVE_EXPORT, { payload }),
    importArchive: ({ bytes, existingJson, passphrase }) =>
      archiveRequest(ARCHIVE_IMPORT, { bytes, payload: { existingJson, passphrase } }),
    setRecording(on) {
      worker.postMessage({
        type: on ? RECORD_START : RECORD_STOP,
        sampleRate: context.sampleRate,
      });
    },
    async stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      worker.terminate();
      await context.close();
    },
  };
}
