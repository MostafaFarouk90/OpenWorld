// K10 (plans/act3-K10.md section 3, Q3 light sockets): the ten shard-gems, two per class. Every string says "shard-gem"
// so a gem never reads as Cael's Ember Shard. A gem counts only while the wearer's class matches; otherwise it is dormant.
import type { ClassId } from '../../actors/classes';
import type { ItemDef } from '../../hud/ports';
import { registerItems } from '../../inventory/items';
import { shardGemId } from '../shardGems';

/**
 * What a gem does. `out` multiplies the player's hits (a `spell` filter only counts spell-kind hits; `lowTarget` only
 * targets under half health; `far` only targets beyond `SOCKET_TUNING.farMetres`). `in` reduces damage the player takes
 * (`blocked` only blocked hits; `lowSelf` only while the player is under half health).
 */
export type GemEffect =
  | { side: 'out'; bonus: number; when?: 'spell' | 'lowTarget' | 'far' }
  | { side: 'in'; reduce: number; when?: 'blocked' | 'lowSelf' };

export interface ShardGemDef {
  id: string;
  name: string;
  classId: ClassId;
  /** A or B: the boss drop order alternates them. */
  variant: 'a' | 'b';
  effect: GemEffect;
}

const gem = (name: string, classId: ClassId, variant: 'a' | 'b', effect: GemEffect): ShardGemDef => ({ id: shardGemId(name), name, classId, variant, effect });

/** Invented tuning (Q6 list, logged in design/changes-applied.md). */
export const SHARD_GEMS: readonly ShardGemDef[] = [
  gem('bulwark', 'knight', 'a', { side: 'in', reduce: 0.15, when: 'blocked' }),
  gem('oathfire', 'knight', 'b', { side: 'out', bonus: 0.06 }),
  gem('rootstone', 'warden', 'a', { side: 'in', reduce: 0.06 }),
  gem('ravager', 'warden', 'b', { side: 'out', bonus: 0.06 }),
  gem('kindling', 'emberwright', 'a', { side: 'out', bonus: 0.08, when: 'spell' }),
  gem('hearthglass', 'emberwright', 'b', { side: 'in', reduce: 0.06, when: 'lowSelf' }),
  gem('nightedge', 'ashblade', 'a', { side: 'out', bonus: 0.1, when: 'lowTarget' }),
  gem('quickstep', 'ashblade', 'b', { side: 'in', reduce: 0.06 }),
  gem('fletching', 'pathfinder', 'a', { side: 'out', bonus: 0.06 }),
  gem('steadyhand', 'pathfinder', 'b', { side: 'out', bonus: 0.1, when: 'far' }),
];

export const SHARD_GEM_STACK = 10;

export const shardGemDef = (id: string): ShardGemDef | undefined => SHARD_GEMS.find((g) => g.id === id);

/** The gem a class gets for a variant. */
export const gemFor = (classId: ClassId, variant: 'a' | 'b'): ShardGemDef => SHARD_GEMS.find((g) => g.classId === classId && g.variant === variant)!;

/** Shard-gems are trade goods with no list price: they cannot be sold, only fitted, removed or recut. */
export const SHARD_GEM_ITEMS: readonly ItemDef[] = SHARD_GEMS.map((g) => ({
  id: g.id,
  nameKey: `item.${g.id}.name`,
  descKey: `item.${g.id}.desc`,
  kind: 'quest',
  stackMax: SHARD_GEM_STACK,
}));

registerItems(SHARD_GEM_ITEMS);
