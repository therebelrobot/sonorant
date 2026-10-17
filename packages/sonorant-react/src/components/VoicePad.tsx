import type { VoiceFrame } from "../model";
import { activeFlags, confidenceBand, isTrustworthy, mapPitch, mapResonance, padPoint } from "../model";

const PITCH_TICKS = [100, 200, 400, 800];
const RESONANCE_TICKS = [-6, -3, 0, 3, 6];

export interface VoicePadProps {
  /** Frames to plot, oldest first. The last frame is the current marker. */
  frames: VoiceFrame[];
  /** Maximum points to keep on the pad. Older points scroll off. */
  maxPoints?: number;
  width?: number;
  height?: number;
  title?: string;
}

/**
 * Pitch-by-resonance pad: the signature Sonorant visualization.
 *
 * Pitch (Hz, log-scaled) runs across; vocal-tract resonance (semitones, relative
 * to the session baseline) runs up. Pitch is drawn as circles, resonance is
 * marked with squares — the two axes stay visually separable (brief principle 1).
 *
 * Accessibility: the SVG carries a text `<title>` and the surrounding figure
 * caption repeats the axis meaning and the confidence state in words, so nothing
 * is conveyed by colour alone. Rendering is static — one draw per render — so it
 * satisfies `prefers-reduced-motion` by construction.
 */
export function VoicePad({
  frames,
  maxPoints = 240,
  width = 640,
  height = 360,
  title = "Pitch by resonance pad",
}: VoicePadProps) {
  const shown = frames.slice(-maxPoints);
  const margin = { left: 44, right: 12, top: 12, bottom: 28 };
  const plot = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };
  const current = shown[shown.length - 1];
  const trustworthy = current ? isTrustworthy(current) : true;

  const toPoint = (frame: VoiceFrame) => {
    const { x, y } = padPoint(frame);
    return { px: plot.x + x * plot.w, py: plot.y + plot.h - y * plot.h };
  };
  const trace = shown.map(toPoint);
  const tracePath = trace.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join(" ");

  return (
    <figure className="sonorant-pad">
      <svg
        className="sonorant-pad__svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${title}. Pitch across, resonance up. ${current ? `Latest frame: ${describe(current)}` : "No frames yet."}`}
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

        {/* Trace */}
        {trace.length > 1 && <path className="sonorant-pad__trace" d={tracePath} />}
        {trace.map((p, i) => (
          <circle key={i} className="sonorant-pad__dot" cx={p.px} cy={p.py} r={2} />
        ))}
        {current &&
          (() => {
            const { px, py } = toPoint(current);
            return (
              <g className="sonorant-pad__current">
                <rect x={px - 4} y={py - 4} width={8} height={8} />
                <circle cx={px} cy={py} r={5} />
              </g>
            );
          })()}
      </svg>
      <figcaption className="sonorant-pad__caption">
        Pitch (Hz) runs across; resonance (semitones) runs up. Pitch is drawn as circles; resonance is
        marked with squares.
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
