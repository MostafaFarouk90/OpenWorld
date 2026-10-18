import { doorCentre, footprintBox, footprintCorners, footprintsOverlap, footprintWithin, pointInFootprint, wallBoxes } from './geometry';
import type { LayoutData, StructureSpec } from './layoutTypes';
import { resolveAnchor, type HeightFn, type ResolvedAnchor } from './resolveLayout';

export interface ValidateOptions {
  /** Defaults to resolving every anchor with `heightAt`; tests pass tampered anchors here. */
  resolvedAnchors?: ResolvedAnchor[];
  /** Largest allowed terrain height spread under a footprint (m). */
  maxFootprintSpread?: number;
  /** tan of the steepest slope an anchor may sit on. */
  maxSlopeTan?: number;
  /** Cell size of the walkability grid (m). */
  cell?: number;
  /** Positions of things that must stay clear of every blocking structure (the old training dummies). */
  keepClear?: Array<{ id: string; x: number; z: number; radius: number }>;
}

const ID = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const NAME = /^[a-zA-Z0-9_-]+$/;
const PLAYER_MARGIN = 0.3;

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return [...out];
}

const finite = (...n: number[]) => n.every((v) => Number.isFinite(v));

/** Returns one message per problem; an empty array means the layout is sound. Pure, no WebGL. */
export function validateLayout(layout: LayoutData, heightAt: HeightFn, opts: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  const maxSpread = opts.maxFootprintSpread ?? 0.5;
  const maxSlopeTan = opts.maxSlopeTan ?? Math.tan((40 * Math.PI) / 180);
  const cell = opts.cell ?? 0.5;

  for (const id of dupes(layout.anchors.map((a) => a.id))) errors.push(`duplicate anchor id "${id}"`);
  for (const id of dupes(layout.triggers.map((t) => t.id))) errors.push(`duplicate trigger id "${id}"`);
  for (const id of dupes(layout.structures.map((s) => s.id))) errors.push(`duplicate structure id "${id}"`);
  for (const id of dupes(layout.npcs.map((n) => n.id))) errors.push(`duplicate npc id "${id}"`);
  for (const id of dupes(layout.patrols.map((p) => p.id))) errors.push(`duplicate patrol id "${id}"`);

  const structures = new Map(layout.structures.map((s) => [s.id, s]));
  const anchorIds = new Set(layout.anchors.map((a) => a.id));

  for (const a of layout.anchors) {
    if (!ID.test(a.id)) errors.push(`anchor "${a.id}": id must look like <area>.<thing>`);
    if (!finite(a.x, a.z, a.yawDeg, a.dy ?? 0)) errors.push(`anchor "${a.id}": non-finite coordinate`);
    if (a.onStructure && !structures.has(a.onStructure)) errors.push(`anchor "${a.id}": unknown structure "${a.onStructure}"`);
  }
  for (const t of layout.triggers) {
    if (!finite(t.x, t.z, t.dy ?? 0)) errors.push(`trigger "${t.id}": non-finite coordinate`);
    if (t.shape === 'sphere' ? !(t.radius > 0 && Number.isFinite(t.radius)) : !t.half.every((h) => h > 0 && Number.isFinite(h)))
      errors.push(`trigger "${t.id}": size must be positive`);
  }
  for (const s of layout.structures) {
    if (!finite(s.x, s.z, s.yawDeg) || !s.footprint.every((v) => v > 0 && Number.isFinite(v))) {
      errors.push(`structure "${s.id}": bad position or footprint`);
      continue;
    }
    if (s.mode === 'enterable') {
      if (s.yawDeg % 360 !== 0) errors.push(`structure "${s.id}": enterable structures need yaw 0`);
      if (!s.door) errors.push(`structure "${s.id}": enterable structure has no door`);
      else {
        if (!NAME.test(s.door.name)) errors.push(`structure "${s.id}": bad door name "${s.door.name}"`);
        const wall = s.door.side === 'N' || s.door.side === 'S' ? s.footprint[0] : s.footprint[1];
        if (!(s.door.width > 0) || s.door.width > wall - 2) errors.push(`structure "${s.id}": door width ${s.door.width} does not fit the wall`);
      }
    } else if (s.door) errors.push(`structure "${s.id}": only enterable structures can have a door`);
    if (s.inside) {
      const host = structures.get(s.inside);
      if (!host || host.mode !== 'enterable') errors.push(`structure "${s.id}": inside "${s.inside}" is not an enterable structure`);
      else if (!footprintWithin(s, host)) errors.push(`structure "${s.id}": not fully inside "${s.inside}"`);
    }
  }
  for (const n of layout.npcs) {
    if (!anchorIds.has(n.post)) errors.push(`npc "${n.id}": unknown post anchor "${n.post}"`);
  }
  for (const p of layout.patrols) {
    if (p.points.length < 2) errors.push(`patrol "${p.id}": needs at least two points`);
    for (const id of p.points) if (!anchorIds.has(id)) errors.push(`patrol "${p.id}": unknown anchor "${id}"`);
  }

  // Terrain checks on the resolved anchors.
  const resolved = opts.resolvedAnchors ?? layout.anchors.map((a) => resolveAnchor(a, heightAt));
  const specById = new Map(layout.anchors.map((a) => [a.id, a]));
  for (const r of resolved) {
    const spec = specById.get(r.id);
    const { x, y, z } = r.position;
    if (!finite(x, y, z)) continue;
    const ground = heightAt(x, z);
    const elevated = r.tags.includes('elevated');
    if (y < ground - 0.05) errors.push(`anchor "${r.id}": below the terrain (y ${y.toFixed(2)}, ground ${ground.toFixed(2)})`);
    if (!elevated && !spec?.onStructure && y > ground + 0.25) errors.push(`anchor "${r.id}": floats above the terrain (y ${y.toFixed(2)}, ground ${ground.toFixed(2)})`);
    if (!elevated) {
      const sx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2;
      const sz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
      if (Math.hypot(sx, sz) > maxSlopeTan) errors.push(`anchor "${r.id}": slope too steep to stand on`);
    }
  }

  // Footprint terrain spread and overlaps.
  for (const s of layout.structures) {
    if (!finite(s.x, s.z) ) continue;
    const pts = [...footprintCorners(s), [s.x, s.z] as [number, number]];
    const hs = pts.map(([x, z]) => heightAt(x, z));
    if (Math.max(...hs) - Math.min(...hs) > maxSpread) errors.push(`structure "${s.id}": terrain under the footprint is not flat enough`);
  }
  const blocking = layout.structures.filter((s) => s.mode !== 'open' && finite(s.x, s.z, s.yawDeg) && s.footprint.every((v) => v > 0));
  for (let i = 0; i < blocking.length; i++) {
    for (let j = i + 1; j < blocking.length; j++) {
      const a = blocking[i];
      const b = blocking[j];
      if (a.inside === b.id || b.inside === a.id) continue;
      if (footprintsOverlap(a, b)) errors.push(`structures "${a.id}" and "${b.id}" overlap`);
    }
  }
  for (const k of opts.keepClear ?? []) {
    for (const s of blocking) {
      if (pointInFootprint(s, k.x, k.z, k.radius)) errors.push(`structure "${s.id}" overlaps "${k.id}"`);
    }
  }

  // Walkability: build a grid, flood from the player spawn, check every standing anchor.
  const spawn = layout.anchors.find((a) => a.id === 'brightwater.player-spawn');
  if (!spawn) {
    errors.push('missing anchor "brightwater.player-spawn"');
    return errors;
  }
  const pad = 12;
  const xs = [...layout.anchors.map((a) => a.x), ...blocking.flatMap((s) => footprintCorners(s).map((c) => c[0]))].filter(Number.isFinite);
  const zs = [...layout.anchors.map((a) => a.z), ...blocking.flatMap((s) => footprintCorners(s).map((c) => c[1]))].filter(Number.isFinite);
  const x0 = Math.min(...xs) - pad;
  const z0 = Math.min(...zs) - pad;
  const w = Math.ceil((Math.max(...xs) + pad - x0) / cell);
  const h = Math.ceil((Math.max(...zs) + pad - z0) / cell);
  const blockedGrid = new Uint8Array(w * h);
  const mark = (s: StructureSpec, onlyWalls: boolean) => {
    const boxes = onlyWalls ? wallBoxes(s) : [footprintBox(s)];
    for (const b of boxes) {
      const ix0 = Math.max(0, Math.floor((b.cx - b.hx - PLAYER_MARGIN - x0) / cell));
      const ix1 = Math.min(w - 1, Math.ceil((b.cx + b.hx + PLAYER_MARGIN - x0) / cell));
      const iz0 = Math.max(0, Math.floor((b.cz - b.hz - PLAYER_MARGIN - z0) / cell));
      const iz1 = Math.min(h - 1, Math.ceil((b.cz + b.hz + PLAYER_MARGIN - z0) / cell));
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const px = x0 + (ix + 0.5) * cell;
          const pz = z0 + (iz + 0.5) * cell;
          if (Math.abs(px - b.cx) <= b.hx + PLAYER_MARGIN && Math.abs(pz - b.cz) <= b.hz + PLAYER_MARGIN) blockedGrid[iz * w + ix] = 1;
        }
      }
    }
  };
  for (const s of blocking) if (s.mode === 'enterable') mark(s, true);
  for (const s of blocking) if (s.mode === 'solid') mark(s, false);
  const cellOf = (x: number, z: number) => {
    const ix = Math.floor((x - x0) / cell);
    const iz = Math.floor((z - z0) / cell);
    return ix < 0 || iz < 0 || ix >= w || iz >= h ? -1 : iz * w + ix;
  };
  const start = cellOf(spawn.x, spawn.z);
  if (start < 0 || blockedGrid[start]) {
    errors.push('anchor "brightwater.player-spawn": blocked by a structure');
    return errors;
  }
  const seen = new Uint8Array(w * h);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const ix = c % w;
    const iz = (c - ix) / w;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const n = nz * w + nx;
      if (seen[n] || blockedGrid[n]) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  for (const a of layout.anchors) {
    if (!finite(a.x, a.z) || a.tags?.includes('elevated')) continue;
    const c = cellOf(a.x, a.z);
    const solidHost = a.onStructure ? structures.get(a.onStructure) : undefined;
    if (c >= 0 && blockedGrid[c]) {
      const inSolidHost = solidHost?.mode === 'solid' && pointInFootprint(solidHost, a.x, a.z);
      if (!inSolidHost) errors.push(`anchor "${a.id}": inside a solid structure`);
      continue;
    }
    if (c < 0 || !seen[c]) errors.push(`anchor "${a.id}": unreachable from the player spawn`);
  }
  // Doors must lead somewhere: the doorway cell has to be reachable from outside.
  for (const s of blocking) {
    const d = doorCentre(s);
    if (!d) continue;
    const c = cellOf(d.x, d.z);
    if (c < 0 || !seen[c]) errors.push(`structure "${s.id}": doorway is not reachable`);
  }
  return errors;
}
