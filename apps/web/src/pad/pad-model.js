// Pad model (phase 6 S2.2): pure mapping and classification. No drawing here.

export const PITCH_MIN_HZ = 60;
export const PITCH_MAX_HZ = 1200;
export const RESONANCE_MIN_SEMITONES = -6;
export const RESONANCE_MAX_SEMITONES = 6;

const LOG_PITCH_SPAN = Math.log2(PITCH_MAX_HZ / PITCH_MIN_HZ);

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** Pitch to a 0..1 position (logarithmic, so octaves are evenly spaced). */
export function mapPitch(hz) {
  const f0 = clamp(hz, PITCH_MIN_HZ, PITCH_MAX_HZ);
  return Math.log2(f0 / PITCH_MIN_HZ) / LOG_PITCH_SPAN;
}

/** Resonance (semitones) to a 0..1 position. */
export function mapResonance(semitones) {
  return (
    (clamp(semitones, RESONANCE_MIN_SEMITONES, RESONANCE_MAX_SEMITONES) - RESONANCE_MIN_SEMITONES) /
    (RESONANCE_MAX_SEMITONES - RESONANCE_MIN_SEMITONES)
  );
}

/**
 * A frame to a `{x, y}` point in `[0,1]^2`: x = pitch, y = resonance.
 * NaN coordinates (e.g. an unvoiced frame) fall to the minimum via `clamp`.
 */
export function padPoint(frame) {
  const f0 = Number.isFinite(frame.f0_hz) ? frame.f0_hz : PITCH_MIN_HZ;
  const st = Number.isFinite(frame.scale_semitones) ? frame.scale_semitones : 0;
  return { x: mapPitch(f0), y: mapResonance(st) };
}

/** Mirror of sonorant-core's `flags` bitfield. */
export const FLAGS = {
  CLIPPED: 1,
  LOW_SNR: 2,
  CREAK: 4,
  SUBHARMONIC: 8,
  FORMANT_UNSTABLE: 16,
  UNCALIBRATED: 32,
};

/** Phase-6 S2.2 flag labels (text, never colour alone). */
export const FLAG_LABELS = {
  [FLAGS.CLIPPED]: "Clipped",
  [FLAGS.LOW_SNR]: "Low signal",
  [FLAGS.CREAK]: "Creaky",
  [FLAGS.SUBHARMONIC]: "Subharmonic",
  [FLAGS.FORMANT_UNSTABLE]: "Formant unstable",
  [FLAGS.UNCALIBRATED]: "Not calibrated",
};

export function activeFlags(flags) {
  return Object.keys(FLAG_LABELS)
    .map(Number)
    .filter((bit) => (flags & bit) !== 0)
    .sort((a, b) => a - b)
    .map((bit) => FLAG_LABELS[bit]);
}

/** Display-confidence bands (TDD §11 thresholds). */
export const CONFIDENCE_THRESHOLDS = { high: 0.75, medium: 0.5 };

export function confidenceBand(value) {
  if (!Number.isFinite(value) || value < CONFIDENCE_THRESHOLDS.medium) return "low";
  if (value < CONFIDENCE_THRESHOLDS.high) return "medium";
  return "high";
}

/** Mean confidence over the formants that are present. 0 when there are none. */
export function meanFormantConfidence(frame) {
  const present = (frame.formants ?? [])
    .filter((f) => f && f.hz > 0)
    .map((f) => f.confidence);
  if (present.length === 0) return 0;
  return present.reduce((sum, c) => sum + c, 0) / present.length;
}

/** Phase-6 S2.3: below threshold when mean formant confidence < 0.6 or voicing < 0.4. */
export const TRUST_FORMANT_CONFIDENCE = 0.6;
export const TRUST_VOICING_CONFIDENCE = 0.4;

export function isTrustworthy(frame) {
  return (
    meanFormantConfidence(frame) >= TRUST_FORMANT_CONFIDENCE &&
    (frame.f0_confidence ?? 0) >= TRUST_VOICING_CONFIDENCE
  );
}

export function prefersReducedMotion(scope = globalThis) {
  return scope?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}
