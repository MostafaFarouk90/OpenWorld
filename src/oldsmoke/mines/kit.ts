// Shared helpers for the Deepgate mines (A4 PR 2): where each mine interior floats, the greybox room and corridor builders and the
// mine lighting. Every mine def is hand-authored in local metres from its lift landing (yaw 0 faces -Z, the rooms run toward -Z).
import type { InteriorDef, InteriorEnvironment, LocalRect, RoomDef } from '../../interiors/types';

export type MineId = 'shaft' | 'old' | 'lower' | 'bellows' | 'deepdelve';

/**
 * Where each mine floats. The plateau cannot hold them: interiors must stay 130 m apart (the enemies' wake range, interiors/harrowmark
 * sites.test.ts) and the flat plateau is 500 m across with Grisel Hall on it. These five spots in the Oldsmoke region west of the
 * plateau are >= 500 m apart, inside the region and within 25 m of ground range under the widest footprint. Only the ground height
 * under a site matters (the interior floats 150 m above it); nothing of the world is visible from inside. Local extents allowed per
 * def: x in [-70, 70], z in [-130, 10] (Deepdelve to x 220); `kit.test.ts` enforces the bounds.
 */
export const MINE_SITES: Readonly<Record<MineId, { x: number; z: number }>> = {
  shaft: { x: 19000, z: 7800 },
  old: { x: 19000, z: 7200 },
  lower: { x: 19700, z: 8100 },
  bellows: { x: 19800, z: 7300 },
  deepdelve: { x: 19900, z: 8600 },
};
export const MINE_LOCAL_BOUNDS = { x0: -70, x1: 70, z0: -130, z1: 10, deepdelveX1: 220 } as const;

/** Interior and door ids (names fixed by A14's rule; `MINE_INTERIOR_IDS` stays empty). */
export const MINE_IDS: Readonly<Record<MineId, string>> = {
  shaft: 'mine-deepgate-shaft',
  old: 'mine-old-galleries',
  lower: 'mine-lower-galleries',
  bellows: 'mine-weeping-bellows',
  deepdelve: 'mine-deepdelve',
};
/** Each mine's door opens onto the surface shaft head (`oldsmoke.shaft.door`); the lift moves the player between mines by exit and enter at black. */
export const MINE_DOOR_IDS: Readonly<Record<MineId, string>> = {
  shaft: 'mine-deepgate-shaft',
  old: 'mine-old-galleries',
  lower: 'mine-lower-galleries',
  bellows: 'mine-weeping-bellows',
  deepdelve: 'mine-deepdelve',
};

/** The lift landing in each mine: where the lift sets the player down (the door's inside anchor); `<landing>.up` is the exit interactable ("ride up to the surface") and `<landing>.call` the lift menu, both beside it. */
export const MINE_LANDINGS: Readonly<Record<MineId, string>> = {
  shaft: 'oldsmoke.shaft.floor',
  old: 'oldsmoke.old.lift',
  lower: 'oldsmoke.lower.lift',
  bellows: 'oldsmoke.bellows.lift',
  deepdelve: 'oldsmoke.deepdelve.lift',
};

export const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });

/** A room from its corner and size. Touching rooms are open to each other. */
export function room(id: string, x0: number, z0: number, w: number, d: number, height = 4): RoomDef {
  return { id, x0, z0, x1: x0 + w, z1: z0 + d, height };
}

/** A straight corridor along x or z between two points (centre line), `width` wide; ends overlap the rooms they join by half a metre. */
export function corridor(id: string, from: { x: number; z: number }, to: { x: number; z: number }, width = 3, height = 3.6): RoomDef {
  const h = width / 2;
  if (from.x === to.x) return { id, x0: from.x - h, x1: from.x + h, z0: Math.min(from.z, to.z) - 0.5, z1: Math.max(from.z, to.z) + 0.5, height };
  if (from.z === to.z) return { id, x0: Math.min(from.x, to.x) - 0.5, x1: Math.max(from.x, to.x) + 0.5, z0: from.z - h, z1: from.z + h, height };
  throw new Error(`corridor "${id}" must be axis-aligned`);
}

/** Wall torches along a room's long sides, every `spacing` metres, just inside the wall. */
export function torchesAlong(r: LocalRect, y = 2.2, spacing = 8): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  const [a0, a1] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
  for (let t = a0 + spacing / 2; t < a1; t += spacing) {
    if (alongX) out.push({ x: t, y, z: r.z0 + 0.1 }, { x: t, y, z: r.z1 - 0.1 });
    else out.push({ x: r.x0 + 0.1, y, z: t }, { x: r.x1 - 0.1, y, z: t });
  }
  return out;
}

/** The mine light: dark rock, warm lantern, a low orange ambient. `glow` > 0 warms it toward furnace red (Deepdelve). */
export function mineEnvironment(glow = 0): InteriorEnvironment {
  const warm = (c: number, g: number) => {
    const r = Math.min(255, ((c >> 16) & 255) + Math.round(g * 70));
    const gr = Math.min(255, ((c >> 8) & 255) + Math.round(g * 18));
    return (r << 16) | (gr << 8) | (c & 255);
  };
  return {
    fogColor: warm(0x120d0a, glow),
    fogNear: 6,
    fogFar: 48,
    skyColor: warm(0x3a2a22, glow),
    groundColor: warm(0x1c1410, glow),
    ambientIntensity: 0.55,
    lightColor: 0xffb070,
    lightIntensity: 1.5,
    lightDistance: 24,
  };
}

/** Skeleton of a mine def; the caller adds rooms, props, blockers, anchors and triggers. */
export function mineDef(id: MineId, parts: Pick<InteriorDef, 'rooms' | 'anchors'> & Partial<InteriorDef>, glow = 0): InteriorDef {
  return {
    id: MINE_IDS[id],
    site: MINE_SITES[id],
    pillars: [],
    blockers: [],
    torches: [],
    triggers: [],
    doors: [{ doorId: MINE_DOOR_IDS[id], outside: 'oldsmoke.shaft.door', inside: MINE_LANDINGS[id], exit: `${MINE_LANDINGS[id]}.up`, outsideInteractable: false }],
    environment: mineEnvironment(glow),
    ...parts,
  };
}
