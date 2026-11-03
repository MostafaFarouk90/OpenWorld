import type { EnemyDef, SpawnerDef } from '../../types';
import { EMBER_WYRM_DEF } from '../defs';

/**
 * Skarl's drake (K6a PR 1, plan 6.2, design 10 row 22): the Ember Wyrm build at 0.8 with an iron collar, chained by
 * `drakeChain` to a post, tagged `dragonkin` (R16's keep bonus). K8 builds the D06 fight on it: the chain struck while the
 * drake is landed is Skarl's forced break, and the drake is freed on either outcome (so it takes no mercy here; K8 may
 * spread the def and retune it).
 */
export const SKARL_DRAKE = {
  scale: 0.8,
  /** Chain length from the collar to the post: the drake's flight leash. */
  chainLength: 14,
  /** The chain's struck segment: within this of the ground under the chain's low point. */
  strikeHeight: 1.6,
} as const;

export const SKARL_DRAKE_DEF: EnemyDef = {
  ...EMBER_WYRM_DEF,
  kind: 'skarl-drake',
  nameKey: 'enemies.name.skarl-drake',
  maxHealth: 160,
  maxPoise: 50,
  // Its own move ids (the overlays read the `.spit` / `.dive` suffixes), so its tuning and telegraphs never alias the Ember Wyrm's.
  moves: EMBER_WYRM_DEF.moves.map((m) => ({ ...m, id: m.id.replace(/^wyrm\./, 'drake.') })),
  mercy: undefined,
  tags: ['dragonkin'],
};

/** A drake group on any anchor (K8's Aerie group). Manual, never respawns, not saved by K6a. */
export function skarlDrakeSpawner(id: string, anchor: string, extra: Partial<SpawnerDef> = {}): SpawnerDef {
  return { id, enemy: 'skarl-drake', count: 1, anchor, band: 'dragonspine', area: 'dragonspine-summit', activation: 'manual', respawn: 'never', leash: true, ...extra };
}

/** Dev only (`?drake=1`): manual and never saved; its `dev.drake.*` anchors exist only once the hook defines them. */
export const DRAKE_DEV_SPAWNERS: readonly SpawnerDef[] = [skarlDrakeSpawner('wyrm.dev.drake', 'dev.drake.spawn', { tag: 'wyrm.dev', ephemeral: true, leash: false })];
