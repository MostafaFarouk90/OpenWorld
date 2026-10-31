/**
 * The committed Act 3 `?act3=` fixtures (K16): every quest id in both block orders is present, each save says what its
 * meta says (read without a boot), and the generator is deterministic (two runs of a sample, byte-identical). The full
 * drift check against the committed files is `CHECK_FIXTURES=1` (act3FixturesGen.ts); loads on the real save plugin are in
 * act3Containment.e2e.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACT3_ARRIVAL, ACT3_JUMP_IDS, ACT3_ORDERS, ACT3_PREREQS, ACT3_SHRINE_AFTER, blockOf, needsDragonspine } from '../quests/act3Jump';
import { act3FixtureName, type Act3FixtureMeta } from './act3FixtureKey';
import { generateAct3Fixture } from './act3Fixtures';
import { seedFixtureRandom } from './fixtureDeterminism';
import { PEAKS_CARD_SEEN_FLAG } from './phaseECard';
import { blockLevelFlag } from '../shrine/warmthBlocks';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act3/*.json', { eager: true, import: 'default' });
const file = (name: string) => FILES[`../save/__fixtures__/act3/${name}`];
const CASES = ACT3_ORDERS.flatMap((order) => ACT3_JUMP_IDS.map((id) => [order, id] as const));
type Flags = Record<string, unknown>;
const flagsOf = (save: Record<string, unknown>): Flags =>
  ((save.entries as Record<string, { data: { flags: Flags } }>)['world-state'].data.flags);

describe('the committed Act 3 fixtures', () => {
  it('are exactly one save and one meta per quest id and order', () => {
    const want = CASES.flatMap(([o, id]) => [`${act3FixtureName(o, id)}.json`, `${act3FixtureName(o, id)}.meta.json`]).sort();
    expect(Object.keys(FILES).map((k) => k.split('/').pop()!).sort()).toEqual(want);
  });

  it.each(CASES)('%s %s: the save holds what its meta and the jump rules say', (order, id) => {
    const name = act3FixtureName(order, id);
    const meta = file(`${name}.meta.json`) as unknown as Act3FixtureMeta;
    const save = file(`${name}.json`);
    expect(meta.fixture).toBe(`${name}.json`);
    expect([meta.id, meta.order]).toEqual([id, order]);
    expect(meta.injected).toEqual(ACT3_PREREQS[order][id]);
    const flags = flagsOf(save);
    expect(flags['story.gate.a3']).toBe(true);
    expect(flags['story.gate.a4']).toBeUndefined();
    expect(flags['codex.actEnding.a2.seen']).toBe(true);
    for (const q of meta.injected) expect(flags[`story.${q}.complete`], q).toBe(true);
    expect(flags[`story.${id}.complete`]).toBeUndefined();
    for (const [q, shrine] of Object.entries(ACT3_SHRINE_AFTER)) expect(flags[shrine] === true, shrine).toBe(meta.injected.includes(q));
    expect(flags['story.phase.dragonspineOpen'] === true).toBe(needsDragonspine(id, order));
    // A real play saw the "peaks are next" card at D05; the jump marks it seen, so it never pops over the arrival.
    expect(flags[PEAKS_CARD_SEEN_FLAG] === true).toBe(meta.injected.includes('d05'));
    for (const [block, level] of Object.entries(meta.lockedBlocks)) expect(flags[blockLevelFlag(block)], block).toBe(level);
    expect(Object.keys(meta.lockedBlocks).sort()).toEqual(
      [meta.injected.includes('m23') && 'greyfen', meta.injected.includes('m28') && 'dragonspine-lower'].filter(Boolean).sort(),
    );
    const pos = (save.entries as Record<string, { data: { x: number; z: number } }>)['player-position'].data;
    expect({ x: pos.x, z: pos.z }).toEqual(ACT3_ARRIVAL[blockOf(id)!]);
    const prog = (save.entries as Record<string, { data: { xp: number } }>).progression.data;
    expect(prog.xp).toBeGreaterThanOrEqual(23_500);
  });

  it('lock the second block above the first (it sees the first block\'s Warmth and the player\'s growth)', () => {
    const g = file(`${act3FixtureName('greyfen', 'd06')}.meta.json`) as unknown as Act3FixtureMeta;
    const s = file(`${act3FixtureName('spine', 'd06')}.meta.json`) as unknown as Act3FixtureMeta;
    expect(g.lockedBlocks['dragonspine-lower']).toBeGreaterThanOrEqual(s.lockedBlocks['dragonspine-lower']);
    expect(s.lockedBlocks.greyfen).toBeGreaterThanOrEqual(g.lockedBlocks.greyfen);
  });
});

describe('the generator is deterministic', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  // One lock in the Greyfen; and both blocks locked with the Dragonspine open.
  it.each([['greyfen', 'm24'], ['spine', 'm31']] as const)('%s %s: two runs write identical bytes', async (order, id) => {
    const run = async () => {
      seedFixtureRandom();
      const out = await generateAct3Fixture(id, order);
      vi.restoreAllMocks();
      return JSON.stringify(out);
    };
    const a = await run();
    const b = await run();
    expect(b).toBe(a);
  }, 120_000);
});
