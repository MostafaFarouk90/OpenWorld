import { FEN_TUNING } from './tuning';

/** A peat bog a Peat Shambler regenerates in: a circle in engine metres. */
export interface PeatPatchDef {
  id: string;
  x: number;
  z: number;
  radius: number;
}

const PATCHES = new Map<string, PeatPatchDef>();

const valid = (p: PeatPatchDef): boolean =>
  typeof p.id === 'string' && p.id.length > 0 && [p.x, p.z, p.radius].every((n) => typeof n === 'number' && Number.isFinite(n)) && p.radius > 0;

/**
 * Registers a peat patch (K3's bogs, the ambient shambler bogs, D05's rooms); returns the undo. Throws on a duplicate id or
 * a bad patch (no finite centre, a radius of 0 or less). A shambler picks its patch once, at spawn.
 */
export function registerPeatPatch(p: PeatPatchDef): () => void {
  if (!valid(p)) throw new Error(`registerPeatPatch: bad patch ${JSON.stringify(p)}`);
  if (PATCHES.has(p.id)) throw new Error(`registerPeatPatch: duplicate id '${p.id}'`);
  const row = { ...p };
  PATCHES.set(p.id, row);
  return () => {
    if (PATCHES.get(p.id) === row) PATCHES.delete(p.id);
  };
}

/** The registered patch containing (x, z), the nearest centre first; null when none does. */
export function peatPatchAt(x: number, z: number): PeatPatchDef | null {
  let best: PeatPatchDef | null = null;
  let bestD = Infinity;
  for (const p of PATCHES.values()) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d <= p.radius && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** The default wallow: a `FEN_TUNING.wallowRadius` patch centred on a shambler's spawn, for one no registered patch holds. */
export function defaultWallow(spawn: { x: number; z: number }): PeatPatchDef {
  return { id: 'wallow', x: spawn.x, z: spawn.z, radius: FEN_TUNING.wallowRadius };
}

/** A shambler's patch: the registered one under its spawn, else its default wallow. */
export function homePatch(spawn: { x: number; z: number }): PeatPatchDef {
  return peatPatchAt(spawn.x, spawn.z) ?? defaultWallow(spawn);
}

export function inPatch(p: PeatPatchDef, at: { x: number; z: number }): boolean {
  return Math.hypot(at.x - p.x, at.z - p.z) <= p.radius;
}

/** The firm point a dragged shambler lands on: `clear` metres past the patch's edge, along the line from the centre through `from` (or toward `toward` when `from` is the centre). */
export function firmPointOutside(p: PeatPatchDef, from: { x: number; z: number }, toward: { x: number; z: number }, clear: number): { x: number; z: number } {
  let dx = from.x - p.x;
  let dz = from.z - p.z;
  let l = Math.hypot(dx, dz);
  if (l < 0.05) {
    dx = toward.x - p.x;
    dz = toward.z - p.z;
    l = Math.hypot(dx, dz);
  }
  if (l < 0.05) {
    dx = 1;
    dz = 0;
    l = 1;
  }
  const r = p.radius + clear;
  return { x: p.x + (dx / l) * r, z: p.z + (dz / l) * r };
}

/** Registered patches (tests). */
export function registeredPeatPatches(): PeatPatchDef[] {
  return [...PATCHES.values()].map((p) => ({ ...p }));
}
