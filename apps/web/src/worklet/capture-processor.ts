// AudioWorklet capture processor (TDD §6.1).
//
// The audio callback runs under a hard real-time budget. This file does the minimum:
// copy channel 0 into a transferable Float32Array, chunk it, post it to the Worker.
// NO analysis happens here — LPC root-finding and cepstral analysis run on the
// Worker, where one slow frame is not an audible glitch.
//
// It is deliberately import-free: `wasm-pack --target web` output does not resolve
// in the worklet global scope, and keeping this module self-contained avoids the
// question entirely.

/** Message type for a block of PCM. Mirrors `protocol.js` (not imported). */
export const PCM = "sonorant/pcm";

/** Samples per posted chunk. One analysis frame's worth arrives per batch. */
export const DEFAULT_CHUNK_SAMPLES = 2048;

/**
 * Accumulate arbitrary-length blocks and emit fixed-size copies.
 * Returns an object with `push(block) -> Float32Array[]`.
 */
export function createChunker(chunkSize = DEFAULT_CHUNK_SAMPLES) {
  let pending = new Float32Array(0);
  return {
    push(block) {
      const merged = new Float32Array(pending.length + block.length);
      merged.set(pending, 0);
      merged.set(block, pending.length);

      const chunks = [];
      let offset = 0;
      while (merged.length - offset >= chunkSize) {
        // slice() copies, so the buffer is transferable without aliasing.
        chunks.push(merged.slice(offset, offset + chunkSize));
        offset += chunkSize;
      }
      pending = merged.slice(offset);
      return chunks;
    },
  };
}

/**
 * The testable core of the worklet: copy, chunk, post. Returns `true` so the
 * browser keeps the node alive.
 */
export class CaptureProcessorCore {
  constructor({ chunkSize = DEFAULT_CHUNK_SAMPLES, post = () => {} } = {}) {
    this.chunker = createChunker(chunkSize);
    this.post = post;
    this.chunksSent = 0;
  }

  /** `inputs` is `[[channel0, ...], ...]`; only channel 0 is used (mono). */
  process(inputs) {
    const channel = inputs && inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      for (const chunk of this.chunker.push(channel)) {
        this.post({ type: PCM, samples: chunk }, [chunk.buffer]);
        this.chunksSent += 1;
      }
    }
    return true;
  }
}

// Register the real processor only inside an AudioWorklet global scope.
if (typeof registerProcessor === "function" && typeof AudioWorkletProcessor === "function") {
  class SonorantCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.core = new CaptureProcessorCore({
        post: (message, transfer) => this.port.postMessage(message, transfer),
      });
    }

    process(inputs) {
      return this.core.process(inputs);
    }
  }
  registerProcessor("sonorant-capture", SonorantCaptureProcessor);
}
