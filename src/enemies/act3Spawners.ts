import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from './hunters/def';
import { faunaAnchorId, GREYFEN_FAUNA_GROUPS, type FaunaGroup } from './fen/greyfenFauna.layout';
import './fen/overlays';
import './peak/overlays';
import { DRAGONSPINE_FAUNA_GROUPS, peakFaunaAnchorId, type PeakFaunaGroup } from './peak/dragonspineFauna.layout';
import { HAWK_PARENT } from './peak/tuning';
import type { EnemyKind, SpawnerDef, SpawnOptions } from './types';

/** The flag every Act 3 ambient group waits on: none stands in the fen before Act 3 opens. */
export const ACT3_AMBIENT_GATE = 'story.gate.a3';

const KIND: Record<FaunaGroup['kind'], EnemyKind> = {
  leech: 'fen-leech',
  shambler: 'peat-shambler',
  hunters: 'hunter-spearman',
  wraiths: 'ash-wraith',
};

function greyfenDef(g: FaunaGroup): SpawnerDef {
  const id = `greyfen.${g.id}`;
  const anchors = Array.from({ length: g.count }, (_, i) => faunaAnchorId(g.id, i + 1));
  return {
    id,
    tag: id,
    enemy: KIND[g.kind],
    ...(g.kind === 'hunters' ? { memberKinds: HUNTER_PACK_KINDS, leaderSlot: HUNTER_PACK_LEADER_SLOT } : {}),
    count: g.count,
    anchor: anchors[0]!,
    memberAnchors: anchors,
    band: 'greyfen',
    block: 'greyfen',
    ...(g.firstArrival ? { blockSpan: 1 } : {}),
    activation: { flag: ACT3_AMBIENT_GATE },
    respawn: 'onRest',
    leash: true,
  };
}

const PEAK_KIND: Record<PeakFaunaGroup['kind'], EnemyKind> = {
  hawks: 'rime-hawk',
  ogres: 'crag-ogre',
  hunters: 'hunter-spearman',
  wyrm: 'ember-wyrm',
};

/** The flag the summit groups wait on: the last lower-slopes beat before the summit opens (K4's summit hole needs more). */
export const SUMMIT_AMBIENT_GATE = 'story.m30.complete';

/**
 * Set by the peak plugin while Corvin Skarl's fight is armed (his boss is registered and undecided, or D06 is active): the
 * Aerie's ambient wyrms are sent off (their gate's `until`), so none is airborne over the courtyard (coordinator change).
 */
export const AERIE_WYRMS_AWAY_FLAG = 'world.dragonspine.fauna.aerieWyrmsAway';

function dragonspineDef(g: PeakFaunaGroup): SpawnerDef {
  const id = `dragonspine.${g.id}`;
  const anchors = Array.from({ length: g.count }, (_, i) => peakFaunaAnchorId(g.id, i + 1));
  return {
    id,
    tag: id,
    enemy: PEAK_KIND[g.kind],
    ...(g.kind === 'hunters' ? { memberKinds: HUNTER_PACK_KINDS, leaderSlot: HUNTER_PACK_LEADER_SLOT } : {}),
    count: g.count,
    anchor: anchors[0]!,
    memberAnchors: anchors,
    band: 'dragonspine',
    ...(g.summit ? { area: 'dragonspine-summit' as const } : { block: 'dragonspine-lower' as const }),
    ...(g.firstArrival ? { blockSpan: 1 } : {}),
    ...(g.nest ? { options: { nest: anchors[0]! } } : {}),
    activation: g.kind === 'wyrm' && g.summit
      ? { flag: SUMMIT_AMBIENT_GATE, until: AERIE_WYRMS_AWAY_FLAG }
      : { flag: g.summit ? SUMMIT_AMBIENT_GATE : ACT3_AMBIENT_GATE },
    respawn: 'onRest',
    leash: true,
  };
}

/** The ids of the summit wyrm groups by the Aerie: the peak plugin sends them off while Skarl's fight is armed. */
export const AERIE_WYRM_SPAWNERS: readonly string[] = DRAGONSPINE_FAUNA_GROUPS.filter((g) => g.kind === 'wyrm' && g.summit).map((g) => `dragonspine.${g.id}`);

// ---- helpers for the quest threads (K13's Dragonspine packs and the R18 parents)

/** A Rime Hawk group on K4's anchors (`memberAnchors`), on the lower block unless `extra` says otherwise. */
export function rimeHawkSpawner(id: string, memberAnchors: readonly string[], extra: Partial<SpawnerDef> = {}): SpawnerDef {
  return { id, tag: id, enemy: 'rime-hawk', count: memberAnchors.length, anchor: memberAnchors[0]!, memberAnchors: [...memberAnchors], band: 'dragonspine', block: 'dragonspine-lower', activation: 'manual', respawn: 'never', leash: true, ...extra };
}

/** A Crag Ogre group on K4's anchors, on the lower block unless `extra` says otherwise. */
export function cragOgreSpawner(id: string, memberAnchors: readonly string[], extra: Partial<SpawnerDef> = {}): SpawnerDef {
  return { id, tag: id, enemy: 'crag-ogre', count: memberAnchors.length, anchor: memberAnchors[0]!, memberAnchors: [...memberAnchors], band: 'dragonspine', block: 'dragonspine-lower', activation: 'manual', respawn: 'never', leash: true, ...extra };
}

/** K4's R18 anchors: the two parents' spawn points and the nest they guard. */
export const R18_PARENT_ANCHORS = ['dragonspine.spawn.hawk-cliffs.parent-1', 'dragonspine.spawn.hawk-cliffs.parent-2'] as const;
export const R18_NEST_ANCHOR = 'dragonspine.hawk.nest.r18';

/**
 * The M28 crag balance (coordinator rulings 2026-10-31 and 2026-11-03; area level stays 20, defs unchanged): spawner options
 * for the crag's six hawks and its ogre, tuned for an L17 Knight in M28-era kit (Act 2 gear, Warmth, flasks, companions) who
 * blocks, dodges the slam and the stoop and drinks flasks: he survives the first wave with a margin, a careless one dies. At
 * most two of the group fight at once (the rest hold off until one is out); the group has 0.4 of its health and deals 0.6 of
 * its damage; the ogre blusters through two hits or five seconds in reach before its first swing; no hawk stoops while the
 * engaged ogre stands within 5 m of the target. K13 passes it as the crag group's `options`.
 */
export const M28_CRAG_OPTIONS: Readonly<Partial<SpawnOptions>> = { waveSize: 2, healthScale: 0.4, damageScale: 0.6, blusterHits: 2, blusterSeconds: 5, stoopClearOfOgre: 5 };

/**
 * The R18 parents (plan 2.7): two hawks circling the R18 nest with 10x health, stooping only near it and breaking off after a
 * stoop once Cael backs away (`nestGuard`). Manual: K13 spawns, despawns and respawns them (the failure reset).
 */
export function r18ParentsSpawner(id = 'dragonspine.r18.parents', extra: Partial<SpawnerDef> = {}): SpawnerDef {
  return rimeHawkSpawner(id, R18_PARENT_ANCHORS, {
    leash: false,
    ...extra,
    options: { healthScale: HAWK_PARENT.healthScale, nest: R18_NEST_ANCHOR, nestGuard: true, ...extra.options },
  });
}

/**
 * Act 3 ambient groups (K6b). PR 1: the Greyfen, every group on the `greyfen` block (its levels follow the Warmth lock, K0 item
 * 8b), present from `story.gate.a3`, refilled on rest. PR 2: the Dragonspine, on the `dragonspine-lower` block or, on the
 * summit, the `dragonspine-summit` area (the Q9 cap), present from `story.gate.a3` (the summit from `story.m30.complete`).
 * Quest packs are K12's, K13's and K8's.
 */
export const GREYFEN_SPAWNERS: readonly SpawnerDef[] = GREYFEN_FAUNA_GROUPS.map(greyfenDef);
export const DRAGONSPINE_SPAWNERS: readonly SpawnerDef[] = DRAGONSPINE_FAUNA_GROUPS.map(dragonspineDef);
/** The R18 parents' group, registered so K13's R18 step only calls `spawnGroup` / `despawnGroup` / `reset` on its id. */
export const R18_PARENTS_SPAWNER: SpawnerDef = r18ParentsSpawner();
export const ACT3_SPAWNERS: readonly SpawnerDef[] = [...GREYFEN_SPAWNERS, ...DRAGONSPINE_SPAWNERS, R18_PARENTS_SPAWNER];
