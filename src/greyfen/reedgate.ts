// Reedgate on K1's dry pad (revision 2 item 1: the houses stand on short stilts over boggy ground, the reed-and-water look is
// the pad's edge), the Reedgate Ferry landing with its jetty, boathouse and folk, and M24's mud flats and fenced dive pool.
import type { AnchorSpec, LayoutData, StructureSpec } from '../region/layoutTypes';
import { heightAt } from '../terrain/heightfield';
import { a, numbered, open, ring, solid, yawAlong } from './helpers';
import { JETTIES, JETTY_DECK, JETTY_WIDTH, M24_SOUNDINGS, onJetty, REEDGATE as R } from './places';
import { FERRY_STOPS, GREYFEN_WAYSTONES, SITES, type XZ } from './sites';
import type { JettyFit } from './fit';

/** Ten stilt houses round the landing deck (offsets from the pad centre). */
export const REEDGATE_HOUSES: ReadonlyArray<readonly [number, number]> = [
  [-56, -30], [-56, 0], [-56, 30], [-32, -30], [-32, 30], [32, -30], [32, 30], [56, -30], [56, 0], [56, 30],
];
const HOUSE = 7;

/** A jetty as a plank deck (`bridge` kind, solid) from its land end to its water end, its top at the jetty deck height. */
export function jettySpec(id: string, j: JettyFit): StructureSpec {
  // Half a metre past the land end, so the deck meets the ground at its own height.
  const length = j.length + 0.5;
  const cx = (j.land.x - j.dir.x * 0.5 + j.water.x) / 2;
  const cz = (j.land.z - j.dir.z * 0.5 + j.water.z) / 2;
  return solid(id, 'bridge', cx, cz, length, JETTY_WIDTH, Math.max(0.3, JETTY_DECK - heightAt(cx, cz)), yawAlong(j.dir.x, j.dir.z));
}

/** An anchor standing on a jetty deck `along` metres from its land end. */
export function onJettyAnchor(id: string, jettyId: string, j: JettyFit, along: number, heading: number, tags: string[] = []): AnchorSpec {
  const p = onJetty(j, along);
  return a(id, p.x, p.z, heading, tags, { onStructure: jettyId, dy: Math.round((JETTY_DECK - heightAt(p.x, p.z)) * 100) / 100 });
}

/** Compass heading from one point towards another. */
export const headingTo = (from: XZ, to: XZ): number => ((Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI + 360) % 360;

export function reedgateLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const ws = GREYFEN_WAYSTONES.reedgate;
  const houses = REEDGATE_HOUSES.map(([dx, dz], i) => solid(`greyfen-reedgate-house-${i + 1}`, 'greyfen-stilt-house', R.x + dx, R.z + dz, HOUSE, HOUSE));
  // Plank walks from the landing deck to each house (open decoration on the pad).
  const walks = REEDGATE_HOUSES.map(([dx, dz], i) => {
    const len = Math.hypot(dx, dz) - HOUSE / 2 - 8;
    const ux = dx / Math.hypot(dx, dz);
    const uz = dz / Math.hypot(dx, dz);
    const mid = 8 + len / 2;
    return open(`greyfen-reedgate-walk-${i + 1}`, 'greyfen-plank-walk', R.x + ux * mid, R.z + uz * mid, len, 1.6, undefined, yawAlong(ux, uz));
  });
  return {
    anchors: [
      a('waystone.reedgate', ws.x, ws.z - 1.8, 0, ['waystone']),
      a('npc-post.leofa.reedgate', R.x + 4, R.z - 6, 0, ['npc-post']),
      ...numbered('greyfen.reedgate.folk', [[R.x - 10, R.z + 4], [R.x + 10, R.z + 4], [R.x - 4, R.z - 10]], ['npc-post'], 0),
      a('greyfen.reedgate.centre', R.x, R.z, 0, ['flood-seed']),
    ],
    triggers: [],
    structures: [
      solid('greyfen-waystone-reedgate', 'waystone', ws.x, ws.z, 1.6, 1.6, 2.4),
      open('greyfen-reedgate-deck', 'greyfen-plank-walk', R.x, R.z, 16, 16),
      ...houses,
      ...walks,
    ],
  };
}

export const FERRY_JETTY_ID = (stop: string) => `greyfen-jetty-${stop}`;

export function ferryLandingLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const s = FERRY_STOPS.reedgate;
  const j = JETTIES.reedgate;
  const jid = FERRY_JETTY_ID('reedgate');
  const pool = SITES.m24Pool;
  const back = headingTo(j.water, j.land);
  // The fence round three sides of M24's pit; the west side is the way in.
  const fence = [
    solid('greyfen-m24-fence-n', 'fence', pool.x, pool.z + pool.d / 2 + 1, pool.w + 2, 0.3, 1.2),
    solid('greyfen-m24-fence-s', 'fence', pool.x, pool.z - pool.d / 2 - 1, pool.w + 2, 0.3, 1.2),
    solid('greyfen-m24-fence-e', 'fence', pool.x + pool.w / 2 + 1, pool.z, 0.3, pool.d, 1.2),
  ];
  return {
    anchors: [
      // K7 puts `ferry:reedgate` on the stop anchor at the jetty's water end.
      onJettyAnchor('greyfen.ferry.reedgate', jid, j, j.length - 1, back),
      a('greyfen.ferry.reedgate.shore', j.land.x - j.dir.x * 3, j.land.z - j.dir.z * 3, back),
      a('npc-post.dudda.ferry', s.x - 6, s.z - 6, 90, ['npc-post']),
      a('npc-post.hild.ferry', s.x - 9, s.z - 3, 90, ['npc-post']),
      ...numbered('greyfen.ferry.hand', [[s.x + 2, s.z - 12], [s.x - 4, s.z - 14]], ['npc-post'], 0),
      a('npc-post.widow.ferry', s.x - 16, s.z - 12, 45, ['npc-post']),
      // M24: the soundings on the mud flats, the pit (K7 registers its volume and route from these), the horn on the jetty.
      ...numbered('greyfen.m24.sound', M24_SOUNDINGS.map((p) => [p.x, p.z] as const), ['objective']),
      a('greyfen.m24.pool', pool.x, pool.z - pool.d / 2 - 2, 0, ['objective']),
      a('greyfen.m24.pool.entry', pool.x - pool.w / 2 - 1, pool.z, 90, ['objective']),
      a('greyfen.m24.pool.horn', pool.x, pool.z, 0, ['objective']),
      onJettyAnchor('greyfen.m24.horn.blow', jid, j, 3, headingTo(j.land, j.water), ['objective']),
      ...numbered('greyfen.spawn.m24.wreck', ring(M24_SOUNDINGS[0]!.x, M24_SOUNDINGS[0]!.z, 5, 4, 45).map((p) => [p[0], p[1]] as const), ['spawn']),
    ],
    triggers: [],
    structures: [jettySpec(jid, j), solid('greyfen-ferry-boathouse', 'greyfen-boathouse', s.x - 12, s.z + 10, 8, 6), ...fence],
  };
}
