# Visualization smoothing

**Binding on:** every live renderer — `sonorant-react` components, the web app's pad and trend
renderers, the `apps/docs` showcase, and any downstream consumer that draws a live value (a realtime
monitor, a practice overlay, a tuning display). It is the standard those consumers code against.

---

## The rule

**Smoothing is a display concern, never a measurement one.** A smoothed value is never stored, never
exported, never used in a calculation, and never shown as a number. It exists only to decide where a
dot is drawn. Stored values, exported frames, text alternatives, and every reported statistic stay
raw.

Smoothing is therefore **not acoustic maths** and does not belong in the Rust core. It estimates
nothing about the voice; it decides how an already-measured value is presented. (Constraint: no
acoustic maths in TypeScript, ever — this is not acoustic maths.) It is implemented **once**, in
TypeScript, and shared, so the web app, `sonorant-react`, and any consumer cannot drift — the same
reasoning that puts `scale_semitones` in the core (§TDD 4.2), applied to presentation.

The "not the core" half of this is **measured, not asserted** — see [What it costs](#what-it-costs).

## Why

Sonorant is used primarily to *change* a voice while watching a value. The core emits a frame roughly
every 12 ms (~86 fps). At that rate a raw value thrashes: the eye reads the frame-to-frame jitter as
instability in the voice, and a person training is taught to chase noise. The measurement is not
wrong. The display is being asked to show 86 independent estimates a second, and that is a display
problem, so it gets a display fix.

The goal is **legibility, not prettiness**: the trace should show the change the person is making and
nothing else. Do not smooth so hard that a real, sustained change is hidden — that trades one
misreading for another.

## What it costs

Measured 2026-10-21, Node 24, Apple silicon, on a synthetic 10-minute session: 51,600 frames at
~86 fps (512-sample hop @ 44.1 kHz), 6 channels (pitch, resonance, HNR, CPP, SPL, stability), 8 % of
frames gapped. The median, slew, and EMA stages are timed with the input pre-generated outside the
timed loop and with a no-smoothing control loop subtracted. Reproduce with those parameters; the
harness was a throwaway.

| Operation | Cost |
|---|---|
| Live: per frame, all 6 channels | **~0.22 µs** (221 ns) |
| Live: per channel per frame | ~37 ns |
| Share of the 11.6 ms analysis frame | **~0.002 %** |
| One second of audio, 6 channels | ~19 µs |
| Whole 10-minute session, 6 channels, bulk | **~11 ms** — one-off, not per frame |

A deliberately wasteful implementation — sorting a fresh array copy and allocating an object on
*every* frame — is ~78 ms for the same 10-minute 6-channel session (~1.5 µs/frame): still ~0.01 % of
the frame budget. Even the naive version does not justify a boundary crossing.

**Why it is cheap.** The pipeline is **O(1) per frame**: a median over a 5-frame window, a clamp for
slew, one multiply-add for the EMA. There is no FFT, no LPC, and no autocorrelation here — those are
the expensive parts of the system, and they are already in Rust.

**Why this settles the placement.** Three reasons, strongest first:

1. **The data is already in JS.** Frames cross the WASM boundary once, because the UI needs them for
   text, confidence, flags, and storage. Smoothing in Rust means a second, smoothed stream to marshal
   *back*, or a second pass over data already held — added boundary traffic and duplicated state, to
   save ~0.002 % of a frame.
2. **A boundary call costs about as much as the whole computation.** A `wasm-bindgen` call through
   the glue is on the order of 50–200 ns (**estimate — not measured here**); the entire 6-channel
   smoothing step is 221 ns. A per-frame call into WASM to smooth would be a wash at best, and would
   eat most of its own benefit.
3. **The wire layout has no room.** The frame is a fixed all-`f32` struct (TDD §4.4). Shipping a
   parallel smoothed series is a `CORE_ABI_VERSION` change — a hard startup-failure surface — for
   something that costs 221 ns.

**The one case that would flip this.** Bulking smoothing over a very large history library at load.
Even then it is ~11 ms per session, and it is one-off work to push to a worker or run lazily — not a
reason to put a presentation filter into the analysis core.

## The two registers

Never mix them. They answer different questions.

| Register | Used by | Operation | Question it answers |
|---|---|---|---|
| **Live** | realtime monitor, live pad | **smooth** (time-based, below) | "what am I doing right now?" |
| **History** | trend chart, session summary | **aggregate** (median, p05/p50/p95) | "what has changed over weeks?" |

A history series is summarised, never filtered into a line. A live monitor is never aggregated — it
must respond to the person in front of it.

## The standard pipeline

Fixed order. Every stage is optional and named; `mode: "none"` draws raw frames and is the escape
hatch for inspection.

```
displayable → rolling median → slew limit → EMA → hold-and-fade
```

| Stage | Option | Default | What it removes |
|---|---|---|---|
| Rolling median | `medianWindowMs` | `60` | isolated spikes: one-frame octave errors, a single bad formant, a click |
| Slew limit | `slewSpanPerSecond` | `0.5` | thrashing: bounds how fast the drawn value may move |
| EMA | `emaTimeConstantMs` | `120` | residual jitter, so the trace reads as a line not a caterpillar |
| Hold-and-fade | `holdMs` / `fadeMs` | `400` / `600` | the jarring drop-and-return at every gap |

Defaults are **provisional and derived from the pipeline's frame rate**, not from a clinical source —
the same status as the thresholds in `measure-tolerances.md`. Validate them against the live pad
(`docs/verification/live-pad.md`) before treating them as settled.

## Displayability — what "absence of data" means

A frame contributes a value to a channel **iff all three hold**:

1. the value is finite;
2. the channel's confidence is at or above its **existing** trust threshold — voicing ≥ `0.4`
   (`TRUST_VOICING_CONFIDENCE`), formants ≥ `0.6` (`TRUST_FORMANT_CONFIDENCE`); no new number;
3. the value is inside the channel's **declared display range** (below).

Anything else is a **gap**. Gaps cover, with one rule:

- an unvoiced frame (`f0_hz <= 0`);
- a low-confidence frame (below the trust threshold);
- a **missing frame** — dropout, no audio, microphone not open;
- an **out-of-range value** — pitch outside the declared range, i.e. harmonics outside the standard
  speaking range, which is also what an octave error looks like.

A gap is **never** a zero, **never** a value clamped to the axis, and **never** bridged by
interpolation. Treating out-of-range harmonics as gaps rather than clamped points is deliberate: see
below.

## Gaps: hold, then fade

The jarring event on a live monitor is a value snapping to the floor and snapping back. Remove it.

1. Hold the last displayable value for `holdMs`.
2. Fade it out over `fadeMs` — opacity or desaturation **plus a non-colour stale marker**, because
   nothing may be conveyed by colour alone. A dotted or hollow continuation of the trace, with the
   state also in the caption and the text alternative.
3. When the next displayable frame arrives, fade back in.
4. Never snap to the axis. Never snap back to the value.

The held segment is marked **stale for its whole duration**, so it cannot be read as a measurement.
This is why hold-and-fade is allowed to draw a horizontal line where interpolation is not: a held
line is explicitly marked as "no new data", while a line drawn *through* a gap invents a trajectory
across a region where nothing was measured. Do not interpolate across a gap.

## Transients

- Isolated spikes are rejected by the rolling **median** — a mean would drag the value toward the
  spike instead.
- Sustained fast change is bounded by the **slew limit**, defined as a fraction of the display span
  per second, never an absolute number, so it scales with the chart and the channel.
- A spike that survives the median **is drawn**. It happened, and hiding it would be a lie of
  omission.
- The **time axis is never rescaled** to compress a transient, and an **auto-scaling value axis is
  forbidden**: a single octave error would flatten every real change around it. Display ranges are
  fixed and declared.

## Harmonics outside the standard speaking range

- Out-of-range values are **gaps**, not clamped points. Clamping an octave error pins a wrong pitch
  to the ceiling of the chart, where it reads as a real, high note — a wrong number presented as a
  measurement.
- The frame's flag (`SUBHARMONIC`, `CREAK`, `FORMANT_UNSTABLE`, `CLIPPED`) is surfaced as **text**
  alongside the gap, per the never-colour-alone rule.
- Declared display ranges, fixed per channel:

  | Channel | Range | Source |
  |---|---|---|
  | Pitch | 60–1200 Hz | `PITCH_MIN_HZ` / `PITCH_MAX_HZ` (`model.ts`) |
  | Resonance | −6…+6 semitones | `RESONANCE_MIN_SEMITONES` / `RESONANCE_MAX_SEMITONES` |
  | Formants | capped at `max_formant_hz` (5500 Hz) | TDD §4.1 — beyond it, the core does not measure |

## Frame-rate independence

Every time constant is in **milliseconds and applied against the frame's own `t_ms`**, never a frame
count, never a hop size, never a sample rate. A dropout then lengthens the gap instead of
over-smoothing the frames on either side, and the same options behave identically at 44.1 kHz and
48 kHz. Keying a time constant to frame index is the bug this rule exists to prevent.

## Numbers are never smoothed

- Text alternatives, stored series, and exported values use **raw** measurements.
- Summary statistics (min, max, p50) are computed from **raw** values.
- Confidence is displayed from the **raw** frame, not from the smoothed value.
- The caption of a smoothed trace **states the mode** — e.g. "smoothed, 120 ms" — so a reader can
  tell what they are looking at. A chart that is smoothed and does not say so is a chart that
  overstates its own precision.

## Reduced motion

Hold-and-fade is motion. Under `prefers-reduced-motion: reduce`, replace the fade with a **static
stale marker** at the held value; the value must still be visibly marked stale. The trace must not
become the only signal that data stopped.

## Interface

The shape consumers code against. One implementation lives in `sonorant-react`
(`src/smoothing.ts`, exported from the package root) and is imported by every renderer; do not
re-implement it per surface.

```ts
export type SmoothingMode = "none" | "smooth";

export interface SmoothingOptions {
  /** "none" draws raw frames (inspection); "smooth" is the standard pipeline. */
  mode?: SmoothingMode;
  /** Rolling-median window, ms. 0 disables. */
  medianWindowMs?: number;
  /** EMA time constant, ms. 0 disables. */
  emaTimeConstantMs?: number;
  /** Slew limit, display spans per second. 0 disables. */
  slewSpanPerSecond?: number;
  /** How long the last displayable value is held into a gap, ms. */
  holdMs?: number;
  /** How long a held value takes to fade out, ms. */
  fadeMs?: number;
}

export const SMOOTHING_DEFAULTS: Required<SmoothingOptions>;

export interface SmoothingInput {
  t_ms: number;
  value: number;
  confidence: number;
}

export interface DisplayPoint {
  t_ms: number;
  /** The smoothed position, or the held value while stale; NaN once faded out. */
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
export function withDefaults(options?: SmoothingOptions): Required<SmoothingOptions>;

/** Displayability for one channel: finite, confident enough, in range. */
export function isDisplayable(
  value: number,
  confidence: number,
  options: Pick<DisplaySeriesOptions, "range" | "minConfidence">,
): boolean;

/** The standard pipeline. Raw in, display positions out. Never persisted. */
export function smoothSeries(
  frames: ReadonlyArray<SmoothingInput>,
  options: DisplaySeriesOptions,
): DisplayPoint[];
```

**Resume after a gap.** If the gap outlasted `holdMs + fadeMs` the value fully disappeared, so the
smoother restarts from the new measurement — the fade-in is the signal that it is new data. A shorter
gap carries the state, so the dot glides from the held value instead of jumping.

## Status

Implemented in `sonorant-react` (`src/smoothing.ts`, `VoicePad`'s `smoothing` prop), with tests in
`packages/sonorant-react/test/smoothing.test.ts`. `VoicePad` is the live renderer, so it smooths by
default and exposes `smoothing`; pass `{ mode: "none" }` to draw raw frames. `TrendChart` is a
*history* register and deliberately does **not** smooth — it aggregates (see [The two registers](#the-two-registers)).
