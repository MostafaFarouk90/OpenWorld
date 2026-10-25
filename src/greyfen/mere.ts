// Hathren's Mere: the shrine site (K9 builds the shrine and its rite at `greyfen.mere.shrine`; K3 keeps 10 m clear round it),
// the Mere waystone 14 m west of it, the south jetty for the ferry, and the shore spots of M23, M26 and M27.
import type { LayoutData } from '../region/layoutTypes';
import { a, numbered, sphere, solid } from './helpers';
import { JETTIES, MERE_SHORE, MERE_SPOTS } from './places';
import { FERRY_JETTY_ID, headingTo, jettySpec, onJettyAnchor } from './reedgate';
import { GREYFEN_WAYSTONES, SITES, type XZ } from './sites';

const pts = (list: readonly XZ[]) => list.map((p) => [p.x, p.z] as const);

/** The shore spots by use (MERE_SPOTS is nearest the shore first). */
export const MERE_USE = {
  nets: MERE_SPOTS.slice(0, 4),
  scaleBed: MERE_SPOTS[4]!,
  blinds: MERE_SPOTS.slice(5, 11),
  brood: MERE_SPOTS.slice(11, 14),
  m27Search: MERE_SPOTS.slice(14, 18),
  packs: MERE_SPOTS.slice(18, 20),
} as const;

export function mereLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const shrine = SITES.mereShrine;
  const ws = GREYFEN_WAYSTONES['hathrens-mere'];
  const j = JETTIES.mere;
  const jid = FERRY_JETTY_ID('mere');
  const toMere = headingTo(shrine, SITES.mere);
  const ripple = { x: MERE_SHORE.x + (SITES.mere.x - shrine.x) * 0.04, z: MERE_SHORE.z + (SITES.mere.z - shrine.z) * 0.04 };
  return {
    anchors: [
      a('greyfen.mere.shrine', shrine.x, shrine.z, toMere, ['objective']),
      a('waystone.hathrens-mere', ws.x, ws.z - 1.8, 0, ['waystone']),
      a('npc-post.leofa.mere', shrine.x + 12, shrine.z - 9, toMere, ['npc-post']),
      a('greyfen.mere.shore', MERE_SHORE.x, MERE_SHORE.z, toMere, ['objective']),
      a('greyfen.m23.search.4', MERE_SHORE.x - 6, MERE_SHORE.z - 1, 0, ['objective']),
      a('greyfen.m23.ripples', ripple.x, ripple.z, toMere, ['objective']),
      onJettyAnchor('greyfen.ferry.mere', jid, j, j.length - 1, headingTo(j.water, j.land)),
      ...numbered('greyfen.mere.net', pts(MERE_USE.nets), ['objective']),
      a('greyfen.m26.scale-bed', MERE_USE.scaleBed.x, MERE_USE.scaleBed.z, 0, ['objective']),
      ...numbered('greyfen.spawn.m26.nets', MERE_USE.nets.flatMap((p) => [[p.x - 3, p.z] as const, [p.x + 3, p.z] as const]), ['spawn']),
      ...numbered('greyfen.m27.blind', pts(MERE_USE.blinds), ['objective']),
      ...numbered('greyfen.m27.brood', pts(MERE_USE.brood), ['objective']),
      ...numbered('greyfen.m27.search', pts(MERE_USE.m27Search), ['objective']),
      ...MERE_USE.packs.flatMap((p, k) =>
        numbered(`greyfen.spawn.m27.pack.${k + 1}`, [[p.x - 2, p.z - 2], [p.x + 2, p.z - 2], [p.x - 2, p.z + 2], [p.x + 2, p.z + 2]], ['spawn']),
      ),
    ],
    triggers: [sphere('trg.greyfen.m27.blinds', MERE_USE.blinds[0]!.x, MERE_USE.blinds[0]!.z, 15)],
    structures: [solid('greyfen-waystone-hathrens-mere', 'waystone', ws.x, ws.z, 1.6, 1.6, 2.4), jettySpec(jid, j)],
  };
}
