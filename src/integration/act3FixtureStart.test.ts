import { describe, expect, it, vi } from 'vitest';
import { Act3FixtureStart, type Act3FixtureStartPorts } from './act3FixtureStart';
import { act3FixtureFresh, act3FixtureName, chooseAct3Start, fixtureDefIds, knownQuestDefs } from './act3FixtureKey';
import { ACT3_PREREQS } from '../quests/act3Jump';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the fixture key', () => {
  it('names a fixture by order and id', () => {
    expect(act3FixtureName('greyfen', 'm23')).toBe('act3-greyfen-m23');
    expect(act3FixtureName('spine', 'd06')).toBe('act3-spine-d06');
  });

  it('keys freshness on the injected quests and the target', () => {
    expect(fixtureDefIds('m24', 'greyfen')).toEqual(['m23', 'm24']);
    expect(fixtureDefIds('m23', 'spine')).toEqual([...ACT3_PREREQS.spine.m23, 'm23']);
    expect(knownQuestDefs((id) => id === 'm24' || id === 'm23', ['m24', 'r12', 'm23'])).toEqual(['m23', 'm24']);
  });

  it('is fresh only when the build knows exactly the defs the generator knew', () => {
    expect(act3FixtureFresh({ questDefs: [] }, [])).toBe(true);
    expect(act3FixtureFresh({ questDefs: ['m23', 'm24'] }, ['m24', 'm23'])).toBe(true);
    expect(act3FixtureFresh({ questDefs: [] }, ['m23'])).toBe(false);
    expect(act3FixtureFresh({ questDefs: ['m23'] }, [])).toBe(false);
    expect(act3FixtureFresh({ questDefs: ['m23'] }, ['m24'])).toBe(false);
  });

  it('is stale when the jump would now inject other quests than the meta records', () => {
    expect(act3FixtureFresh({ questDefs: [], id: 'm24', order: 'greyfen', injected: ['m23'] }, [])).toBe(true);
    expect(act3FixtureFresh({ questDefs: [], id: 'm24', order: 'greyfen', injected: [] }, [])).toBe(false);
    expect(act3FixtureFresh({ questDefs: [], id: 'm24', order: 'greyfen', injected: ['m23', 'r14'] }, [])).toBe(false);
  });

  it('chooses the fixture when present and fresh, injection otherwise, with the reason', () => {
    expect(chooseAct3Start('n', true, { questDefs: [] }, [])).toEqual({ use: 'fixture' });
    expect(chooseAct3Start('n', false, { questDefs: [] }, [])).toEqual({ use: 'inject', reason: '&fixture=0' });
    expect(chooseAct3Start('n', true, null, [])).toEqual({ use: 'inject', reason: 'no fixture n' });
    const stale = chooseAct3Start('n', true, { questDefs: [] }, ['m23']);
    expect(stale.use).toBe('inject');
    expect(stale.use === 'inject' && stale.reason).toMatch(/fixture n is stale .*\[\].*\[m23\]\); regenerate it/);
  });
});

describe('Act3FixtureStart', () => {
  const ports = (over: Partial<Act3FixtureStartPorts> = {}): Act3FixtureStartPorts & { warn: ReturnType<typeof vi.fn> } => ({
    find: async () => ({ name: 'n', save: { s: 1 }, meta: { questDefs: [] } }),
    ready: () => true,
    known: () => [],
    loadFile: vi.fn(async () => true),
    warn: vi.fn(),
    ...over,
  }) as never;

  it('loads a fresh fixture once and never lets the jump run', async () => {
    const p = ports();
    const s = new Act3FixtureStart('n', true, p);
    expect(s.tick()).toBe(false);
    await settle();
    expect(s.tick()).toBe(false);
    expect(s.state).toBe('loading');
    await settle();
    expect(s.state).toBe('loaded');
    expect(s.tick()).toBe(false);
    expect(p.loadFile).toHaveBeenCalledTimes(1);
    expect(p.loadFile).toHaveBeenCalledWith({ s: 1 });
    expect(p.warn).not.toHaveBeenCalled();
  });

  it('waits for the boot to settle before deciding', async () => {
    let ready = false;
    const p = ports({ ready: () => ready });
    const s = new Act3FixtureStart('n', true, p);
    await settle();
    expect(s.tick()).toBe(false);
    expect(s.state).toBe('deciding');
    ready = true;
    s.tick();
    expect(s.state).toBe('loading');
  });

  it('injects at once with &fixture=0, and never looks for the fixture', () => {
    const find = vi.fn();
    const s = new Act3FixtureStart('n', false, ports({ find }));
    expect(s.tick()).toBe(true);
    expect(find).not.toHaveBeenCalled();
  });

  it('falls back to injection, with a warning, for a missing, unreadable, stale or failed fixture', async () => {
    const cases: [string, Partial<Act3FixtureStartPorts>, RegExp][] = [
      ['missing', { find: async () => null }, /no fixture n/],
      ['unreadable', { find: () => Promise.reject(new Error('404')) }, /no fixture n/],
      ['stale', { known: () => ['m23'] }, /stale/],
      ['refused', { loadFile: async () => false }, /did not load/],
      ['throws', { loadFile: () => Promise.reject(new Error('x')) }, /failed to load/],
      ['no loader', { loadFile: undefined }, /cannot load a file/],
    ];
    for (const [what, over, msg] of cases) {
      const p = ports(over);
      const s = new Act3FixtureStart('n', true, p);
      s.tick();
      await settle();
      s.tick();
      await settle();
      expect(s.tick(), what).toBe(true);
      expect(s.state, what).toBe('inject');
      expect(String(p.warn.mock.calls[0]?.[0]), what).toMatch(msg);
    }
  });
});
