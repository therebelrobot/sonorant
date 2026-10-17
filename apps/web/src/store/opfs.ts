// OPFS audio sink (TDD §7). Browser and worker only.
//
// Writes a 32-bit float mono WAV: a placeholder header, the PCM, then the two size
// fields patched on close.

import { u32Bytes, wavHeader } from "./wav.ts";

export async function opfsWavSink(
  fileName,
  sampleRate,
  storage = globalThis.navigator?.storage,
) {
  const root = await storage.getDirectory();
  const handle = await root.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();

  let dataBytes = 0;
  await writable.write(wavHeader(sampleRate, 0));

  return {
    async write(samples) {
      const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
      await writable.write(bytes);
      dataBytes += bytes.byteLength;
    },
    async close() {
      // Patch the RIFF and data sizes now that the length is known.
      await writable.seek(4);
      await writable.write(u32Bytes(36 + dataBytes));
      await writable.seek(40);
      await writable.write(u32Bytes(dataBytes));
      await writable.close();
    },
  };
}
