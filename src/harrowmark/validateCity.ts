// Pure checks for the Harrowmark layout. validateLayout (thread 4's) floods a walkability grid and would need a 9 M cell
// window for a 1.5 km city, so the city gets geometric checks that cost nothing instead.
import { footprintCorners, footprintsOverlap, pointInFootprint } from '../region/geometry';
import type { AnchorSpec, LayoutData, StructureSpec } from '../region/layoutTypes';
import { CENTER, MAX_STRUCTURE_RADIUS } from './city';

const NAME = /^[a-zA-Z0-9_-]+$/;
const PLAYER_MARGIN = 0.4;
const RING_PART = /^(wall|tower|plug|portcullis)\./;

const dupes = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return [...out];
};

export const radiusOf = (x: number, z: number): number => Math.hypot(x - CENTER.x, z - CENTER.z);
const blocks = (s: StructureSpec): boolean => s.mode === 'solid';

/** Where a door's arrival point lands: 1.6 m along the anchor's yaw (yaw 0 faces -Z). */
export function arrival(a: AnchorSpec, dist = 1.6): { x: number; z: number } {
  const yaw = (a.yawDeg * Math.PI) / 180;
  return { x: a.x - Math.sin(yaw) * dist, z: a.z - Math.cos(yaw) * dist };
}

export interface CityValidateOptions {
  /** Anchor ids allowed outside the ring (the approach: gate.* outside anchors, the queue, the M06 start). */
  outsideOk?: (id: string) => boolean;
  /** Ids already taken by other layouts. */
  takenIds?: ReadonlySet<string>;
  doors?: ReadonlyArray<{ doorId: string; anchor: string }>;
}

const defaultOutsideOk = (id: string): boolean =>
  /^harrowmark\.gate\.[a-z]+$/.test(id) || id.startsWith('harrowmark.gate.south.queue.') || id === 'stealth.m06.start';

export function validateCity(layout: LayoutData, opts: CityValidateOptions = {}): string[] {
  const errors: string[] = [];
  const outsideOk = opts.outsideOk ?? defaultOutsideOk;
  for (const id of dupes(layout.anchors.map((a) => a.id))) errors.push(`duplicate anchor id "${id}"`);
  for (const id of dupes(layout.triggers.map((t) => t.id))) errors.push(`duplicate trigger id "${id}"`);
  for (const id of dupes(layout.structures.map((s) => s.id))) errors.push(`duplicate structure id "${id}"`);
  for (const id of dupes(layout.patrols.map((p) => p.id))) errors.push(`duplicate patrol id "${id}"`);
  for (const a of layout.anchors) if (opts.takenIds?.has(a.id)) errors.push(`anchor "${a.id}" is already defined by another layout`);
  for (const t of layout.triggers) if (opts.takenIds?.has(t.id)) errors.push(`trigger "${t.id}" is already defined by another layout`);

  const anchorIds = new Set(layout.anchors.map((a) => a.id));
  const byId = new Map(layout.structures.map((s) => [s.id, s]));
  for (const n of layout.npcs) if (!anchorIds.has(n.post)) errors.push(`npc "${n.id}": unknown post anchor "${n.post}"`);
  for (const p of layout.patrols) {
    if (p.points.length < 2) errors.push(`patrol "${p.id}": needs at least two points`);
    for (const id of p.points) if (!anchorIds.has(id)) errors.push(`patrol "${p.id}": unknown anchor "${id}"`);
  }
  for (const a of layout.anchors) {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(a.yawDeg)) errors.push(`anchor "${a.id}": non-finite coordinate`);
    if (a.tags?.includes('hide')) {
      const name = a.id.replace(/^harrowmark\.hide\./, '').replace(/^hide\./, '').replace(/\./g, '-');
      if (!NAME.test(name)) errors.push(`hide anchor "${a.id}": name must match [a-zA-Z0-9_-]+`);
    }
  }

  for (const s of layout.structures) {
    for (const [x, z] of footprintCorners(s)) {
      if (radiusOf(x, z) > MAX_STRUCTURE_RADIUS) {
        errors.push(`structure "${s.id}": corner (${x.toFixed(1)}, ${z.toFixed(1)}) is ${radiusOf(x, z).toFixed(1)} m out, beyond ${MAX_STRUCTURE_RADIUS}`);
        break;
      }
    }
    if (s.inside && !byId.has(s.inside)) errors.push(`structure "${s.id}": unknown host "${s.inside}"`);
  }
  const solids = layout.structures.filter(blocks);
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const p = solids[i];
      const q = solids[j];
      if (p.inside === q.id || q.inside === p.id) continue;
      if (RING_PART.test(p.id) && RING_PART.test(q.id)) continue; // chords meet at angles; gate parts abut
      if (footprintsOverlap(p, q)) errors.push(`structures "${p.id}" and "${q.id}" overlap`);
    }
  }

  const insideSolid = (x: number, z: number, margin: number): StructureSpec | undefined =>
    solids.find((s) => pointInFootprint(s, x, z, margin));
  for (const a of layout.anchors) {
    const r = radiusOf(a.x, a.z);
    if (r > 760 && !outsideOk(a.id)) errors.push(`anchor "${a.id}": ${r.toFixed(0)} m from the centre, outside the wall`);
    const roof = a.tags?.includes('elevated');
    if (roof) {
      // A roof or banner anchor floats above its host: a chase/roof node must stand on a block as high as its dy.
      if (a.tags?.includes('banner')) continue;
      const host = solids.find((s) => pointInFootprint(s, a.x, a.z, 0));
      if (!host) errors.push(`anchor "${a.id}": elevated but not over any structure`);
      else if (Math.abs((host.height ?? 0) - (a.dy ?? 0)) > 0.01 && host.kind !== 'crate') {
        errors.push(`anchor "${a.id}": dy ${a.dy} does not match "${host.id}" (${host.height})`);
      }
      continue;
    }
    const hit = insideSolid(a.x, a.z, PLAYER_MARGIN);
    if (hit) errors.push(`anchor "${a.id}": inside solid structure "${hit.id}"`);
  }
  for (const d of opts.doors ?? []) {
    const a = layout.anchors.find((q) => q.id === d.anchor);
    if (!a) {
      errors.push(`door "${d.doorId}": missing anchor "${d.anchor}"`);
      continue;
    }
    const p = arrival(a);
    const hit = insideSolid(p.x, p.z, PLAYER_MARGIN);
    if (hit) errors.push(`door "${d.doorId}": arrival point is inside "${hit.id}"`);
  }
  return errors;
}
