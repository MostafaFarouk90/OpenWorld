// v0.7 items 8 and 8b: the Warmth wiring in the spawners (block lock, preview, span roll) and the Q9 summit cap.
import { describe, expect, it, vi } from 'vitest';
import { ACT3_BLOCKS, SUMMIT_CAP_ABOVE_PLAYER, blockBaseLevel, enemyLevel, summitLevel } from './level';
import type { AnchorLike } from './ports';
import { SpawnRequest, SpawnerRegistry } from './spawners';
import type { SpawnerDef } from './types';

const anchor = (id: string, x: number, z: number): AnchorLike => ({ id, position: { x, y: 2, z }, yaw: 0 });

/** Greyfen at engine (3000, 12500), the lower slopes at (13600, 12500), the summit at (13600, 15600). */
const ANCHORS = [anchor('gf', 3000, 12500), anchor('low', 13600, 12500), anchor('top', 13600, 15600)];

function setup(defs: SpawnerDef[], opts: { player?: number; rolls?: number[] } = {}) {
  const warn = vi.fn();
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const state = { player: opts.player as number | undefined, rolls: opts.rolls ?? [0] };
  let i = 0;
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => ANCHORS.find((a) => a.id === id), withTag: () => [] },
    warn,
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: () => {},
    rng: () => state.rolls[i++ % state.rolls.length],
    playerLevel: () => state.player,
  });
  defs.forEach((d) => reg.define(d));
  return { reg, warn, reqs, state };
}

const mk = (over: Partial<SpawnerDef>): SpawnerDef => ({
  id: 's', enemy: 'ash-wraith', count: 1, anchor: 'gf', band: 'greyfen', activation: 'manual', respawn: 'onRest', ...over,
});

const levelsOf = (reqs: SpawnRequest[]) => reqs.map((r) => r.level);

describe('enemyLevel v0.7: a lock is a base with the span rolled on top', () => {
  const B = { min: 3, max: 7 };
  it('a lock with no span is exactly L (Act 1 and 2 callers), clamped to 1..cap', () => {
    expect(enemyLevel(B, { lockedLevel: 12, roll: 1 })).toBe(12);
    expect(enemyLevel(B, { lockedLevel: 99, roll: 1 })).toBe(40);
    expect(enemyLevel(B, { lockedLevel: -4 })).toBe(1);
  });
  it('a lock with a span rolls L..L + span', () => {
    expect(enemyLevel(B, { lockedLevel: 18, span: 5, roll: 0 })).toBe(18);
    expect(enemyLevel(B, { lockedLevel: 18, span: 5, roll: 1 })).toBe(23);
    expect(enemyLevel(B, { lockedLevel: 18, span: 5, roll: 0.5 })).toBe(21);
  });
  it('the block formula rolls the block span when given, not the band span', () => {
    const block = { id: 'greyfen', offset: 0 };
    expect(enemyLevel({ min: 20, max: 28 }, { block, warmthTier: 3, playerLevel: 18, span: 5, roll: 1 })).toBe(23);
  });
});

describe('ACT3_BLOCKS and the 5.9 formula', () => {
  it('Greyfen first then Dragonspine second (recommended) and the reverse give design 5.9 levels', () => {
    expect(blockBaseLevel('greyfen', 3, 18)).toBe(18); // 18 to 23
    expect(blockBaseLevel('dragonspine-lower', 4, 22)).toBe(23); // 23 to 25
    expect(blockBaseLevel('dragonspine-lower', 3, 18)).toBe(20); // 20 to 22
    expect(blockBaseLevel('greyfen', 4, 22)).toBe(21); // 21 to 26
    expect(ACT3_BLOCKS.greyfen.span).toBe(5);
    expect(ACT3_BLOCKS['dragonspine-lower'].span).toBe(2);
  });
  it('clamps to the player window and to 1..cap; the tier is clamped to 0..8', () => {
    expect(blockBaseLevel('greyfen', 8, 18)).toBe(23); // P + 5
    expect(blockBaseLevel('greyfen', 0, 30)).toBe(21); // P - 9
    expect(blockBaseLevel('greyfen', 99, 60)).toBe(40);
    expect(blockBaseLevel('greyfen', -5, 1)).toBe(6); // W clamps to 0: raw 9, window up to P + 5
  });
});

describe('SpawnerRegistry: Act 3 block spawners', () => {
  it('before the lock a block spawn uses the live preview, and the span on top', () => {
    const { reg, reqs } = setup([mk({ block: 'greyfen', count: 3 })], { player: 18, rolls: [0, 1, 0.5] });
    reg.setWarmthTier(3);
    reg.spawnGroup('s');
    expect(levelsOf(reqs)).toEqual([18, 23, 21]);
    expect(reg.blockPreview('greyfen')).toBe(18);
  });

  it('lock then respawn lands in [L, L + span]; live enemies keep their pre-lock level until they respawn', () => {
    const { reg, reqs, state } = setup([mk({ block: 'greyfen' })], { player: 18, rolls: [0] });
    reg.setWarmthTier(3);
    const [first] = reg.spawnGroup('s');
    expect(reqs[0].level).toBe(18);
    // The player levels and a shrine is lit before M23 is accepted: the lock takes the live preview.
    state.player = 20;
    reg.setWarmthTier(4);
    expect(reg.lockBlockLevel('greyfen', reg.blockPreview('greyfen')!)).toBe(21);
    expect(reqs).toHaveLength(1); // nothing re-levels the live member
    reg.onMemberGone(first, 'died');
    for (const roll of [0, 0.3, 0.7, 1]) {
      state.rolls = [roll];
      reg.reset('s');
      reg.spawnGroup('s');
      const lv = reqs[reqs.length - 1].level;
      expect(lv).toBeGreaterThanOrEqual(21);
      expect(lv).toBeLessThanOrEqual(26);
    }
    // Later shrines and levels never move a locked block (Q5).
    state.player = 30;
    reg.setWarmthTier(6);
    state.rolls = [0];
    reg.reset('s');
    reg.spawnGroup('s');
    expect(reqs[reqs.length - 1].level).toBe(21);
  });

  it('the lower slopes roll a span of 2, never the Dragonspine band span of 8', () => {
    const { reg, reqs } = setup([mk({ block: 'dragonspine-lower', anchor: 'low', band: 'dragonspine' })], { player: 22, rolls: [1] });
    reg.lockBlockLevel('dragonspine-lower', 23);
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(25);
  });

  it('a save made after the lock reloads the same L (same field and format, no version bump)', () => {
    const a = setup([mk({ block: 'greyfen' })], { player: 18 });
    a.reg.lockBlockLevel('greyfen', 19);
    const data = JSON.parse(JSON.stringify(a.reg.serialize()));
    expect(data.lockedBlockLevels).toEqual({ greyfen: 19 });
    const b = setup([mk({ block: 'greyfen' })], { player: 25, rolls: [0] });
    b.reg.setWarmthTier(7);
    b.reg.load(data);
    expect(b.reg.getLockedBlockLevel('greyfen')).toBe(19);
    b.reg.spawnGroup('s');
    expect(b.reqs[0].level).toBe(19);
  });

  it('the first lock is kept: a second lock returns it and warns when it differs', () => {
    const { reg, warn } = setup([]);
    expect(reg.lockBlockLevel('greyfen', 18)).toBe(18);
    expect(reg.lockBlockLevel('greyfen', 18)).toBe(18);
    expect(warn).not.toHaveBeenCalled();
    expect(reg.lockBlockLevel('greyfen', 22)).toBe(18);
    expect(warn).toHaveBeenCalledOnce();
    expect(reg.getLockedBlockLevel('greyfen')).toBe(18);
  });

  it("blockTopLevel is L + span (D05's boss at the Greyfen's L + 5), undefined before the lock", () => {
    const { reg } = setup([]);
    expect(reg.blockTopLevel('greyfen')).toBeUndefined();
    reg.lockBlockLevel('greyfen', 21);
    expect(reg.blockTopLevel('greyfen')).toBe(26);
  });

  it('without a player level a block spawn warns once and rolls its band', () => {
    const { reg, reqs, warn } = setup([mk({ block: 'greyfen', band: { min: 2, max: 2 } })]);
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(2);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('Q9: the summit cap (applied after the roll, fixed at spawn)', () => {
  const summit = (over: Partial<SpawnerDef> = {}) => mk({ anchor: 'top', band: 'dragonspine', ...over });

  it('a roll of 28 gives 26 for a player at 23 and stays 28 for a player at 25', () => {
    expect(SUMMIT_CAP_ABOVE_PLAYER).toBe(3);
    const lo = setup([summit()], { player: 23, rolls: [1] });
    lo.reg.spawnGroup('s');
    expect(lo.reqs[0].level).toBe(26);
    const hi = setup([summit()], { player: 25, rolls: [1] });
    hi.reg.spawnGroup('s');
    expect(hi.reqs[0].level).toBe(28);
  });

  it('the cap comes after the roll: a roll of 26 stays 26 for a player at 23 (no band clamp first)', () => {
    expect(summitLevel({ min: 26, max: 28 }, 0, 23)).toBe(26);
    expect(summitLevel({ min: 26, max: 28 }, 0.5, 23)).toBe(26);
    expect(summitLevel({ min: 26, max: 28 }, 0.5, 30)).toBe(27);
  });

  it('a very low player (an ?act3= jump at 10) meets P + 3, below the band min by design, never under 1', () => {
    expect(summitLevel({ min: 26, max: 28 }, 1, 10)).toBe(13);
    expect(summitLevel({ min: 26, max: 28 }, 1, -9)).toBe(1);
  });

  it('null turns the cap off: the design fixed 26 to 28', () => {
    expect(summitLevel({ min: 26, max: 28 }, 1, 10, null)).toBe(28);
    expect(summitLevel({ min: 26, max: 28 }, 0, 10, null)).toBe(26);
  });

  it('the area is taken from the anchor; an explicit area wins with a one-time warning when they disagree', () => {
    const a = setup([summit({ id: 'x' })], { player: 30, rolls: [0] });
    a.reg.spawnGroup('x');
    expect(a.reqs[0].level).toBe(26);
    const b = setup([summit({ id: 'y', anchor: 'low', area: 'dragonspine-summit', count: 2 })], { player: 30, rolls: [0] });
    b.reg.spawnGroup('y');
    expect(b.reqs.map((r) => r.level)).toEqual([26, 26]);
    expect(b.warn).toHaveBeenCalledOnce();
  });

  it('a capped summit enemy is not re-levelled when the player levels up mid-fight; it is capped again at its next respawn', () => {
    const { reg, reqs, state } = setup([summit()], { player: 23, rolls: [1] });
    const [id] = reg.spawnGroup('s');
    expect(reqs[0].level).toBe(26);
    state.player = 24; // level-up mid-fight
    expect(reqs).toHaveLength(1);
    expect(reqs[0].level).toBe(26);
    reg.onMemberGone(id, 'died');
    reg.onRest();
    expect(reqs).toHaveLength(2);
    expect(reqs[1].level).toBe(27);
  });

  it('with no player level the summit rolls the design band and warns once', () => {
    const { reg, reqs, warn } = setup([summit({ count: 2 })], { rolls: [1] });
    reg.spawnGroup('s');
    expect(levelsOf(reqs)).toEqual([28, 28]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('the lower slopes with no block roll their area band (20 to 22)', () => {
    const { reg, reqs } = setup([mk({ anchor: 'low', band: 'dragonspine' })], { player: 30, rolls: [1] });
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(22);
  });
});
