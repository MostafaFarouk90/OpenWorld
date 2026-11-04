// The R18 parents on K6b's helpers (plans/act3-K6b-pr2.md 13a), softened by the coordinator's ruling: one stoop never takes more than
// about 30% of a player's maximum health at level 17 (the Act 3 start level). The damage is computed from the real move and the
// real level formula, not copied from a measurement.
import { describe, expect, it } from 'vitest';
import { COMBAT } from '../../../../config/constants';
import { CLASS_STATS } from '../../../../classes/kits';
import { ENEMY_DEFS } from '../../../../enemies/defs';
import { ACT3_SPAWNERS, R18_NEST_ANCHOR, R18_PARENTS_SPAWNER, r18ParentsSpawner } from '../../../../enemies/act3Spawners';
import { ACT3_BLOCKS, blockBaseLevel, scaleStats } from '../../../../enemies/level';
import { HAWK_PARENT } from '../../../../enemies/peak/tuning';
import { KNIGHT_STATS } from '../../../../progression/classStats';
import { baseMaxHealthForLevel } from '../../../../progression/tuning';
import { PARENT_DAMAGE_SCALE, PARENT_STOOP_MAX_SHARE, DRAGONSPINE_SPAWNERS } from './spawners';
import { R18_PARENTS_TAG } from './r18.quest';
import { R18_PARENTS_GROUP } from './director/eggs';

const START_LEVEL = 17;
const parents = DRAGONSPINE_SPAWNERS.find((s) => s.tag === R18_PARENTS_TAG)!;
const stoop = ENEMY_DEFS['rime-hawk'].moves.find((m) => m.id === 'hawk.stoop')!;

/** The highest level a parent can be for a level-17 player: the block formula at the top Warmth Tier, plus the block's span. */
const worstLevel = (): number => blockBaseLevel('dragonspine-lower', 8, START_LEVEL) + ACT3_BLOCKS['dragonspine-lower'].span;
/** Damage of one stoop with the worst bone (the head, as K6b's measurement hit) and no armour: Enemy damage = move x level scale x spawner scale x bone. */
const stoopDamage = (spawnerScale: number): number =>
  stoop.damage * scaleStats(ENEMY_DEFS['rime-hawk'], worstLevel()).damageScale * spawnerScale * Math.max(...Object.values(COMBAT.boneMultipliers));
const classMaxHealth = (): Array<[string, number]> => [
  ['knight', baseMaxHealthForLevel(START_LEVEL)],
  ...Object.entries(CLASS_STATS).map(([id, row]): [string, number] => [id, row.health + row.healthPerLevel * (START_LEVEL - 1)]),
];

describe('R18 parents on K6b\'s helper', () => {
  it('is r18ParentsSpawner with the quest\'s id and tag, K6b\'s tuning kept, and the damage scale added through the options', () => {
    expect(parents.id).toBe(R18_PARENTS_GROUP);
    expect(parents).toMatchObject({ enemy: 'rime-hawk', count: 2, activation: 'manual', respawn: 'never', block: 'dragonspine-lower' });
    expect(parents.options).toEqual({ healthScale: HAWK_PARENT.healthScale, nest: R18_NEST_ANCHOR, nestGuard: true, damageScale: PARENT_DAMAGE_SCALE });
    expect(parents.memberAnchors).toEqual(r18ParentsSpawner().memberAnchors);
  });

  it('K6b\'s own group is left as K6b shipped it and is never driven by the quest (one parent group at a time)', () => {
    expect(R18_PARENTS_SPAWNER.options).toEqual({ healthScale: HAWK_PARENT.healthScale, nest: R18_NEST_ANCHOR, nestGuard: true });
    expect(ACT3_SPAWNERS).toContain(R18_PARENTS_SPAWNER);
    expect(R18_PARENTS_SPAWNER.id).not.toBe(parents.id);
  });
});

describe('R18 parents: one stoop is at most 30% of any class\'s maximum health at level 17', () => {
  it('the worst case is real: unsoftened, a stoop would be a third of a Knight\'s bar or more', () => {
    expect(worstLevel()).toBeGreaterThanOrEqual(22);
    expect(stoopDamage(1) / baseMaxHealthForLevel(START_LEVEL)).toBeGreaterThan(PARENT_STOOP_MAX_SHARE);
    expect(baseMaxHealthForLevel(START_LEVEL)).toBe(KNIGHT_STATS.health + KNIGHT_STATS.healthPerLevel * (START_LEVEL - 1));
  });

  it.each(classMaxHealth())('%s (max health %d)', (_cls, maxHealth) => {
    const scale = parents.options!.damageScale!;
    expect(scale).toBe(PARENT_DAMAGE_SCALE);
    const dmg = stoopDamage(scale);
    expect(dmg / maxHealth, `${dmg.toFixed(1)} of ${maxHealth}`).toBeLessThanOrEqual(PARENT_STOOP_MAX_SHARE);
  });

  it('the failure state is a parent killed, not the player\'s death: the softened stoop leaves the weakest class most of its health', () => {
    const weakest = Math.min(...classMaxHealth().map(([, hp]) => hp));
    expect(stoopDamage(PARENT_DAMAGE_SCALE)).toBeLessThan(weakest * 0.3 + 1e-9);
  });
});
