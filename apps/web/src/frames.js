// Decode the flat f32 frame block the worker transmits into frame objects.
// Offsets mirror crates/sonorant-ffi/abi/frame_layout.v1.json (FRAME_WORDS = 30).

export const FRAME_WORDS = 30;
const MAX_FORMANTS = 5;

/**
 * @param {Float32Array} words
 * @returns {Array<object>} one object per complete frame
 */
export function decodeFrames(words) {
  const frames = [];
  // `t_ms` is a u32 in the struct; reading it as an f32 word yields its bit
  // pattern, not a value. Reinterpret word 0 as u32.
  const u32 = new Uint32Array(words.buffer, words.byteOffset, words.length);
  for (let i = 0; i + FRAME_WORDS <= words.length; i += FRAME_WORDS) {
    const formants = [];
    for (let f = 0; f < MAX_FORMANTS; f++) {
      const base = i + 4 + f * 3;
      formants.push({
        hz: words[base],
        bandwidth_hz: words[base + 1],
        confidence: words[base + 2],
      });
    }
    frames.push({
      t_ms: u32[i],
      f0_hz: words[i + 1],
      voicing: words[i + 2],
      f0_confidence: words[i + 3],
      formants,
      hnr_db: words[i + 19],
      cpp_db: words[i + 20],
      tilt_db_per_oct: words[i + 21],
      h1_h2_db: words[i + 22],
      centroid_hz: words[i + 23],
      scale_semitones: words[i + 24],
      rms_dbfs: words[i + 25],
      spl_db: words[i + 26],
      jitter_local: words[i + 27],
      shimmer_local: words[i + 28],
      flags: words[i + 29],
    });
  }
  return frames;
}
