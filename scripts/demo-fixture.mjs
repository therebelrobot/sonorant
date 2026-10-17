#!/usr/bin/env node
// Generate the docs-site demo fixtures: real analyses, captured as per-frame JSON.
//
// The documentation's visualization demo renders these by default, so they must be
// genuine measurements, not hand-authored approximations. This script runs the
// native `sonorant-cli` and converts its CSV to the frame objects the components
// consume. Two fixtures are produced:
//
//   reference-vowel.frames.json   the committed reference vowel, analysed as-is
//   synthetic-glide.frames.json   a synthetic pitch + resonance glide, analysed as
//                                 one signal so the pad shows a trajectory
//
// The outputs are committed, so the docs build and the Pages workflow never need a
// Rust toolchain.
//
//   node scripts/demo-fixture.mjs [--bin <path>]

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const bin = flag("--bin", join(ROOT, "target", "debug", "sonorant-cli"));
const outDir = join(ROOT, "apps", "docs", "src", "demo");
const SAMPLE_RATE = 44100;

const num = (raw) => (raw === "NaN" ? null : Number(raw));

function parseCsv(csv) {
  const lines = csv.trim().split("\n");
  const frames = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const formants = [];
    for (let f = 0; f < 5; f++) {
      const base = 4 + f * 3;
      formants.push({
        hz: num(c[base]),
        bandwidth_hz: num(c[base + 1]),
        confidence: num(c[base + 2]),
      });
    }
    frames.push({
      t_ms: Number(c[0]),
      f0_hz: num(c[1]),
      voicing: num(c[2]),
      f0_confidence: num(c[3]),
      formants,
      hnr_db: num(c[19]),
      cpp_db: num(c[20]),
      tilt_db_per_oct: num(c[21]),
      h1_h2_db: num(c[22]),
      centroid_hz: num(c[23]),
      scale_semitones: num(c[24]),
      rms_dbfs: num(c[25]),
      spl_db: num(c[26]),
      jitter_local: num(c[27]),
      shimmer_local: num(c[28]),
      flags: num(c[29]),
    });
  }
  return frames;
}

const analyse = (wav) =>
  parseCsv(
    execFileSync(bin, ["analyse", "--session", "--quiet", wav], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  );

// ---- minimal 32-bit float mono WAV read/write (matches sonorant-cli's writer) ----

function readWavF32(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`not a WAV: ${path}`);
  }
  let offset = 12;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "data") {
      data = buf.subarray(body, body + size);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!data) throw new Error(`no data chunk in ${path}`);
  // The float samples share the Buffer's memory; copy them so concatenation is safe.
  return Float32Array.from(new Float32Array(data.buffer, data.byteOffset, data.length / 4));
}

function writeWavF32(path, samples) {
  const dataBytes = samples.length * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 4, 28); // byte rate
  buf.writeUInt16LE(4, 32); // block align
  buf.writeUInt16LE(32, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  Buffer.from(samples.buffer, samples.byteOffset, dataBytes).copy(buf, 44);
  writeFileSync(path, buf);
}

// ---- fixtures ------------------------------------------------------------------

const version = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();

function writeFixture(file, payload) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, file), `${JSON.stringify(payload, null, 2)}\n`);
  process.stderr.write(`demo-fixture: wrote ${payload.frames.length} frames to ${file}\n`);
}

// 1. The committed reference vowel, unchanged.
const reference = analyse(join(ROOT, "fixtures", "reference", "vowel-150.wav"));
writeFixture("reference-vowel.frames.json", {
  fixture_format: 1,
  source: "fixtures/reference/vowel-150.wav",
  generator: `${version} analyse`,
  description:
    "Synthetic reference vowel, f0 ~150 Hz, formants 700/1220/2600 Hz, 0.3 s @ 44100 Hz. " +
    "A real, sustained measurement: pitch and resonance are steady.",
  frame_len: 2048,
  hop: 512,
  frames: reference,
});

// 2. A synthetic glide: pitch rises while the formants scale down (a longer
//    apparent tract), analysed as one signal so the pad draws a trajectory.
const STEPS = 12;
const STEP_SECONDS = 0.2;
const tmp = mkdtempSync(join(tmpdir(), "sonorant-glide-"));
const samples = [];
for (let i = 0; i < STEPS; i++) {
  const t = i / (STEPS - 1);
  const f0 = 110 + (260 - 110) * t;
  const scale = 1.18 - (1.18 - 0.94) * t;
  const segment = join(tmp, `seg-${i}.wav`);
  execFileSync(bin, [
    "synth",
    "--f0",
    String(f0),
    "--formant-scale",
    String(scale),
    "--duration",
    String(STEP_SECONDS),
    "--sample-rate",
    String(SAMPLE_RATE),
    "--out",
    segment,
  ]);
  samples.push(readWavF32(segment));
}
const combined = join(tmp, "glide.wav");
writeWavF32(combined, concat(samples));
const rawGlide = analyse(combined);

// The glide is stitched from independently synthesised segments, so its joins
// carry a transient the core correctly refuses to trust: unvoiced, subharmonic or
// formant-unstable frames. Keep only the frames that pass the same gate the UI
// uses, and trim the tail so the demo's "current frame" is trustworthy.
const FORMANTS_UNTRUSTED_FLAGS = 8 /* SUBHARMONIC */ | 16 /* FORMANT_UNSTABLE */;
const meanFormantConfidence = (f) => {
  const present = f.formants.filter((x) => x.hz > 0).map((x) => x.confidence);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : 0;
};
const trustworthy = (f) => f.f0_hz > 0 && (f.flags & FORMANTS_UNTRUSTED_FLAGS) === 0 && f.f0_confidence >= 0.4 && meanFormantConfidence(f) >= 0.6;

const glide = rawGlide.filter(trustworthy);
while (glide.length > 0 && !trustworthy(glide[glide.length - 1])) glide.pop();

function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

writeFixture("synthetic-glide.frames.json", {
  fixture_format: 1,
  source: "synthetic (sonorant-cli synth, 12 steps)",
  generator: `${version} synth | ${version} analyse`,
  description:
    "A synthetic glide: pitch rises 110→260 Hz while the preset vowel's formants scale 1.18→0.94 " +
    `(a longer apparent tract) over ${(STEPS * STEP_SECONDS).toFixed(1)} s. Analysed as one signal, ` +
    "so resonance moves relative to the session's own baseline. Frames the core flagged unvoiced, " +
    "subharmonic or formant-unstable (the joins between synthesised segments) are omitted: the " +
    "fixture shows the trustworthy trajectory only.",
  frame_len: 2048,
  hop: 512,
  frames: glide,
});
