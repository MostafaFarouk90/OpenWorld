// The Ashen Waste's ambient spawner groups (Act 4 L5, plans/act4-L5.md section 6). Every group stands on the
// `ashen-waste` band, so SpawnerRegistry caps its members at the player's level + 3 (+ 2 for the first-arrival group, Q1).
// None stands in the Waste before M42 opens it; none refills (the Waste is crossed, not farmed), except the D08 nave's
// night husks, which rise again after every rest once Eormen is defeated.
import './overlays';
import { HUSK_CATHEDRAL_ASH } from '../../waste/interiors/huskCathedral';
import type { EnemyKind, SpawnerDef } from '../types';
import { WASTE_FAUNA_GROUPS, wasteFaunaAnchorId, type WasteFaunaGroup, type WasteFaunaKind } from './wasteFauna.layout';

/** The flag every Waste ambient group waits on (L11's M42 start). */
export const WASTE_AMBIENT_GATE = 'story.m42.started';
/** Derived by the waste plugin from `boss.eormen.outcome === 'defeated'` (on the outcome and on a load). */
export const NAVE_HUSKS_FLAG = 'world.waste.naveHusks';
export const WASTE_BAND = 'ashen-waste';

const KIND: Record<Exclude<WasteFaunaKind, 'husk-knight'>, EnemyKind> = {
  striders: 'waste-strider',
  husks: 'ash-wraith',
  hounds: 'ember-hound',
  gnats: 'cinder-gnat-swarm',
  golems: 'cinder-golem',
};

function base(id: string, enemy: EnemyKind, anchors: readonly string[], g: WasteFaunaGroup): SpawnerDef {
  return {
    id,
    tag: id,
    enemy,
    count: anchors.length,
    anchor: anchors[0]!,
    memberAnchors: anchors,
    band: WASTE_BAND,
    ...(g.firstArrival ? { firstArrival: true } : {}),
    ...(enemy === 'ash-wraith' ? { skin: 'wraith-husk' as const } : {}),
    activation: { flag: WASTE_AMBIENT_GATE },
    respawn: 'never',
    leash: true,
  };
}

/**
 * One group's spawners. A Husk Knight group is two: the knight alone (`<id>`) on the first anchor and its husks
 * (`<id>.husks`) on the rest, so each spawner carries one kind and the husks their skin.
 */
export function wasteGroupSpawners(g: WasteFaunaGroup): SpawnerDef[] {
  const id = `waste.${g.id}`;
  const anchors = Array.from({ length: g.count }, (_, i) => wasteFaunaAnchorId(g.id, i + 1));
  if (g.kind !== 'husk-knight') return [base(id, KIND[g.kind], anchors, g)];
  return [base(id, 'husk-knight', anchors.slice(0, 1), g), base(`${id}.husks`, 'ash-wraith', anchors.slice(1), g)];
}

/** The nave's night husks on L1's aisle ash piles (ash.4 to ash.6; Eormen's adds use ash.1 to ash.3, L6). */
export const NAVE_HUSK_ANCHORS: readonly string[] = HUSK_CATHEDRAL_ASH.filter((a) => a.n >= 4).map((a) => `waste.cathedral.nave.ash.${a.n}`);
export const NAVE_HUSKS_SPAWNER: SpawnerDef = {
  id: 'waste.d08.nave.husks',
  tag: 'waste.d08.nave.husks',
  enemy: 'ash-wraith',
  skin: 'wraith-husk',
  count: NAVE_HUSK_ANCHORS.length,
  anchor: NAVE_HUSK_ANCHORS[0]!,
  memberAnchors: NAVE_HUSK_ANCHORS,
  band: WASTE_BAND,
  activation: { flag: NAVE_HUSKS_FLAG },
  respawn: 'onRest',
  leash: true,
};

export const WASTE_AMBIENT_SPAWNERS: readonly SpawnerDef[] = WASTE_FAUNA_GROUPS.flatMap(wasteGroupSpawners);
export const WASTE_SPAWNERS: readonly SpawnerDef[] = [...WASTE_AMBIENT_SPAWNERS, NAVE_HUSKS_SPAWNER];
