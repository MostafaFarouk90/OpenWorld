import { describe, expect, it } from 'vitest';
import { QuestManager } from '../quests/QuestManager';
import type { BusPort, StatePort } from '../quests/ports';
import type { QuestDef } from '../quests/types';
import { QuestRewardScale } from '../core/scalePorts';
import { ACT3_BLOCKS, blockBaseLevel, type Act3BlockId } from '../enemies/level';
import { WarmthBlocks, blockLevelFlag, type WarmthBlocksPorts } from './warmthBlocks';

/** The spawners' lock and the live preview, as `EnemyManager` exposes them (first lock kept, clamped to 1..cap). */
class FakeEnemies {
  W = 3;
  P: number | undefined = 18;
  locks: Record<string, number> = {};
  lockCalls = 0;
  blockPreview = (b: Act3BlockId): number | undefined => (this.P === undefined ? undefined : blockBaseLevel(b, this.W, this.P));
  blockLevel = (b: Act3BlockId): number | undefined => this.locks[b];
  lockBlockLevel = (b: string, l: number): number | undefined => {
    this.lockCalls++;
    if (this.locks[b] !== undefined) return this.locks[b];
    if (!Number.isFinite(l)) return undefined;
    return (this.locks[b] = Math.min(60, Math.max(1, Math.round(l))));
  };
}

function setup(over: Partial<WarmthBlocksPorts> = {}) {
  const enemies = new FakeEnemies();
  const flags = new Map<string, number>();
  const writes: [string, number][] = [];
  const quests = new Map<string, string>();
  const wb = new WarmthBlocks({
    enemies: () => enemies,
    questState: (id) => quests.get(id) ?? 'inactive',
    flag: (k) => flags.get(k),
    setFlag: (k, v) => {
      flags.set(k, v);
      writes.push([k, v]);
    },
    ...over,
  });
  return { enemies, flags, writes, quests, wb };
}

describe('WarmthBlocks: design 5.9 in both block orders', () => {
  it('Greyfen first: 18 at W3 P18; then the spine, after the Mere lit (W4), is 23', () => {
    const t = setup();
    t.wb.onQuestStarted('m23');
    expect(t.wb.blockLevel('greyfen')).toBe(18);
    expect(t.flags.get('warmth.block.greyfen.level')).toBe(18);
    expect(t.wb.preview('dragonspine-lower')).toBe(20);
    t.enemies.W = 4; // the Mere is lit
    expect(t.wb.preview('dragonspine-lower')).toBe(23);
    expect(t.wb.preview('greyfen')).toBe(18); // the map chip never moves after the lock
    t.wb.onQuestStarted('m28');
    expect(t.wb.blockLevel('dragonspine-lower')).toBe(23);
    expect(t.flags.get(blockLevelFlag('dragonspine-lower'))).toBe(23);
  });

  it('spine first: 20 at W3; then Greyfen second, after the Anvil lit (W4), is 21', () => {
    const t = setup();
    t.wb.onQuestStarted('m28');
    expect(t.wb.blockLevel('dragonspine-lower')).toBe(20);
    t.enemies.W = 4;
    expect(t.wb.preview('greyfen')).toBe(21);
    t.wb.onQuestStarted('m23');
    expect(t.wb.blockLevel('greyfen')).toBe(21);
  });

  it('lockBlock locks at the preview and returns L; other quests do not lock', () => {
    const t = setup();
    t.wb.onQuestStarted('m22');
    t.wb.onQuestStarted('m24');
    expect(t.enemies.locks).toEqual({});
    expect(t.wb.lockBlock('greyfen')).toBe(18);
  });
});

describe('WarmthBlocks: Q5, the lock is never changed', () => {
  it('a second start, a restart after failure and the last quest do not re-lock', () => {
    const t = setup();
    t.wb.onQuestStarted('m23');
    t.enemies.W = 5;
    t.enemies.P = 25;
    t.wb.onQuestStarted('m23');
    t.wb.onQuestStarted('m23');
    t.quests.set('m23', 'failed');
    t.wb.derive();
    t.quests.set('m23', 'active');
    t.wb.onQuestStarted('m23');
    t.quests.set('m27', 'completed');
    t.wb.derive();
    expect(t.wb.blockLevel('greyfen')).toBe(18);
    expect(t.flags.get('warmth.block.greyfen.level')).toBe(18);
    expect(t.writes).toEqual([['warmth.block.greyfen.level', 18]]);
  });

  it('a load restoring M23 active never changes a saved lock', () => {
    const t = setup();
    t.enemies.locks.greyfen = 21;
    t.flags.set('warmth.block.greyfen.level', 21);
    t.quests.set('m23', 'active');
    t.enemies.W = 0;
    t.enemies.P = 10;
    t.wb.derive();
    expect(t.enemies.locks.greyfen).toBe(21);
    expect(t.writes).toEqual([]);
  });
});

describe('WarmthBlocks: no level, bad numbers', () => {
  it('without a player level lockBlock returns undefined, locks nothing and writes no flag', () => {
    const t = setup();
    t.enemies.P = undefined;
    expect(t.wb.lockBlock('greyfen')).toBeUndefined();
    expect(t.enemies.locks).toEqual({});
    expect(t.enemies.lockCalls).toBe(0);
    expect(t.writes).toEqual([]);
  });

  it('a level that appears later is locked by the per-tick derive while the lock quest is active', () => {
    const t = setup();
    t.enemies.P = undefined;
    t.quests.set('m23', 'active');
    t.wb.onQuestStarted('m23');
    t.wb.derive();
    t.wb.derive();
    expect(t.wb.blockLevel('greyfen')).toBeUndefined();
    t.enemies.P = 18;
    t.wb.derive();
    expect(t.wb.blockLevel('greyfen')).toBe(18);
    expect(t.flags.get('warmth.block.greyfen.level')).toBe(18);
  });

  it('P of 0 or NaN reads as no level; a NaN or 0 L reads as unlocked', () => {
    const t = setup();
    for (const bad of [0, NaN]) {
      t.enemies.blockPreview = () => bad;
      expect(t.wb.lockBlock('greyfen')).toBeUndefined();
      expect(t.wb.preview('greyfen')).toBeUndefined();
    }
    t.enemies.blockLevel = () => NaN;
    expect(t.wb.blockLevel('greyfen')).toBeUndefined();
    expect(t.wb.rewardScale('m24')).toBe(1);
    t.enemies.blockLevel = () => 0;
    expect(t.wb.rewardScale('m24')).toBe(1);
  });

  it('works with the enemies service missing', () => {
    const t = setup({ enemies: () => undefined });
    t.wb.onQuestStarted('m23');
    t.wb.derive();
    expect(t.wb.lockBlock('greyfen')).toBeUndefined();
    expect(t.wb.preview('greyfen')).toBeUndefined();
    expect(t.wb.rewardScale('m24')).toBe(1);
  });
});

describe('WarmthBlocks: load and drift', () => {
  it('a lock with no flag writes the flag (the ?act3= jump locks through the enemies service)', () => {
    const t = setup();
    t.enemies.locks['dragonspine-lower'] = 20;
    t.wb.derive();
    expect(t.flags.get('warmth.block.dragonspine-lower.level')).toBe(20);
  });

  it('a save keeps L: after a load that restores the lock the flag still matches', () => {
    const t = setup();
    t.wb.onQuestStarted('m23');
    const savedLocks = { ...t.enemies.locks };
    const savedFlags = new Map(t.flags);
    const u = setup();
    u.enemies.locks = savedLocks;
    for (const [k, v] of savedFlags) u.flags.set(k, v);
    u.enemies.W = 6;
    u.wb.derive();
    expect(u.wb.blockLevel('greyfen')).toBe(18);
    expect(u.writes).toEqual([]);
  });

  it('a lock missing on load (damaged spawner entry) is restored from the flag, not from the preview', () => {
    const t = setup();
    t.flags.set('warmth.block.greyfen.level', 21);
    t.enemies.W = 3;
    t.wb.derive();
    expect(t.enemies.locks.greyfen).toBe(21);
    expect(t.writes).toEqual([]);
  });

  it('neither lock nor flag, lock quest active or completed: locks at the preview; inactive: nothing', () => {
    const t = setup();
    t.wb.derive();
    expect(t.enemies.locks).toEqual({});
    t.quests.set('m23', 'active');
    t.quests.set('m28', 'completed');
    t.wb.derive();
    expect(t.enemies.locks).toEqual({ greyfen: 18, 'dragonspine-lower': 20 });
  });
});

describe('WarmthBlocks: rewardScale', () => {
  const locked = (g?: number, s?: number) => {
    const t = setup();
    if (g !== undefined) t.enemies.locks.greyfen = g;
    if (s !== undefined) t.enemies.locks['dragonspine-lower'] = s;
    return t;
  };

  it('is 21/18 for Greyfen second and 20/23 for the spine first', () => {
    expect(locked(21).wb.rewardScale('m24')).toBeCloseTo(21 / 18, 10);
    expect(locked(undefined, 20).wb.rewardScale('m29')).toBeCloseTo(20 / 23, 10);
    for (const q of ACT3_BLOCKS.greyfen.quests) expect(locked(21).wb.rewardScale(q)).toBeCloseTo(21 / 18, 10);
  });

  it('is 1 for m22, m31, other ids and the empty id', () => {
    const t = locked(21, 20);
    for (const q of ['m22', 'm31', 'r11', 'nope', '']) expect(t.wb.rewardScale(q)).toBe(1);
  });

  it('is 1 until the block is locked (no drifting preview), then L / L_rec', () => {
    const t = setup();
    expect(t.wb.rewardScale('r15')).toBe(1); // an R-quest of the spine, before M28
    t.enemies.W = 4; // the preview moves; the scale does not
    expect(t.wb.rewardScale('r15')).toBe(1);
    t.wb.onQuestStarted('m28');
    expect(t.wb.rewardScale('r15')).toBeCloseTo(23 / 23, 10);
    expect(t.enemies.locks['dragonspine-lower']).toBe(23);
  });

  it('is 1 for a recommended level of 0 or NaN', () => {
    for (const rec of [0, NaN, -5]) {
      const t = setup({ blocks: { greyfen: { recommended: rec, lockQuest: 'm23', quests: ['m24'] } } });
      t.enemies.locks.greyfen = 21;
      expect(t.wb.rewardScale('m24')).toBe(1);
    }
  });

  it('reaches QuestManager through questRewardScale: XP 600 x 21/18 = 700', () => {
    const t = setup();
    t.enemies.W = 4;
    t.wb.onQuestStarted('m23');
    expect(t.enemies.locks.greyfen).toBe(21);
    const scale = new QuestRewardScale();
    scale.setProvider((id) => t.wb.rewardScale(id));
    const handlers = new Map<string, ((p: unknown) => void)[]>();
    const bus: BusPort = {
      on: (type, l) => {
        handlers.set(type, [...(handlers.get(type) ?? []), l as never]);
        return () => {};
      },
      emit: (type, p) => {
        for (const l of handlers.get(type) ?? []) l(p);
      },
    };
    const xp: number[] = [];
    const m = new QuestManager({
      bus,
      state: {} as StatePort,
      playerId: () => 'p',
      progression: () => ({ grantXp: (n: number) => xp.push(n) }) as never,
      inventory: () => ({ addGold: () => {} }) as never,
      rewardScale: () => scale,
    });
    const def = (id: string): QuestDef => ({ id, titleKey: id, summaryKey: id, objectives: [{ id: 'o', type: 'talk', target: 'x', textKey: 'o' }], rewards: [{ xp: 600 }] });
    m.register(def('m24'));
    m.register(def('m22'));
    m.start('m24');
    m.complete('m24');
    m.start('m22');
    m.complete('m22');
    expect(xp).toEqual([700, 600]);
  });

  it('an R-quest completed before M28 pays x1; after M28 locks, a later one pays L / 23', () => {
    const t = setup();
    t.enemies.W = 4;
    const scale = new QuestRewardScale();
    scale.setProvider((id) => t.wb.rewardScale(id));
    const bus: BusPort = { on: () => () => {}, emit: () => {} };
    const xp: number[] = [];
    const m = new QuestManager({
      bus,
      state: {} as StatePort,
      playerId: () => 'p',
      progression: () => ({ grantXp: (n: number) => xp.push(n) }) as never,
      inventory: () => ({ addGold: () => {} }) as never,
      rewardScale: () => scale,
    });
    for (const id of ['r15', 'r16']) {
      m.register({ id, titleKey: id, summaryKey: id, objectives: [{ id: 'o', type: 'talk', target: 'x', textKey: 'o' }], rewards: [{ xp: 100 }] });
    }
    m.start('r15');
    m.complete('r15');
    t.wb.onQuestStarted('m28'); // W4, P18: L 23, so scale 1.0; use a lower recommended to see the change
    t.enemies.locks['dragonspine-lower'] = 46;
    m.start('r16');
    m.complete('r16');
    expect(xp).toEqual([100, 200]);
  });
});
