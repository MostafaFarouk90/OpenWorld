import { describe, expect, it } from 'vitest';
import { objectivesDone, questLive } from './liveness';

function quests(state: string, done: string[], current: string[]) {
  return {
    state: () => state as never,
    objectiveDone: (_q: string, o: string) => done.includes(o),
    isObjectiveCurrent: (_q: string, o: string) => current.includes(o),
  };
}
const W = { id: 'm10', liveFrom: 'o2', liveUntil: 'o3' };

describe('questLive', () => {
  it('is false before liveFrom is current (Gerta not briefed yet)', () => {
    expect(questLive(quests('active', [], ['o1']), W)).toBe(false);
  });
  it('is true while liveFrom is current or done and liveUntil is not done', () => {
    expect(questLive(quests('active', ['o1'], ['o2']), W)).toBe(true);
    expect(questLive(quests('active', ['o1', 'o2'], ['o3']), W)).toBe(true);
  });
  it('is false once liveUntil is done, the quest is not active, or there is no service', () => {
    expect(questLive(quests('active', ['o1', 'o2', 'o3'], ['o4']), W)).toBe(false);
    expect(questLive(quests('completed', [], ['o2']), W)).toBe(false);
    expect(questLive(undefined, W)).toBe(false);
  });
  it('a throwing service reads as not live', () => {
    expect(questLive({ state: () => { throw new Error('x'); }, objectiveDone: () => false, isObjectiveCurrent: () => false }, W)).toBe(false);
  });
});

describe('objectivesDone', () => {
  it('needs every listed objective; none listed is true', () => {
    expect(objectivesDone(quests('active', ['o3', 'o4'], []), 'm09', ['o3', 'o4', 'o5'])).toBe(false);
    expect(objectivesDone(quests('active', ['o3', 'o4', 'o5'], []), 'm09', ['o3', 'o4', 'o5'])).toBe(true);
    expect(objectivesDone(undefined, 'm09', [])).toBe(true);
  });
});
