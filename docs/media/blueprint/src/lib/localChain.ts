import type { Vec3 } from "./projection";
import { arrow, box, cloud, type Segment } from "./segments";

// The signal chain, all on the device: microphone through the analysis core to the pad.
export const NODES: { x: number; label: string }[] = [
  { x: -2.3, label: "mic" },
  { x: -1.15, label: "worklet" },
  { x: 0, label: "worker" },
  { x: 1.15, label: "core" },
  { x: 2.3, label: "pad" },
];

const HALF_W = 0.4;

export const chainSegments = (): Segment[] => {
  const segs: Segment[] = [];
  for (const n of NODES) segs.push(...box([n.x, 0, 0], HALF_W * 2, 0.56, 0.5));
  for (let i = 0; i < NODES.length - 1; i++) {
    segs.push(...arrow([NODES[i].x + HALF_W, 0, 0], [NODES[i + 1].x - HALF_W, 0, 0], 0.13));
  }
  return segs;
};

export const CLOUD_C: Vec3 = [0.2, 1.08, 0];
const CLOUD_SCALE = 0.78;
export const cloudSegments = (): Segment[] => cloud(CLOUD_C, CLOUD_SCALE);

// The two strokes that strike the cloud through, once it is refused.
export const cloudCross = (): Segment[] => [
  { a: [CLOUD_C[0] - 0.56, CLOUD_C[1] - 0.34, 0], b: [CLOUD_C[0] + 0.56, CLOUD_C[1] + 0.34, 0] },
  { a: [CLOUD_C[0] - 0.56, CLOUD_C[1] + 0.34, 0], b: [CLOUD_C[0] + 0.56, CLOUD_C[1] - 0.34, 0] },
];

export const nodeAnchor = (i: number): Vec3 => [NODES[i].x, 0.42, 0];
export const cloudEdge = (): Vec3 => [CLOUD_C[0] + 0.61, CLOUD_C[1], 0];
