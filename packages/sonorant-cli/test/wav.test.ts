// S8.1 tests: the WAV parser and the status/summary logic.

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseWav } from "../src/wav.ts";

/** Build a 32-bit float WAV from interleaved samples. */
function floatWav(samples, { sampleRate = 44100, channels = 1 } = {}) {
  const dataBytes = samples.length * 4;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 4, true);
  view.setUint16(32, channels * 4, true);
  view.setUint16(34, 32, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  samples.forEach((sample, i) => view.setFloat32(44 + i * 4, sample, true));
  return new Uint8Array(buffer);
}

test("parses a 32-bit float mono WAV to f32", () => {
  const wav = parseWav(floatWav([0, 0.5, -0.5, 1]));
  assert.equal(wav.sampleRate, 44100);
  assert.equal(wav.channels, 1);
  assert.equal(wav.samples.length, 4);
  assert.equal(wav.samples[1], 0.5);
  assert.equal(wav.samples[3], 1);
});

test("takes channel 0 of a stereo file", () => {
  const wav = parseWav(floatWav([0.1, 0.9, 0.2, 0.8], { channels: 2 }));
  assert.equal(wav.channels, 2);
  assert.equal(wav.samples.length, 2);
  assert.equal(wav.samples[0], Math.fround(0.1));
  assert.equal(wav.samples[1], Math.fround(0.2));
});

test("honours the file's sample rate", () => {
  assert.equal(parseWav(floatWav([0, 0], { sampleRate: 16000 })).sampleRate, 16000);
});

/** Build a WAVE_FORMAT_EXTENSIBLE float WAV (as `hound` writes). */
function extensibleFloatWav(samples, sampleRate = 44100) {
  const dataBytes = samples.length * 4;
  const buffer = new ArrayBuffer(68 + dataBytes);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 40, true);
  view.setUint16(20, 0xfffe, true); // EXTENSIBLE
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  view.setUint16(36, 22, true); // cbSize
  view.setUint16(38, 32, true); // valid bits
  view.setUint32(40, 0, true); // channel mask
  view.setUint16(44, 3, true); // sub-format GUID: IEEE float
  text(60, "data");
  view.setUint32(64, dataBytes, true);
  samples.forEach((sample, i) => view.setFloat32(68 + i * 4, sample, true));
  return new Uint8Array(buffer);
}

test("resolves WAVE_FORMAT_EXTENSIBLE to its sub-format", () => {
  const wav = parseWav(extensibleFloatWav([0, 0.5, -0.25]));
  assert.equal(wav.samples.length, 3);
  assert.equal(wav.samples[1], 0.5);
  assert.equal(wav.samples[2], -0.25);
});

test("rejects a file that is not a WAV", () => {
  assert.throws(() => parseWav(new Uint8Array(64)), /not a WAV file/);
});
