import type { Vec3 } from '../physics/PhysicsWorld';
import type { NavGridDef } from '../nav/NavGrid';
import type { InteriorDef, LocalRect } from './types';

/** Interiors float this far above the highest terrain under them (plans/slice-2-interiors-nav.md section 2). */
export const FLOAT_HEIGHT = 150;
/** Solid cells and nav cells share this size, so colliders and the grid cannot disagree. */
export const CELL = 0.5;
/** Thickness of floor and ceiling slabs. */
export const SLAB = 0.5;
/** Margin around the rooms that still counts as inside the interior's bounds. */
const BOUNDS_MARGIN = 1;
const DEG = Math.PI / 180;

export type BoxKind = 'floor' | 'wall' | 'ceiling' | 'pillar' | 'blocker';

/** A world-space box. */
export interface SolidBox {
  kind: BoxKind;
  min: Vec3;
  max: Vec3;
  blockerId?: string;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Everything about an interior in world space, without Three or Rapier (built by `build.ts`). */
export interface InteriorLayout {
  def: InteriorDef;
  floorY: number;
  origin: Vec3;
  bounds: Bounds;
  boxes: SolidBox[];
  anchors: { id: string; position: Vec3; yaw: number }[];
  triggers: { id: string; center: Vec3; half: Vec3 }[];
  torches: Vec3[];
  nav: NavGridDef;
}

export function boundsContain(b: Bounds, p: Vec3): boolean {
  return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
}

/** Yaw that faces from `from` toward `to` (0 faces -Z, +PI/2 faces -X; same as the enemies' `yawTo`). */
function yawToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return dx === 0 && dz === 0 ? 0 : Math.atan2(-dx, -dz);
}

function roomsBox(def: InteriorDef): LocalRect {
  const r = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const room of def.rooms) {
    r.x0 = Math.min(r.x0, room.x0);
    r.z0 = Math.min(r.z0, room.z0);
    r.x1 = Math.max(r.x1, room.x1);
    r.z1 = Math.max(r.z1, room.z1);
  }
  return r;
}

const inRect = (r: LocalRect, x: number, z: number) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

/** The highest terrain over the footprint, sampled every 2 m and at the corners. */
function maxGround(def: InteriorDef, heightAt: (x: number, z: number) => number): number {
  const box = roomsBox(def);
  let max = -Infinity;
  const step = 2;
  for (let x = box.x0 - 1; x <= box.x1 + 1 + 1e-9; x += step) {
    for (let z = box.z0 - 1; z <= box.z1 + 1 + 1e-9; z += step) {
      max = Math.max(max, heightAt(def.site.x + x, def.site.z + z));
    }
  }
  return max;
}

/**
 * Turns a def into world-space solids, anchors, triggers and a nav grid def. Solids come from a 0.5 m raster: a room cell has a
 * floor slab and a ceiling slab (raised into a header where a neighbouring room is taller), and a non-room cell next to a room is
 * wall up to the tallest neighbouring ceiling. Equal cells are merged into rectangles, so the vault is a few dozen boxes.
 */
export function layoutInterior(def: InteriorDef, heightAt: (x: number, z: number) => number): InteriorLayout {
  if (def.rooms.length === 0) throw new Error(`Interior "${def.id}" has no rooms`);
  const floorY = maxGround(def, heightAt) + FLOAT_HEIGHT;
  const origin = { x: def.site.x, y: floorY, z: def.site.z };
  const w = (x: number, y: number, z: number): Vec3 => ({ x: origin.x + x, y: floorY + y, z: origin.z + z });

  const box = roomsBox(def);
  // One cell of wall all round.
  const gx0 = box.x0 - CELL;
  const gz0 = box.z0 - CELL;
  const cols = Math.round((box.x1 - box.x0) / CELL) + 2;
  const rows = Math.round((box.z1 - box.z0) / CELL) + 2;
  const roomOf = new Int32Array(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gx0 + (c + 0.5) * CELL;
      const z = gz0 + (r + 0.5) * CELL;
      roomOf[r * cols + c] = def.rooms.findIndex((room) => inRect(room, x, z));
    }
  }
  const heightOf = (c: number, r: number): number => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    const i = roomOf[r * cols + c];
    return i < 0 ? -1 : def.rooms[i].height;
  };

  // Per cell: a key naming its solid intervals (y relative to the floor), so equal cells merge.
  const intervals: [number, number][][] = [];
  const keys: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let around = -1;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) around = Math.max(around, heightOf(c + dc, r + dr));
      const own = heightOf(c, r);
      let iv: [number, number][] = [];
      if (own >= 0) {
        let top = own;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) top = Math.max(top, heightOf(c + dc, r + dr));
        iv = [
          [-SLAB, 0],
          [own, top + SLAB],
        ];
      } else if (around >= 0) {
        iv = [[-SLAB, around + SLAB]];
      }
      intervals.push(iv);
      keys.push(iv.map((p) => p.join(':')).join('|'));
    }
  }

  // Greedy rectangle merge over cells with the same key.
  const boxes: SolidBox[] = [];
  const used = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (used[i] || keys[i] === '') continue;
      const key = keys[i];
      let cw = 1;
      while (c + cw < cols && !used[i + cw] && keys[i + cw] === key) cw++;
      let rh = 1;
      grow: while (r + rh < rows) {
        for (let k = 0; k < cw; k++) {
          const j = (r + rh) * cols + c + k;
          if (used[j] || keys[j] !== key) break grow;
        }
        rh++;
      }
      for (let dr = 0; dr < rh; dr++) for (let k = 0; k < cw; k++) used[(r + dr) * cols + c + k] = 1;
      const x0 = gx0 + c * CELL;
      const z0 = gz0 + r * CELL;
      const x1 = x0 + cw * CELL;
      const z1 = z0 + rh * CELL;
      for (const [y0, y1] of intervals[i]) {
        const kind: BoxKind = y1 <= 0 ? 'floor' : y0 <= -SLAB ? 'wall' : 'ceiling';
        boxes.push({ kind, min: w(x0, y0, z0), max: w(x1, y1, z1) });
      }
    }
  }
  const roomHeightAt = (x: number, z: number): number => {
    const room = def.rooms.find((rm) => inRect(rm, x, z));
    return room ? room.height : Math.max(...def.rooms.map((rm) => rm.height));
  };
  for (const p of def.pillars) {
    const h = roomHeightAt((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
    boxes.push({ kind: 'pillar', min: w(p.x0, 0, p.z0), max: w(p.x1, h, p.z1) });
  }
  for (const b of def.blockers) {
    boxes.push({ kind: 'blocker', blockerId: b.id, min: w(b.rect.x0, 0, b.rect.z0), max: w(b.rect.x1, b.height, b.rect.z1) });
  }

  const tallest = Math.max(...def.rooms.map((rm) => rm.height));
  const bounds: Bounds = {
    min: w(box.x0 - BOUNDS_MARGIN, -BOUNDS_MARGIN, box.z0 - BOUNDS_MARGIN),
    max: w(box.x1 + BOUNDS_MARGIN, tallest + BOUNDS_MARGIN, box.z1 + BOUNDS_MARGIN),
  };

  const anchors = def.anchors.map((a) => ({
    id: a.id,
    position: w(a.x, 0, a.z),
    yaw: a.facing ? yawToward(a, a.facing) : (a.yaw ?? 0) * DEG,
  }));
  const triggers = def.triggers.map((t) => ({ id: t.id, center: w(t.center.x, t.center.y, t.center.z), half: { ...t.half } }));
  const toWorldRect = (r: LocalRect) => ({ x0: origin.x + r.x0, z0: origin.z + r.z0, x1: origin.x + r.x1, z1: origin.z + r.z1 });

  return {
    def,
    floorY,
    origin,
    bounds,
    boxes,
    anchors,
    triggers,
    torches: def.torches.map((t) => w(t.x, t.y, t.z)),
    nav: {
      id: def.id,
      minX: origin.x + box.x0,
      minZ: origin.z + box.z0,
      maxX: origin.x + box.x1,
      maxZ: origin.z + box.z1,
      floorY,
      cellSize: CELL,
      walkable: def.rooms.map(toWorldRect),
      blocked: def.pillars.map(toWorldRect),
      blockers: Object.fromEntries(def.blockers.map((b) => [b.id, [toWorldRect(b.rect)]])),
    },
  };
}
