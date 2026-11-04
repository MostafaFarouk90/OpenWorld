/**
 * The committed Act 3 `?act3=` fixtures (K16): every quest id in both block orders is present, each save says what its
 * meta says (read without a boot), and the generator is deterministic (two runs of a sample, byte-identical). The full
 * drift check against the committed files is `CHECK_FIXTURES=1` (act3FixturesGen.ts); loads on the real save plugin are in
 * act3Containment.e2e.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACT3_WAYSTONES } from '../region/act3/act3Places';
import { GREYFEN_LAYOUT } from '../greyfen/greyfen.layout';
import { DRAGONSPINE_LAYOUT } from '../dragonspine/dragonspine.layout';
import { ACT3_ARRIVAL, ACT3_ARRIVAL_WAYSTONE, act3JumpWaystones, ACT3_JUMP_IDS, ACT3_ORDERS, ACT3_PREREQS, ACT3_SHRINE_AFTER, blockOf } from '../quests/act3Jump';
import { act3FixtureFresh, act3FixtureName, fixtureDefIds, knownQuestDefs, type Act3FixtureMeta } from './act3FixtureKey';
import { questDefs } from '../quests/content';
import { generateAct3Fixture } from './act3Fixtures';
import { seedFixtureRandom } from './fixtureDeterminism';
import { PEAKS_CARD_SEEN_FLAG } from './phaseECard';
import { blockLevelFlag } from '../shrine/warmthBlocks';
import { ERA_FLASK, ERA_PARTY, ERA_TEMPER, wantsEraKit } from '../quests/act3EraKit';
import { getItem } from '../inventory/items';
import '../gear/catalog';
import '../gear/tier4/catalog';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act3/*.json', { eager: true, import: 'default' });
const file = (name: string) => FILES[`../save/__fixtures__/act3/${name}`];
const CASES = ACT3_ORDERS.flatMap((order) => ACT3_JUMP_IDS.map((id) => [order, id] as const));
type Flags = Record<string, unknown>;
const flagsOf = (save: Record<string, unknown>): Flags =>
  ((save.entries as Record<string, { data: { flags: Flags } }>)['world-state'].data.flags);

/** The Act 3 stones this build places (a `waystone.<id>` anchor in a block layout); the jump's rekindle skips one not placed. */
const PLACED = new Set(
  [...GREYFEN_LAYOUT.anchors, ...DRAGONSPINE_LAYOUT.anchors].map((a) => a.id).filter((a) => a.startsWith('waystone.')).map((a) => a.slice(9)),
);

describe('the committed Act 3 fixtures', () => {
  it('place every Act 3 stone but the summit\'s two (the Wyrm\'s Hearth and Frostfang Aerie come with the summit places)', () => {
    expect(Object.keys(ACT3_WAYSTONES).filter((w) => !PLACED.has(w)).sort()).toEqual(
      ['frostfang-aerie', 'wyrms-hearth'].filter((w) => !PLACED.has(w)),
    );
    for (const w of Object.values(ACT3_ARRIVAL_WAYSTONE)) expect(PLACED.has(w), w).toBe(true);
  });

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
    expect(flags['story.phase.dragonspineOpen']).toBeUndefined();
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
    // The Act 3 stones a player at this point has are lit, and no others; the respawn is the arrival stone (a first death
    // never sends the player back to Harrowmark).
    const ws = (save.entries as Record<string, { data: { lit: string[]; respawn: string | null } }>).waystones.data;
    const act3Lit = ws.lit.filter((w) => w in ACT3_WAYSTONES);
    expect(act3Lit.sort()).toEqual(act3JumpWaystones(id, order).filter((w) => PLACED.has(w)).sort());
    expect(ws.respawn).toBe(ACT3_ARRIVAL_WAYSTONE[blockOf(id)!]);
  });

  // K16 era kit (coordinator ruling 2026-11-03): Dragonspine and summit arrivals carry an L17 to L20 player's kit; the
  // Greyfen arrivals keep what Act 2 left them.
  it.each(CASES)('%s %s: carries the era kit when the target is in the Dragonspine or the summit', (order, id) => {
    const e = file(`${act3FixtureName(order, id)}.json`).entries as Record<string, { data: Record<string, any> }>;
    const inv = e.inventory.data;
    const weapon = getItem(inv.equipped.weapon)!;
    if (!wantsEraKit(blockOf(id))) {
      expect(inv.equipped.weapon).toBe('squires-arming-sword');
      expect(e.progression.data.learned).toEqual([]);
      return;
    }
    const block = blockOf(id) as 'spine' | 'summit';
    expect(weapon.gearTier).toBeGreaterThanOrEqual(3);
    for (const slot of ['weapon', 'offhand', 'armour']) {
      expect(getItem(inv.equipped[slot])?.gearTier ?? 0, slot).toBeGreaterThanOrEqual(3);
      expect(inv.gear?.[inv.equipped[slot]]?.temper ?? 0, slot).toBeGreaterThanOrEqual(slot === 'weapon' && inv.equipped.weapon === 'rimewood-haft' ? 0 : ERA_TEMPER[block]);
    }
    // The tempered Ashplate, not a fresh R12 reed armour (K13 review, 2026-11-03).
    expect(inv.equipped.armour).toBe('ashplate');
    expect(e.progression.data.learned.length).toBeGreaterThanOrEqual(9);
    expect(e.progression.data.bar.filter(Boolean).length).toBeGreaterThan(0);
    expect(inv.items[ERA_FLASK]).toBeGreaterThanOrEqual(getItem(ERA_FLASK)!.stackMax);
    expect(e.companions.data.active).toEqual(ERA_PARTY);
    expect(e.gear.data.anvilTiers).toEqual(expect.arrayContaining([2, 3]));
  });

  // Review M2: a fixture the build would refuse (a quest thread's defs landed, the prerequisites moved) fails here, so the
  // chain and the containment test never run on a save `?act3=` itself would not load. Fix: regenerate (act3FixturesGen.ts).
  it.each(CASES)('%s %s: is fresh for this build (its quest defs and injected list match)', (order, id) => {
    const meta = file(`${act3FixtureName(order, id)}.meta.json`) as unknown as Act3FixtureMeta;
    const has = (q: string) => questDefs.some((d) => d.id === q && d.objectives.length > 0);
    const known = knownQuestDefs(has, fixtureDefIds(id, order));
    expect(act3FixtureFresh(meta, known), `stale: generated with [${meta.questDefs}], this build knows [${known}]; regenerate`).toBe(true);
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
