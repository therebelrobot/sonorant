// Opt-in recording (S5.2). Pure state machine; the storage sink is injected.
//
// Recording is OFF by default: frames are analysed and discarded in memory, and no
// audio is written. When a write fails, the session is NOT interrupted — recording
// stops, the audio is not kept, and the failure is reported.

export const RecordingState = {
  OFF: "off",
  RECORDING: "recording",
  ERROR: "error",
};

/** The exact copy from phase 6 (S2.5). */
export const RECORDING_COPY = {
  off: "Recording is off. Audio is analysed and not saved.",
  offAction: "Turn on recording",
  on: "Recording on. Audio is saved on this device only.",
  onAction: "Stop recording",
  error: {
    heading: "Recording could not be saved",
    body: "There may not be enough space on this device. Your session is still running, but the audio was not kept.",
    action: "Continue without recording",
  },
};

/**
 * @param {{ openSink: (name: string) => Promise<{write: Function, close: Function}>, onStateChange?: Function }} deps
 */
export function createRecorder({ openSink, onStateChange }) {
  let state = RecordingState.OFF;
  let sink = null;

  const announce = (detail) => onStateChange?.({ state, detail });

  async function dropSink() {
    if (!sink) return;
    try {
      await sink.close();
    } catch {
      // The failure we are reporting is the write/open error, not the close.
    }
    sink = null;
  }

  return {
    get state() {
      return state;
    },

    async start(name = "session.wav") {
      if (state === RecordingState.RECORDING) return state;
      try {
        sink = await openSink(name);
        state = RecordingState.RECORDING;
      } catch (error) {
        sink = null;
        state = RecordingState.ERROR;
        announce(String(error));
        return state;
      }
      announce();
      return state;
    },

    /** Called for each captured chunk. A no-op when recording is off. */
    async push(samples) {
      if (state !== RecordingState.RECORDING || !sink) return;
      try {
        await sink.write(samples);
      } catch (error) {
        await dropSink();
        state = RecordingState.ERROR;
        announce(String(error));
      }
    },

    async stop() {
      await dropSink();
      state = RecordingState.OFF;
      announce();
      return state;
    },
  };
}
