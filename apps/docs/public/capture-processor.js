// The capture shim for the docs demo.
//
// It does almost nothing, on purpose: the audio callback runs under a hard
// real-time budget, so it only copies the input into a transferable buffer and
// hands it off. All analysis happens off the audio thread (here, on the main
// thread, because the demo analyses short chunks and the visual budget is loose).
//
// This mirrors `apps/web`'s `capture-processor`, including the rule that the
// microphone is opened with echo cancellation, noise suppression and auto-gain
// all off — AGC in particular turns every dynamic-range measurement into fiction.

class SonorantCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length) {
      const copy = new Float32Array(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("sonorant-capture", SonorantCaptureProcessor);
