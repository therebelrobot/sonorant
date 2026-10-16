// Main-thread capture shim (TDD §6.1): microphone -> AudioWorklet -> Worker.
//
// Capture happens in the audio callback; analysis and recording happen on the
// Worker. This module only wires the two together and detects SharedArrayBuffer.

import { ERROR, FRAMES, PCM, RECORD_START, RECORD_STOP, RECORDING, VERSIONS } from "./protocol.js";
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

  worker.addEventListener("message", (event) => {
    const data = event.data;
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

  // Analysis only: route through a muted gain node so the audio graph pulls the
  // worklet (a node not connected onward is never processed) without playing it.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(context.destination);

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
