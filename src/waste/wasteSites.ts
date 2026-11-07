// Act 4 thread L1 PR 2 (plans/act4-L1.md sections 16 and 17): the Waste's places, as points other threads import (L5's
// spawners, L6's arena, L9's map and codex, L11's quests). Every point is an offset from a master site in
// src/terrain/shape/waste.ts or a point on a rope-line, so nothing here hard-codes a site twice. Plain data, worker-safe
// (no THREE). Compass headings: 0 = +Z (north), 90 = +X (east).
import { CINDER_CHAPEL, GLASSLANDS, HUSK_CATHEDRAL, RIMFOOT, WALKER_CAMP, type XZ } from '../terrain/shape/waste';
import { pointAt, ropeLine } from '../region/act4/ropeLines';

const r2 = (n: number): number => Math.round(n * 100) / 100;
const off = (p: XZ, dx: number, dz: number): XZ => [r2(p[0] + dx), r2(p[1] + dz)];
/** A point `r` metres from `p` on compass bearing `deg`. */
export const polarFrom = (p: XZ, deg: number, r: number): XZ => {
  const a = (deg * Math.PI) / 180;
  return [r2(p[0] + Math.sin(a) * r), r2(p[1] + Math.cos(a) * r)];
};
/** Compass heading from `p` toward `q`. */
export const headingTo = (p: XZ, q: XZ): number => r2((((Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI) % 360 + 360) % 360);

// ---- the Walker Camp (a dune basin; the camp's three rope-lines meet at its centre)

export const CAMP = {
  centre: WALKER_CAMP,
  /** The camp fire and rest point (the M43 hub), 12 m clear of every rope lane. */
  rest: off(WALKER_CAMP, -18, 8),
  /** M43's Pyre Rite: three pyres along the basin's south-west edge. */
  pyres: [off(WALKER_CAMP, -60, -75), off(WALKER_CAMP, -40, -85), off(WALKER_CAMP, -20, -88)] as readonly XZ[],
  /** R24: two rain cisterns south of the fire; they hold water from `story.r24.choice = all`. */
  cisterns: [off(WALKER_CAMP, 20, -85), off(WALKER_CAMP, 45, -75)] as readonly XZ[],
  /** M43's Spear-Dance ring (radius 9) in the basin's north-east. */
  trialRing: off(WALKER_CAMP, 55, 82),
  /** M43's Storm Walk: about 300 m of open dune west of the basin, off every rope-line; a knotted guide rope (not a rope-line). */
  stormWalkStart: off(WALKER_CAMP, -110, 60),
  stormWalkEnd: off(WALKER_CAMP, -410, 60),
  /** Five knots on the Storm Walk's guide rope, evenly spaced from the start to the end (L11's checkpoints). */
  stormWalkKnots: [1, 2, 3, 4, 5].map((k) => off(WALKER_CAMP, -110 - k * 50, 60)) as readonly XZ[],
  /** The camp gate on the line from the Crossing (R24's cart arrives here and the choice is made). */
  gate: off(WALKER_CAMP, 95.8, -28.7),
  waystone: off(WALKER_CAMP, -35, 30),
  tents: [off(WALKER_CAMP, -70, 40), off(WALKER_CAMP, -80, 0), off(WALKER_CAMP, -70, -40), off(WALKER_CAMP, 40, 60), off(WALKER_CAMP, 75, 45)] as readonly XZ[],
  posts: {
    wulfhild: off(WALKER_CAMP, -22, -5),
    hrodna: off(WALKER_CAMP, 55, 70),
    'walker.1': off(WALKER_CAMP, -62, 45),
    'walker.2': off(WALKER_CAMP, -72, 0),
    'walker.3': off(WALKER_CAMP, -62, -40),
    'walker.4': off(WALKER_CAMP, 48, 52),
    carter: off(WALKER_CAMP, 98.4, -20),
  },
} as const;
/** L7's id: Wulfhild's shop point, 1.6 m east of her post. */
export const WULFHILD_SHOP_POINT: XZ = off(CAMP.posts.wulfhild, 1.6, 0);

// ---- the Cinder Chapel and its ruined village (the chapel's line arrives from the south)

export const CHAPEL = {
  centre: CINDER_CHAPEL,
  /** The chapel shell: 10 m wide, 16 m long, its door on the south face. */
  shell: off(CINDER_CHAPEL, 0, 45),
  door: off(CINDER_CHAPEL, 0, 35),
  ebba: off(CINDER_CHAPEL, 6, 32),
  waystone: off(CINDER_CHAPEL, 35, 15),
  /** Three roofless houses west of the line, 8 x 6 m, doorways facing east (toward the line). */
  houses: [off(CINDER_CHAPEL, -55, 25), off(CINDER_CHAPEL, -60, -15), off(CINDER_CHAPEL, -50, -55)] as readonly XZ[],
} as const;
/** M44: the wraith nest in house 2 (L5 spawns here) and the music box in house 3's north-west corner. */
export const CHAPEL_NEST: XZ = CHAPEL.houses[1];
export const CHAPEL_MUSIC_BOX: XZ = off(CHAPEL.houses[2], -2.6, 1.6);
/** Dressing only (R25's hearths are at the burned villages, R25_HEARTHS): a cold hearth against each house's west wall. */
export const CHAPEL_HEARTHS: readonly XZ[] = CHAPEL.houses.map((h, i) => off(h, -3, i === 2 ? -1.6 : 0));

// ---- the Glasslands and the Singing Slag (the shrine anchor is L0's, at GLASSLANDS; both rope-lines end there)

const SLAG_BEARINGS = [105, 121, 137, 153, 169, 185] as const;
export const SLAG = {
  shrine: GLASSLANDS,
  /** Where the player stands to strike (2 m in front of the shrine, facing the pillars). */
  strike: polarFrom(GLASSLANDS, 145, 2),
  /** The six glass pillars on an arc of radius 10 to the south-east (clear of both lanes). */
  pillars: SLAG_BEARINGS.map((b) => polarFrom(GLASSLANDS, b, 10)) as readonly XZ[],
  /** Where each pillar is struck from (1.8 m in front of it, toward the shrine). */
  pillarFaces: SLAG_BEARINGS.map((b) => polarFrom(GLASSLANDS, b, 8.2)) as readonly XZ[],
  /** The three Chime Key plaques, east of the arc. */
  plaques: [60, 85, 110].map((b) => polarFrom(GLASSLANDS, b, 16)) as readonly XZ[],
  waystone: polarFrom(GLASSLANDS, 315, 20),
} as const;
export const SLAG_PILLAR_RADIUS = 10;

// ---- the Husk Cathedral (the rope arrives at its door from the south)

export const CATHEDRAL = {
  /** The rope's end and the door's outside anchor (`waste.husk-cathedral.entry`, PR 1). */
  door: HUSK_CATHEDRAL,
  /** The exterior shell: 34 m wide, 48 m long, north of the door. */
  shell: off(HUSK_CATHEDRAL, 0, 30),
  shellSize: [34, 48] as const,
  /** Where the interior floats (150 m over the plateau, inside the open Waste, never over the Caldera hole). */
  floatSite: off(HUSK_CATHEDRAL, -10, 60),
} as const;

// ---- the Cinder Road North and Rimfoot

const CRN = 'rope.cinder-road-north' as const;
/** Arc lengths (m from Ashgate) of the three M46 cairns, between the Crossing (965) and Rimfoot (2022), clear of the shelters. */
export const CAIRN_ARCS = [1150, 1480, 1800] as const;
/** A cairn's stones stand this far west of the line (the player reads it from `at`, 2 m nearer the line, and searches at `lore`); its wave clearing (radius 20) is centred on the line. */
export const CAIRN_OFFSET = 7.5;
export const CAIRN_CLEARING = 20;
export const CAIRNS: readonly { at: XZ; stones: XZ; lore: XZ; lane: XZ }[] = CAIRN_ARCS.map((s) => {
  const p = pointAt(ropeLine(CRN).points, s);
  // Left of travel (toward Rimfoot) is west-ish: (-dz, dx).
  const lx = -p.dz;
  const lz = p.dx;
  const side = (d: number): XZ => [r2(p.x + lx * d), r2(p.z + lz * d)];
  return { lane: side(0), at: side(CAIRN_OFFSET - 2), stones: side(CAIRN_OFFSET), lore: side(CAIRN_OFFSET + 2.5) };
});
/** The glass drift that shatters when the Singing Slag is lit (visual only), across the line below the rim's foot. */
export const GLASS_DRIFT_ARC = 1580;
export const GLASS_DRIFT: { at: XZ; yawDeg: number } = (() => {
  const p = pointAt(ropeLine(CRN).points, GLASS_DRIFT_ARC);
  return { at: [r2(p.x), r2(p.z)], yawDeg: r2((((Math.atan2(-p.dz, p.dx) * 180) / Math.PI) % 360 + 360) % 360) };
})();

export const RIMFOOT_CAMP = {
  fire: RIMFOOT,
  tents: [off(RIMFOOT, 25, 20), off(RIMFOOT, 35, -5), off(RIMFOOT, 20, -28)] as readonly XZ[],
  wulfhild: off(RIMFOOT, 8, 6),
  companions: { tobb: off(RIMFOOT, -7, 5), hrolf: off(RIMFOOT, -8, -2), aelfreda: off(RIMFOOT, -2, -8) },
  /** L13's camp scene camera: south-east of the fire, looking north over it to the Caldera's glow. */
  cam: off(RIMFOOT, 6, -16),
} as const;

// ---- points of interest (section 16 item 8): named, so L5, L9 and L11 import them

export type WastePoiTemplate = 'burned-village' | 'stumps' | 'wagon-train' | 'walker-cairn' | 'glass-vein' | 'buried-bell' | 'strider-nest' | 'rim-vista';
export interface WastePoi {
  id: string;
  template: WastePoiTemplate;
  at: XZ;
  /** Compass heading the piece faces. */
  facing: number;
  /** Footprint radius (clearance checks). */
  radius: number;
}
const poi = (id: string, template: WastePoiTemplate, at: XZ, facing: number, radius: number): WastePoi => ({ id, template, at, facing, radius });

/** The eleven: design 4.5's sixteen minus the four waystones and the shrine. */
export const WASTE_POIS: readonly WastePoi[] = [
  poi('burned-village.1', 'burned-village', [7550, 7750], 45, 26),
  poi('burned-village.2', 'burned-village', [8400, 8000], 270, 26),
  poi('burned-village.3', 'burned-village', [7600, 8900], 180, 26),
  poi('stumps.1', 'stumps', [8650, 7500], 0, 40),
  poi('stumps.2', 'stumps', [14100, 8800], 0, 40),
  poi('wagon-train', 'wagon-train', [9450, 5050], 60, 22),
  poi('walker-cairn', 'walker-cairn', [7550, 6450], 90, 8),
  poi('glass-vein', 'glass-vein', [14200, 6650], 270, 14),
  poi('buried-bell', 'buried-bell', [13000, 10300], 180, 10),
  poi('strider-nest', 'strider-nest', [10050, 10000], 180, 18),
  poi('rim-vista', 'rim-vista', [12850, 7000], 270, 8),
];
export const wastePoi = (id: string): WastePoi => {
  const p = WASTE_POIS.find((x) => x.id === id);
  if (!p) throw new Error(`waste: unknown poi "${id}"`);
  return p;
};
/**
 * R25's three hearths, one in each burned village round the chapel (coordinator ruling 2026-11-06: about 1.8 to 2 km of
 * walking between them, against three in one village), each 4 m in front of its village's centre.
 */
export const R25_HEARTHS: readonly XZ[] = ['burned-village.1', 'burned-village.2', 'burned-village.3'].map((id) => {
  const p = WASTE_POIS.find((x) => x.id === id)!;
  return polarFrom(p.at, p.facing, 4);
});
/** Anchor and trigger ids of a POI (`waste.poi.<id>.centre`, `trg.waste.poi.<id>.discover`) and its discover place id. */
export const poiAnchorId = (id: string, part = 'centre'): string => `waste.poi.${id}.${part}`;
export const poiTriggerId = (id: string): string => `trg.waste.poi.${id}.discover`;
export const poiPlaceId = (id: string): string => `poi.a4.${id}`;

/** Every site's footprint, for the clearance rules (POIs 120 m off these). */
export const WASTE_SITE_DISCS: readonly { id: string; at: XZ; radius: number }[] = [
  { id: 'walker-camp', at: WALKER_CAMP, radius: 110 },
  { id: 'cinder-chapel', at: CINDER_CHAPEL, radius: 90 },
  { id: 'glasslands', at: GLASSLANDS, radius: 40 },
  { id: 'husk-cathedral', at: CATHEDRAL.shell, radius: 40 },
  { id: 'rimfoot', at: RIMFOOT, radius: 50 },
];
