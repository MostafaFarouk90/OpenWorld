/**
 * The committed Act 5 `?act5=` fixtures (N12 PR 1): every Act 5 quest id has one, each save says what its meta says (read
 * without a boot), the carried bases are real Phase H chain ends, the generator is deterministic (two runs of a sample are
 * byte-identical and match the committed file), and a loaded fixture takes each favour preset to the design's snapshot.
 * The full drift check is `CHECK_FIXTURES=1` (act5FixturesGen.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACT5_JUMP_IDS, ACT5_PREREQS, ACT5_PRESET_FAVOUR, ACT5_START_XP, ACT5_PHASE_J_START_XP, Act5Jump, act5PhaseOf, act5StartXpFor } from '../quests/act5Jump';
import { act5JumpPorts } from '../quests/act5Jump.plugin';
import { ACT4_JUMP_IDS } from '../quests/act4Jump';
import { actEnding } from './actEndings';
import { ACT5_FIXTURE_BASE_RUN, act5BaseName, act5ExtraName, act5FixtureName, type Act5BaseMeta, type Act5FixtureMeta } from './act5FixtureKey';
import { ACT5_EXTRAS, generateAct5Fixture } from './act5Fixtures';
import { act5FixtureText } from './act5CarriedBase';
import { bootFromSave } from './chapterHarness';
import { seedFixtureRandom } from './fixtureDeterminism';
import { xpForLevel } from '../progression/tuning';
import { ACT5_GATE_FLAG, FOUNDRY_OPEN_FLAG, RIM_GATE_OPEN_FLAG } from '../region/act5Regions';
import { FAVOUR_TRACKS, snapshotFlag } from '../state/favour';


const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act5/*.json', { eager: true, import: 'default' });
const file = (name: string) => FILES[`../save/__fixtures__/act5/${name}`];
type Flags = Record<string, unknown>;
const flagsOf = (save: Record<string, unknown>): Flags => (save.entries as Record<string, { data: { flags: Flags } }>)['world-state'].data.flags;

describe('the carried Act 5 bases', () => {
  it.each(['a', 'b'] as const)('run %s is the end of a real Act 4 chain: every Act 4 quest done, the ending and camp seen, gate a5', (run) => {
    const base = file(`${act5BaseName(run)}.json`)!;
    const meta = file(`${act5BaseName(run)}.meta.json`) as unknown as Act5BaseMeta;
    expect(base && meta, `${act5BaseName(run)} committed`).toBeTruthy();
    const f = flagsOf(base);
    for (const q of ACT4_JUMP_IDS) expect(f[`story.${q}.complete`], q).toBe(true);
    const a4 = actEnding(4)!;
    expect(f[a4.gateFlag]).toBe(true);
    expect(f[ACT5_GATE_FLAG]).toBe(true);
    expect(f[a4.campSeenFlag]).toBe(true);
    expect(f[RIM_GATE_OPEN_FLAG]).toBeUndefined();
    expect(meta.act4QuestDefs.sort()).toEqual([...ACT4_JUMP_IDS].sort());
    // earned by the chain, not the jump's floor
    expect(meta.level).toBeGreaterThanOrEqual(30);
    expect(meta.xp).toBeGreaterThanOrEqual(xpForLevel(meta.level));
    expect(meta.xp).toBeLessThan(ACT5_START_XP);
    expect(meta.deaths).toBe(0);
    expect(Object.keys(meta.trails).sort()).toEqual([...ACT4_JUMP_IDS].sort());
    expect(meta.choices['story.r24.choice']).toBe(run === 'a' ? 'all' : 'half');
    expect(meta.choices['boss.eormen.outcome']).toBe(run === 'a' ? 'defeated' : 'released');
  });
});

describe('the committed Act 5 fixtures', () => {
  const baseMeta = file(`${act5BaseName(ACT5_FIXTURE_BASE_RUN)}.meta.json`) as unknown as Act5BaseMeta;
  it.each([...ACT5_JUMP_IDS])('%s says what its meta says', (id) => {
    const save = file(`${act5FixtureName(id)}.json`);
    const meta = file(`${act5FixtureName(id)}.meta.json`) as unknown as Act5FixtureMeta | undefined;
    expect(save && meta, `${act5FixtureName(id)} committed`).toBeTruthy();
    expect(meta!.id).toBe(id);
    expect(meta!.injected).toEqual([...ACT5_PREREQS[id]]);
    expect(meta!.base).toEqual({ fixture: baseMeta.fixture, level: baseMeta.level, xp: baseMeta.xp });
    const f = flagsOf(save!);
    expect(f[ACT5_GATE_FLAG]).toBe(true);
    for (const q of meta!.injected) expect(f[`story.${q}.complete`], q).toBe(true);
    expect(f[`story.${id}.complete`], 'the target itself is not done').not.toBe(true);
    expect(meta!.rimGateOpen).toBe(id !== 'm47');
    // N12 PR 2 retired the Phase I hold: no fixture carries its flag, Phase J included
    expect(meta!.foundryOpen).toBe(false);
    expect(f[FOUNDRY_OPEN_FLAG]).toBeUndefined();
    // no preset is baked in: a snapshot is only one an injected quest took itself on completion (N10's M52 snapshot, from
    // the base's own favour, since N10's real M52 is in the stack); a preset applied on load writes the design's table
    const snaps = new Set(Object.keys(f).filter((k) => k.startsWith('favour.snapshot.')).map((k) => k.split('.')[2]));
    for (const q of snaps) expect(meta!.injected, `snapshot ${q}`).toContain(q);
    // Phase I targets start at 98,800, Phase J targets at their own 109,000 (ruling L1)
    expect(meta!.xp).toBeGreaterThanOrEqual(act5StartXpFor(id));
    if (act5PhaseOf(id) === 'J') expect(meta!.xp).toBeGreaterThanOrEqual(ACT5_PHASE_J_START_XP);
    else expect(meta!.xp).toBeLessThan(ACT5_PHASE_J_START_XP);
  });

  it('has nothing beyond the two bases, the 17 ids and the named extras', () => {
    const names = new Set(Object.keys(FILES).map((k) => k.split('/').pop()!.replace(/(\.meta)?\.json$/, '')));
    const want = new Set([act5BaseName('a'), act5BaseName('b'), ...ACT5_JUMP_IDS.map(act5FixtureName), ...ACT5_EXTRAS.map((e) => act5ExtraName(e.name))]);
    expect([...names].filter((n) => !want.has(n))).toEqual([]);
    for (const e of ACT5_EXTRAS) expect(names.has(act5ExtraName(e.name)), e.name).toBe(true);
  });
});

describe('Act 5 fixtures booted', () => {
  beforeEach(() => {
    for (const k of ['warn', 'info', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('two runs of m49 write the same bytes, equal to the committed file', async () => {
    const base = file(`${act5BaseName('a')}.json`)!;
    const meta = file(`${act5BaseName('a')}.meta.json`) as unknown as Act5BaseMeta;
    seedFixtureRandom();
    const a = await generateAct5Fixture(base, meta, 'm49');
    seedFixtureRandom();
    const b = await generateAct5Fixture(base, meta, 'm49');
    expect(act5FixtureText(a.save)).toBe(act5FixtureText(b.save));
    expect(act5FixtureText(a.meta)).toBe(act5FixtureText(b.meta));
    expect(act5FixtureText(a.save), 'act5-m49.json drifted: regenerate').toBe(act5FixtureText(file('act5-m49.json')));
  }, 240_000);

  it.each(['marshal', 'keepers'] as const)('act5-m52 with &favour=%s reads the design\'s M52 snapshot and live tracks', async (preset) => {
    const h = await bootFromSave(file('act5-m52.json')!, { models: false, virtualClock: true });
    try {
      expect(h.loaded).toBe(true);
      const jump = new Act5Jump('m52', act5JumpPorts(h.ctx), 'knight', preset).onLoadedFixture();
      h.ctx.systems.add({ id: 'n12-test-jump', fixedPhase: 'rules', order: 900, fixedUpdate: () => jump.tick() });
      for (let i = 0; i < 40 && !jump.finished; i++) await h.runAsync(30);
      expect(jump.finished).toBe(true);
      const want = ACT5_PRESET_FAVOUR[preset].m52;
      FAVOUR_TRACKS.forEach((t, i) => {
        expect(h.ctx.state.getFlag(snapshotFlag('m52', t)), t).toBe(want[i]);
        expect(h.ctx.state.favour(t), t).toBe(want[i]);
      });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
