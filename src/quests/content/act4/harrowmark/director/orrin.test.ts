import { describe, expect, it } from 'vitest';
import { DENSITY_LAYOUT_HM } from '../../../../../harrowmark/density.layout';
import { ORRIN_AWAY, installOrrin, orrinAway } from './orrin';
import { M35_ESCORT } from '../m35.quest';

function kit(init: Record<string, boolean>) {
  const flags = new Map(Object.entries(init));
  let tick: (() => void) | null = null;
  let loaded: (() => void) | null = null;
  const k = {
    on: (_e: string, fn: () => void) => { loaded = fn; return () => { loaded = null; }; },
    flag: (f: string) => flags.get(f) === true,
    set: (f: string) => void flags.set(f, true),
    clear: (f: string) => void flags.delete(f),
    every: (_n: number, fn: () => void) => { tick = fn; return () => { tick = null; }; },
  };
  return { k: k as never, flags, tick: () => tick?.(), load: () => loaded?.() };
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

  it('syncs at once on a load, not only on the next poll', () => {
    const w = kit({ 'story.m22.complete': true, 'story.gate.a4': true });
    installOrrin(w.k);
    expect(w.flags.has(ORRIN_AWAY)).toBe(false);
    // an older save made after M22, before the gate, loads over it
    w.flags.delete('story.gate.a4');
    w.load();
    expect(w.flags.get(ORRIN_AWAY)).toBe(true);
  });

  it('is what the layout reads for his absence', () => {
    const spec = DENSITY_LAYOUT_HM.npcs.find((n) => n.id === 'grisel-steward')!;
    expect(spec.absentWhen).toBe(ORRIN_AWAY);
    expect(spec.presentWhen).toBe('story.m22.started');
  });
});

describe('Orrin during the Grisel escort (Act 4 L14)', () => {
  const withEscort = (active: string | null, flags: Record<string, boolean> = { 'story.gate.a4': true }) => ({
    flag: (x: string) => flags[x] === true,
    ctx: { services: { get: (id: string) => (id === 'escortsAct4' ? { active: () => active } : undefined) } },
  }) as never;

  it('steps out only while the Grisel party walks', () => {
    expect(orrinAway(withEscort(M35_ESCORT('grisel')))).toBe(true);
    expect(orrinAway(withEscort(M35_ESCORT('halvard')))).toBe(false);
    expect(orrinAway(withEscort(null))).toBe(false);
  });

  it('a missing escorts service changes nothing', () => {
    expect(orrinAway({ flag: () => false, ctx: { services: { get: () => undefined } } } as never)).toBe(false);
  });
});
