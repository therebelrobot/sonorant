import type { Vec3 } from "./projection";

export type Segment = { a: Vec3; b: Vec3 };

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const poly = (pts: Vec3[]): Segment[] => {
  const out: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1] });
  return out;
};

// A rectangular box as its 12 edges.
export const box = (c: Vec3, w: number, h: number, d: number): Segment[] => {
  const [cx, cy, cz] = c;
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const p: Vec3[] = [
    [cx - x, cy - y, cz - z], [cx + x, cy - y, cz - z], [cx + x, cy + y, cz - z], [cx - x, cy + y, cz - z],
    [cx - x, cy - y, cz + z], [cx + x, cy - y, cz + z], [cx + x, cy + y, cz + z], [cx - x, cy + y, cz + z],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return edges.map(([i, j]) => ({ a: p[i], b: p[j] }));
};

// A straight connector with a two-stroke arrowhead at b, drawn in the x-y plane.
export const arrow = (a: Vec3, b: Vec3, head = 0.14): Segment[] => {
  const dir = unit(sub(b, a));
  const back = mul(dir, -head);
  const perp = unit([dir[1], -dir[0], 0]);
  const h1 = add(add(b, back), mul(perp, head * 0.55));
  const h2 = add(add(b, back), mul(perp, -head * 0.55));
  return [{ a, b }, { a: b, b: h1 }, { a: b, b: h2 }];
};

// A flat cloud silhouette, sampled as a closed outline in the x-y plane:
// a bumpy top and a flatter base, like a drawn cloud.
export const cloud = (c: Vec3, scale = 1): Segment[] => {
  const pts: Vec3[] = [];
  const steps = 44;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const top = Math.max(0, Math.sin(a));
    const r = 0.62 + 0.34 * Math.pow(top, 0.7) * (0.72 + 0.28 * Math.sin(a * 4));
    pts.push([c[0] + Math.cos(a) * r * scale * 1.25, c[1] + Math.sin(a) * r * scale * 0.8, c[2]]);
  }
  pts.push(pts[0]);
  return poly(pts);
};
