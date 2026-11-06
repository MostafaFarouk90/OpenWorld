import { describe, expect, it, vi } from 'vitest';
import { act4FixtureDefIds, act4FixtureFresh, act4FixtureName, ACT4_BASE_NAME } from './act4FixtureKey';
import { Act3FixtureStart } from './act3FixtureStart';
import { ACT4_PREREQS } from '../quests/act4Jump';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the Act 4 fixture key', () => {
  it('names fixtures by id and keeps the base apart', () => {
    expect(act4FixtureName('m35')).toBe('act4-m35');
    expect(ACT4_BASE_NAME).not.toMatch(/^act4-(m|r|d)\d\d$/);
  });

  it('keys freshness on the injected quests and the target', () => {
    expect(act4FixtureDefIds('m35')).toEqual(['m35']);
    expect(act4FixtureDefIds('m37')).toEqual([...ACT4_PREREQS.m37, 'm37']);
    expect(act4FixtureDefIds('m37')).toContain('d07');
  });

  it('is fresh only when the build knows exactly the defs the generator knew', () => {
    expect(act4FixtureFresh({ questDefs: [] }, [])).toBe(true);
    expect(act4FixtureFresh({ questDefs: ['m35'] }, ['m35'])).toBe(true);
    // L10 landed after the fixture was made: stale.
    expect(act4FixtureFresh({ questDefs: [] }, ['m35'])).toBe(false);
    expect(act4FixtureFresh({ questDefs: ['m35'] }, [])).toBe(false);
  });

  it('is stale when the jump would now inject other quests than the meta records', () => {
    const now = [...ACT4_PREREQS.m38];
    expect(act4FixtureFresh({ id: 'm38', injected: now, questDefs: [] }, [])).toBe(true);
    expect(act4FixtureFresh({ id: 'm38', injected: now.slice(1), questDefs: [] }, [])).toBe(false);
    expect(act4FixtureFresh({ id: 'm38', injected: [...now].reverse(), questDefs: [] }, [])).toBe(false);
  });

  it('drives the shared fixture start with its own rule: a stale Act 4 fixture falls back to injection', async () => {
    const warn = vi.fn();
    const loadFile = vi.fn(async () => true);
    const stale = new Act3FixtureStart('act4-m35', true, {
      find: async () => ({ name: 'act4-m35', save: {}, meta: { id: 'm35', injected: [], questDefs: [] } as never }),
      ready: () => true,
      known: () => ['m35'],
      loadFile,
      warn,
      fresh: act4FixtureFresh,
    });
    stale.tick();
    await settle();
    expect(stale.tick()).toBe(true);
    expect(loadFile).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toMatch(/act4-m35 is stale/);

    const fresh = new Act3FixtureStart('act4-m35', true, {
      find: async () => ({ name: 'act4-m35', save: { s: 1 }, meta: { id: 'm35', injected: [], questDefs: ['m35'] } as never }),
      ready: () => true,
      known: () => ['m35'],
      loadFile,
      warn,
      fresh: act4FixtureFresh,
    });
    fresh.tick();
    await settle();
    expect(fresh.tick()).toBe(false);
    await settle();
    expect(fresh.state).toBe('loaded');
    expect(loadFile).toHaveBeenCalledWith({ s: 1 });
  });

  it('a missing fixture or &fixture=0 injects', async () => {
    const warn = vi.fn();
    const missing = new Act3FixtureStart('act4-m41', true, { find: async () => null, ready: () => true, known: () => [], warn, fresh: act4FixtureFresh });
    missing.tick();
    await settle();
    expect(missing.tick()).toBe(true);
    expect(warn.mock.calls[0][0]).toMatch(/no fixture act4-m41/);
    const forced = new Act3FixtureStart('act4-m41', false, { find: async () => null, ready: () => true, known: () => [], warn, fresh: act4FixtureFresh });
    expect(forced.tick()).toBe(true);
  });
});
