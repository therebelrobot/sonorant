// Minimal RIFF/WAVE reader: 16/24/32-bit PCM and 32-bit float, to mono f32.
// Parsing only — no acoustic maths (AGENTS.md rule 1).

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;

function tag(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** Read one sample at byte offset `o` according to the format. */
function readSample(view, o, format, bits) {
  if (format === FORMAT_FLOAT && bits === 32) return view.getFloat32(o, true);
  if (format === FORMAT_PCM && bits === 16) return view.getInt16(o, true) / 32768;
  if (format === FORMAT_PCM && bits === 24) {
    let value = view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getUint8(o + 2) << 16);
    if (value & 0x800000) value -= 0x1000000;
    return value / 8388608;
  }
  if (format === FORMAT_PCM && bits === 32) return view.getInt32(o, true) / 2147483648;
  throw new Error(`unsupported WAV sample format: ${format} ${bits}-bit`);
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ sampleRate: number, channels: number, samples: Float32Array }}
 */
export function parseWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || tag(view, 0) !== "RIFF" || tag(view, 8) !== "WAVE") {
    throw new Error("not a WAV file");
  }

  let fmt = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      // 0xFFFE is WAVE_FORMAT_EXTENSIBLE: the real code is the first word of the
      // sub-format GUID.
      let format = view.getUint16(body, true);
      if (format === 0xfffe && size >= 40) format = view.getUint16(body + 24, true);
      fmt = {
        format,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      data = { offset: body, size: Math.min(size, bytes.byteLength - body) };
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV is missing its fmt or data chunk");

  const channels = fmt.channels || 1;
  const bytesPerSample = fmt.bitsPerSample / 8;
  const frames = Math.floor(data.size / bytesPerSample / channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    samples[i] = readSample(view, data.offset + i * channels * bytesPerSample, fmt.format, fmt.bitsPerSample);
  }
  return { sampleRate: fmt.sampleRate, channels, samples };
}
