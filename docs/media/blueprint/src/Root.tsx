import { Composition } from "remotion";
import { LocalOnly } from "./scenes/LocalOnly";
import { PitchResonance } from "./scenes/PitchResonance";
import { Plateau } from "./scenes/Plateau";
import { aspects, defaultStyle, FPS, type Aspect } from "./style";

const DURATION_SECONDS = 10;

const SCENES = {
  "pitch-resonance": PitchResonance,
  "local-only": LocalOnly,
  plateau: Plateau,
} as const;

// Each scene is registered once per aspect ratio, e.g. PitchResonance-16x9.
export const RemotionRoot: React.FC = () => (
  <>
    {Object.entries(SCENES).map(([name, component]) =>
      (Object.keys(aspects) as Aspect[]).map((a) => (
        <Composition
          key={`${name}-${a}`}
          id={`${name}-${a}`}
          component={component}
          durationInFrames={DURATION_SECONDS * FPS}
          fps={FPS}
          width={aspects[a].width}
          height={aspects[a].height}
          defaultProps={defaultStyle}
        />
      )),
    )}
  </>
);
