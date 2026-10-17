// Pure view-model for the Sonorant React visualizations.
//
// This module contains **no acoustic maths**. It maps and classifies the frame
// objects the Rust core produces (via `sonorant`'s `decodeFrames`), and it builds
// the text alternatives the components render alongside their charts. Every
// displayed value carries a confidence; a value with no usable confidence is not
// shown as a value (brief principle 3).
//
// The mapping here mirrors the first-party app (`apps/web/src/pad/pad-model.ts`,
// `apps/web/src/pad/summary.ts`, `apps/web/src/store/trends.ts`). It is a
// deliberate copy while the app still owns its own canvas renderer; converging
// the app onto this package is tracked as a follow-up so the two cannot drift
// silently.

/** A formant as decoded from a `sonorant` frame. */
export interface Formant {
  hz: number;
  bandwidth_hz: number;
  confidence: number;
}

/**
 * One analysed frame, structurally compatible with `sonorant`'s `DecodedFrame`.
 * Only `f0_hz`, `f0_confidence`, `scale_semitones`, `formants` and `flags` are
 * required; the rest degrade gracefully when a partial frame is passed.
 */
export interface VoiceFrame {
  t_ms: number;
  f0_hz: number;
  voicing?: number;
  f0_confidence: number;
  formants: Formant[];
  hnr_db?: number;
  cpp_db?: number;
  tilt_db_per_oct?: number;
  h1_h2_db?: number;
  centroid_hz?: number;
  scale_semitones: number;
  rms_dbfs?: number;
  spl_db?: number;
  jitter_local?: number;
  shimmer_local?: number;
  flags: number;
}

export const PITCH_MIN_HZ = 60;
export const PITCH_MAX_HZ = 1200;
export const RESONANCE_MIN_SEMITONES = -6;
export const RESONANCE_MAX_SEMITONES = 6;

const LOG_PITCH_SPAN = Math.log2(PITCH_MAX_HZ / PITCH_MIN_HZ);

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Pitch to a 0..1 position (logarithmic, so octaves are evenly spaced). */
export function mapPitch(hz: number): number {
  const f0 = clamp(hz, PITCH_MIN_HZ, PITCH_MAX_HZ);
  return Math.log2(f0 / PITCH_MIN_HZ) / LOG_PITCH_SPAN;
}

/** Resonance (semitones) to a 0..1 position. */
export function mapResonance(semitones: number): number {
  return (
    (clamp(semitones, RESONANCE_MIN_SEMITONES, RESONANCE_MAX_SEMITONES) - RESONANCE_MIN_SEMITONES) /
    (RESONANCE_MAX_SEMITONES - RESONANCE_MIN_SEMITONES)
  );
}

/**
 * A frame to a `{x, y}` point in `[0,1]^2`: x = pitch, y = resonance.
 * NaN coordinates (e.g. an unvoiced frame) fall to the minimum via `clamp`.
 */
export function padPoint(frame: VoiceFrame): { x: number; y: number } {
  const f0 = Number.isFinite(frame.f0_hz) ? frame.f0_hz : PITCH_MIN_HZ;
  const st = Number.isFinite(frame.scale_semitones) ? frame.scale_semitones : 0;
  return { x: mapPitch(f0), y: mapResonance(st) };
}

/** Mirror of `sonorant-core`'s flags bitfield (TDD §4.1). */
export const FLAGS = {
  CLIPPED: 1,
  LOW_SNR: 2,
  CREAK: 4,
  SUBHARMONIC: 8,
  FORMANT_UNSTABLE: 16,
  UNCALIBRATED: 32,
} as const;

/** Flag labels — always rendered as text, never by colour alone. */
export const FLAG_LABELS: Record<number, string> = {
  [FLAGS.CLIPPED]: "Clipped",
  [FLAGS.LOW_SNR]: "Low signal",
  [FLAGS.CREAK]: "Creaky",
  [FLAGS.SUBHARMONIC]: "Subharmonic",
  [FLAGS.FORMANT_UNSTABLE]: "Formant unstable",
  [FLAGS.UNCALIBRATED]: "Not calibrated",
};

/** The active flag labels for a frame's bitfield, in bit order. */
export function activeFlags(flags: number): string[] {
  return Object.keys(FLAG_LABELS)
    .map(Number)
    .filter((bit) => (flags & bit) !== 0)
    .sort((a, b) => a - b)
    .map((bit) => FLAG_LABELS[bit] as string);
}

/** Display-confidence bands (TDD §11 thresholds). */
export const CONFIDENCE_THRESHOLDS = { high: 0.75, medium: 0.5 } as const;

export type ConfidenceBand = "low" | "medium" | "high";

export function confidenceBand(value: number): ConfidenceBand {
  if (!Number.isFinite(value) || value < CONFIDENCE_THRESHOLDS.medium) return "low";
  if (value < CONFIDENCE_THRESHOLDS.high) return "medium";
  return "high";
}

/** Mean confidence over the formants that are present. 0 when there are none. */
export function meanFormantConfidence(frame: VoiceFrame): number {
  const present = (frame.formants ?? []).filter((f) => f && f.hz > 0).map((f) => f.confidence);
  if (present.length === 0) return 0;
  return present.reduce((sum, c) => sum + c, 0) / present.length;
}

export const TRUST_FORMANT_CONFIDENCE = 0.6;
export const TRUST_VOICING_CONFIDENCE = 0.4;

/** Below threshold when mean formant confidence < 0.6 or voicing confidence < 0.4. */
export function isTrustworthy(frame: VoiceFrame): boolean {
  return (
    meanFormantConfidence(frame) >= TRUST_FORMANT_CONFIDENCE &&
    (frame.f0_confidence ?? 0) >= TRUST_VOICING_CONFIDENCE
  );
}

// ---- text summary (the accessible equivalent of the pad) ---------------------

export const SUMMARY_COPY = {
  heading: "Summary",
  notReliable: "These numbers are not reliable yet. See the note above.",
  notEnoughVoice:
    "Not enough clear voice was detected. Try speaking a little longer or a little louder.",
  uncalibrated: "Sound level: not calibrated.",
  unvoiced: "Pitch: not detected (unvoiced).",
  noFormants: "Resonance: not measured yet.",
} as const;

const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Pitch with its confidence. An unvoiced frame is not shown as a value. */
export function pitchLine(frame: VoiceFrame): string {
  if (!(frame.f0_hz > 0)) return SUMMARY_COPY.unvoiced;
  return `Pitch: ${round(frame.f0_hz)} Hz (confidence: ${confidenceBand(frame.f0_confidence)}).`;
}

/** Resonance relative to the session baseline, with formant confidence. */
export function resonanceLine(frame: VoiceFrame): string {
  const hasFormants = (frame.formants ?? []).some((f) => f.hz > 0);
  if (!hasFormants) return SUMMARY_COPY.noFormants;
  const semitones = frame.scale_semitones;
  const direction = semitones > 0.1 ? "above" : semitones < -0.1 ? "below" : "at";
  const phrase =
    direction === "at"
      ? "at your baseline"
      : `${round(Math.abs(semitones), 1)} semitones ${direction} your baseline`;
  return `Resonance: ${phrase} (confidence: ${confidenceBand(meanFormantConfidence(frame))}).`;
}

/** Level is SPL once calibrated, and honestly blank until then (TDD §13). */
export function levelLine(_frame: VoiceFrame, { calibrated = false } = {}): string {
  return calibrated ? "Sound level: see the calibration panel." : SUMMARY_COPY.uncalibrated;
}

export function isVoiceTooWeak(frame: VoiceFrame): boolean {
  return (frame.f0_confidence ?? 0) < TRUST_VOICING_CONFIDENCE;
}

export interface FrameSummary {
  heading: string;
  reliable: boolean;
  caveat: string | null;
  lines: string[];
}

export function summarize(frame: VoiceFrame, options: { calibrated?: boolean } = {}): FrameSummary {
  const reliable = isTrustworthy(frame);
  const lines = [pitchLine(frame), resonanceLine(frame), levelLine(frame, options)];
  const caveat = reliable
    ? null
    : isVoiceTooWeak(frame)
      ? SUMMARY_COPY.notEnoughVoice
      : SUMMARY_COPY.notReliable;
  return { heading: SUMMARY_COPY.heading, reliable, caveat, lines };
}

/** The whole summary as one string, for screen readers and copy/paste. */
export function summaryText(frame: VoiceFrame, options: { calibrated?: boolean } = {}): string {
  const { heading, lines, caveat } = summarize(frame, options);
  return [`${heading}:`, ...lines, ...(caveat ? [caveat] : [])].join(" ");
}

// ---- longitudinal trends -----------------------------------------------------

export const TREND_COPY = {
  heading: "Trend",
  boundaryLabel: "Measurement method changed here",
  boundaryBody:
    "The app changed how it measures on this date. Points before and after are not directly comparable.",
  stopped: "The chart stops here because continuing would be misleading.",
  empty: "Not enough sessions yet to show a trend.",
} as const;

export const CHANNEL_LABELS: Record<string, string> = {
  f0: "Pitch (Hz)",
  scale: "Resonance (semitones)",
  hnr: "HNR (dB)",
  cpp: "CPP",
  spl: "Sound level (dB SPL)",
  stability: "Resonance stability (semitones)",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

export interface TrendPoint {
  t_ms: number;
  value: number;
  confidence: number;
  coreVersion: string;
}

export interface TrendBoundary {
  index: number;
  t_ms: number;
  fromVersion: string;
  toVersion: string;
}

export interface TrendSegment {
  coreVersion: string;
  points: TrendPoint[];
}

export interface TrendSeries {
  channel: string;
  points: TrendPoint[];
  segments: TrendSegment[];
  boundaries: TrendBoundary[];
}

/**
 * Build a trend series from points, each carrying the `core_version` that
 * produced it. Points are split into segments at every version change; the change
 * is a boundary the UI must mark (TDD §9.3).
 */
export function buildTrendSeries({
  channel,
  points,
}: {
  channel: string;
  points: TrendPoint[];
}): TrendSeries {
  const sorted = [...points].sort((a, b) => a.t_ms - b.t_ms);
  const segments: TrendSegment[] = [];
  const boundaries: TrendBoundary[] = [];

  for (const point of sorted) {
    const current = segments[segments.length - 1];
    if (!current || current.coreVersion !== point.coreVersion) {
      if (current) {
        boundaries.push({
          index: segments.length,
          t_ms: point.t_ms,
          fromVersion: current.coreVersion,
          toVersion: point.coreVersion,
        });
      }
      segments.push({ coreVersion: point.coreVersion, points: [] });
    }
    (segments[segments.length - 1] as TrendSegment).points.push(point);
  }

  return { channel, points: sorted, segments, boundaries };
}

/** `"up" | "down" | "steady"`, ignoring tiny wobble relative to the span. */
export function trendDirection(values: number[]): "up" | "down" | "steady" {
  if (values.length < 2) return "steady";
  const first = values[0] as number;
  const last = values[values.length - 1] as number;
  const span = Math.max(...values) - Math.min(...values);
  const threshold = Math.max(1e-6, span * 0.1);
  const delta = last - first;
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "steady";
}

/** Distribution of a segment's values (the "distribution shift" view). */
export function segmentDistribution(
  points: TrendPoint[],
): { p05: number; p50: number; p95: number; min: number; max: number } | null {
  const values = points.map((p) => p.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const at = (p: number) => values[Math.min(values.length - 1, Math.round((values.length - 1) * p))] as number;
  return {
    p05: at(0.05),
    p50: at(0.5),
    p95: at(0.95),
    min: values[0] as number,
    max: values[values.length - 1] as number,
  };
}

/**
 * The trend stops at a boundary when there are not enough points after it to show
 * a trend — continuing would show a change in the software as a change in the voice.
 */
export function trendStopsAt(series: TrendSeries): TrendBoundary | null {
  return series.boundaries.find((b) => (series.segments[b.index]?.points.length ?? 0) < 2) ?? null;
}

export interface TrendTextAlternative {
  summary: string;
  boundaryNote: string | null;
  stoppedNote: string | null;
}

/** The accessible equivalent of the chart. */
export function trendTextAlternative(series: TrendSeries): TrendTextAlternative {
  const values = series.points.map((p) => p.value).filter(Number.isFinite);
  if (values.length < 2) {
    return { summary: TREND_COPY.empty, boundaryNote: null, stoppedNote: null };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const direction = trendDirection(values);
  const confidences = series.points.map((p) => p.confidence).filter(Number.isFinite);
  const mean = confidences.length ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length : Number.NaN;

  const summary = `${channelLabel(series.channel)} trend is ${direction}, ranging ${min.toFixed(1)} to ${max.toFixed(1)} (confidence: ${confidenceBand(mean)}).`;
  const boundaryNote = series.boundaries.length ? TREND_COPY.boundaryBody : null;
  const stoppedNote = trendStopsAt(series) ? TREND_COPY.stopped : null;

  return { summary, boundaryNote, stoppedNote };
}

export function prefersReducedMotion(scope: { matchMedia?: (q: string) => { matches: boolean } } = globalThis): boolean {
  return scope?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}
