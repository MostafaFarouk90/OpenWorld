import { describe, expect, it } from 'vitest';
import { ACT3_BLOCKS, blockBaseLevel, type Act3BlockId } from '../../enemies/level';
import { WarmthBlocks, blockLevelFlag, type WarmthBlocksEnemies } from '../../shrine/warmthBlocks';
import { BLOCK_LOCKED_KEY, BLOCK_PREVIEW_KEY, BLOCK_REGIONS, blockChips, blockChipsKey, blockTone, type BlockChipPorts } from './blockChips';
import { MAP_ACT3_STRINGS_EN } from './strings.en';

const BLOCKS = Object.keys(ACT3_BLOCKS) as Act3BlockId[];

/** K9's real WarmthBlocks over a fake enemies service that holds the lock like the spawners' save does. */
function world(opts: { player?: number; warmth?: number } = {}) {
  const s = { player: opts.player ?? 20, warmth: opts.warmth ?? 3, locks: new Map<Act3BlockId, number>(), flags: new Map<string, number>(), quests: new Map<string, string>() };
  const enemies: WarmthBlocksEnemies = {
    lockBlockLevel: (b, level) => {
      if (!s.locks.has(b as Act3BlockId)) s.locks.set(b as Act3BlockId, level);
      return s.locks.get(b as Act3BlockId);
    },
    blockLevel: (b) => s.locks.get(b),
    blockPreview: (b) => blockBaseLevel(b, s.warmth, s.player),
  };
  const warmth = new WarmthBlocks({ enemies: () => enemies, questState: (id) => s.quests.get(id), flag: (k) => s.flags.get(k), setFlag: (k, v) => void s.flags.set(k, v) });
  const open = ['brightwater', 'harrowmark', 'greyfen', 'dragonspine'] as const;
  const chips = (extra: Partial<BlockChipPorts> = {}) => blockChips({ open: [...open], warmth, playerLevel: s.player, questState: (id) => s.quests.get(id), ...extra });
  const chip = (b: Act3BlockId) => chips().find((c) => c.block === b);
  return { s, warmth, chips, chip };
}

describe('blockTone (design 5.9 against the live player level P)', () => {
  it('gold at or under P, orange for P+1 to P+3, red for P+4 or more', () => {
    const P = 20;
    expect(blockTone(P - 5, P)).toBe('gold');
    expect(blockTone(P, P)).toBe('gold');
    expect(blockTone(P + 1, P)).toBe('orange');
    expect(blockTone(P + 3, P)).toBe('orange');
    expect(blockTone(P + 4, P)).toBe('red');
    expect(blockTone(P + 9, P)).toBe('red');
  });
});

describe('blockChips', () => {
  it('shows the preview before the lock, with the player level in the text', () => {
    const w = world({ player: 20, warmth: 3 });
    const c = w.chip('greyfen')!;
    expect(c.locked).toBe(false);
    expect(c.textKey).toBe(BLOCK_PREVIEW_KEY);
    expect(c.level).toBe(blockBaseLevel('greyfen', 3, 20));
    expect(c.params).toEqual({ level: c.level, player: 20 });
    expect(c.top).toBe(c.level + ACT3_BLOCKS.greyfen.span);
    expect(MAP_ACT3_STRINGS_EN[c.textKey]).toBe('Tuned for level {level}. You are level {player}.');
  });

  it('shows the locked level and its span after the lock, even when the preview would move', () => {
    const w = world({ player: 20, warmth: 3 });
    const before = w.chip('greyfen')!.level;
    w.warmth.lockBlock('greyfen');
    w.s.player = 28; // a level up after the lock: the preview would rise, the lock must not
    w.s.warmth = 6;
    const c = w.chip('greyfen')!;
    expect(c.locked).toBe(true);
    expect(c.level).toBe(before);
    expect(c.top).toBe(before + 5);
    expect(c.textKey).toBe(BLOCK_LOCKED_KEY);
    expect(c.params).toEqual({ level: before, top: before + 5 });
    // The tone follows the live player level.
    expect(c.tone).toBe(blockTone(before, 28));
  });

  it('works in both block orders: Greyfen first, then the lower slopes, and the reverse', () => {
    for (const order of [BLOCKS, [...BLOCKS].reverse()]) {
      const w = world({ player: 22, warmth: 2 });
      expect(w.chips().map((c) => [c.block, c.locked])).toEqual(BLOCKS.map((b) => [b, false]));
      const lockedLevels = new Map<Act3BlockId, number>();
      for (const b of order) {
        w.s.warmth += 1; // the Warmth tier moves between the two locks
        lockedLevels.set(b, w.warmth.lockBlock(b)!);
        // The block just locked shows its level; the other one is still a live preview.
        for (const other of BLOCKS) {
          const c = w.chip(other)!;
          expect(c.locked).toBe(lockedLevels.has(other));
          if (c.locked) expect(c.level).toBe(lockedLevels.get(other));
          else expect(c.level).toBe(blockBaseLevel(other, w.s.warmth, 22));
        }
      }
    }
  });

  it('re-derives after save.loaded: the lock comes back from its flag and the chip shows it', () => {
    const w = world({ player: 20, warmth: 3 });
    const L = w.warmth.lockBlock('dragonspine-lower')!;
    expect(w.s.flags.get(blockLevelFlag('dragonspine-lower'))).toBe(L);
    // A load: the spawners' save is replaced (the lock is gone) but the numeric flag came back with the world state.
    w.s.locks.clear();
    w.s.warmth = 7;
    expect(w.chip('dragonspine-lower')!.locked).toBe(false);
    w.warmth.derive();
    const c = w.chip('dragonspine-lower')!;
    expect(c.locked).toBe(true);
    expect(c.level).toBe(L);
    // Read in the other order too: the chips are read first (live preview), derive afterwards.
    w.s.locks.clear();
    expect(w.chip('dragonspine-lower')!.level).not.toBe(L);
    w.warmth.derive();
    expect(w.chip('dragonspine-lower')!.level).toBe(L);
  });

  it('tone boundaries at P, P+1, P+3 and P+4 on the chip itself', () => {
    const P = 20;
    const make = (level: number) => blockChips({ open: ['greyfen'], warmth: { preview: () => level }, playerLevel: P, questState: () => 'inactive' })[0]!;
    expect(make(P).tone).toBe('gold');
    expect(make(P + 1).tone).toBe('orange');
    expect(make(P + 3).tone).toBe('orange');
    expect(make(P + 4).tone).toBe('red');
  });

  it('a level up changes the tone at once, with no event', () => {
    const w = world({ player: 14, warmth: 5 });
    w.warmth.lockBlock('greyfen');
    const L = w.chip('greyfen')!.level;
    expect(w.chip('greyfen')!.tone).toBe('red'); // the lock sits P + 5 over a level 14 player
    w.s.player = L - 3;
    expect(w.chip('greyfen')!.tone).toBe('orange');
    w.s.player = L;
    expect(w.chip('greyfen')!.tone).toBe('gold');
    w.s.player = L - 4;
    expect(w.chip('greyfen')!.tone).toBe('red');
  });

  it('stays until every quest of the block is completed, read from the table', () => {
    for (const b of BLOCKS) {
      const quests = ACT3_BLOCKS[b].quests;
      expect(quests.length).toBeGreaterThan(1);
      const w = world();
      w.warmth.lockBlock(b);
      // Completing all but one (any one) keeps the chip.
      for (const skipped of quests) {
        w.s.quests.clear();
        for (const q of quests) if (q !== skipped) w.s.quests.set(q, 'completed');
        expect(w.chip(b), `${b} without ${skipped}`).toBeDefined();
      }
      // The last main quest alone does not hide it (D05 and the R quests are still open).
      w.s.quests.clear();
      w.s.quests.set(quests.filter((q) => /^m\d+$/.test(q)).at(-1)!, 'completed');
      expect(w.chip(b)).toBeDefined();
      for (const q of quests) w.s.quests.set(q, 'completed');
      expect(w.chip(b)).toBeUndefined();
      // An active or failed quest is not completed.
      w.s.quests.set(quests[0]!, 'failed');
      expect(w.chip(b)).toBeDefined();
    }
  });

  it("hides a block whose region is not open; the other block's chip is unaffected", () => {
    const w = world();
    expect(w.chips({ open: ['brightwater', 'harrowmark'] })).toEqual([]);
    expect(w.chips({ open: ['greyfen'] }).map((c) => c.block)).toEqual(['greyfen']);
    expect(w.chips({ open: ['dragonspine'] }).map((c) => c.block)).toEqual(['dragonspine-lower']);
  });

  it('hides when no level is known: no service, no player level, NaN, a throwing service', () => {
    const w = world();
    expect(w.chips({ warmth: undefined })).toEqual([]);
    expect(w.chips({ playerLevel: undefined })).toEqual([]);
    expect(w.chips({ playerLevel: NaN })).toEqual([]);
    expect(w.chips({ warmth: {} })).toEqual([]); // K9's block methods missing
    expect(w.chips({ warmth: { preview: () => NaN } })).toEqual([]);
    expect(w.chips({ warmth: { preview: () => undefined, blockLevel: () => undefined } })).toEqual([]);
    expect(w.chips({ warmth: { preview: () => { throw new Error('x'); } } })).toEqual([]);
    expect(w.chips({ questState: () => { throw new Error('x'); } }).length).toBe(2);
  });

  it('the legend warning flag is on only while the player stands in an unstarted block', () => {
    const w = world();
    expect(w.chips({ player: { x: 0, z: 0 } }).some((c) => c.here)).toBe(false);
    const box = (id: 'greyfen' | 'dragonspine') => w.chip(id === 'greyfen' ? 'greyfen' : 'dragonspine-lower')!;
    const centre = box('greyfen');
    const here = w.chips({ player: { x: centre.x, z: centre.z } });
    expect(here.find((c) => c.block === 'greyfen')!.here).toBe(true);
    expect(here.find((c) => c.block === 'dragonspine-lower')!.here).toBe(false);
    w.warmth.lockBlock('greyfen');
    expect(w.chips({ player: { x: centre.x, z: centre.z } }).find((c) => c.block === 'greyfen')!.here).toBe(false);
    expect(w.chips({ player: { x: NaN, z: 0 } }).some((c) => c.here)).toBe(false);
  });

  it('chips sit on the region centres', () => {
    expect(BLOCK_REGIONS).toEqual({ greyfen: 'greyfen', 'dragonspine-lower': 'dragonspine' });
    const [a, b] = world().chips();
    expect(a!.x).not.toBe(b!.x);
  });
});

describe('blockChipsKey', () => {
  it('changes with a lock, a level up, a tone change or the player entering, and not otherwise', () => {
    const w = world({ player: 20, warmth: 3 });
    const k0 = blockChipsKey(w.chips());
    expect(blockChipsKey(w.chips())).toBe(k0);
    w.s.player = 21;
    const k1 = blockChipsKey(w.chips());
    expect(k1).not.toBe(k0);
    w.warmth.lockBlock('greyfen');
    const k2 = blockChipsKey(w.chips());
    expect(k2).not.toBe(k1);
    w.s.player = 22;
    expect(blockChipsKey(w.chips())).not.toBe(k2);
    expect(blockChipsKey([])).toBe('');
  });
});
