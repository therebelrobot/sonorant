import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FlatGrid, FloorGrid } from "../components/Grid";
import { Label } from "../components/Label";
import { Strokes, type Stroke3D } from "../components/Strokes";
import { useFontsReady } from "../fonts";
import { depthRatio, makeCamera, project } from "../lib/projection";
import { axisPoint, glottisPoint, lipsPoint, standingWave, tractSegments } from "../lib/vocalTract";
import { calmEase, palette, sizes, type StyleProps } from "../style";

const ease = Easing.bezier(...calmEase);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Timeline in seconds.
const T = {
  grid: [0, 2.2],
  draw: [0.3, 2.9],
  pulses: [2.4, 3.6],
  wave: [2.8, 4.4],
  labelPitch: [3.4, 4.6],
  labelRes: [4.4, 5.6],
  lengthen: [5.8, 8.4],
  labelTwo: [8.5, 9.8],
};

const PULSE_COUNT = 7;
const PULSE_SPEED = 0.34; // cycles per second — held constant: the pitch never changes

export const PitchResonance: React.FC<StyleProps> = ({ lineMode, grid, text }) => {
  useFontsReady();
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const minDim = Math.min(width, height);
  const t = frame / fps;
  const at = (range: number[], out: [number, number] = [0, 1]) =>
    interpolate(frame, range.map((s) => s * fps), out, { easing: ease, ...clamp });

  const yaw = interpolate(frame, [0, durationInFrames - 1], [0.22, 0.44], { easing: ease });
  const pitch = interpolate(frame, [0, durationInFrames - 1], [-0.2, -0.27], { easing: ease });
  const camera = makeCamera(width, height, yaw, pitch, 1.12);

  const drop = at(T.lengthen, [0, 0.34]);
  const drawP = at(T.draw);

  const tube: Stroke3D[] = tractSegments(drop).map((s, i) => ({ ...s, id: `tube-${i}` }));
  const wave: Stroke3D[] = standingWave(drop).map((s, i) => ({ ...s, id: `wave-${i}`, weight: 1.0 }));

  const pulseFade = at(T.pulses);
  const showFloor = grid === "floor" || grid === "both";

  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <radialGradient id="pulseGlow">
            <stop offset="0%" stopColor={palette.accent} stopOpacity={0.55} />
            <stop offset="40%" stopColor={palette.accent} stopOpacity={0.14} />
            <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
          </radialGradient>
        </defs>
        {(grid === "flat" || grid === "both") && <FlatGrid width={width} height={height} />}
        {showFloor && <FloorGrid camera={camera} minDim={minDim} reveal={at(T.grid)} y={-1.6} />}
        <Strokes segments={tube} camera={camera} progress={drawP} mode={lineMode} minDim={minDim} />
        <Strokes
          segments={wave}
          camera={camera}
          progress={at(T.wave)}
          mode={lineMode}
          minDim={minDim}
          color={palette.accent}
        />
        {pulseFade > 0 &&
          Array.from({ length: PULSE_COUNT }, (_, i) => {
            const u = (t * PULSE_SPEED + i / PULSE_COUNT) % 1;
            const p = project(axisPoint(u, drop), camera);
            const r = sizes.orb * minDim * 1.15 * depthRatio(p, camera);
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={r * 4.5} fill="url(#pulseGlow)" opacity={pulseFade * 0.8} />
                <circle cx={p.x} cy={p.y} r={r} fill={palette.accentCore} opacity={pulseFade} />
              </g>
            );
          })}
        <Label
          anchor={project(glottisPoint(drop), camera)}
          text="pitch: pulse rate"
          side={-1}
          rise={-1}
          progress={at(T.labelPitch)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-pitch"
          frameWidth={width}
          reach={1.8}
        />
        <Label
          anchor={project(lipsPoint(drop), camera)}
          text="resonance: tube length"
          side={1}
          rise={1}
          progress={at(T.labelRes)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-res"
          frameWidth={width}
          reach={2.2}
        />
        <Label
          anchor={project(axisPoint(0.45, drop), camera)}
          text="two separate controls"
          side={1}
          rise={-1}
          progress={at(T.labelTwo)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-two"
          frameWidth={width}
          reach={2.8}
        />
      </svg>
    </AbsoluteFill>
  );
};
