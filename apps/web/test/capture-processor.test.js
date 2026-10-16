// S4.2 tests: the worklet chunks and copies; the callback posts transferables and
// does no analysis; capture is mono.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CaptureProcessorCore,
  createChunker,
  DEFAULT_CHUNK_SAMPLES,
} from "../src/worklet/capture-processor.js";

test("chunker emits exact-size copies and holds the remainder", () => {
  const chunker = createChunker(4);
  assert.equal(chunker.push(Float32Array.from([1, 2, 3])).length, 0, "not enough yet");

  const chunks = chunker.push(Float32Array.from([4, 5, 6]));
  assert.equal(chunks.length, 1);
  assert.deepEqual(Array.from(chunks[0]), [1, 2, 3, 4]);

  const next = chunker.push(Float32Array.from([7, 8, 9, 10, 11]));
  assert.deepEqual(Array.from(next[0]), [5, 6, 7, 8]);
});

test("chunks are copies, not aliases of the input", () => {
  const chunker = createChunker(2);
  const input = Float32Array.from([1, 2, 3, 4]);
  const chunks = chunker.push(input);
  input[0] = 99;
  assert.deepEqual(Array.from(chunks[0]), [1, 2], "the chunk must not alias the input");
});

test("the processor copies channel 0 and posts a transferable", () => {
  const posted = [];
  const core = new CaptureProcessorCore({
    chunkSize: 4,
    post: (message, transfer) => posted.push({ message, transfer }),
  });

  const alive = core.process([[Float32Array.from([1, 2, 3, 4, 5])]]);
  assert.equal(alive, true, "the processor must ask to stay alive");

  assert.equal(posted.length, 1);
  assert.equal(posted[0].message.type, "sonorant/pcm");
  assert.deepEqual(Array.from(posted[0].message.samples), [1, 2, 3, 4]);
  assert.equal(posted[0].transfer.length, 1);
  assert.equal(posted[0].transfer[0], posted[0].message.samples.buffer);
  assert.equal(core.chunksSent, 1);
});

test("extra channels are ignored (mono capture)", () => {
  const posted = [];
  const core = new CaptureProcessorCore({ chunkSize: 2, post: (m) => posted.push(m) });
  core.process([[Float32Array.from([1, 2]), Float32Array.from([9, 9])]]);
  assert.deepEqual(Array.from(posted[0].samples), [1, 2]);
});

test("empty input produces nothing", () => {
  const posted = [];
  const core = new CaptureProcessorCore({ post: (m) => posted.push(m) });
  core.process([[]]);
  core.process([]);
  assert.equal(posted.length, 0);
});

test("default chunk size is one analysis frame", () => {
  assert.equal(DEFAULT_CHUNK_SAMPLES, 2048);
});
