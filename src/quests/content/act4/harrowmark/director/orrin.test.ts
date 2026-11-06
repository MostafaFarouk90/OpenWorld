import { describe, expect, it } from 'vitest';
import { DENSITY_LAYOUT_HM } from '../../../../../harrowmark/density.layout';
import { ORRIN_AWAY, installOrrin, orrinAway } from './orrin';

function kit(init: Record<string, boolean>) {
  const flags = new Map(Object.entries(init));
  let tick: (() => void) | null = null;
  const k = {
    flag: (f: string) => flags.get(f) === true,
    set: (f: string) => void flags.set(f, true),
    clear: (f: string) => void flags.delete(f),
    every: (_n: number, fn: () => void) => { tick = fn; return () => { tick = null; }; },
  };
  return { k: k as never, flags, tick: () => tick?.() };
}

describe('Orrin in Act 4', () => {
  it('is away after M22 until the Act 4 gate, back for M35 and M36, away again after M38', () => {
    const f = (o: Record<string, boolean>) => orrinAway({ flag: (x: string) => o[x] === true });
    expect(f({})).toBe(false);
    expect(f({ 'story.m22.complete': true })).toBe(true);
    expect(f({ 'story.m22.complete': true, 'story.gate.a4': true })).toBe(false);
    expect(f({ 'story.m22.complete': true, 'story.gate.a4': true, 'story.m38.complete': true })).toBe(true);
  });

  it('puts an Act 3 save right on load, then follows the gate', () => {
    const w = kit({ 'story.m22.complete': true });
    installOrrin(w.k);
    expect(w.flags.get(ORRIN_AWAY)).toBe(true);
    w.flags.set('story.gate.a4', true);
    w.tick();
    expect(w.flags.has(ORRIN_AWAY)).toBe(false);
  });

  it('is what the layout reads for his absence', () => {
    const spec = DENSITY_LAYOUT_HM.npcs.find((n) => n.id === 'grisel-steward')!;
    expect(spec.absentWhen).toBe(ORRIN_AWAY);
    expect(spec.presentWhen).toBe('story.m22.started');
  });
});
