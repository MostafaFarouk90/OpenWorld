import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from './hunters/def';
import { faunaAnchorId, GREYFEN_FAUNA_GROUPS, type FaunaGroup } from './fen/greyfenFauna.layout';
import './fen/overlays';
import type { EnemyKind, SpawnerDef } from './types';

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

/**
 * Act 3 ambient groups (K6b, plans/act3-K6b.md section 5). PR 1: the Greyfen, every group on the `greyfen` block (its levels
 * follow the Warmth lock, K0 item 8b), present from `story.gate.a3`, refilled on rest. Quest packs (M23 to M27, R12, R14, D05)
 * are K12's and K8's. PR 2 adds the Dragonspine.
 */
export const ACT3_SPAWNERS: readonly SpawnerDef[] = GREYFEN_FAUNA_GROUPS.map(greyfenDef);
