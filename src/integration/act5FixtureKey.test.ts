// N12 PR 1: the Act 5 fixture key (names, freshness), the jump on a loaded fixture (presets applied on load, nothing
// injected again) and the carried base's meta (pure; the booted checks are in act5Fixtures.test.ts).
import { describe, expect, it, vi } from 'vitest';
import { ACT5_FIXTURE_BASE_RUN, act5BaseName, act5ExtraName, act5FixtureDefIds, act5FixtureFresh, act5FixtureName } from './act5FixtureKey';
import { Act3FixtureStart } from './act3FixtureStart';
import { ACT5_PREREQS, ACT5_START_XP, Act5Jump, type Act5JumpPorts } from '../quests/act5Jump';
import { QUIET_TICKS } from '../quests/act4Jump';
import { snapshotFlag } from '../state/favour';
import { act5BaseMeta, ACT4_CARRIED_CHOICES } from './act5CarriedBase';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the Act 5 fixture key', () => {
  it('names fixtures by id, keeps the bases and extras apart, builds per-id fixtures on run A', () => {
    expect(act5FixtureName('m52')).toBe('act5-m52');
    expect(act5BaseName('b')).toBe('act5-carried-chain-b');
    expect(act5ExtraName('lava-stair-lip')).toBe('act5-extra-lava-stair-lip');
    expect(ACT5_FIXTURE_BASE_RUN).toBe('a');
    expect(act5FixtureDefIds('m52')).toEqual([...ACT5_PREREQS.m52, 'm52']);
    expect(act5FixtureDefIds('m47')).toEqual(['m47']);
  });

  it('is fresh only when the build knows exactly the defs the generator knew', () => {
    expect(act5FixtureFresh({ questDefs: ['m47'] }, ['m47'])).toBe(true);
    // a quest thread landed a def the generating build lacked: stale
    expect(act5FixtureFresh({ questDefs: [] }, ['m47'])).toBe(false);
    expect(act5FixtureFresh({ questDefs: ['m47', 'm48'] }, ['m48'])).toBe(false);
  });

  it('is stale when the jump would now inject other quests than the meta records', () => {
    const defs = act5FixtureDefIds('m49');
    expect(act5FixtureFresh({ id: 'm49', injected: [...ACT5_PREREQS.m49], questDefs: defs }, defs)).toBe(true);
    expect(act5FixtureFresh({ id: 'm49', injected: ['m47'], questDefs: defs }, defs)).toBe(false);
  });

  it('drives the shared fixture start: stale falls back to injection, fresh loads', async () => {
    const warn = vi.fn();
    const loadFile = vi.fn(async () => true);
    const stale = new Act3FixtureStart('act5-m48', true, {
      find: async () => ({ name: 'act5-m48', save: {}, meta: { id: 'm48', injected: ['m47'], questDefs: [] } as never }),
      ready: () => true, known: () => ['m47', 'm48'], loadFile, warn, fresh: act5FixtureFresh,
    });
    stale.tick();
    await settle();
    expect(stale.tick()).toBe(true);
    expect(loadFile).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toMatch(/act5-m48 is stale/);
    const fresh = new Act3FixtureStart('act5-m48', true, {
      find: async () => ({ name: 'act5-m48', save: { s: 1 }, meta: { id: 'm48', injected: ['m47'], questDefs: ['m47', 'm48'] } as never }),
      ready: () => true, known: () => ['m47', 'm48'], loadFile, warn, fresh: act5FixtureFresh,
    });
    fresh.tick();
    await settle();
    expect(fresh.tick()).toBe(false);
    await settle();
    expect(fresh.state).toBe('loaded');
    expect(loadFile).toHaveBeenCalledWith({ s: 1 });
  });
});

function ports() {
  const flags = new Map<string, unknown>();
  const favour = new Map<string, number>();
  const placed: unknown[] = [];
  const raw = {
    setFlag: vi.fn((k: string, v: boolean) => flags.set(k, v)),
    setFlagValue: (k: string, v: unknown) => flags.set(k, v),
    setFavourTo: (t: string, v: number) => favour.set(t, v),
    hasQuest: () => true,
    quests: { state: () => 'inactive', start: vi.fn(), complete: vi.fn(() => true) },
    warn: vi.fn(),
    topUpXp: vi.fn(),
    closeDialogue: () => false,
    quiet: vi.fn(),
    giverPose: () => undefined,
    placePose: (at: unknown) => (placed.push(at), true),
  };
  return { p: raw as unknown as Act5JumpPorts, raw, flags, favour, placed };
}
const run = (j: Act5Jump) => { for (let i = 0; i < QUIET_TICKS + 5 && !j.finished; i++) j.tick(); };

describe('the jump on a loaded fixture', () => {
  it('&favour=keepers on act5-m52: the preset and the M52 snapshot, nothing injected or topped up again', () => {
    const t = ports();
    const j = new Act5Jump('m52', t.p, 'knight', 'keepers').onLoadedFixture();
    run(j);
    expect(j.finished).toBe(true);
    expect(t.raw.quests.complete).not.toHaveBeenCalled();
    expect(t.raw.topUpXp).not.toHaveBeenCalled();
    expect(t.raw.setFlag).not.toHaveBeenCalled();
    expect(t.flags.get('story.m21.choice')).toBe('spy');
    expect([21, 52, 34, 51, 53]).toEqual(['halvard', 'oswin', 'grisel', 'dragons', 'ashwalkers'].map((k) => t.flags.get(snapshotFlag('m52', k as never))));
    expect(t.favour.get('ashwalkers')).toBe(53);
    expect(t.placed).toHaveLength(1);
  });
  it('without a preset it only quiets and places', () => {
    const t = ports();
    run(new Act5Jump('m48', t.p).onLoadedFixture());
    expect(t.flags.size).toBe(0);
    expect(t.favour.size).toBe(0);
    expect(t.placed).toHaveLength(1);
  });
  it('the top-up target is the measured 98,800', () => expect(ACT5_START_XP).toBe(98_800));
});

describe('the carried base meta', () => {
  const live = (flags: Record<string, unknown>) => ({
    level: 30, xp: 87_604.4, scars: 2, favour: (t: string) => ({ halvard: 33 } as Record<string, number>)[t] ?? 0,
    flag: (k: string) => flags[k], hasQuest: (id: string) => id !== 'r25',
  });
  it('records level, rounded XP, Scars, favour, choices and every trail (Phase H over Phase G on a clash)', () => {
    const t = (n: number) => ({ talks: [{ npc: 'x', nodes: n }], scripted: [], order: [], extra: 1 } as never);
    const m = act5BaseMeta('a', live({ 'story.r24.choice': 'all', 'story.m31.choice': 7 }), { deaths: 0 }, { m42: t(3), m41: t(9) }, { trails: { m41: t(1), m35: t(2) } });
    expect(m).toMatchObject({ fixture: 'act5-carried-chain-a.json', run: 'a', level: 30, xp: 87_604, scars: 2, deaths: 0 });
    expect(m.favour).toEqual({ halvard: 33, oswin: 0, grisel: 0, dragons: 0, ashwalkers: 0 });
    expect(m.choices['story.r24.choice']).toBe('all');
    expect(m.choices['story.m31.choice']).toBeUndefined(); // non-string flags are not choices
    expect(Object.keys(m.choices).sort()).toEqual([...ACT4_CARRIED_CHOICES].sort());
    expect(Object.keys(m.trails).sort()).toEqual(['m35', 'm41', 'm42']);
    expect((m.trails.m41 as { talks: { nodes: number }[] }).talks[0].nodes).toBe(9);
    expect(m.trails.m41).not.toHaveProperty('extra');
    expect(m.act4QuestDefs).not.toContain('r25');
  });
  it('an empty Phase G meta still yields the run\'s own trails', () => {
    const m = act5BaseMeta('b', live({}), { deaths: 1 }, {}, { trails: undefined as never });
    expect(m.trails).toEqual({});
    expect(m.deaths).toBe(1);
  });
});
