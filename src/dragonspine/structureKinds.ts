// The Dragonspine structure kinds, registered through `registerStructureKind` (v0.6 item 17). Prefixed `dragonspine-` so Act 1 and
// 2 kinds never collide. Registration is refcounted: every plugin setup takes a reference and only the last release removes the
// kinds, so a double setup (or a test next to the real plugin) cannot throw.
import { registerStructureKind, type StructureRecipe } from '../region/structureKinds';

export const DRAGONSPINE_KINDS: Readonly<Record<string, StructureRecipe>> = {
  /** The long hall's shell (the interior floats elsewhere); `hex/building_castle_red`, snow-tinted. */
  'dragonspine-hall': { height: 10, model: 'hex/building_castle_red', collider: 'solid' },
  /** Stables with an open front (the Ashmare's spot). Procedural. */
  'dragonspine-stable': { height: 4, collider: 'solid' },
  /** The sled shed (R15's depot). Procedural. */
  'dragonspine-shed': { height: 5, collider: 'solid' },
  /** A cold fire pit: a ring of stones, ash and a spit. Procedural, no collider. */
  'dragonspine-fire-pit': { height: 0.6, collider: 'open' },
  /** Skinning and trophy racks (`hex/weaponrack` stands over trophy racks once loaded). Procedural, no collider. */
  'dragonspine-rack': { height: 2.2, collider: 'open' },
  'dragonspine-drying-rack': { height: 2, collider: 'open' },
  /** Eadgyth's trophy wall: a plank wall hung with a tooth, a harpoon, a drawing, a map and a tally (M29's five searches). */
  'dragonspine-trophy-wall': { height: 2.6, collider: 'solid' },
  'dragonspine-woodpile': { height: 1.4, collider: 'solid' },
  'dragonspine-leanto': { height: 3, collider: 'solid' },
  /** The egg thief's camp pieces. Procedural, no collider. */
  'dragonspine-straw': { height: 0.3, collider: 'open' },
  'dragonspine-sack': { height: 0.8, collider: 'open' },
  'dragonspine-tracks': { height: 0.1, collider: 'open' },
  'dragonspine-shell': { height: 0.3, collider: 'open' },
  /** A hawk nest of sticks and bone. Procedural, no collider. */
  'dragonspine-nest': { height: 0.8, collider: 'open' },
  /** The Last Anvil's cleared pad, a carving stone, a weathered keeper-mark and a rest bench. */
  'dragonspine-pad': { height: 0.1, collider: 'open' },
  'dragonspine-carving': { height: 2.2, collider: 'open' },
  'dragonspine-mark': { height: 1.4, collider: 'solid' },
  'dragonspine-bench': { height: 0.6, collider: 'open' },
  /** The rock arch over the collapsed cave's door. Procedural. */
  'dragonspine-cave-mouth': { height: 6, collider: 'solid' },
  // ---- the summit (PR 2)
  /** The summit gate: two stone pillars and the arch over the Rime Pass (open: the fog face is the blocker). Procedural. */
  'dragonspine-gate-pillar': { height: 9, collider: 'solid' },
  'dragonspine-gate-arch': { height: 9, collider: 'open' },
  /** The Wyrm's Hearth: the basin ring round the shrine site, a black-glass tier, the keeper-stone, the hoard and the axe on it, a glide marker cairn. */
  'dragonspine-hearth-basin': { height: 0.5, collider: 'open' },
  'dragonspine-glass-tier': { height: 0.35, collider: 'solid' },
  'dragonspine-keeper-stone': { height: 2.6, collider: 'solid' },
  'dragonspine-hoard': { height: 1.2, collider: 'open' },
  'dragonspine-hoard-axe': { height: 0.3, collider: 'open' },
  'dragonspine-glide-marker': { height: 1.6, collider: 'open' },
  /** The roost climb's searches: a dead hunter's horn and a shed scale. */
  'dragonspine-horn': { height: 0.3, collider: 'open' },
  'dragonspine-scale': { height: 0.2, collider: 'open' },
  /** Skyhold's rig camp and the net (rope-card spans hung over the cliff edge, one per anchor). */
  'dragonspine-rig-tent': { height: 3, collider: 'solid' },
  'dragonspine-rig-table': { height: 0.9, collider: 'open' },
  'dragonspine-rope-coil': { height: 0.5, collider: 'open' },
  'dragonspine-net-rack': { height: 1.8, collider: 'open' },
  'dragonspine-net': { height: 3, collider: 'open' },
  /** Frostfang Aerie: the gate leaves (the blocker toggle), the keep's shell, the winch, the hawk cage, the drake's chain-post, the feed trough. */
  'dragonspine-aerie-gate': { height: 6, collider: 'solid' },
  'dragonspine-keep': { height: 14, model: 'hex/building_castle_red', collider: 'solid' },
  'dragonspine-winch': { height: 1.4, collider: 'solid' },
  'dragonspine-hawk-cage': { height: 2, collider: 'solid' },
  'dragonspine-chain-post': { height: 2.5, collider: 'solid' },
  'dragonspine-feed-trough': { height: 0.6, collider: 'open' },
  /** The glide ledges: a wind banner beside each launch deck and a landing marker per landing area. */
  'dragonspine-wind-banner': { height: 5, collider: 'open' },
  'dragonspine-landing-marker': { height: 0.15, collider: 'open' },
  /** The world changes: the lit fire pit (M34), Skarl's burned banner (D06 defeated), the drake's roost on a tower (D06 complete). */
  'dragonspine-fire-lit': { height: 1.6, collider: 'open' },
  'dragonspine-banner-burned': { height: 3, collider: 'open' },
  'dragonspine-drake-roost': { height: 1.5, collider: 'open' },
};

let refs = 0;
let undo: Array<() => void> = [];

/** Registers every Dragonspine kind (once, however many callers) and returns this caller's release. */
export function registerDragonspineKinds(): () => void {
  if (refs === 0) {
    const done: Array<() => void> = [];
    try {
      for (const [kind, recipe] of Object.entries(DRAGONSPINE_KINDS)) done.push(registerStructureKind(kind, recipe));
    } catch (err) {
      for (const u of done.reverse()) u();
      throw err;
    }
    undo = done;
  }
  refs++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    refs--;
    if (refs === 0) for (const u of undo.splice(0).reverse()) u();
  };
}
