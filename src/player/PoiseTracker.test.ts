import { describe, expect, it } from 'vitest';
import { PoiseTracker, type PoiseDamageInfo } from './PoiseTracker';
import { POISE } from './tuning';

const make = () => {
  const actor = { dead: false, restored: 0, restorePoise() { this.restored++; } };
  return { actor, p: new PoiseTracker(actor) };
};
const hit = (o: Partial<PoiseDamageInfo> = {}): PoiseDamageInfo => ({
  outcome: 'hit', reqPoise: 10, poiseDealt: 10, staggered: false, ...o,
});
const run = (p: PoiseTracker, n: number) => { for (let i = 0; i < n; i++) p.tick(); };

describe('PoiseTracker reactions', () => {
  it('light hit flinches', () => {
    expect(make().p.onDamage(hit())).toEqual({ kind: 'flinch', ticks: POISE.flinchTicks });
  });

  it('flinch has no knockback', () => {
    expect(make().p.onDamage(hit())).not.toHaveProperty('knockback');
  });

  it('heavy hit at exactly 30 staggers while poise remains', () => {
    expect(make().p.onDamage(hit({ reqPoise: 30 }))).toEqual({
      kind: 'stagger', ticks: POISE.heavyStaggerTicks, knockback: POISE.knockbackMetres,
    });
  });

  it('29 flinches', () => {
    expect(make().p.onDamage(hit({ reqPoise: 29 })).kind).toBe('flinch');
  });

  it('an emptied bar breaks for 1.2 s, even from a light hit', () => {
    const r = make().p.onDamage(hit({ staggered: true }));
    expect(r).toEqual({ kind: 'break', ticks: 72, knockback: POISE.knockbackMetres });
  });

  it('break wins over heavy stagger', () => {
    expect(make().p.onDamage(hit({ reqPoise: 50, staggered: true })).kind).toBe('break');
  });

  it('a hit with only health damage flinches; no damage at all does nothing', () => {
    expect(make().p.onDamage(hit({ poiseDealt: 0, amount: 5 })).kind).toBe('flinch');
    expect(make().p.onDamage(hit({ poiseDealt: 0 })).kind).toBe('none');
  });

  it.each(['blocked', 'parried', 'immune'] as const)('%s gives none', (outcome) => {
    expect(make().p.onDamage(hit({ outcome, reqPoise: 50, staggered: true }))).toEqual({ kind: 'none' });
  });

  it('a hit on a dead actor gives none', () => {
    const { actor, p } = make();
    actor.dead = true;
    expect(p.onDamage(hit({ staggered: true }))).toEqual({ kind: 'none' });
  });
});

describe('PoiseTracker regeneration', () => {
  it('refills at exactly the delay and not one tick earlier', () => {
    const { actor, p } = make();
    p.onDamage(hit());
    run(p, POISE.regenDelayTicks - 1);
    expect(actor.restored).toBe(0);
    p.tick();
    expect(actor.restored).toBe(1);
    expect(POISE.regenDelayTicks).toBe(240);
  });

  it('refills once per damage burst', () => {
    const { actor, p } = make();
    p.onDamage(hit());
    run(p, POISE.regenDelayTicks + 100);
    expect(actor.restored).toBe(1);
  });

  it('damage restarts the delay', () => {
    const { actor, p } = make();
    p.onDamage(hit());
    run(p, 200);
    p.onDamage(hit());
    run(p, POISE.regenDelayTicks - 1);
    expect(actor.restored).toBe(0);
    p.tick();
    expect(actor.restored).toBe(1);
  });

  it('blocked hits do not restart the delay', () => {
    const { actor, p } = make();
    p.onDamage(hit());
    run(p, 200);
    p.onDamage(hit({ outcome: 'blocked' }));
    run(p, POISE.regenDelayTicks - 200);
    expect(actor.restored).toBe(1);
  });

  it('never refills without prior damage', () => {
    const { actor, p } = make();
    run(p, 1000);
    expect(actor.restored).toBe(0);
  });
});
