import type { VoiceFrame } from "../model";
import {
  PITCH_MAX_HZ,
  PITCH_MIN_HZ,
  RESONANCE_MAX_SEMITONES,
  RESONANCE_MIN_SEMITONES,
  TRUST_FORMANT_CONFIDENCE,
  TRUST_VOICING_CONFIDENCE,
  activeFlags,
  confidenceBand,
  isTrustworthy,
  mapPitch,
  mapResonance,
  meanFormantConfidence,
} from "../model";
import type { SmoothingOptions } from "../smoothing";
import { smoothSeries, withDefaults } from "../smoothing";

const PITCH_TICKS = [100, 200, 400, 800];
const RESONANCE_TICKS = [-6, -3, 0, 3, 6];

export interface VoicePadProps {
  /** Frames to plot, oldest first. The last frame is the current marker. */
  frames: VoiceFrame[];
  /** Maximum points to keep on the pad. Older points scroll off. */
  maxPoints?: number;
  /**
   * Display smoothing (see `docs/rules/visualization-smoothing.md`). Defaults to
   * the standard pipeline. Pass `{ mode: "none" }` to draw raw frames.
   */
  smoothing?: SmoothingOptions;
  width?: number;
  height?: number;
  title?: string;
}

interface TracePoint {
  x: number;
  y: number;
  stale: boolean;
}

/**
 * Pitch-by-resonance pad: the signature Sonorant visualization.
 *
 * Pitch (Hz, log-scaled) runs across; vocal-tract resonance (semitones, relative
 * to the session baseline) runs up. Pitch is drawn as circles, resonance is
 * marked with squares — the two axes stay visually separable (brief principle 1).
 *
 * The trace is smoothed for display by the standard pipeline: a value that is
 * unvoiced, low-confidence, or out of range is a gap, and the last value is held
 * and then faded rather than snapping to the axis. A stale stretch is drawn dashed
 * with hollow dots — never by colour alone — and the caption says so.
 *
 * Accessibility: the SVG carries a text `<title>` and the surrounding figure
 * caption repeats the axis meaning and the confidence state in words. Rendering is
 * static — one draw per render — so it satisfies `prefers-reduced-motion` by
 * construction.
 */
export function VoicePad({
  frames,
  maxPoints = 240,
  smoothing,
  width = 640,
  height = 360,
  title = "Pitch by resonance pad",
}: VoicePadProps) {
  const shown = frames.slice(-maxPoints);
  const opts = withDefaults(smoothing);
  const margin = { left: 44, right: 12, top: 12, bottom: 28 };
  const plot = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };
  const current = shown[shown.length - 1];
  const trustworthy = current ? isTrustworthy(current) : true;

  // Each axis is smoothed on its own, over its own declared range and confidence
  // threshold. Both series share the frames' `t_ms`, so they stay aligned by index.
  const pitchSeries = smoothSeries(
    shown.map((frame) => ({ t_ms: frame.t_ms, value: frame.f0_hz, confidence: frame.f0_confidence })),
    {
      ...smoothing,
      range: [PITCH_MIN_HZ, PITCH_MAX_HZ],
      minConfidence: TRUST_VOICING_CONFIDENCE,
    },
  );
  const resonanceSeries = smoothSeries(
    shown.map((frame) => ({
      t_ms: frame.t_ms,
      value: frame.scale_semitones,
      confidence: meanFormantConfidence(frame),
    })),
    {
      ...smoothing,
      range: [RESONANCE_MIN_SEMITONES, RESONANCE_MAX_SEMITONES],
      minConfidence: TRUST_FORMANT_CONFIDENCE,
    },
  );

  const trace: (TracePoint | null)[] = shown.map((_, i) => {
    const pitch = pitchSeries[i];
    const resonance = resonanceSeries[i];
    if (!pitch || !resonance) return null;
    if (!Number.isFinite(pitch.value) || !Number.isFinite(resonance.value)) return null;
    const stale = pitch.stale || resonance.stale;
    const x = mapPitch(pitch.value);
    const y = mapResonance(resonance.value);
    return {
      x: plot.x + x * plot.w,
      y: plot.y + plot.h - y * plot.h,
      stale,
    };
  });

  // Contiguous drawable stretches, split where the stale state changes, so a held
  // (faded) stretch is its own dashed run and never reads as measured data.
  const runs: { points: TracePoint[]; stale: boolean }[] = [];
  let run: TracePoint[] = [];
  let runStale = false;
  const flush = () => {
    if (run.length > 0) runs.push({ points: run, stale: runStale });
    run = [];
  };
  for (const point of trace) {
    if (!point) {
      flush();
      continue;
    }
    if (run.length > 0 && point.stale !== runStale) flush();
    runStale = point.stale;
    run.push(point);
  }
  flush();

  const last = trace[trace.length - 1] ?? null;
  const isStale = trace.some((point) => point?.stale === true);
  const smoothingNote =
    opts.mode === "none"
      ? "Raw frames — no smoothing."
      : `Smoothed, ${opts.emaTimeConstantMs} ms.`;

  return (
    <figure className="sonorant-pad">
      <svg
        className="sonorant-pad__svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${title}. Pitch across, resonance up. ${smoothingNote} ${current ? `Latest frame: ${describe(current)}` : "No frames yet."}${isStale ? " Parts of the trace are dashed where no clear voice was detected; the last value was held and faded." : ""}`}
      >
        <title>{title}</title>
        <defs>
          <pattern id="sonorant-pad-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(180,120,0,0.22)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Grid */}
        {PITCH_TICKS.map((hz) => {
          const px = plot.x + mapPitch(hz) * plot.w;
          return (
            <g key={`p${hz}`}>
              <line className="sonorant-pad__grid-line" x1={px} y1={plot.y} x2={px} y2={plot.y + plot.h} />
              <text className="sonorant-pad__tick" x={px - 9} y={plot.y + plot.h + 15}>
                {hz}
              </text>
            </g>
          );
        })}
        {RESONANCE_TICKS.map((st) => {
          const py = plot.y + plot.h - mapResonance(st) * plot.h;
          return (
            <g key={`r${st}`}>
              <line className="sonorant-pad__grid-line" x1={plot.x} y1={py} x2={plot.x + plot.w} y2={py} />
              <text className="sonorant-pad__tick" x={8} y={py + 4}>
                {st}
              </text>
            </g>
          );
        })}
        <rect className="sonorant-pad__frame" x={plot.x} y={plot.y} width={plot.w} height={plot.h} />

        {/* Low-confidence overlay, a hatch + text, never colour alone. */}
        {!trustworthy && (
          <>
            <rect
              x={plot.x}
              y={plot.y}
              width={plot.w}
              height={plot.h}
              fill="url(#sonorant-pad-hatch)"
              pointerEvents="none"
            />
            <text className="sonorant-pad__warn" x={plot.x + 6} y={plot.y + 16}>
              Confidence: low
            </text>
          </>
        )}

        {/* Trace: a solid run where data is live, a dashed run where it is held. */}
        {runs.map((r, i) =>
          r.points.length > 1 ? (
            <path
              key={`run${i}`}
              className={
                r.stale
                  ? "sonorant-pad__trace sonorant-pad__trace--stale"
                  : "sonorant-pad__trace"
              }
              d={r.points
                .map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                .join(" ")}
            />
          ) : null,
        )}
        {trace.map((p, i) =>
          p ? (
            <circle
              key={i}
              className={
                p.stale ? "sonorant-pad__dot sonorant-pad__dot--stale" : "sonorant-pad__dot"
              }
              cx={p.x}
              cy={p.y}
              r={2}
            />
          ) : null,
        )}
        {current && last && (
          <g
            className={
              last.stale
                ? "sonorant-pad__current sonorant-pad__current--stale"
                : "sonorant-pad__current"
            }
          >
            <rect x={last.x - 4} y={last.y - 4} width={8} height={8} />
            <circle cx={last.x} cy={last.y} r={5} />
            {last.stale && (
              <text className="sonorant-pad__held" x={last.x + 8} y={last.y - 8}>
                Held
              </text>
            )}
          </g>
        )}
      </svg>
      <figcaption className="sonorant-pad__caption">
        Pitch (Hz) runs across; resonance (semitones) runs up. Pitch is drawn as circles; resonance is
        marked with squares. {smoothingNote}
        {isStale
          ? " The dashed part of the trace is where no clear voice was detected; the last value was held and then faded."
          : ""}
        {current ? ` ${describe(current)}` : " No frames yet."}
      </figcaption>
    </figure>
  );
}

function describe(frame: VoiceFrame): string {
  const band = confidenceBand(frame.f0_confidence);
  const f0 = frame.f0_hz > 0 ? `${Math.round(frame.f0_hz)} Hz` : "unvoiced";
  const st = Number.isFinite(frame.scale_semitones) ? `${frame.scale_semitones.toFixed(1)} semitones` : "resonance not measured";
  const flags = activeFlags(frame.flags);
  const flagText = flags.length ? ` Flags: ${flags.join(", ")}.` : "";
  return `Latest frame: pitch ${f0}, resonance ${st} (pitch confidence: ${band}).${flagText}`;
}
