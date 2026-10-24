import { describe, it, expect } from 'vitest';
import { QuestManager } from './QuestManager';
import { QuestRewardScale } from '../core/scalePorts';
import type { BusPort, StatePort } from './ports';
import type { QuestDef } from './types';

function setup(scaleSvc?: { scale(id: string): number }) {
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  const bus: BusPort = {
    on: (t, l) => { handlers.set(t, [...(handlers.get(t) ?? []), l as never]); return () => {}; },
    emit: (t, p) => { for (const l of handlers.get(t) ?? []) l(p); },
  };
  const xp: number[] = [];
  const gold: number[] = [];
  const m = new QuestManager({
    bus, state: {} as StatePort, playerId: () => 'p',
    progression: () => ({ grantXp: (n: number) => { xp.push(n); } }) as never,
    inventory: () => ({ addGold: (n: number) => { gold.push(n); } }) as never,
    rewardScale: scaleSvc ? () => scaleSvc : undefined,
  });
  return { m, xp, gold };
}
const q = (id: string, extra: Partial<QuestDef>): QuestDef =>
  ({ id, titleKey: id, summaryKey: id, objectives: [{ id: 'o', type: 'talk', target: 'x', textKey: 'o' }], ...extra });

describe('quest reward scale (v0.7 item 9)', () => {
  const run = (svc: { scale(id: string): number } | undefined, extra: Partial<QuestDef>) => {
    const s = setup(svc);
    s.m.register(q('a', extra));
    s.m.start('a');
    s.m.complete('a');
    return s;
  };

  it('no port, or an identity port, changes nothing', () => {
    expect(run(undefined, { rewards: [{ xp: 40 }, { giveGold: 15 }] })).toMatchObject({ xp: [40], gold: [15] });
    expect(run(new QuestRewardScale(), { rewards: [{ xp: 40 }, { giveGold: 15 }] })).toMatchObject({ xp: [40], gold: [15] });
  });

  it('scales rewards XP and gold, rounded once', () => {
    const r = run({ scale: () => 1.5 }, { rewards: [{ xp: 25 }, { giveGold: 11 }] });
    expect(r.xp).toEqual([38]);
    expect(r.gold).toEqual([17]);
  });

  it('does not scale onComplete effects', () => {
    const r = run({ scale: () => 2 }, { onComplete: [{ xp: 10 }], rewards: [{ xp: 10 }] });
    expect(r.xp).toEqual([10, 20]);
  });

  it('passes the quest id to the port', () => {
    const ids: string[] = [];
    run({ scale: (id) => { ids.push(id); return 1; } }, { rewards: [{ xp: 1 }] });
    expect(ids).toEqual(['a']);
  });

  it('a scale that rounds to 0 grants nothing; NaN and negative from a raw port read as 1', () => {
    expect(run({ scale: () => 0 }, { rewards: [{ xp: 5 }, { giveGold: 5 }] })).toMatchObject({ xp: [], gold: [] });
    expect(run({ scale: () => NaN }, { rewards: [{ xp: 5 }] }).xp).toEqual([5]);
    expect(run({ scale: () => -3 }, { rewards: [{ giveGold: 7 }] }).gold).toEqual([7]);
  });

  it('the real port falls back to 1 for a bad provider', () => {
    const port = new QuestRewardScale();
    port.setProvider(() => NaN);
    expect(run(port, { rewards: [{ xp: 9 }] }).xp).toEqual([9]);
    port.setProvider(() => 0.5);
    expect(run(port, { rewards: [{ xp: 9 }] }).xp).toEqual([5]);
  });

  it('a throwing port reads as 1', () => {
    expect(run({ scale: () => { throw new Error('x'); } }, { rewards: [{ xp: 9 }] }).xp).toEqual([9]);
  });
});
