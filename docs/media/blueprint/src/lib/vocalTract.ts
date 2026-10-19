import type { Vec3 } from "./projection";
import { add, mul, sub, unit, type Segment } from "./segments";

// The vocal tract as a wireframe tube: a pharynx that rises, then bends forward
// into the oral cavity. `drop` lowers the larynx, which lengthens the tract.
const P0: Vec3 = [-0.52, -0.95, 0]; // larynx
const C1: Vec3 = [-0.52, -0.15, 0];
const C2: Vec3 = [-0.12, 0.34, 0];
const P3: Vec3 = [0.62, 0.5, 0]; // lips

const bez = (u: number, p0: Vec3, c1: Vec3, c2: Vec3, p3: Vec3): Vec3 => {
  const m = 1 - u;
  const a = m * m * m;
  const b = 3 * m * m * u;
  const c = 3 * m * u * u;
  const d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
    a * p0[2] + b * c1[2] + c * c2[2] + d * p3[2],
  ];
};

export const axisPoint = (u: number, drop = 0): Vec3 => {
  const p0 = add(P0, [0, -drop, 0]);
  const c1 = add(C1, [0, -drop * 0.7, 0]);
  return bez(u, p0, c1, C2, P3);
};

const axisTangent = (u: number, drop = 0): Vec3 => {
  const e = 0.002;
  return unit(sub(axisPoint(Math.min(1, u + e), drop), axisPoint(Math.max(0, u - e), drop)));
};

// The tract is planar (z = 0), so each ring's frame is the in-plane normal plus world z.
const frameAt = (u: number, drop = 0): { p: Vec3; n: Vec3 } => {
  const p = axisPoint(u, drop);
  const t = axisTangent(u, drop);
  const n = unit([t[1], -t[0], 0]);
  return { p, n };
};

export const radiusAt = (u: number): number => 0.2 - 0.05 * u + 0.022 * Math.sin(u * Math.PI);

const RING_STEPS = 8;
const RINGS = 13;

const ringPoint = (u: number, theta: number, drop = 0): Vec3 => {
  const { p, n } = frameAt(u, drop);
  const r = radiusAt(u);
  return add(p, add(mul(n, Math.cos(theta) * r), [0, 0, Math.sin(theta) * r]));
};

// The tube wireframe. Segment count is constant, so stroke seeds never shift.
export const tractSegments = (drop = 0): Segment[] => {
  const segs: Segment[] = [];
  const seg = (a: Vec3, b: Vec3) => segs.push({ a, b });
  for (let i = 0; i < RINGS; i++) {
    const u = i / (RINGS - 1);
    for (let k = 0; k < RING_STEPS; k++) {
      const t0 = (k / RING_STEPS) * Math.PI * 2;
      const t1 = ((k + 1) / RING_STEPS) * Math.PI * 2;
      seg(ringPoint(u, t0, drop), ringPoint(u, t1, drop));
    }
  }
  for (let i = 0; i < RINGS - 1; i++) {
    const u0 = i / (RINGS - 1);
    const u1 = (i + 1) / (RINGS - 1);
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * Math.PI * 2;
      seg(ringPoint(u0, t, drop), ringPoint(u1, t, drop));
    }
  }
  return segs;
};

// A standing wave inside the tube. Its wavelength follows the tube's length.
const WAVE_STEPS = 56;
export const standingWave = (drop = 0, halfWaves = 2, amp = 0.62): Segment[] => {
  const segs: Segment[] = [];
  let prev: Vec3 | null = null;
  for (let i = 0; i <= WAVE_STEPS; i++) {
    const u = i / WAVE_STEPS;
    const { p, n } = frameAt(u, drop);
    const off = Math.sin(u * Math.PI * halfWaves) * radiusAt(u) * amp;
    const q = add(p, mul(n, off));
    if (prev) segs.push({ a: prev, b: q });
    prev = q;
  }
  return segs;
};

export const glottisPoint = (drop = 0): Vec3 => axisPoint(0, drop);
export const lipsPoint = (drop = 0): Vec3 => axisPoint(1, drop);
