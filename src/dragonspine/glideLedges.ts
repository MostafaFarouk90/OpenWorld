// Glide ledge dressing (PR 2, agreed with K7): at each of K1's six lips a launch deck (a flat stone slab, its top level with the
// highest ground under it, so there is a flat stand of about 3 m behind the lip), a wind banner beside it and the anchor
// `dragonspine.glide.<ledgeId>.launch` at the lip, facing K1's launch heading (K7 PR 2 makes it `GlideLedgeDef.anchorId`). One
// landing marker and `dragonspine.glide.<ledgeId>.landing` per landing area (for tests). Nothing stands in K1's 60 m launch run.
import type { Act3GlideLedgeId } from '../region/act3/act3Glide';
import { groundRange } from '../region/geometry';
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, open, solid, type Part } from './helpers';
import type { XZ } from './inputs';
import { clearOfRuns, compassOf, forwardOf, freeStand, GLIDE_LEDGE_IDS, type SummitSites } from './summitSites';

/** The deck: 6 m across the lane, 4 m along it, its front edge 0.5 m past the lip, 0.3 m over the highest ground within 1 m. */
export const DECK = { w: 6, d: 4, h: 0.3, past: 0.5 } as const;
/** The flat stand reaches this far behind the lip (on the deck). */
export const STAND_BACK = 3;
const BANNER_SIDE = 6;

export interface GlideLedgeInfo {
  launch: Record<Act3GlideLedgeId, XZ>;
  landing: Record<Act3GlideLedgeId, XZ>;
  /** Top of each deck (absolute), from the ground at build time. */
  deckTop: Record<Act3GlideLedgeId, number>;
  specs: StructureSpec[];
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

/** `avoid`: structures already placed (the lower slopes' and the summit's), so the banners and markers keep off them. */
export function glideLedgesLayout(s: SummitSites, avoid: readonly StructureSpec[]): { part: Part; info: GlideLedgeInfo } {
  const anchors = [];
  const structures: StructureSpec[] = [];
  const launch = {} as Record<Act3GlideLedgeId, XZ>;
  const landing = {} as Record<Act3GlideLedgeId, XZ>;
  const deckTop = {} as Record<Act3GlideLedgeId, number>;
  for (const id of GLIDE_LEDGE_IDS) {
    const l = s.ledges[id];
    const f = forwardOf(l);
    const yaw = Math.round(((((l.heading * 180) / Math.PI) % 360) + 360) % 360 * 100) / 100;
    const back = DECK.d / 2 - DECK.past;
    const deck = solid(`dragonspine-glide-${id}-deck`, 'rock', l.ledge.x - f.x * back, l.ledge.z - f.z * back, DECK.w, DECK.d, DECK.h, yaw);
    const top = groundRange(deck, s.h, 1).max + DECK.h;
    deckTop[id] = top;
    // The banner: beside the deck (left of the lane), on ground level enough for a pole; never in the run.
    const side = { x: -f.z, z: f.x };
    const want = { x: l.ledge.x - f.x * STAND_BACK + side.x * BANNER_SIDE, z: l.ledge.z - f.z * STAND_BACK + side.z * BANNER_SIDE };
    const pole = freeStand(s.h, want, { radius: 40, maxGrad: 0.5, avoid: [...avoid, deck, ...structures], clear: 1 }) ?? fail(`no level ground for the ${id} wind banner`);
    const banner = open(`dragonspine-glide-${id}-banner`, 'dragonspine-wind-banner', pole.x, pole.z, 0.4, 0.4);
    if (!clearOfRuns(banner, s.runs)) fail(`the ${id} wind banner stands in a launch run`);
    // The landing marker: the standable point nearest K1's target inside the first landing area, clear of other structures.
    const area = l.landingAreas[0]!;
    const within = { minX: area.x0 + 2, maxX: area.x1 - 2, minZ: area.z0 + 2, maxZ: area.z1 - 2 };
    const land = freeStand(s.h, l.target, { radius: 160, maxGrad: 0.12, within, avoid: [...avoid, ...structures, deck], clear: 2 }) ?? fail(`no level ground for the ${id} landing marker`);
    const marker = open(`dragonspine-glide-${id}-landing`, 'dragonspine-landing-marker', land.x, land.z, 2, 2);
    structures.push(deck, banner, marker);
    launch[id] = { x: l.ledge.x, z: l.ledge.z };
    landing[id] = land;
    anchors.push(
      // On the deck at the lip: `elevated` (the lip may be steep ground; the deck is the floor), `dy` up to the deck's top.
      a(`dragonspine.glide.${id}.launch`, l.ledge.x, l.ledge.z, compassOf(l), ['objective', 'glide-launch', 'elevated'], { onStructure: deck.id, dy: Math.max(0, Math.round((top - s.h(l.ledge.x, l.ledge.z)) * 100) / 100) }),
      a(`dragonspine.glide.${id}.landing`, land.x, land.z, compassOf(l), ['poi']),
    );
  }
  return { part: { ...emptyPart(), anchors, structures }, info: { launch, landing, deckTop, specs: structures } };
}
