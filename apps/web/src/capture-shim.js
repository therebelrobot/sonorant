// Main-thread capture shim (TDD §6.1): microphone -> AudioWorklet -> Worker.
//
// Capture happens in the audio callback; analysis and recording happen on the
// Worker. This module only wires the two together and detects SharedArrayBuffer.

import { ERROR, FRAMES, PCM, RECORD_START, RECORD_STOP, RECORDING } from "./protocol.js";
import { sharedArrayBufferSupported } from "./shared-array-buffer.js";

export const WORKLET_URL = "worklet/capture-processor.js";
export const WORKER_URL = "worker.js";

/**
 * Start the live pipeline for a granted `MediaStream`.
 * Returns `{ sampleRate, sharedArrayBuffer, setRecording(on), stop() }`.
 */
export async function startCapture(
  stream,
  { onFrames, onRecording, onError } = {},
  scope = globalThis,
) {
  const AudioContextCtor = scope.AudioContext ?? scope.webkitAudioContext;
  const context = new AudioContextCtor();
  await context.audioWorklet.addModule(new URL(WORKLET_URL, import.meta.url));

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "sonorant-capture");
  const worker = new scope.Worker(new URL(WORKER_URL, import.meta.url), { type: "module" });

  worker.addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === FRAMES) onFrames?.(data.frames, data.count);
    else if (data && data.type === RECORDING) onRecording?.(data.state, data.detail);
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
