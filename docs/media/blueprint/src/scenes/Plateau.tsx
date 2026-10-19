import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FlatGrid, FloorGrid } from "../components/Grid";
import { Label } from "../components/Label";
import { Strokes, type Stroke3D } from "../components/Strokes";
import { useFontsReady } from "../fonts";
import { AXIS_X1, AXIS_Y0, axes, curve, pitchPoint, pitchY, resonancePoint, resonanceY } from "../lib/plateauChart";
import { makeCamera, project } from "../lib/projection";
import { calmEase, palette, type StyleProps } from "../style";

const ease = Easing.bezier(...calmEase);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const T = {
  grid: [0, 1.8],
  axes: [0.2, 2.0],
  pitch: [1.8, 5.0],
  res: [3.0, 5.2],
  labelPitch: [5.0, 6.2],
  labelRes: [5.4, 6.6],
  labelPlateau: [7.0, 8.8],
};

const STEPS = 84;

export const Plateau: React.FC<StyleProps> = ({ lineMode, grid, text }) => {
  useFontsReady();
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const minDim = Math.min(width, height);
  const at = (range: number[], out: [number, number] = [0, 1]) =>
    interpolate(frame, range.map((s) => s * fps), out, { easing: ease, ...clamp });

  const yaw = interpolate(frame, [0, durationInFrames - 1], [0.16, 0.4], { easing: ease });
  const pitch = interpolate(frame, [0, durationInFrames - 1], [-0.22, -0.3], { easing: ease });
  const camera = makeCamera(width, height, yaw, pitch, 1.1);

  // Each curve reveals along its length: opacity per segment, so ids never shift.
  const pitchReveal = at(T.pitch);
  const resReveal = at(T.res);
  const pitchCurve: Stroke3D[] = curve(pitchY, STEPS).map((s, i) => ({
    ...s,
    id: `pitch-${i}`,
    weight: 1.6,
    opacity: i / STEPS < pitchReveal ? 1 : 0,
  }));
  const resCurve: Stroke3D[] = curve(resonanceY, STEPS).map((s, i) => ({
    ...s,
    id: `res-${i}`,
    weight: 1.1,
    opacity: i / STEPS < resReveal ? 0.75 : 0,
  }));
  const axisLines: Stroke3D[] = axes().map((s, i) => ({ ...s, id: `axis-${i}`, weight: 0.8 }));

  const showFloor = grid === "floor" || grid === "both";

  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {(grid === "flat" || grid === "both") && <FlatGrid width={width} height={height} />}
        {showFloor && <FloorGrid camera={camera} minDim={minDim} reveal={at(T.grid)} y={-1.25} />}
        <Strokes segments={axisLines} camera={camera} progress={at(T.axes)} mode={lineMode} minDim={minDim} />
        <Strokes segments={resCurve} camera={camera} progress={1} mode={lineMode} minDim={minDim} />
        <Strokes segments={pitchCurve} camera={camera} progress={1} mode={lineMode} minDim={minDim} color={palette.accent} />
        <Label
          anchor={project(resonancePoint(0.42), camera)}
          text="resonance: unchanged"
          side={-1}
          rise={-1}
          progress={at(T.labelRes)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-res"
          frameWidth={width}
          reach={1.8}
        />
        <Label
          anchor={project(pitchPoint(0.78), camera)}
          text="pitch: raised, then flat"
          side={1}
          rise={1}
          progress={at(T.labelPitch)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-pitch"
          frameWidth={width}
          reach={1.8}
        />
        <Label
          anchor={project([AXIS_X1, AXIS_Y0, 0], camera)}
          text="time"
          side={1}
          rise={-1}
          progress={at(T.axes)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-time"
          frameWidth={width}
          reach={1.1}
        />
        <Label
          anchor={project(pitchPoint(0.55), camera)}
          text="the plateau"
          side={-1}
          rise={1}
          progress={at(T.labelPlateau)}
          textMode={text}
          lineMode={lineMode}
          minDim={minDim}
          seed="lbl-plateau"
          frameWidth={width}
          reach={2.2}
        />
      </svg>
    </AbsoluteFill>
  );
};
