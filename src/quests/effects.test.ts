import { describe, it, expect, vi } from 'vitest';
import { createEffectRunner } from './effects';
import type { EffectEnv, InventoryPort, ProgressionPort } from './ports';
import type { Effect, FlagValue } from './types';

function setup(over: Partial<EffectEnv> = {}) {
  const flags = new Map<string, FlagValue>();
  const emitted: { type: string; payload: unknown }[] = [];
  const warns: string[] = [];
  const addFavour = vi.fn(() => 1);
  const quests = {
    state: () => 'inactive' as const, objectiveDone: () => false,
    start: vi.fn(() => true), complete: vi.fn(() => true), completeObjective: vi.fn(() => true),
  };
  const env: EffectEnv = {
    state: {
      getFlag: (k) => flags.get(k),
      setFlag: (k, v) => {
        if (!/^[a-z][a-z0-9_.-]*$/i.test(k)) throw new Error(`invalid key ${k}`);
        flags.set(k, v);
      },
      clearFlag: vi.fn((k: string) => { flags.delete(k); }),
      favour: () => 0, favourBand: () => 'cold', addFavour,
    },
    quests,
    bus: { on: () => () => {}, emit: (type, payload) => { emitted.push({ type, payload }); } },
    sourceId: 'quest:test',
    warn: (m) => warns.push(m),
    ...over,
  };
  return { env, flags, emitted, warns, addFavour, quests, runner: createEffectRunner(env) };
}

describe('createEffectRunner', () => {
  it('run(undefined) and empty give []', () => {
    const { runner } = setup();
    expect(runner.run(undefined)).toEqual([]);
    expect(runner.run([])).toEqual([]);
  });

  it('setFlag and clearFlag; clear of missing is a no-op', () => {
    const { runner, flags, env } = setup();
    const r = runner.run([{ setFlag: 'a.b', value: 5 }, { clearFlag: 'missing' }]);
    expect(r.every((x) => x.ok)).toBe(true);
    expect(flags.get('a.b')).toBe(5);
    expect(env.state.clearFlag).not.toHaveBeenCalled();
    runner.run([{ clearFlag: 'a.b' }]);
    expect(flags.has('a.b')).toBe(false);
  });

  it('failures are isolated: invalid key and NaN, rest still run', () => {
    const { runner, flags, warns } = setup();
    const r = runner.run([
      { setFlag: '!!bad', value: true },
      { setFlag: 'nan', value: NaN },
      { setFlag: 'ok', value: true },
    ]);
    expect(r.map((x) => x.ok)).toEqual([false, false, true]);
    expect(r[0].error).toContain('invalid key');
    expect(flags.get('ok')).toBe(true);
    expect(flags.has('nan')).toBe(false);
    expect(warns).toHaveLength(2);
  });

  it('favour uses source quest; bad delta/track fail', () => {
    const { runner, addFavour } = setup();
    const r = runner.run([
      { favour: 'halvard', delta: 5 },
      { favour: 'halvard', delta: NaN },
      { favour: 'nobody' as never, delta: 1 },
    ]);
    expect(addFavour).toHaveBeenCalledTimes(1);
    expect(addFavour).toHaveBeenCalledWith('halvard', 5, 'quest');
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
  });

  it('mercy emits the data', () => {
    const { runner, emitted } = setup();
    const data = { verb: 'spare' as const, tier: 'normal' as const, track: null, creature: 'wraith' };
    expect(runner.run([{ mercy: data }])[0].ok).toBe(true);
    expect(emitted).toEqual([{ type: 'mercy', payload: data }]);
  });

  it('quest effects call the manager; false warns without throwing', () => {
    const { runner, quests, warns } = setup();
    quests.start.mockReturnValueOnce(false);
    quests.complete.mockReturnValueOnce(false);
    quests.completeObjective.mockReturnValueOnce(false);
    runner.run([{ startQuest: 'q' }, { completeQuest: 'q' }, { completeObjective: ['q', 'o'] }]);
    expect(quests.start).toHaveBeenCalledWith('q');
    expect(quests.complete).toHaveBeenCalledWith('q');
    expect(quests.completeObjective).toHaveBeenCalledWith('q', 'o');
    expect(warns).toHaveLength(3);
    const r = runner.run([{ startQuest: 'q' }]);
    expect(r[0].ok).toBe(true);
    expect(warns).toHaveLength(3);
  });

  it('give emits loot.granted and filters bad entries', () => {
    const { runner, emitted, warns } = setup();
    runner.run([{ give: [
      { itemId: 'bread', count: 2 }, { itemId: 'x', count: 0 }, { itemId: 'y', count: -1 },
      { itemId: 'z', count: NaN }, { itemId: 'w', count: 1.5 }, { itemId: '', count: 1 },
    ] }]);
    expect(emitted).toEqual([{ type: 'loot.granted', payload: { sourceId: 'quest:test', items: [{ itemId: 'bread', count: 2 }] } }]);
    expect(warns).toHaveLength(1);
  });

  it('give with nothing valid emits nothing', () => {
    const { runner, emitted } = setup();
    runner.run([{ give: [{ itemId: 'x', count: 0 }] }, { give: [] }]);
    expect(emitted).toEqual([]);
  });

  it('take removes per entry; failed removal warns; absent service warns once', () => {
    const remove = vi.fn((id: string) => id !== 'gone');
    const inv: InventoryPort = { remove };
    const a = setup({ inventory: () => inv });
    a.runner.run([{ take: [{ itemId: 'a', count: 1 }, { itemId: 'gone', count: 2 }, { itemId: 'b', count: 0 }] }]);
    expect(remove.mock.calls).toEqual([['a', 1], ['gone', 2]]);
    expect(a.warns).toHaveLength(1);

    for (const env of [setup(), setup({ inventory: () => undefined })]) {
      const e: Effect = { take: [{ itemId: 'a', count: 1 }] };
      const r = env.runner.run([e, e]);
      expect(r.map((x) => x.ok)).toEqual([false, false]);
      expect(env.warns).toHaveLength(1);
    }
  });

  it('xp and skillPoints use the progression service', () => {
    const p: ProgressionPort = { grantXp: vi.fn(), grantSkillPoints: vi.fn() };
    const { runner } = setup({ progression: () => p });
    const r = runner.run([
      { xp: 50 }, { xp: 0 }, { xp: NaN }, { xp: -3 },
      { skillPoints: 2 }, { skillPoints: 0 }, { skillPoints: Infinity },
    ]);
    expect(p.grantXp).toHaveBeenCalledTimes(1);
    expect(p.grantXp).toHaveBeenCalledWith(50, 'quest:test');
    expect(p.grantSkillPoints).toHaveBeenCalledTimes(1);
    expect(p.grantSkillPoints).toHaveBeenCalledWith(2);
    expect(r[0].ok).toBe(true);
  });

  it('xp / skillPoints without service warn once and continue', () => {
    const { runner, warns, flags } = setup();
    const r = runner.run([{ xp: 5 }, { xp: 6 }, { skillPoints: 1 }, { skillPoints: 1 }, { setFlag: 'after', value: 1 }]);
    expect(r.map((x) => x.ok)).toEqual([false, false, false, false, true]);
    expect(warns).toHaveLength(2);
    expect(flags.get('after')).toBe(1);
  });

  it('skillPoints with progression lacking grantSkillPoints warns', () => {
    const { runner, warns } = setup({ progression: () => ({ grantXp: vi.fn() }) });
    expect(runner.run([{ skillPoints: 1 }])[0].ok).toBe(false);
    expect(warns).toHaveLength(1);
  });

  it('event allowlist', () => {
    const { runner, emitted, warns } = setup();
    const r = runner.run([
      { event: 'tutorial.x', payload: { a: 1 } },
      { event: 'damage.dealt' },
      { event: 'actor.died' },
      { event: 'story.' },
      { event: 'npc.wave' },
    ]);
    expect(r.map((x) => x.ok)).toEqual([true, false, false, false, true]);
    expect(emitted).toEqual([{ type: 'tutorial.x', payload: { a: 1 } }, { type: 'npc.wave', payload: undefined }]);
    expect(warns).toHaveLength(3);
  });

  it('unknown effect shape fails without stopping others', () => {
    const { runner, flags } = setup();
    const r = runner.run([{ nope: 1 } as unknown as Effect, { setFlag: 'k', value: true }]);
    expect(r.map((x) => x.ok)).toEqual([false, true]);
    expect(flags.get('k')).toBe(true);
  });

  it('works without a warn callback', () => {
    const { runner, env } = setup();
    delete env.warn;
    expect(runner.run([{ event: 'damage.dealt' }])[0].ok).toBe(false);
  });
});
