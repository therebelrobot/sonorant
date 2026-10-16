// Minimal WAV (RIFF) header for 32-bit float mono PCM. Pure and testable.

export const WAV_HEADER_BYTES = 44;
const FORMAT_IEEE_FLOAT = 3;

/** The 44-byte RIFF/WAVE header for `dataBytes` bytes of f32 mono PCM. */
export function wavHeader(sampleRate, dataBytes) {
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES));
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  const u16 = (offset, value) => view.setUint16(offset, value, true);
  const u32 = (offset, value) => view.setUint32(offset, value, true);

  text(0, "RIFF");
  u32(4, 36 + dataBytes);
  text(8, "WAVE");
  text(12, "fmt ");
  u32(16, 16); // fmt chunk size
  u16(20, FORMAT_IEEE_FLOAT);
  u16(22, 1); // mono
  u32(24, sampleRate);
  u32(28, sampleRate * 4); // byte rate = channels * bits/8
  u16(32, 4); // block align
  u16(34, 32); // bits per sample
  text(36, "data");
  u32(40, dataBytes);
  return new Uint8Array(view.buffer);
}

/** Little-endian u32 bytes, for patching the two size fields on close. */
export function u32Bytes(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, value, true);
  return new Uint8Array(view.buffer);
}
