// Every outdoor sub-site of the Greyfen, fitted once on the shaped ground (fit.ts) from K1's exports (sites.ts). The layout
// files build on these; the plugin and the tests read them too. No literal map coordinate: offsets only.
import { heightAt } from '../terrain/heightfield';
import { roadLength, roadPoint } from '../terrain/shape/roadPoint';
import { FERRY_MERE_GREYWATCH_POINTS, FERRY_MERE_MIREWEATHER_POINTS, REEDGATE_PLATEAU } from '../terrain/shape/greyfen';
import { fitFlat, fitJetty, fitSpots, firstAlong, type JettyFit } from './fit';
import {
  CAUSEWAY_DECK,
  CAUSEWAY_GAPS,
  FERRY_REEDGATE_MERE_POINTS,
  FERRY_STOPS,
  GREYFEN_WATER_TABLE,
  GREYFEN_WAYSTONES,
  REEDBED_EAST,
  REEDBED_WEST,
  SITES,
  type Act3FerryStopId,
  type XZ,
} from './sites';

export const REEDGATE_CAUSEWAY = 'causeway-reedgate-mere' as const;
export const CAUSEWAYS = ['causeway-reedgate-mere', 'causeway-mere-greywatch', 'causeway-mere-mireweather'] as const;

const W = GREYFEN_WATER_TABLE;
/** Wading ground: 0.4 to 1.2 m under the water table (K0's WADE_TUNING), kept off the edges. */
export const isWade = (y: number): boolean => y >= W - 1.1 && y <= W - 0.5;
export const isDry = (y: number): boolean => y >= W + 0.5;

/** Reedgate's pad: its centre and half extents (K1's plateau box). */
const rb = REEDGATE_PLATEAU.box;
export const REEDGATE = { x: (rb.minX + rb.maxX) / 2, z: (rb.minZ + rb.maxZ) / 2, hx: (rb.maxX - rb.minX) / 2, hz: (rb.maxZ - rb.minZ) / 2 };

/** A ferry jetty's water depth at its stop end (K7's boat needs 1.3 m). */
export const JETTY_MIN_DEPTH = 1.3;
export const JETTY_WIDTH = 3;
/** The jetty deck: a metre above the water, the causeway deck height. */
export const JETTY_DECK = CAUSEWAY_DECK;

/**
 * Where the boat moors for a stop: the nearest vertex of K1's ferry channels (the channel's end or bend beside the quay);
 * a stop that is itself a channel end moors at the next vertex along. The jetty runs from the quay's edge towards it.
 */
const CHANNEL_VERTICES: readonly (readonly [number, number])[] = [...FERRY_REEDGATE_MERE_POINTS, ...FERRY_MERE_GREYWATCH_POINTS, ...FERRY_MERE_MIREWEATHER_POINTS];
export function mooringFor(stop: XZ): XZ {
  const far = CHANNEL_VERTICES.filter(([x, z]) => Math.hypot(x - stop.x, z - stop.z) > 1);
  const [x, z] = far.reduce((best, v) => (Math.hypot(v[0] - stop.x, v[1] - stop.z) < Math.hypot(best[0] - stop.x, best[1] - stop.z) ? v : best));
  return { x, z };
}
const jetty = (stop: Act3FerryStopId, land: XZ): JettyFit => fitJetty(FERRY_STOPS[stop], land, mooringFor(FERRY_STOPS[stop]), JETTY_DECK, W, JETTY_MIN_DEPTH);
export const JETTIES: Readonly<Record<Act3FerryStopId, JettyFit>> = {
  reedgate: jetty('reedgate', REEDGATE),
  mere: jetty('mere', SITES.mereShrine),
  greywatch: jetty('greywatch', GREYFEN_WAYSTONES.greywatch),
  mireweather: jetty('mireweather', SITES.hutDoor),
};
/** A point `along` metres from a jetty's land end towards its water end. */
export const onJetty = (j: JettyFit, along: number): XZ => ({ x: j.land.x + j.dir.x * along, z: j.land.z + j.dir.z * along });

/** M24's five mud soundings: wading flats nearest the Reedgate landing. */
export const M24_SOUNDINGS: readonly XZ[] = fitSpots(FERRY_STOPS.reedgate, 5, 4, isWade, { minR: 16, minGap: 10 });

/** How far past K1's cut (and its blend) a bridge looks for the causeway deck on either side. */
const BRIDGE_SEARCH = 20;
/** The arc, from `arc` stepping by `step` (±0.5 m), where the causeway is back at its deck height. */
function deckArc(arc: number, step: number): number {
  for (let d = 0; Math.abs(d) <= BRIDGE_SEARCH; d += step) {
    const p = roadPoint(REEDGATE_CAUSEWAY, arc + d, 0);
    if (heightAt(p.x, p.z) >= CAUSEWAY_DECK - 0.05) return arc + d;
  }
  throw new Error(`greyfen: no causeway deck within ${BRIDGE_SEARCH} m of the gap at arc ${arc}`);
}

/**
 * M23's two plank bridges over K1's gaps on the Reedgate causeway: each deck runs from where the causeway is back at deck
 * height on one side to the same on the other, plus a metre on each end (K1's cut and its blend sit off-centre of the arc).
 */
export const BRIDGES = CAUSEWAY_GAPS.map((g, i) => {
  const n = (i + 1) as 1 | 2;
  const a0 = deckArc(g.arc, -0.5) - 1;
  const a1 = deckArc(g.arc, 0.5) + 1;
  const c = roadPoint(REEDGATE_CAUSEWAY, (a0 + a1) / 2, 0);
  const near = roadPoint(REEDGATE_CAUSEWAY, a0, 0);
  const far = roadPoint(REEDGATE_CAUSEWAY, a1, 0);
  const deckY = (heightAt(near.x, near.z) + heightAt(far.x, far.z)) / 2;
  // The levers stand 2 m back from the deck ends, so nobody pulls one from inside the span.
  const leverNear = roadPoint(REEDGATE_CAUSEWAY, a0 - 2, 0);
  const leverFar = roadPoint(REEDGATE_CAUSEWAY, a1 + 2, 0);
  return { n, arc: g.arc, centre: c, near, far, leverNear, leverFar, length: a1 - a0, deckY };
});

/** M23's plank bridges are 3 m wide. */
export const BRIDGE_WIDTH = 3;

/** The five R12 reed beds (30 x 30 m) on K1's reed-bed flats, three west and two east of the causeway. */
export const REED_BED_SIZE = 30;
const bedX = (f: typeof REEDBED_WEST) => (f.box.minX + f.box.maxX) / 2;
const bedZ = (f: typeof REEDBED_WEST, t: number) => f.box.minZ + REED_BED_SIZE / 2 + 5 + t * (f.box.maxZ - f.box.minZ - REED_BED_SIZE - 10);
export const REED_BEDS: readonly XZ[] = [
  { x: bedX(REEDBED_WEST), z: bedZ(REEDBED_WEST, 0) },
  { x: bedX(REEDBED_WEST), z: bedZ(REEDBED_WEST, 0.5) },
  { x: bedX(REEDBED_WEST), z: bedZ(REEDBED_WEST, 1) },
  { x: bedX(REEDBED_EAST), z: bedZ(REEDBED_EAST, 0.25) },
  { x: bedX(REEDBED_EAST), z: bedZ(REEDBED_EAST, 0.75) },
];
/** The two reed-cutters stand on dry ground beside bed 1 and bed 4. */
export const REED_CUTTERS: readonly XZ[] = [REED_BEDS[0]!, REED_BEDS[3]!].map((b) => fitFlat({ x: b.x + (b.x < SITES.reedgate.x ? 40 : -40), z: b.z }, 2, 2, { maxSpread: 0.3, accept: isDry }));

/** Hathren's Mere: the first wading ground north of the shrine, and the shore spots round it (nets, blinds, broods). */
export const MERE_SHORE: XZ = (() => {
  const p = firstAlong(SITES.mereShrine, SITES.mere, isWade, 300);
  if (!p) throw new Error('greyfen: no wading shore between the shrine and the Mere');
  return { x: p.x, z: p.z };
})();
export const MERE_SPOTS: readonly XZ[] = fitSpots(MERE_SHORE, 20, 4, isWade, { minGap: 12, maxR: 400 });

/** The Greywatch posts: a 6 x 6 platform 4 m up and a 9-step stair east of it, on a level 15 x 6 m site (dry or wading: posts on stilts) near each K1 post. */
export const POST_PLATFORM = 6;
export const POST_HEIGHT = 4;
export const POST_STEPS = 9;
export const GREYWATCH_POSTS: readonly XZ[] = SITES.greywatchPosts.map((p) => fitFlat(p, POST_PLATFORM + POST_STEPS, POST_PLATFORM, { maxSpread: 0.3, maxR: 150, accept: (y) => y >= W - 1.1 }));
export const postPlatform = (f: XZ): XZ => ({ x: f.x - (POST_PLATFORM + POST_STEPS) / 2 + POST_PLATFORM / 2, z: f.z });
export const R14_LEECHES: readonly XZ[] = fitSpots(GREYWATCH_POSTS[3]!, 3, 3, isWade, { minR: 12, minGap: 6 });

/** Each causeway's length (K1's polylines). */
export const CAUSEWAY_LENGTH: Readonly<Record<(typeof CAUSEWAYS)[number], number>> = Object.fromEntries(CAUSEWAYS.map((c) => [c, roadLength(c)])) as never;
export { roadPoint };
