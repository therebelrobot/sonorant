import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FlatGrid, FloorGrid } from "../components/Grid";
import { Label } from "../components/Label";
import { Strokes, type Stroke3D } from "../components/Strokes";
import { useFontsReady } from "../fonts";
import { NODES, chainSegments, cloudCross, cloudEdge, cloudSegments, nodeAnchor } from "../lib/localChain";
import { depthRatio, makeCamera, project } from "../lib/projection";
import { calmEase, palette, sizes, type StyleProps } from "../style";

const ease = Easing.bezier(...calmEase);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const T = {
  grid: [0, 2.0],
  draw: [0.3, 2.7],
  flow: [2.5, 3.7],
  labels: [3.0, 4.4],
  cloud: [4.8, 6.0],
  cross: [6.3, 7.3],
  labelNo: [6.6, 7.8],
  labelLocal: [7.6, 9.2],
};

const FLOW_COUNT = 6;
const FLOW_SPEED = 0.42;
const X0 = -2.95;
const X1 = 2.95;

export const LocalOnly: React.FC<StyleProps> = ({ lineMode, grid, text }) => {
  useFontsReady();
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const minDim = Math.min(width, height);
  const t = frame / fps;
  const at = (range: number[], out: [number, number] = [0, 1]) =>
    interpolate(frame, range.map((s) => s * fps), out, { easing: ease, ...clamp });

  const yaw = interpolate(frame, [0, durationInFrames - 1], [0.22, 0.12], { easing: ease });
  const pitch = interpolate(frame, [0, durationInFrames - 1], [-0.22, -0.28], { easing: ease });
  const camera = makeCamera(width, height, yaw, pitch, 1.0);

  const drawP = at(T.draw);
  const cloudDim = 1 - 0.7 * at(T.cross);

  const chain: Stroke3D[] = chainSegments().map((s, i) => ({ ...s, id: `chain-${i}` }));
  const cloudShape: Stroke3D[] = cloudSegments().map((s, i) => ({ ...s, id: `cloud-${i}`, opacity: cloudDim }));
  const cross: Stroke3D[] = cloudCross().map((s, i) => ({ ...s, id: `cross-${i}`, weight: 1.6 }));

  const flowFade = at(T.flow);
  const showFloor = grid === "floor" || grid === "both";

  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <radialGradient id="flowGlow">
            <stop offset="0%" stopColor={palette.accent} stopOpacity={0.55} />
            <stop offset="40%" stopColor={palette.accent} stopOpacity={0.14} />
            <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
          </radialGradient>
        </defs>
        {(grid === "flat" || grid === "both") && <FlatGrid width={width} height={height} />}
        {showFloor && <FloorGrid camera={camera} minDim={minDim} reveal={at(T.grid)} y={-1.5} />}
        <Strokes segments={chain} camera={camera} progress={drawP} mode={lineMode} minDim={minDim} />
        <Strokes segments={cloudShape} camera={camera} progress={at(T.cloud)} mode={lineMode} minDim={minDim} />
        <Strokes segments={cross} camera={camera} progress={at(T.cross)} mode={lineMode} minDim={minDim} color={palette.accent} />
        {flowFade > 0 &&
          Array.from({ length: FLOW_COUNT }, (_, i) => {
            const u = (t * FLOW_SPEED + i / FLOW_COUNT) % 1;
            const p = project([X0 + u * (X1 - X0), 0, 0], camera);
            const r = sizes.orb * minDim * 1.0 * depthRatio(p, camera);
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={r * 4.5} fill="url(#flowGlow)" opacity={flowFade * 0.8} />
                <circle cx={p.x} cy={p.y} r={r} fill={palette.accentCore} opacity={flowFade} />
              </g>
            );
          })}
        {NODES.map((n, i) => (
          <Label
            key={n.label}
            anchor={project(nodeAnchor(i), camera)}
            text={n.label}
            side={1}
            rise={1}
            progress={at(T.labels)}
            textMode={text}
            lineMode={lineMode}
            minDim={minDim}
            seed={`lbl-${n.label}`}
            frameWidth={width}
            reach={1.1}
          />
        ))}
        <Label
          anchor={project(cloudEdge(), camera)}
          text="no server"
          side={1}
          rise={1}
          progress={at(T.labelNo)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-no"
          frameWidth={width}
          reach={2.2}
        />
        <Label
          anchor={project([0, -0.8, 0], camera)}
          text="everything runs on your device"
          side={1}
          rise={-1}
          progress={at(T.labelLocal)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-local"
          frameWidth={width}
          reach={2.6}
        />
      </svg>
    </AbsoluteFill>
  );
};
