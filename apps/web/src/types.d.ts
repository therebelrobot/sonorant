// Shared TypeScript types for the web app. Imported by JSDoc in the JS modules as
// `import("../types").Frame`.

export interface Formant {
  hz: number;
  bandwidth_hz: number;
  confidence: number;
}

/** One analysis frame, as decoded from the flat f32 block. */
export interface Frame {
  t_ms: number;
  f0_hz: number;
  voicing: number;
  f0_confidence: number;
  formants: Formant[];
  hnr_db: number;
  cpp_db: number;
  tilt_db_per_oct: number;
  h1_h2_db: number;
  centroid_hz: number;
  scale_semitones: number;
  rms_dbfs: number;
  spl_db: number;
  jitter_local: number;
  shimmer_local: number;
  flags: number;
}
