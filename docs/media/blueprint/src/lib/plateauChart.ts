import type { Vec3 } from "./projection";
import type { Segment } from "./segments";

// A chart on the z = 0 plane: x is time, y is the measured value.
export const AXIS_X0 = -1.7;
export const AXIS_X1 = 1.7;
export const AXIS_Y0 = -0.95;
export const AXIS_Y1 = 1.05;

export const axes = (): Segment[] => {
  const out: Segment[] = [];
  out.push({ a: [AXIS_X0, AXIS_Y0, 0], b: [AXIS_X1, AXIS_Y0, 0] });
  out.push({ a: [AXIS_X0, AXIS_Y0, 0], b: [AXIS_X0, AXIS_Y1, 0] });
  for (let i = 1; i <= 6; i++) {
    const x = AXIS_X0 + (AXIS_X1 - AXIS_X0) * (i / 7);
    out.push({ a: [x, AXIS_Y0, 0], b: [x, AXIS_Y0 - 0.06, 0] });
  }
  for (let i = 1; i <= 4; i++) {
    const y = AXIS_Y0 + (AXIS_Y1 - AXIS_Y0) * (i / 5);
    out.push({ a: [AXIS_X0, y, 0], b: [AXIS_X0 - 0.06, y, 0] });
  }
  return out;
};

const xAt = (u: number): number => AXIS_X0 + (AXIS_X1 - AXIS_X0) * u;

// Pitch climbs, then flattens into the plateau.
export const pitchY = (u: number): number => {
  const rise = Math.min(1, u / 0.4);
  const eased = 1 - Math.pow(1 - rise, 3);
  return -0.62 + eased * 1.15;
};

// Resonance does not move.
export const resonanceY = (_u: number): number => -0.32;

// One polyline as a fixed number of segments, so ids stay stable while it reveals.
export const curve = (fn: (u: number) => number, steps = 84): Segment[] => {
  const segs: Segment[] = [];
  for (let i = 0; i < steps; i++) {
    const u0 = i / steps;
    const u1 = (i + 1) / steps;
    const a: Vec3 = [xAt(u0), fn(u0), 0];
    const b: Vec3 = [xAt(u1), fn(u1), 0];
    segs.push({ a, b });
  }
  return segs;
};

export const pitchPoint = (u: number): Vec3 => [xAt(u), pitchY(u), 0];
export const resonancePoint = (u: number): Vec3 => [xAt(u), resonanceY(u), 0];
