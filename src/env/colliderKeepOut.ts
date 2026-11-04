// The keep-walkable list for the env colliders (src/env/colliders.ts): everything the game sends a body through, as discs, corridors and boxes.
// Built from the shipped layouts, so a lane, trigger, anchor or door added later is protected without touching this file.
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { CROWD_LANES, DOORS, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { DENSITY_LAYOUT_HM } from '../harrowmark/density.layout';
import type { LayoutData } from '../region/layoutTypes';
import { TUTORIAL_ANCHORS } from '../tutorial/beats';
import type { KeepOut, KeepOutBox, KeepOutDisc, KeepOutSegment } from './colliders';

/** Anchors keep this clear (metres). */
export const ANCHOR_CLEARANCE = 1.2;
/** Door arrival points keep this clear (metres). */
export const DOOR_CLEARANCE = 2;
/** A lane keeps at least this clear on each side, whatever its crowd half width (the narrow ward streets are 1 m): every crossing gap is then 2.5 m or more. */
export const MIN_LANE_CLEARANCE = 1.25;
/** A chase line keeps this clear on each side (metres). */
export const CHASE_HALF_WIDTH = 1.5;

const DEG = Math.PI / 180;

export interface KeepOutSources {
  layouts: readonly LayoutData[];
  lanes: ReadonlyArray<{ id: string; points: readonly string[]; loop: boolean; halfWidth: number }>;
  doors: ReadonlyArray<{ doorId: string; x: number; z: number }>;
  anchors: ReadonlyArray<{ id: string; x: number; z: number }>;
  boxes: readonly KeepOutBox[];
}

/**
 * The B2 lane north of the Kettlewick gate (x -4 .. 4, z 232 .. 300, the waves' road): the hedges stand on the east verge from x 4 on
 * (b2.tiles.test.ts), so the box ends at 3.5 and the verge keeps its collider.
 */
export const EXTRA_KEEP_OUT_BOXES: readonly KeepOutBox[] = [{ cx: -0.25, cz: 266, hx: 3.75, hz: 34, yaw: 0, why: 'lane kettlewick-road' }];

export const DEFAULT_SOURCES: KeepOutSources = {
  layouts: [BRIGHTWATER_LAYOUT, HARROWMARK_LAYOUT, DENSITY_LAYOUT_HM],
  lanes: CROWD_LANES,
  doors: DOORS,
  anchors: TUTORIAL_ANCHORS,
  boxes: EXTRA_KEEP_OUT_BOXES,
};

const CHASE_ID = /^(chase\.[\w.-]+?)\.(\d+)$/;

/** Chase lines are anchors named `chase.<quest>.<n>` (the courier's route) and `chase.<quest>.alt.<n>` (the second route): one polyline per prefix. */
export function chaseLines(layouts: readonly LayoutData[]): Array<{ id: string; points: Array<[number, number]> }> {
  const lines = new Map<string, Array<{ n: number; x: number; z: number }>>();
  for (const l of layouts) {
    for (const a of l.anchors) {
      const m = CHASE_ID.exec(a.id);
      if (!m || !Number.isFinite(a.x) || !Number.isFinite(a.z)) continue;
      const k = m[1]!;
      (lines.get(k) ?? lines.set(k, []).get(k)!).push({ n: Number(m[2]), x: a.x, z: a.z });
    }
  }
  return [...lines].map(([id, pts]) => ({ id, points: pts.sort((a, b) => a.n - b.n).map((p) => [p.x, p.z] as [number, number]) }));
}

const polyline = (pts: ReadonlyArray<readonly [number, number]>, loop: boolean, r: number, why: string): KeepOutSegment[] => {
  const out: KeepOutSegment[] = [];
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    out.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r, why });
  }
  return out;
};

export function buildKeepOut(src: KeepOutSources = DEFAULT_SOURCES): KeepOut {
  const discs: KeepOutDisc[] = [];
  const segments: KeepOutSegment[] = [];
  const boxes: KeepOutBox[] = [...src.boxes];
  const anchorAt = new Map<string, [number, number]>();
  for (const l of src.layouts) {
    for (const a of l.anchors) {
      anchorAt.set(a.id, [a.x, a.z]);
      // Rooftop anchors (banners, roof hides, ward-deck chase nodes) are above the ground boxes: they do not keep the street clear.
      if (a.dy || a.tags?.includes('elevated')) continue;
      discs.push({ x: a.x, z: a.z, r: ANCHOR_CLEARANCE, why: `anchor ${a.id}` });
    }
    for (const t of l.triggers) {
      if (t.shape === 'sphere') discs.push({ x: t.x, z: t.z, r: t.radius, why: `trigger ${t.id}` });
      else boxes.push({ cx: t.x, cz: t.z, hx: t.half[0], hz: t.half[2], yaw: (t.yawDeg ?? 0) * DEG, why: `trigger ${t.id}` });
    }
  }
  for (const a of src.anchors) discs.push({ x: a.x, z: a.z, r: ANCHOR_CLEARANCE, why: `anchor ${a.id}` });
  for (const d of src.doors) discs.push({ x: d.x, z: d.z, r: DOOR_CLEARANCE, why: `door ${d.doorId}` });
  for (const lane of src.lanes) {
    const pts = lane.points.map((id) => anchorAt.get(id)).filter((p): p is [number, number] => !!p);
    segments.push(...polyline(pts, lane.loop, Math.max(lane.halfWidth, MIN_LANE_CLEARANCE), `lane ${lane.id}`));
  }
  for (const c of chaseLines(src.layouts)) segments.push(...polyline(c.points, false, CHASE_HALF_WIDTH, `chase ${c.id}`));
  return { discs, segments, boxes };
}

let cached: KeepOut | null = null;
/** The default keep-out, built once. */
export function defaultKeepOut(): KeepOut {
  return (cached ??= buildKeepOut());
}
