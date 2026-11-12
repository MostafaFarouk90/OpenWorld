/**
 * The committed Act 4 `?act4=` fixtures (L13): every Act 4 quest id has one, each save says what its meta says (read without a
 * boot), the carried base is a real Act 3 chain end, and the generator is deterministic (two runs of a sample are
 * byte-identical and match the committed file). The full drift check is `CHECK_FIXTURES=1` (act4FixturesGen.ts); loads on
 * the real save plugin are in act4Containment.e2e.test.ts.
 */
import { phaseGEndName } from '../save/__fixtures__/act4';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACT4_JUMP_IDS, ACT4_PREREQS, ACT4_START_XP, WASTE_OPEN_FLAG } from '../quests/act4Jump';
import { ACT3_JUMP_IDS } from '../quests/act3Jump';
import { actEnding } from './actEndings';
import { ACT4_BASE_NAME, act4FixtureName, type Act4BaseMeta, type Act4FixtureMeta } from './act4FixtureKey';
import { generateAct4Fixture } from './act4Fixtures';
import { fixtureText } from './act4FixturesGen';
import { seedFixtureRandom } from './fixtureDeterminism';
import { xpForLevel } from '../progression/tuning';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act4/*.json', { eager: true, import: 'default' });
const file = (name: string) => FILES[`../save/__fixtures__/act4/${name}`];
type Flags = Record<string, unknown>;
const flagsOf = (save: Record<string, unknown>): Flags => (save.entries as Record<string, { data: { flags: Flags } }>)['world-state'].data.flags;

const base = file(`${ACT4_BASE_NAME}.json`)!;
const baseMeta = file(`${ACT4_BASE_NAME}.meta.json`) as unknown as Act4BaseMeta;

describe('the carried Act 4 base', () => {
  it('is the end of a real Act 3 chain: every Act 3 quest done, the ending and the camp seen, the Act 4 gate set', () => {
    expect(base, `${ACT4_BASE_NAME}.json is committed`).toBeTruthy();
    const f = flagsOf(base);
    for (const q of ACT3_JUMP_IDS) expect(f[`story.${q}.complete`], q).toBe(true);
    const a3 = actEnding(3)!;
    expect(f[a3.gateFlag]).toBe(true);
    expect(f[a3.campSeenFlag]).toBe(true);
    expect(f[WASTE_OPEN_FLAG]).toBeUndefined();
    expect(baseMeta.act3QuestDefs.sort()).toEqual([...ACT3_JUMP_IDS].sort());
    // Earned, not the Act 3 jump's 23,500 floor: the chain's own level and XP.
    expect(baseMeta.xp).toBeGreaterThan(40_000);
    expect(baseMeta.xp).toBeGreaterThanOrEqual(xpForLevel(baseMeta.level));
  });
});

describe('the committed Act 4 fixtures', () => {
  it.each([...ACT4_JUMP_IDS])('%s says what its meta says', (id) => {
    const save = file(`${act4FixtureName(id)}.json`);
    const meta = file(`${act4FixtureName(id)}.meta.json`) as unknown as Act4FixtureMeta | undefined;
    expect(save && meta, `${act4FixtureName(id)} committed`).toBeTruthy();
    expect(meta!.id).toBe(id);
    expect(meta!.injected).toEqual([...ACT4_PREREQS[id]]);
    expect(meta!.base).toEqual({ fixture: baseMeta.fixture, level: baseMeta.level, xp: baseMeta.xp });
    const f = flagsOf(save!);
    expect(f['story.gate.a4']).toBe(true);
    for (const q of meta!.injected) expect(f[`story.${q}.complete`], q).toBe(true);
    expect(f[`story.${id}.complete`], 'the target itself is not done').not.toBe(true);
    // The Phase G hold stands for Phase G ids; Phase H ids set it (until PR 2 retires it).
    // the Phase G hold is retired (L13 PR 2): no fixture carries it
    expect(meta!.wasteOpen).toBe(false);
    expect(f[WASTE_OPEN_FLAG]).toBeUndefined();
    // Topped up to plan 7.2's full-play start (a base above it would be left alone).
    expect(meta!.xp).toBeGreaterThanOrEqual(ACT4_START_XP);
  });

  it('has nothing beyond the base and the 21 ids (stale names are deleted on regeneration)', () => {
    const names = Object.keys(FILES).map((k) => k.split('/').pop()!.replace(/(\.meta)?\.json$/, ''));
    // plus Phase G's chain end saves, Phase H's start (phaseG.run.ts, SAVE_PHASE_G_END=1)
    const want = new Set([ACT4_BASE_NAME, ...ACT4_JUMP_IDS.map(act4FixtureName), phaseGEndName('a'), phaseGEndName('b')]);
    expect([...new Set(names)].filter((n) => !want.has(n) && !n.startsWith('act4-extra-') && n !== 'act4-l3-storm')).toEqual([]);
  });
});

describe('Act 4 fixture determinism', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('two runs of m38 write the same bytes, equal to the committed file', async () => {
    seedFixtureRandom();
    const a = await generateAct4Fixture(base, baseMeta, 'm38');
    seedFixtureRandom();
    const b = await generateAct4Fixture(base, baseMeta, 'm38');
    expect(fixtureText(a.save)).toBe(fixtureText(b.save));
    expect(fixtureText(a.meta)).toBe(fixtureText(b.meta));
    expect(fixtureText(a.save), 'act4-m38.json drifted: regenerate').toBe(fixtureText(file('act4-m38.json')));
  }, 240_000);
});
