import type { Anchor } from '../layout/AnchorRegistry';
import type { QuestWindow } from './liveness';
import type { P3 } from './perceptionPort';

/**
 * A box placed on an anchor (anchors are points; plans/slice-2-stealth-chase.md section 12, B1). The box turns with
 * the anchor's yaw; `offset` is in the anchor's frame (x right, z back, yaw 0 facing -Z).
 */
export interface VolumeDef {
  anchor: string;
  half: P3;
  offset?: P3;
}

export interface CheckpointDef {
  /** Checkpoint id (saved in `stealth` v1; thread 6 matches `gate.inside`). */
  id: string;
  /** Where a capture or load puts the player (feet and yaw). */
  anchor: string;
  volume: VolumeDef;
}

export interface StealthSectionDef {
  id: string;
  /** Live from `liveFrom` (current or done) until `liveUntil` is done (quest-derived, no flags; ruling 3). */
  quest: QuestWindow & { exitArmedAfter?: readonly string[] };
  /** The section's bounds: a box on an anchor, or a whole interior (`interiors.interiorAt(feet)`). */
  bounds: VolumeDef | { interior: string };
  /** First is the section start. */
  checkpoints: readonly CheckpointDef[];
  exit: VolumeDef;
  /** Thread 5's spawner groups holding the section's watch guards. */
  guardGroups: readonly string[];
  /** `hide` interactables registered by explicit id (never by tag). */
  hideSpots: readonly { id: string; anchor: string }[];
}

const v = (anchor: string, hx: number, hy: number, hz: number, offset?: P3): VolumeDef => ({ anchor, half: { x: hx, y: hy, z: hz }, ...(offset ? { offset } : {}) });

/**
 * M06 on thread 17's anchors (src/harrowmark/ANCHORS.md: start z 1234, cp.inside 1275, end 1300; hide spots out to
 * x +168 and z +81, so the box is 175 x 85 around cp.inside, symmetric so the anchor's 180 degree yaw does not
 * matter). M09 on thread 3a's counting-house def, created when the interior loads; its bounds are the interior.
 */
export const SECTIONS: readonly StealthSectionDef[] = [
  {
    id: 'm06.south-gate',
    quest: { id: 'm06', liveFrom: 'o2', liveUntil: 'o2' },
    bounds: v('stealth.m06.cp.inside', 175, 15, 85),
    checkpoints: [
      { id: 'gate.start', anchor: 'stealth.m06.start', volume: v('stealth.m06.start', 4, 3, 4) },
      { id: 'gate.inside', anchor: 'stealth.m06.cp.inside', volume: v('stealth.m06.cp.inside', 4, 3, 4) },
    ],
    exit: v('stealth.m06.end', 3, 3, 3),
    guardGroups: ['stealth.m06.watch'],
    hideSpots: [1, 2, 3, 4].map((i) => ({ id: `hide:m06-${i}`, anchor: `hide.m06.${i}` })),
  },
  {
    id: 'm09.counting-house',
    quest: { id: 'm09', liveFrom: 'o2', liveUntil: 'o4', exitArmedAfter: ['o3'] },
    bounds: { interior: 'counting-house' },
    checkpoints: [
      { id: 'ch.entry', anchor: 'stealth.m09.entry', volume: v('stealth.m09.entry', 2, 3, 2) },
      { id: 'ch.hall', anchor: 'stealth.m09.cp.hall', volume: v('stealth.m09.cp.hall', 2, 3, 2) },
      { id: 'ch.office', anchor: 'stealth.m09.cp.office', volume: v('stealth.m09.cp.office', 2, 3, 2) },
    ],
    exit: v('stealth.m09.exit', 2, 3, 2),
    guardGroups: ['stealth.m09.hall', 'stealth.m09.stacks', 'stealth.m09.clerk'],
    hideSpots: [1, 2, 3, 4].map((i) => ({ id: `hide:m09-${i}`, anchor: `hide.m09.${i}` })),
  },
  // Act 2 (A12): M15's hunters' camp, on A3's anchors in cinderreach/huntersCamp.ts; the bounds cover the camp's 90 x 90 m trigger.
  {
    id: 'm15.camp',
    quest: { id: 'm15', liveFrom: 'scout', liveUntil: 'scout' },
    bounds: v('cinderreach.stealth.m15.centre', 48, 15, 48),
    checkpoints: [
      { id: 'camp.start', anchor: 'cinderreach.stealth.m15.start', volume: v('cinderreach.stealth.m15.start', 4, 3, 4) },
      { id: 'camp.inside', anchor: 'cinderreach.stealth.m15.cp.inside', volume: v('cinderreach.stealth.m15.cp.inside', 4, 3, 4) },
    ],
    exit: v('cinderreach.stealth.m15.end', 3, 3, 3),
    guardGroups: ['stealth.m15.watch'],
    hideSpots: [1, 2, 3, 4].map((i) => ({ id: `hide:m15-${i}`, anchor: `cinderreach.hide.m15.${i}` })),
  },
  // Act 2 Phase D (A13): M21's spy branch, in Grisel Hall (A4's interior `grisel-hall`; the hall's anchors are the interior's own).
  {
    id: 'm21.grisel-hall',
    quest: { id: 'm21', liveFrom: 'stealth', liveUntil: 'stealth' },
    bounds: { interior: 'grisel-hall' },
    checkpoints: [
      { id: 'hall.start', anchor: 'oldsmoke.stealth.m21.start', volume: v('oldsmoke.stealth.m21.start', 2, 3, 2) },
      { id: 'hall.gallery', anchor: 'oldsmoke.stealth.m21.cp.gallery', volume: v('oldsmoke.stealth.m21.cp.gallery', 2, 3, 2) },
      { id: 'hall.study', anchor: 'oldsmoke.stealth.m21.cp.study', volume: v('oldsmoke.stealth.m21.cp.study', 2, 3, 2) },
    ],
    exit: v('oldsmoke.stealth.m21.end', 2, 3, 2),
    guardGroups: ['stealth.m21.watch'],
    hideSpots: [1, 2, 3, 4].map((i) => ({ id: `hide:m21-${i}`, anchor: `oldsmoke.hide.m21.${i}` })),
  },
];

export const isInteriorBounds = (b: StealthSectionDef['bounds']): b is { interior: string } => 'interior' in b;

/** Is `p` inside the section's bounds? `interiorAt` answers interior bounds (null outdoors). */
export function insideSection(def: StealthSectionDef, find: (id: string) => Anchor | undefined, interiorAt: (p: P3) => string | null, p: P3): boolean {
  return isInteriorBounds(def.bounds) ? interiorAt(p) === def.bounds.interior : insideVolume(def.bounds, find, p);
}

/** Is `p` inside the volume? False when its anchor does not exist (yet). */
export function insideVolume(vol: VolumeDef, find: (id: string) => Anchor | undefined, p: P3): boolean {
  const a = find(vol.anchor);
  if (!a || ![p.x, p.y, p.z].every(Number.isFinite)) return false;
  const c = Math.cos(a.yaw);
  const s = Math.sin(a.yaw);
  const o = vol.offset ?? { x: 0, y: 0, z: 0 };
  // Box centre in world space: the offset turned by the anchor's yaw.
  const cx = a.position.x + o.x * c + o.z * s;
  const cz = a.position.z - o.x * s + o.z * c;
  const dx = p.x - cx;
  const dz = p.z - cz;
  // Into the box's frame (inverse yaw).
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= vol.half.x && Math.abs(p.y - (a.position.y + o.y)) <= vol.half.y && Math.abs(lz) <= vol.half.z;
}

export interface SectionProblem {
  section: string;
  problem: string;
}

/** Distance from p to the segment a-b, horizontally. */
function segDist(p: P3, a: P3, b: P3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/**
 * Checks a section against a layout: every anchor exists, checkpoint and exit boxes sit inside a box section, hide
 * spots are at least `hideClearance` from every patrol segment (patrol routes given as ordered node lists).
 */
export function validateSection(
  def: StealthSectionDef,
  find: (id: string) => Anchor | undefined,
  patrols: readonly (readonly P3[])[] = [],
  hideClearance = 3,
): SectionProblem[] {
  const out: SectionProblem[] = [];
  const need = (id: string) => {
    if (!find(id)) out.push({ section: def.id, problem: `missing anchor ${id}` });
  };
  if (!isInteriorBounds(def.bounds)) need(def.bounds.anchor);
  def.checkpoints.forEach((c) => (need(c.anchor), need(c.volume.anchor)));
  need(def.exit.anchor);
  def.hideSpots.forEach((h) => need(h.anchor));
  if (out.length) return out;
  if (def.checkpoints.length === 0) out.push({ section: def.id, problem: 'no checkpoints' });
  const box = def.bounds;
  if (!isInteriorBounds(box)) {
    for (const c of def.checkpoints) {
      if (!insideVolume(box, find, find(c.anchor)!.position)) out.push({ section: def.id, problem: `checkpoint ${c.id} outside the section` });
    }
    if (!insideVolume(box, find, find(def.exit.anchor)!.position)) out.push({ section: def.id, problem: 'exit outside the section' });
  }
  for (const h of def.hideSpots) {
    const p = find(h.anchor)!.position;
    for (const route of patrols) {
      for (let i = 0; i < route.length; i++) {
        const a = route[i];
        const b = route[(i + 1) % route.length];
        if (segDist(p, a, b) < hideClearance) {
          out.push({ section: def.id, problem: `hide spot ${h.id} within ${hideClearance} m of a patrol segment` });
          i = route.length;
        }
      }
    }
  }
  return out;
}
