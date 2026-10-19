import { useCallback, useRef, useState } from "react";
import type { VoiceFrame } from "sonorant-react";

// Served from `public/`, so it stays a real same-origin URL (a bundled `?url`
// import gets inlined as a data: URL, which `addModule` rejects).
const processorUrl = `${import.meta.env.BASE_URL}capture-processor.js`;

export type LiveStatus = "idle" | "starting" | "running" | "error";

interface Active {
  context: AudioContext;
  stream: MediaStream;
  node: AudioWorkletNode;
}

/**
 * Open the microphone and feed it through the real WASM core, off the render
 * path. This is a demonstration, so it analyses on the main thread; the app
 * itself analyses on a Worker (TDD §6.1). The microphone constraints are not
 * optional — the browser's AGC, noise suppression and echo cancellation all
 * corrupt the measurements they touch.
 */
export function useLiveCapture(onFrames: (frames: VoiceFrame[]) => void) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const active = useRef<Active | null>(null);
  const onFramesRef = useRef(onFrames);
  onFramesRef.current = onFrames;

  const stop = useCallback(async () => {
    const current = active.current;
    active.current = null;
    if (!current) {
      setStatus("idle");
      return;
    }
    try {
      current.node.port.onmessage = null;
      current.node.disconnect();
      for (const track of current.stream.getTracks()) track.stop();
      await current.context.close();
    } catch {
      /* shutting down best-effort */
    }
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser has no microphone API available on this page.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("This browser has no Web Audio API.");
      const context = new Ctor();
      await context.audioWorklet.addModule(processorUrl);

      // Import on demand: the WASM bundle only loads when the demo is used.
      const { loadEngine, framesView, decodeFrames } = await import("sonorant");
      const engine = await loadEngine(context.sampleRate);
      engine.configure(2048, 512, 24);

      const node = new AudioWorkletNode(context, "sonorant-capture");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        engine.push(event.data);
        const decoded = decodeFrames(framesView(engine)) as unknown as VoiceFrame[];
        if (decoded.length) onFramesRef.current(decoded);
      };

      const source = context.createMediaStreamSource(stream);
      source.connect(node);
      node.connect(context.destination);

      active.current = { context, stream, node };
      setStatus("running");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "The microphone could not be opened.");
    }
  }, []);

  return { status, error, start, stop };
}
