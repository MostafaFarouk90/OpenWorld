import { describe, expect, it, vi } from 'vitest';
import { KILL_FAILSAFE_TUNING, KillFailsafe, currentKillTargets, type KillTarget } from './killFailsafe';
import { killObjectiveLeads } from './leads';

const target: KillTarget = { questId: 'm01', objectiveId: 'o1', spawnTag: 'm01', remaining: 3 };
const PERIOD = KILL_FAILSAFE_TUNING.period;

function make(live: () => number, spawn: () => void = () => {}) {
  const spawnGroup = vi.fn(spawn);
  const reset = vi.fn();
  const warn = vi.fn();
  const f = new KillFailsafe({ targets: () => [target], live, spawnGroup, reset, warn });
  return { f, spawnGroup, reset, warn };
}

describe('KillFailsafe', () => {
  it('leaves a group with enough living enemies alone', () => {
    const t = make(() => 3);
    t.f.update(PERIOD);
    expect(t.spawnGroup).not.toHaveBeenCalled();
  });

  it('waits a full period between checks', () => {
    const t = make(() => 3);
    t.f.update(PERIOD / 2);
    t.f.update(PERIOD / 4);
    expect(t.spawnGroup).not.toHaveBeenCalled();
  });

  it('refills free slots first, without a rebuild, when that is enough', () => {
    let live = 1;
    const t = make(() => live, () => { live = 3; });
    t.f.update(PERIOD);
    expect(t.spawnGroup).toHaveBeenCalledWith('m01.lanes');
    expect(t.reset).not.toHaveBeenCalled();
  });

  it('rebuilds exactly the remaining count once a group stays short', () => {
    const t = make(() => 1);
    for (let t0 = 0; t0 < KILL_FAILSAFE_TUNING.rebuildAfter + PERIOD; t0 += PERIOD) t.f.update(PERIOD);
    expect(t.reset).toHaveBeenCalledWith('m01.lanes');
    expect(t.spawnGroup).toHaveBeenCalledWith('m01.lanes', { count: 3 });
    expect(t.warn).toHaveBeenCalledOnce();
  });

  it('forgets the shortfall once the group is whole again', () => {
    let live = 1;
    const t = make(() => live);
    t.f.update(PERIOD);
    live = 3;
    t.f.update(PERIOD);
    live = 1;
    for (let i = 0; i < 2; i++) t.f.update(PERIOD);
    expect(t.reset).not.toHaveBeenCalled();
  });
});

describe('currentKillTargets', () => {
  const def = (id: string, spawnTag: string | undefined, required = 5) => ({ id, type: 'kill', target: 'ash-wraith', required, spawnTag, textKey: 'x' });
  const quests = (state: string, objs: Array<{ def: ReturnType<typeof def>; progress: number; done: boolean; current: boolean }>) => ({
    state: () => state,
    objectives: () => objs as never,
  });

  it('lists the open kill objective of a failsafe group with what is left', () => {
    const q = quests('active', [{ def: def('o1', 'm01'), progress: 2, done: false, current: true }]);
    expect(currentKillTargets(q, ['m01'])).toEqual([{ questId: 'm01', objectiveId: 'o1', spawnTag: 'm01', remaining: 3 }]);
  });

  it('skips finished, closed, untracked and inactive ones', () => {
    const objs = [
      { def: def('a', 'm01'), progress: 5, done: true, current: false },
      { def: def('b', 'm01.mill'), progress: 0, done: false, current: false },
      { def: def('c', 'm04.sergeant'), progress: 0, done: false, current: true },
      { def: def('d', undefined), progress: 0, done: false, current: true },
    ];
    expect(currentKillTargets(quests('active', objs), ['m01'])).toEqual([]);
    expect(currentKillTargets(quests('completed', [{ def: def('o1', 'm01'), progress: 0, done: false, current: true }]), ['m01'])).toEqual([]);
  });
});

describe('killObjectiveLeads', () => {
  it('marks the nearest living enemy of each group and skips groups with none', () => {
    const leads = killObjectiveLeads({
      targets: () => [
        { questId: 'm01', objectiveId: 'o1', spawnTag: 'm01' },
        { questId: 'm01', objectiveId: 'mill', spawnTag: 'm01.mill' },
      ],
      nearestLiving: (tag) => (tag === 'm01' ? { x: 4, z: 9 } : undefined),
    });
    expect(leads).toEqual([{ id: 'lead.m01.o1', x: 4, z: 9, label: 'm01' }]);
  });
});
