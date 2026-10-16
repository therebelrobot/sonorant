// S5.2 tests: the recorder is off by default, writes when on, and never lets a
// storage failure interrupt the session.

import { test } from "node:test";
import assert from "node:assert/strict";

import { RecordingState, createRecorder } from "../src/store/recorder.js";
import { WAV_HEADER_BYTES, wavHeader } from "../src/store/wav.js";

function fakeSink({ failWrite = false } = {}) {
  const written = [];
  let closed = false;
  return {
    written,
    get closed() {
      return closed;
    },
    async write(samples) {
      if (failWrite) throw new Error("no space left");
      written.push(samples);
    },
    async close() {
      closed = true;
    },
  };
}

test("wav header is a valid 44-byte RIFF/WAVE float header", () => {
  const header = wavHeader(44100, 800);
  assert.equal(header.length, WAV_HEADER_BYTES);

  const view = new DataView(header.buffer);
  const text = (offset, length) =>
    Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");

  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(text(12, 4), "fmt ");
  assert.equal(text(36, 4), "data");
  assert.equal(view.getUint32(4, true), 36 + 800, "RIFF size covers the data");
  assert.equal(view.getUint16(20, true), 3, "IEEE float format");
  assert.equal(view.getUint16(22, true), 1, "mono");
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 32, "32-bit");
  assert.equal(view.getUint32(40, true), 800, "data size");
});

test("recording off writes nothing", async () => {
  const recorder = createRecorder({ openSink: async () => fakeSink() });
  await recorder.push(new Float32Array(4));
  assert.equal(recorder.state, RecordingState.OFF);
});

test("recording on writes chunks, then stops and closes", async () => {
  const sink = fakeSink();
  const states = [];
  const recorder = createRecorder({
    openSink: async () => sink,
    onStateChange: (change) => states.push(change.state),
  });

  await recorder.start("x.wav");
  assert.equal(recorder.state, RecordingState.RECORDING);

  const chunk = new Float32Array(4);
  await recorder.push(chunk);
  assert.equal(sink.written.length, 1);
  assert.equal(sink.written[0], chunk);

  await recorder.stop();
  assert.equal(recorder.state, RecordingState.OFF);
  assert.ok(sink.closed, "stop closes the sink");
  assert.deepEqual(states, ["recording", "off"]);
});

test("a write failure stops recording without interrupting the session", async () => {
  const sink = fakeSink({ failWrite: true });
  const states = [];
  const recorder = createRecorder({
    openSink: async () => sink,
    onStateChange: (change) => states.push(change),
  });

  await recorder.start();
  await recorder.push(new Float32Array(4)); // must not throw

  assert.equal(recorder.state, RecordingState.ERROR);
  assert.ok(sink.closed, "the failed sink is closed");
  assert.equal(states[states.length - 1].state, RecordingState.ERROR);
});

test("a sink that fails to open reports an error and keeps recording off", async () => {
  const recorder = createRecorder({
    openSink: async () => {
      throw new Error("denied");
    },
  });
  await recorder.start();
  assert.equal(recorder.state, RecordingState.ERROR);
  await recorder.push(new Float32Array(4)); // still a no-op
  assert.equal(recorder.state, RecordingState.ERROR);
});
