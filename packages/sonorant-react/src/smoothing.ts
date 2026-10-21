// The standard display-smoothing pipeline, for live renderers.
//
// This module contains **no acoustic maths** and estimates nothing about the
// voice: it decides where a dot is drawn. It is the implementation of
// `docs/rules/visualization-smoothing.md`, and it is the only one — every
// renderer imports it rather than re-implementing it, so two surfaces cannot
// drift.
//
//   displayable -> rolling median -> slew limit -> EMA -> hold-and-fade
//
// A smoothed value is never stored, exported, used in a calculation, or shown as
// a number. A frame that is unvoiced, low-confidence, missing, or outside the
// channel's declared display range is a **gap**: never a zero, never clamped to
// the axis, never interpolated across. It is held and then faded, marked stale.
//
// Every time constant is in **milliseconds**, applied against the frame's own
// `t_ms` — never a frame count — so a dropout lengthens the gap instead of
// over-smoothing the frames on either side, and the behaviour is identical at
// 44.1 kHz and 48 kHz.

export type SmoothingMode = "none" | "smooth";

export interface SmoothingOptions {
  /** `"none"` draws raw frames (inspection); `"smooth"` is the standard pipeline. */
  mode?: SmoothingMode;
  /** Rolling-median window, ms. `0` disables. */
  medianWindowMs?: number;
  /** EMA time constant, ms. `0` disables. */
  emaTimeConstantMs?: number;
  /** Slew limit, display spans per second. `0` disables. */
  slewSpanPerSecond?: number;
  /** How long the last displayable value is held into a gap, ms. */
  holdMs?: number;
  /** How long a held value takes to fade out, ms. */
  fadeMs?: number;
}

/**
 * The provisional defaults from the rule. Derived from the pipeline's frame rate
 * (~86 fps), not from a clinical source; validate against the live pad before
 * treating them as settled.
 */
export const SMOOTHING_DEFAULTS = {
  mode: "smooth",
  medianWindowMs: 60,
  emaTimeConstantMs: 120,
  slewSpanPerSecond: 0.5,
  holdMs: 400,
  fadeMs: 600,
} as const satisfies Required<SmoothingOptions>;

/** One frame entering the smoother. `t_ms` is the frame's own timestamp. */
export interface SmoothingInput {
  t_ms: number;
  value: number;
  confidence: number;
}

/** One value leaving the smoother, ready to draw. */
export interface DisplayPoint {
  t_ms: number;
  /** The smoothed position, or the held value while stale; `NaN` once faded out. */
  value: number;
  /** Held across a gap: draw stale (faded + non-colour marker), never as a measurement. */
  stale: boolean;
}

export interface DisplaySeriesOptions extends SmoothingOptions {
  /** The channel's declared display range. A value outside it is a gap. */
  range: readonly [number, number];
  /** Confidence below this is a gap. Pass the channel's own trust threshold. */
  minConfidence: number;
}

/** Fill in every option from the defaults. */
export function withDefaults(options: SmoothingOptions = {}): Required<SmoothingOptions> {
  return {
    mode: options.mode ?? SMOOTHING_DEFAULTS.mode,
    medianWindowMs: options.medianWindowMs ?? SMOOTHING_DEFAULTS.medianWindowMs,
    emaTimeConstantMs: options.emaTimeConstantMs ?? SMOOTHING_DEFAULTS.emaTimeConstantMs,
    slewSpanPerSecond: options.slewSpanPerSecond ?? SMOOTHING_DEFAULTS.slewSpanPerSecond,
    holdMs: options.holdMs ?? SMOOTHING_DEFAULTS.holdMs,
    fadeMs: options.fadeMs ?? SMOOTHING_DEFAULTS.fadeMs,
  };
}

/**
 * Displayability for one channel: finite, confident enough, and inside the
 * declared range. Anything else is a gap. An out-of-range value is a gap rather
 * than a clamped point on purpose — clamping an octave error pins a wrong pitch
 * to the ceiling, where it reads as a real, high note.
 */
export function isDisplayable(
  value: number,
  confidence: number,
  { range, minConfidence }: Pick<DisplaySeriesOptions, "range" | "minConfidence">,
): boolean {
  return (
    Number.isFinite(value) &&
    Number.isFinite(confidence) &&
    confidence >= minConfidence &&
    value >= range[0] &&
    value <= range[1]
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = n >> 1;
  if (n === 0) return Number.NaN;
  return n % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * The standard pipeline. Raw frames in, display positions out. Never persisted.
 *
 * Resume behaviour: if the gap outlasted `holdMs + fadeMs` the value fully
 * disappeared, so the smoother restarts from the new measurement — the fade-in is
 * the signal that it is new data. A short gap carries the state, so the dot glides
 * from the held value instead of jumping.
 */
export function smoothSeries(
  frames: ReadonlyArray<SmoothingInput>,
  options: DisplaySeriesOptions,
): DisplayPoint[] {
  const opts = withDefaults(options);
  const span = options.range[1] - options.range[0];
  const gapTotalMs = opts.holdMs + opts.fadeMs;
  const out: DisplayPoint[] = [];

  if (opts.mode === "none") {
    for (const frame of frames) {
      const ok = isDisplayable(frame.value, frame.confidence, options);
      out.push({ t_ms: frame.t_ms, value: ok ? frame.value : Number.NaN, stale: !ok });
    }
    return out;
  }

  let window: SmoothingInput[] = [];
  let ema = Number.NaN;
  let slew = Number.NaN;
  let lastGood = Number.NaN;
  let lastGoodT = Number.NEGATIVE_INFINITY;
  let lastT = Number.NaN;
  let inGap = false;

  for (const frame of frames) {
    const dt = Number.isFinite(lastT) ? Math.max(0, frame.t_ms - lastT) : 0;
    lastT = frame.t_ms;

    if (!isDisplayable(frame.value, frame.confidence, options)) {
      const ageMs = frame.t_ms - lastGoodT;
      const held = Number.isFinite(lastGood) && ageMs <= gapTotalMs;
      out.push({ t_ms: frame.t_ms, value: held ? lastGood : Number.NaN, stale: true });
      inGap = true;
      continue;
    }

    if (inGap) {
      // The value fully disappeared, so this is new data, not a continuation.
      if (!Number.isFinite(lastGood) || frame.t_ms - lastGoodT > gapTotalMs) {
        ema = Number.NaN;
        slew = Number.NaN;
      }
      inGap = false;
    }

    // 1. Rolling median: rejects isolated spikes without dragging toward them.
    let middle = frame.value;
    if (opts.medianWindowMs > 0) {
      window.push(frame);
      const floor = frame.t_ms - opts.medianWindowMs;
      window = window.filter((entry) => entry.t_ms >= floor);
      middle = median(window.map((entry) => entry.value));
    }

    // 2. Slew limit: bounds how fast the drawn value may move, in spans/second.
    if (Number.isNaN(slew)) {
      slew = middle;
    } else if (opts.slewSpanPerSecond > 0) {
      const maxStep = opts.slewSpanPerSecond * span * (dt / 1000);
      const delta = middle - slew;
      slew += delta > maxStep ? maxStep : delta < -maxStep ? -maxStep : delta;
    } else {
      slew = middle;
    }

    // 3. EMA: removes the residual jitter, so the trace reads as a line.
    if (Number.isNaN(ema)) {
      ema = slew;
    } else if (opts.emaTimeConstantMs > 0 && dt > 0) {
      ema += (slew - ema) * (1 - Math.exp(-dt / opts.emaTimeConstantMs));
    } else if (opts.emaTimeConstantMs <= 0) {
      ema = slew;
    }

    lastGood = ema;
    lastGoodT = frame.t_ms;
    out.push({ t_ms: frame.t_ms, value: ema, stale: false });
  }

  return out;
}
