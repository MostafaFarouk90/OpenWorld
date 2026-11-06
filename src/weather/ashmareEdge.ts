// Act 4 L3 (plans/act4-L3.md 2.8): the Ashmare will not go onto the ash. A rider who comes within a few metres of a
// region with `mount: 'refused'` (the Waste) is set down outside it, the horse goes to her post at Ashgate, and a
// toast says so (once per approach). Inside, L0's region rule refuses the summon; outside she comes as before.
import { insideDepth, type Box } from './weight';

/** Metres before the edge the rider is set down; the toast re-arms once the rider is this far back out. */
export const ASHMARE_EDGE = { dismountAt: 4, rearmAt: 30, fallbackStep: 6 } as const;
export const ASHMARE_POST_ANCHOR = 'ashgate.horse-post';
export const ASHMARE_DISMISSED_KEY = 'mount.waste.dismissed';

/** The deepest a point reaches into any of the boxes (negative: metres outside the nearest). */
export function deepest(boxes: readonly Box[], x: number, z: number): { depth: number; box: Box | null } {
  let best: { depth: number; box: Box | null } = { depth: -Infinity, box: null };
  for (const b of boxes) {
    const d = insideDepth(b, x, z);
    if (d > best.depth) best = { depth: d, box: b };
  }
  return best;
}

/** A point `step` metres further out of `box` than (x, z), away from its nearest edge. */
export function outward(box: Box, x: number, z: number, step: number): { x: number; z: number } {
  const edges = [
    { d: Math.abs(x - box.x0), nx: -1, nz: 0 },
    { d: Math.abs(box.x1 - x), nx: 1, nz: 0 },
    { d: Math.abs(z - box.z0), nx: 0, nz: -1 },
    { d: Math.abs(box.z1 - z), nx: 0, nz: 1 },
  ].sort((a, b) => a.d - b.d);
  const e = edges[0];
  return { x: x + e.nx * step, z: z + e.nz * step };
}

export class AshmareEdge {
  private armed = true;

  constructor(private readonly boxes: readonly Box[]) {}

  /** One fixed step while mounted (or not); returns the box to set the rider down at, if due now. */
  step(mounted: boolean, x: number, z: number): { dismount: boolean; toast: boolean; box: Box | null } {
    const { depth, box } = deepest(this.boxes, x, z);
    if (depth < -ASHMARE_EDGE.rearmAt) this.armed = true;
    if (!mounted || depth < -ASHMARE_EDGE.dismountAt) return { dismount: false, toast: false, box: null };
    const toast = this.armed;
    this.armed = false;
    return { dismount: true, toast, box };
  }
}
