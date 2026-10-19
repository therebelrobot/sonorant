import { random } from "remotion";
import { depthRatio, project, type Camera, type Vec3 } from "../lib/projection";
import { palette, sizes } from "../style";

type OrbSpec = {
  radius: number; height: number; speed: number; phase: number;
  bob: number; size: number; pulseRate: number;
};

export const makeOrbs = (count: number, seed = "orb"): OrbSpec[] =>
  Array.from({ length: count }, (_, i) => {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    return {
      radius: 1.0 + r("r") * 0.9,
      height: -0.8 + r("y") * 2.0,
      speed: (0.22 + r("s") * 0.38) * (r("d") < 0.5 ? -1 : 1),
      phase: r("p") * Math.PI * 2,
      bob: 0.08 + r("b") * 0.14,
      size: 0.8 + r("z") * 0.8,
      pulseRate: 0.25 + r("pr") * 0.25,
    };
  });

const orbPos = (o: OrbSpec, t: number): Vec3 => {
  const q = o.phase + t * o.speed;
  return [o.radius * Math.cos(q), o.height + Math.sin(t * 1.1 + o.phase) * o.bob, o.radius * Math.sin(q)];
};

// Accent-colored orbs drifting around the subject. Each pulses softly and leaves a short fading trail.
export const Orbs: React.FC<{
  orbs: OrbSpec[];
  camera: Camera;
  t: number; // seconds
  fade: number; // 0→1
  minDim: number;
}> = ({ orbs, camera, t, fade, minDim }) => {
  if (fade <= 0) return null;
  const trailSteps = 12;
  const trailDt = 0.04;
  const drawn = orbs
    .map((o, i) => ({ o, i, p: project(orbPos(o, t), camera) }))
    .sort((a, b) => b.p.z - a.p.z);
  return (
    <g>
      <defs>
        <radialGradient id="orbGlow">
          <stop offset="0%" stopColor={palette.accent} stopOpacity={0.6} />
          <stop offset="35%" stopColor={palette.accent} stopOpacity={0.16} />
          <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
        </radialGradient>
      </defs>
      {drawn.map(({ o, i, p }) => {
        const depth = depthRatio(p, camera);
        const pulse = 0.5 + 0.5 * Math.sin(Math.PI * 2 * o.pulseRate * t + o.phase);
        const r = sizes.orb * minDim * o.size * depth * (0.85 + 0.3 * pulse);
        const vis = fade * Math.max(0.3, Math.min(1, 0.35 + 0.65 * ((depth - 0.75) / 0.5)));
        const trail: React.ReactNode[] = [];
        let prev = p;
        for (let j = 1; j <= trailSteps; j++) {
          const q = project(orbPos(o, t - j * trailDt), camera);
          const k = 1 - j / (trailSteps + 1);
          trail.push(
            <line key={j} x1={prev.x} y1={prev.y} x2={q.x} y2={q.y}
              stroke={palette.accent} strokeWidth={r * 1.1 * k} strokeLinecap="round" opacity={0.4 * k * vis} />,
          );
          prev = q;
        }
        return (
          <g key={i}>
            {trail}
            <circle cx={p.x} cy={p.y} r={r * 5} fill="url(#orbGlow)" opacity={vis * (0.6 + 0.4 * pulse)} />
            <circle cx={p.x} cy={p.y} r={r} fill={palette.accentCore} opacity={vis} />
          </g>
        );
      })}
    </g>
  );
};
