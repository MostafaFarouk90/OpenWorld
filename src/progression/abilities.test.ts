import { describe, expect, it, vi } from 'vitest';
import { Abilities } from './abilities';
import { fakeActor, makeProgression, type Evt } from './testkit';
import type { AbilityHandler, SpellsPort } from '../hud/ports';
import { xpForLevel } from './tuning';

function setup(opts: { spells?: boolean; ember?: number; fallback?: boolean } = {}) {
  const prog = makeProgression();
  prog.p.grantXp(xpForLevel(4), 'x');
  prog.p.learn('knight.rallyCry');
  prog.p.learn('knight.rimBash');
  const caster = fakeActor();
  const events: Evt[] = [];
  const warnings: string[] = [];
  const spells: SpellsPort & { spent: number[] } = {
    burn: 0,
    ember: opts.ember ?? 30,
    maxEmber: 30,
    spent: [],
    spendEmber(n) {
      this.spent.push(n);
      return true;
    },
  };
  const fallback = vi.fn<AbilityHandler>(() => ({ ok: true }));
  const ab = new Abilities({
    progression: prog.p,
    spells: () => (opts.spells === false ? undefined : spells),
    caster: () => caster,
    ctx: () => 'ctx',
    emit: (type, payload) => events.push({ type, payload }),
    logger: { warn: (m) => warnings.push(m) },
    fallback: opts.fallback === false ? undefined : fallback,
  });
  return { ab, prog, caster, events, warnings, spells, fallback };
}

describe('abilities', () => {
  it('bad, empty and passive slots', () => {
    const { ab } = setup();
    expect(ab.use(-1)).toEqual({ ok: false, reason: 'bad-slot' });
    expect(ab.use(6)).toEqual({ ok: false, reason: 'bad-slot' });
    expect(ab.use(NaN)).toEqual({ ok: false, reason: 'bad-slot' });
    expect(ab.use(1)).toEqual({ ok: false, reason: 'empty-slot' });
    expect(ab.cooldown(1)).toEqual({ remaining: 0, total: 0 });
  });
  it('passive on the bar refuses', () => {
    const { ab, prog } = setup();
    vi.spyOn(prog.p, 'bar').mockReturnValue(['knight.rimBash', null, null, null, null, null]);
    expect(ab.use(0)).toEqual({ ok: false, reason: 'passive' });
  });
  it('success spends ember, starts cooldown, emits, passes args', () => {
    const { ab, spells, events, fallback } = setup();
    expect(ab.use(0)).toEqual({ ok: true });
    expect(spells.spent).toEqual([10]);
    expect(events).toContainEqual({ type: 'ability.used', payload: { skillId: 'knight.rallyCry', slot: 0 } });
    expect(fallback).toHaveBeenCalledWith({ skillId: 'knight.rallyCry', slot: 0, caster: { id: 'player' }, ctx: 'ctx' });
    expect(ab.cooldown(0)).toEqual({ remaining: 20, total: 20 });
  });
  it('cooldown refuses without cost and ends after exactly 1200 ticks', () => {
    const { ab, spells } = setup();
    ab.use(0);
    expect(ab.use(0)).toEqual({ ok: false, reason: 'cooldown' });
    expect(spells.spent).toEqual([10]);
    for (let i = 0; i < 1199; i++) ab.tick();
    expect(ab.use(0)).toMatchObject({ reason: 'cooldown' });
    expect(ab.cooldown(0).remaining).toBeCloseTo(1 / 60, 6);
    ab.tick();
    expect(ab.cooldown(0).remaining).toBe(0);
    expect(ab.use(0)).toEqual({ ok: true });
  });
  it('no ticks, no cooldown progress', () => {
    const { ab } = setup();
    ab.use(0);
    const before = ab.cooldown(0).remaining;
    expect(ab.cooldown(0).remaining).toBe(before);
  });
  it('no-ember only enforced when spells exist', () => {
    const low = setup({ ember: 9 });
    expect(low.ab.use(0)).toEqual({ ok: false, reason: 'no-ember' });
    expect(low.fallback).not.toHaveBeenCalled();
    const none = setup({ spells: false, ember: 0 });
    expect(none.ab.use(0)).toEqual({ ok: true });
  });
  it('dead or missing caster', () => {
    const s = setup();
    (s.caster as { dead: boolean }).dead = true;
    expect(s.ab.use(0)).toEqual({ ok: false, reason: 'dead' });
    const prog = makeProgression();
    prog.p.grantXp(50, 'x');
    prog.p.learn('knight.rallyCry');
    const ab = new Abilities({ progression: prog.p, spells: () => undefined, caster: () => null, ctx: () => 0, emit() {} });
    expect(ab.use(0)).toEqual({ ok: false, reason: 'dead' });
  });
  it('handler returning not ok: no cost, no cooldown', () => {
    const { ab, spells, events } = setup();
    ab.registerHandler('knight.rallyCry', () => ({ ok: false, reason: 'blocked' }));
    expect(ab.use(0)).toEqual({ ok: false, reason: 'handler-failed', detail: 'blocked' });
    expect(spells.spent).toEqual([]);
    expect(ab.cooldown(0).remaining).toBe(0);
    expect(events.some((e) => e.type === 'ability.used')).toBe(false);
  });
  it('throwing handler is isolated and logged', () => {
    const { ab, spells, warnings } = setup();
    ab.registerHandler('knight.rallyCry', () => {
      throw new Error('boom');
    });
    expect(ab.use(0)).toMatchObject({ ok: false, reason: 'handler-failed' });
    expect(warnings[0]).toContain('boom');
    expect(spells.spent).toEqual([]);
    expect(ab.cooldown(0).remaining).toBe(0);
  });
  it('second handler is refused; dispose frees the id; handler beats fallback', () => {
    const { ab, fallback } = setup();
    const h = vi.fn<AbilityHandler>(() => ({ ok: true }));
    const reg = ab.registerHandler('knight.rallyCry', h);
    if (!reg.ok) throw new Error('first registration failed');
    const dispose = reg.dispose;
    expect(ab.registerHandler('knight.rallyCry', h)).toEqual({ ok: false, reason: 'duplicate' });
    ab.use(0);
    expect(h).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    dispose();
    dispose();
    expect(ab.registerHandler('knight.rallyCry', h).ok).toBe(true);
  });
  it('no handler and no fallback', () => {
    const { ab } = setup({ fallback: false });
    expect(ab.use(0)).toEqual({ ok: false, reason: 'handler-failed', detail: 'no-handler' });
  });
  it('reportTrigger only when learned', () => {
    const { ab, events } = setup();
    expect(ab.reportTrigger('knight.riposteEdge')).toBe(false);
    expect(events.some((e) => e.type === 'skill.triggered')).toBe(false);
    expect(ab.reportTrigger('knight.rimBash')).toBe(true);
    expect(events).toContainEqual({ type: 'skill.triggered', payload: { skillId: 'knight.rimBash' } });
  });
});
