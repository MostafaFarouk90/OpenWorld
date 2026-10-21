import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from './hunters/def';
import type { SpawnerDef } from './types';

const members = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/** Anchor-name prefixes A6b asks A1 (oldsmoke), A3 (cinderreach) and A4 (mines) to create; see `ACT2_ANCHOR_PREFIXES`. */
export const ACT2_SPAWN_ANCHOR_PREFIXES = ['cinderreach.spawn.', 'oldsmoke.spawn.'] as const;

/**
 * Act 2 ambient ground groups (plans/act2-A6b.md). The sites follow A3's `cinderreach.spawn.<site>.<n>` names and A1/A4's
 * `oldsmoke.spawn.<site>.<n>`; a missing anchor warns once and spawns nothing. Quest-scoped groups (M12 raid, M15 packs, D03
 * courtyard, R09 nests) belong to the quest threads. Nothing respawns on rest.
 */
export const ACT2_SPAWNERS: readonly SpawnerDef[] = [
  // R07 Wolf-Mother's Kits: before the choice both hound rings are out; sparing the pups stills the Cinderford hounds, culling
  // them stills the Fellwalker Pasture ones. An unset or unexpected value counts as undecided.
  {
    id: 'cinderreach.hounds.cinderford', tag: 'cinderreach.hounds.cinderford', enemy: 'ember-hound', count: 3,
    anchor: 'cinderreach.spawn.cinderford.1', memberAnchors: members('cinderreach.spawn.cinderford.', 1, 3),
    band: 'cinderreach', activation: { unlessChoice: { flag: 'story.r07.choice', equals: 'spared' } }, respawn: 'never', leash: true,
  },
  {
    id: 'cinderreach.hounds.pasture', tag: 'cinderreach.hounds.pasture', enemy: 'ember-hound', count: 3,
    anchor: 'cinderreach.spawn.pasture.1', memberAnchors: members('cinderreach.spawn.pasture.', 1, 3),
    band: 'cinderreach', activation: { unlessChoice: { flag: 'story.r07.choice', equals: 'culled' } }, respawn: 'never', leash: true,
  },
  // Golems on the Hushed Anvil ridge and in the Scorchhold quarry.
  {
    id: 'cinderreach.golems.anvil', tag: 'cinderreach.golems.anvil', enemy: 'cinder-golem', count: 2,
    anchor: 'cinderreach.spawn.anvil.1', memberAnchors: members('cinderreach.spawn.anvil.', 1, 2),
    band: 'cinderreach', activation: 'auto', respawn: 'never', leash: true,
  },
  {
    id: 'cinderreach.golems.quarry', tag: 'cinderreach.golems.quarry', enemy: 'cinder-golem', count: 2,
    anchor: 'cinderreach.spawn.scorchhold.7', memberAnchors: members('cinderreach.spawn.scorchhold.', 7, 8),
    band: 'cinderreach', activation: 'auto', respawn: 'never', leash: true,
  },
  // The Hunters' camp: three spearmen and a harpooner (slot 3, the pack leader).
  {
    id: 'cinderreach.hunters.camp', tag: 'cinderreach.hunters.camp', enemy: 'hunter-spearman', memberKinds: HUNTER_PACK_KINDS, count: 4,
    anchor: 'cinderreach.spawn.huntercamp.1', memberAnchors: members('cinderreach.spawn.huntercamp.', 1, 4),
    band: 'cinderreach', activation: 'auto', leaderSlot: HUNTER_PACK_LEADER_SLOT, respawn: 'never', leash: true,
  },
  // Slag Crawlers hang from the Oldsmoke mine galleries.
  {
    id: 'oldsmoke.crawlers.mines', tag: 'oldsmoke.crawlers.mines', enemy: 'slag-crawler', count: 3,
    anchor: 'oldsmoke.spawn.mines.1', memberAnchors: members('oldsmoke.spawn.mines.', 1, 3),
    band: 'oldsmoke', activation: 'auto', respawn: 'never', leash: true,
  },
  // The cache fox waits near A2's fox-cache points of interest.
  {
    id: 'cinderreach.fox.cache', tag: 'cinderreach.fox.cache', enemy: 'kindling-fox', count: 1,
    anchor: 'cinderreach.spawn.fox.1', memberAnchors: ['cinderreach.spawn.fox.1'],
    band: 'cinderreach', activation: 'auto', respawn: 'never', leash: false,
  },
  // R05's guide fox, started by the quest (A12 calls `foxes.guide('cinderreach.fox.r05', ...)` after `spawnGroup`).
  {
    id: 'cinderreach.fox.r05', tag: 'cinderreach.fox.r05', enemy: 'kindling-fox', count: 1,
    anchor: 'cinderreach.r05.fox', memberAnchors: ['cinderreach.r05.fox'],
    band: 'cinderreach', activation: 'manual', respawn: 'never', leash: false,
  },
  // Dev only (`?ground=1`, ground/ground.plugin.ts defines the `dev.ground.*` anchors): one of each kind near the player.
  ...(['cinder-golem', 'slag-crawler', 'kindling-fox'] as const).map(
    (kind): SpawnerDef => ({
      id: `dev.ground.${kind}`, tag: `dev.ground.${kind}`, enemy: kind, count: 1,
      anchor: `dev.ground.${kind}`, memberAnchors: [`dev.ground.${kind}`],
      band: { min: 6, max: 6 }, activation: 'manual', respawn: 'never', leash: false,
    }),
  ),
  {
    id: 'dev.ground.hunters', tag: 'dev.ground.hunters', enemy: 'hunter-spearman', memberKinds: HUNTER_PACK_KINDS, count: 4,
    anchor: 'dev.ground.hunters.1', memberAnchors: members('dev.ground.hunters.', 1, 4),
    band: { min: 6, max: 6 }, activation: 'manual', leaderSlot: HUNTER_PACK_LEADER_SLOT, respawn: 'never', leash: false,
  },
];
