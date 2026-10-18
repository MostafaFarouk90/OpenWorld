import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameEvents, type GameEventMap } from '../core/events';
import type { Actor } from './Actor';
import { ActorRegistry } from './ActorRegistry';
import { DamageResolver, type DamageRequest } from './DamageResolver';
import { playerInit } from './teams';

function make() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const warn = vi.fn();
  const dr = new DamageResolver(actors, events, warn);
  const log: string[] = [];
  const seen: { type: keyof GameEventMap; payload: unknown }[] = [];
  events.onAny((t, p) => {
    log.push(String(t));
    seen.push({ type: t, payload: p });
  });
  const player = actors.spawn(playerInit());
  const enemy = actors.spawn({ kind: 'wraith', team: 'hostile', maxHealth: 30, maxPoise: 20 });
  const dummy = actors.spawn({ kind: 'dummy', team: 'neutral', maxHealth: 100, immortal: true, maxPoise: 10 });
  const npc = actors.spawn({ kind: 'npc', team: 'neutral', maxHealth: 10, hittable: false });
  log.length = 0;
  seen.length = 0;
  const hit = (target: Actor, amount: number, extra: Partial<DamageRequest> = {}) =>
    dr.apply({ attackerId: player.id, targetId: target.id, amount, kind: 'melee', ...extra });
  const of = <K extends keyof GameEventMap>(t: K) => seen.filter((s) => s.type === t).map((s) => s.payload as GameEventMap[K]);
  return { events, actors, dr, warn, log, seen, player, enemy, dummy, npc, hit, of };
}

describe('DamageResolver.apply basics', () => {
  it('deals damage and poise (default poise = amount) and returns the result', () => {
    const { enemy, hit, of } = make();
    const r = hit(enemy, 10)!;
    expect(r).toMatchObject({ outcome: 'hit', dealt: 10, poiseDealt: 10, healthAfter: 20, killed: false, saved: false, staggered: false });
    expect(enemy.health).toBe(20);
    expect(enemy.poise).toBe(10);
    expect(of('damage.dealt')).toEqual([r]);
  });

  it('explicit poise differs from amount', () => {
    const { enemy, hit } = make();
    const r = hit(enemy, 5, { poise: 2 })!;
    expect(r.dealt).toBe(5);
    expect(r.poiseDealt).toBe(2);
    expect(enemy.poise).toBe(18);
  });

  it('overkill clamps at 0 and dealt is the health actually removed', () => {
    const { enemy, hit } = make();
    const r = hit(enemy, 500)!;
    expect(enemy.health).toBe(0);
    expect(r.dealt).toBe(30);
    expect(r.healthAfter).toBe(0);
    expect(r.killed).toBe(true);
    expect(enemy.dead).toBe(true);
  });

  it('damage to exactly 0 kills and emits actor.died once with details', () => {
    const { enemy, hit, of, player } = make();
    hit(enemy, 30);
    expect(enemy.dead).toBe(true);
    expect(of('actor.died')).toEqual([{ actorId: enemy.id, killerId: player.id, kind: 'wraith', team: 'hostile', level: 1 }]);
  });

  it('hits on a dead actor are dropped and do not re-emit died', () => {
    const { enemy, hit, of, log } = make();
    hit(enemy, 30);
    const n = log.length;
    expect(hit(enemy, 5)).toBeNull();
    expect(log.length).toBe(n);
    expect(of('actor.died')).toHaveLength(1);
  });

  it('unknown target returns null', () => {
    const { dr } = make();
    expect(dr.apply({ attackerId: null, targetId: 'ghost', amount: 1, kind: 'script' })).toBeNull();
  });

  it('an unknown attacker id still applies (no team check)', () => {
    const { dr, enemy } = make();
    expect(dr.apply({ attackerId: 'gone', targetId: enemy.id, amount: 1, kind: 'melee' })).not.toBeNull();
  });

  it('null attacker (environment) applies', () => {
    const { dr, player } = make();
    const r = dr.apply({ attackerId: null, targetId: player.id, amount: 5, kind: 'fall' })!;
    expect(r.dealt).toBe(5);
    expect(player.health).toBe(95);
  });

  it('does not mutate the input request', () => {
    const { dr, enemy, player } = make();
    const req: DamageRequest = { attackerId: player.id, targetId: enemy.id, amount: 5, kind: 'melee' };
    dr.addModifier('m', (r) => {
      r.amount = 1;
    });
    dr.apply(req);
    expect(req.amount).toBe(5);
    expect(req.poise).toBeUndefined();
  });

  describe('invalid amounts', () => {
    for (const bad of [-1, NaN, Infinity, -Infinity]) {
      it(`amount ${bad} is dropped with a warning`, () => {
        const { enemy, hit, warn, log } = make();
        expect(hit(enemy, bad)).toBeNull();
        expect(enemy.health).toBe(30);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(log).toEqual([]);
      });
      it(`poise ${bad} is dropped with a warning`, () => {
        const { enemy, hit, warn } = make();
        expect(hit(enemy, 1, { poise: bad })).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
      });
    }
  });

  describe('team rule and hittable', () => {
    it('a blocked pairing is dropped silently', () => {
      const { dr, player, actors, log, warn } = make();
      const ally = actors.spawn({ kind: 'ally', team: 'ally', maxHealth: 10 });
      log.length = 0;
      expect(dr.apply({ attackerId: player.id, targetId: ally.id, amount: 1, kind: 'melee' })).toBeNull();
      expect(ally.health).toBe(10);
      expect(log).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('hittable false drops every request, even without an attacker', () => {
      const { dr, npc, hit } = make();
      expect(hit(npc, 5)).toBeNull();
      expect(dr.apply({ attackerId: null, targetId: npc.id, amount: 5, kind: 'script' })).toBeNull();
      expect(npc.health).toBe(10);
    });

    it('a hostile can hurt the player', () => {
      const { dr, enemy, player } = make();
      const r = dr.apply({ attackerId: enemy.id, targetId: player.id, amount: 10, kind: 'melee' });
      expect(r?.dealt).toBe(10);
    });
  });
});

describe('immortal actors', () => {
  it('are refilled to max after every hit, healthAfter is max, and never die', () => {
    const { dummy, hit, of } = make();
    const r1 = hit(dummy, 10)!;
    expect(dummy.health).toBe(100);
    expect(r1.healthAfter).toBe(100);
    expect(r1.dealt).toBe(10);
    expect(r1.killed).toBe(false);
    const r2 = hit(dummy, 1000)!;
    expect(dummy.health).toBe(100);
    expect(r2.healthAfter).toBe(100);
    expect(r2.killed).toBe(false);
    expect(dummy.dead).toBe(false);
    expect(of('actor.died')).toHaveLength(0);
    expect(of('damage.dealt')).toHaveLength(2);
  });

  it('still lose poise and stagger, then keep taking hits', () => {
    const { dummy, hit, of } = make();
    hit(dummy, 1, { poise: 10 });
    expect(of('actor.staggered')).toHaveLength(1);
    expect(dummy.poise).toBe(0);
  });

  it('do not run lethal handlers', () => {
    const { dr, dummy, hit } = make();
    const h = vi.fn(() => true);
    dr.addLethalHandler('h', h);
    hit(dummy, 1000);
    expect(h).not.toHaveBeenCalled();
  });

  it('kill() on an immortal is a no-op', () => {
    const { dr, dummy, log } = make();
    dr.kill(dummy.id);
    expect(dummy.dead).toBe(false);
    expect(log).toEqual([]);
  });
});

describe('invulnerable, immune, parried, blocked', () => {
  it('invulnerable is immune with 0 damage and 0 poise damage', () => {
    const { enemy, hit } = make();
    enemy.invulnerable = true;
    const r = hit(enemy, 10)!;
    expect(r).toMatchObject({ outcome: 'immune', dealt: 0, poiseDealt: 0, healthAfter: 30 });
    expect(enemy.health).toBe(30);
    expect(enemy.poise).toBe(20);
  });

  it('a modifier can turn an immune hit into something else only by setting outcome (order of modifiers)', () => {
    const { enemy, hit, dr } = make();
    enemy.invulnerable = true;
    let outcomeSeen = '';
    dr.addModifier('spy', (r) => {
      outcomeSeen = r.outcome;
    });
    hit(enemy, 10);
    expect(outcomeSeen).toBe('immune');
  });

  it('parried deals nothing (health or poise)', () => {
    const { enemy, hit, dr } = make();
    dr.addModifier('parry', (r) => {
      r.outcome = 'parried';
    });
    const r = hit(enemy, 10)!;
    expect(r).toMatchObject({ outcome: 'parried', dealt: 0, poiseDealt: 0 });
    expect(enemy.health).toBe(30);
  });

  it('blocked deals what the modifier left', () => {
    const { enemy, hit, dr } = make();
    dr.addModifier('block', (r) => {
      r.outcome = 'blocked';
      r.amount *= 0.2;
      r.poise *= 0.5;
    });
    const r = hit(enemy, 10)!;
    expect(r.outcome).toBe('blocked');
    expect(r.dealt).toBeCloseTo(2);
    expect(r.poiseDealt).toBeCloseTo(5);
    expect(enemy.health).toBeCloseTo(28);
  });

  it('modifier-made negative or non-finite values count as 0', () => {
    const { enemy, hit, dr } = make();
    dr.addModifier('bad', (r) => {
      r.amount = -5;
      r.poise = NaN;
    });
    const r = hit(enemy, 10)!;
    expect(r.dealt).toBe(0);
    expect(r.poiseDealt).toBe(0);
    expect(enemy.health).toBe(30);
  });
});

describe('modifiers', () => {
  it('run in ascending order, ties by registration', () => {
    const { enemy, hit, dr } = make();
    const order: string[] = [];
    dr.addModifier('c', () => void order.push('c'), 5);
    dr.addModifier('a', () => void order.push('a'), -1);
    dr.addModifier('b1', () => void order.push('b1'), 0);
    dr.addModifier('b2', () => void order.push('b2'), 0);
    hit(enemy, 1);
    expect(order).toEqual(['a', 'b1', 'b2', 'c']);
  });

  it('receive target and attacker (null without one)', () => {
    const { enemy, hit, dr, player } = make();
    const m = vi.fn();
    dr.addModifier('m', m);
    hit(enemy, 1);
    expect(m.mock.calls[0][1]).toBe(enemy);
    expect(m.mock.calls[0][2]).toBe(player);
    dr.apply({ attackerId: null, targetId: enemy.id, amount: 1, kind: 'fall' });
    expect(m.mock.calls[1][2]).toBeNull();
  });

  it('a throwing modifier is skipped and warned about; later ones still run', () => {
    const { enemy, hit, dr, warn } = make();
    const later = vi.fn();
    dr.addModifier('bad', () => {
      throw new Error('x');
    });
    dr.addModifier('good', later, 1);
    const r = hit(enemy, 5)!;
    expect(r.dealt).toBe(5);
    expect(later).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('duplicate id throws; removal works and frees the id', () => {
    const { dr, hit, enemy } = make();
    const fn = vi.fn();
    const off = dr.addModifier('m', fn);
    expect(() => dr.addModifier('m', fn)).toThrow(/duplicate modifier "m"/);
    off();
    off();
    hit(enemy, 1);
    expect(fn).not.toHaveBeenCalled();
    expect(() => dr.addModifier('m', fn)).not.toThrow();
  });

  it('a modifier that kills the target drops the hit', () => {
    const { dr, enemy, hit, of } = make();
    dr.addModifier('assassin', (_r, t) => {
      dr.kill(t.id);
    });
    expect(hit(enemy, 1)).toBeNull();
    expect(enemy.dead).toBe(true);
    expect(of('actor.died')).toHaveLength(1);
    expect(of('damage.dealt')).toHaveLength(1); // only the nested kill's
  });

  it('a modifier that despawns the target drops the hit', () => {
    const { dr, enemy, hit, actors } = make();
    dr.addModifier('rm', (_r, t) => actors.despawn(t.id));
    expect(hit(enemy, 1)).toBeNull();
  });

  it('apply from inside a modifier resolves fully and its events are delivered after the outer hit events (contract 4.3)', () => {
    const { dr, enemy, player, hit, of } = make();
    let done = false;
    dr.addModifier('thorns', (_r, _t, attacker) => {
      if (done || !attacker) return;
      done = true;
      dr.apply({ attackerId: enemy.id, targetId: player.id, amount: 3, kind: 'melee' });
    });
    hit(enemy, 5);
    expect(player.health).toBe(97);
    expect(enemy.health).toBe(25);
    expect(of('damage.dealt').map((d) => d.targetId)).toEqual([enemy.id, player.id]);
  });
});

describe('poise and stagger', () => {
  it('crossing to 0 staggers once; already 0 does not re-stagger', () => {
    const { enemy, hit, of } = make();
    hit(enemy, 1, { poise: 20 });
    expect(of('actor.staggered')).toHaveLength(1);
    const r = hit(enemy, 1, { poise: 20 })!;
    expect(of('actor.staggered')).toHaveLength(1);
    expect(r.staggered).toBe(false);
    expect(r.poiseDealt).toBe(0);
  });

  it('poise overkill clamps at 0', () => {
    const { enemy, hit } = make();
    const r = hit(enemy, 1, { poise: 500 })!;
    expect(r.poiseDealt).toBe(20);
    expect(enemy.poise).toBe(0);
  });

  it('actors with no poise pool never stagger', () => {
    const { actors, hit, of } = make();
    const a = actors.spawn({ kind: 'rock', team: 'hostile', maxHealth: 10 });
    hit(a, 1, { poise: 10 });
    expect(of('actor.staggered')).toEqual([]);
  });

  it('a killing blow does not also stagger', () => {
    const { enemy, hit, of } = make();
    const r = hit(enemy, 30, { poise: 20 })!;
    expect(r.killed).toBe(true);
    expect(r.staggered).toBe(false);
    expect(of('actor.staggered')).toEqual([]);
  });

  it('staggered event carries the attacker id (null for environment)', () => {
    const { enemy, hit, of, player, dr } = make();
    hit(enemy, 1, { poise: 20 });
    expect(of('actor.staggered')[0]).toEqual({ actorId: enemy.id, byId: player.id });
    const { dr: dr2, enemy: e2, of: of2 } = make();
    dr2.apply({ attackerId: null, targetId: e2.id, amount: 0, poise: 20, kind: 'script' });
    expect(of2('actor.staggered')[0].byId).toBeNull();
    void dr;
  });

  it('event order is dealt, staggered, died', () => {
    const { enemy, hit, log, dr } = make();
    // saved + staggered: dealt, saved, staggered
    dr.addLethalHandler('sw', (t) => {
      t.health = 5;
      return true;
    });
    hit(enemy, 100, { poise: 20 });
    expect(log).toEqual(['damage.dealt', 'actor.saved', 'actor.staggered']);
  });

  it('dealt, staggered then died ordering for a non-fatal stagger followed by a kill', () => {
    const { enemy, hit, log } = make();
    hit(enemy, 1, { poise: 20 });
    hit(enemy, 100);
    expect(log).toEqual(['damage.dealt', 'actor.staggered', 'damage.dealt', 'actor.died']);
  });

  it('a 0-amount hit is poise only: no health change, can stagger, emits damage.dealt', () => {
    const { enemy, hit, of } = make();
    const r = hit(enemy, 0, { poise: 20 })!;
    expect(r.dealt).toBe(0);
    expect(r.staggered).toBe(true);
    expect(enemy.health).toBe(30);
    expect(of('damage.dealt')).toHaveLength(1);
  });

  describe('stagger()', () => {
    it('breaks poise, emits only actor.staggered, returns true', () => {
      const { dr, enemy, player, log } = make();
      expect(dr.stagger(enemy.id, player.id, 20)).toBe(true);
      expect(enemy.poise).toBe(0);
      expect(log).toEqual(['actor.staggered']);
    });
    it('partial poise damage returns false and no event', () => {
      const { dr, enemy, log } = make();
      expect(dr.stagger(enemy.id, null, 5)).toBe(false);
      expect(enemy.poise).toBe(15);
      expect(log).toEqual([]);
    });
    it('returns false for unknown, dead, unhittable, no-poise, bad amounts, or poise already 0', () => {
      const { dr, enemy, npc, actors, hit } = make();
      const rock = actors.spawn({ kind: 'rock', team: 'hostile', maxHealth: 5 });
      expect(dr.stagger('ghost', null, 5)).toBe(false);
      expect(dr.stagger(npc.id, null, 5)).toBe(false);
      expect(dr.stagger(rock.id, null, 5)).toBe(false);
      for (const p of [0, -1, NaN, Infinity]) expect(dr.stagger(enemy.id, null, p)).toBe(false);
      expect(enemy.poise).toBe(20);
      dr.stagger(enemy.id, null, 20);
      expect(dr.stagger(enemy.id, null, 5)).toBe(false);
      hit(enemy, 100);
      enemy.poise = 10;
      expect(dr.stagger(enemy.id, null, 5)).toBe(false);
    });
  });
});

describe('lethal handlers', () => {
  it('a saving handler prevents death: no actor.died, actor.saved emitted, health above 0', () => {
    const { dr, enemy, hit, of, log } = make();
    dr.addLethalHandler('second-wind', (t) => {
      t.health = 15;
      return true;
    });
    const r = hit(enemy, 100)!;
    expect(r.saved).toBe(true);
    expect(r.killed).toBe(false);
    expect(enemy.dead).toBe(false);
    expect(enemy.health).toBe(15);
    expect(r.healthAfter).toBe(15);
    expect(log).not.toContain('actor.died');
    expect(of('actor.saved')).toEqual([expect.objectContaining({ actorId: enemy.id, handlerId: 'second-wind' })]);
    expect(of('actor.saved')[0].request.amount).toBe(100);
  });

  it('a handler that returns true without setting health leaves 1 (or max if smaller)', () => {
    const { dr, enemy, hit, actors } = make();
    dr.addLethalHandler('lazy', () => true);
    hit(enemy, 100);
    expect(enemy.health).toBe(1);
    const tiny = actors.spawn({ kind: 'tiny', team: 'hostile', maxHealth: 0.5 });
    hit(tiny, 100);
    expect(tiny.health).toBe(0.5);
  });

  it('the first true handler wins; later ones are not run', () => {
    const { dr, enemy, hit, of } = make();
    const second = vi.fn(() => true);
    dr.addLethalHandler('no', () => false, 0);
    dr.addLethalHandler('yes', () => true, 1);
    dr.addLethalHandler('later', second, 2);
    hit(enemy, 100);
    expect(second).not.toHaveBeenCalled();
    expect(of('actor.saved')[0].handlerId).toBe('yes');
  });

  it('handlers run in order', () => {
    const { dr, enemy, hit } = make();
    const order: string[] = [];
    dr.addLethalHandler('b', () => (order.push('b'), false), 2);
    dr.addLethalHandler('a', () => (order.push('a'), false), 1);
    hit(enemy, 100);
    expect(order).toEqual(['a', 'b']);
  });

  it('a throwing handler is skipped with a warning', () => {
    const { dr, enemy, hit, warn, of } = make();
    dr.addLethalHandler('bad', () => {
      throw new Error('x');
    });
    dr.addLethalHandler('good', () => true, 1);
    hit(enemy, 100);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(of('actor.saved')[0].handlerId).toBe('good');
  });

  it('only truthy-true counts: other return values do not save', () => {
    const { dr, enemy, hit } = make();
    dr.addLethalHandler('weird', (() => 1) as never);
    hit(enemy, 100);
    expect(enemy.dead).toBe(true);
  });

  it('handlers are not consulted for non-lethal hits or 0-amount hits at 0 health is not reachable', () => {
    const { dr, enemy, hit } = make();
    const h = vi.fn(() => true);
    dr.addLethalHandler('h', h);
    hit(enemy, 5);
    hit(enemy, 0, { poise: 1 });
    expect(h).not.toHaveBeenCalled();
  });

  it('the handler sees the partial result with dealt and healthAfter 0', () => {
    const { dr, enemy, hit } = make();
    let seen: unknown;
    dr.addLethalHandler('spy', (_t, r) => {
      seen = r;
      return false;
    });
    hit(enemy, 100);
    expect(seen).toMatchObject({ dealt: 30, healthAfter: 0, killed: false, saved: false });
  });

  it('duplicate id throws; removal works', () => {
    const { dr, enemy, hit } = make();
    const off = dr.addLethalHandler('h', () => true);
    expect(() => dr.addLethalHandler('h', () => true)).toThrow(/duplicate lethal handler/);
    off();
    hit(enemy, 100);
    expect(enemy.dead).toBe(true);
  });

  it('can be saved more than once', () => {
    const { dr, enemy, hit } = make();
    dr.addLethalHandler('h', (t) => ((t.health = 10), true));
    hit(enemy, 100);
    hit(enemy, 100);
    expect(enemy.dead).toBe(false);
  });
});

describe('re-entrancy through events', () => {
  it('apply from inside a damage.dealt listener works and its events come after', () => {
    const { dr, enemy, events, player, log } = make();
    let once = true;
    events.on('damage.dealt', (d) => {
      if (once && d.targetId === enemy.id) {
        once = false;
        dr.apply({ attackerId: enemy.id, targetId: player.id, amount: 2, kind: 'melee' });
      }
    });
    dr.apply({ attackerId: player.id, targetId: enemy.id, amount: 100, kind: 'melee' });
    expect(player.health).toBe(98);
    expect(log).toEqual(['damage.dealt', 'actor.died', 'damage.dealt']);
  });

  it('revive from a damage.dealt listener: actor.revived is delivered after actor.died', () => {
    const { dr, enemy, events, hit, log } = make();
    events.on('damage.dealt', (d) => {
      if (d.killed) dr.revive(d.targetId, 0.5, 'script');
    });
    hit(enemy, 100);
    expect(log).toEqual(['damage.dealt', 'actor.died', 'actor.revived']);
    expect(enemy.dead).toBe(false);
  });
});

describe('heal', () => {
  it('adds health and returns the amount added; clamps to max', () => {
    const { dr, enemy, hit } = make();
    hit(enemy, 20);
    expect(dr.heal(enemy.id, 5)).toBe(5);
    expect(enemy.health).toBe(15);
    expect(dr.heal(enemy.id, 1000)).toBe(15);
    expect(enemy.health).toBe(30);
    expect(dr.heal(enemy.id, 1)).toBe(0);
  });
  it('returns 0 for dead, unknown, and bad amounts', () => {
    const { dr, enemy, hit } = make();
    for (const a of [0, -1, NaN, Infinity]) expect(dr.heal(enemy.id, a)).toBe(0);
    expect(dr.heal('ghost', 5)).toBe(0);
    hit(enemy, 100);
    expect(dr.heal(enemy.id, 5)).toBe(0);
    expect(enemy.health).toBe(0);
  });
});

describe('revive', () => {
  it('brings a dead actor back with a fraction of max health, full poise, and emits actor.revived', () => {
    const { dr, enemy, hit, of } = make();
    hit(enemy, 100, { poise: 0 });
    enemy.poise = 3;
    expect(dr.revive(enemy.id, 0.5, 'respawn')).toBe(true);
    expect(enemy.dead).toBe(false);
    expect(enemy.health).toBe(15);
    expect(enemy.poise).toBe(20);
    expect(of('actor.revived')).toEqual([{ actorId: enemy.id, reason: 'respawn', health: 15 }]);
  });
  it('fraction 1 is allowed', () => {
    const { dr, enemy, hit } = make();
    hit(enemy, 100);
    expect(dr.revive(enemy.id, 1, 'script')).toBe(true);
    expect(enemy.health).toBe(30);
  });
  it('only when dead', () => {
    const { dr, enemy, of } = make();
    expect(dr.revive(enemy.id, 0.5, 'script')).toBe(false);
    expect(dr.revive('ghost', 0.5, 'script')).toBe(false);
    expect(of('actor.revived')).toEqual([]);
  });
  it.each([0, -0.5, 1.5, NaN, Infinity])('fraction %s is rejected with a warning and the actor stays dead', (f) => {
    const { dr, enemy, hit, warn } = make();
    hit(enemy, 100);
    expect(dr.revive(enemy.id, f, 'script')).toBe(false);
    expect(enemy.dead).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('a revived actor can die again, emitting a second actor.died', () => {
    const { dr, enemy, hit, of } = make();
    hit(enemy, 100);
    dr.revive(enemy.id, 1, 'script');
    hit(enemy, 100);
    expect(of('actor.died')).toHaveLength(2);
  });
  it('a revive in an actor.died listener works', () => {
    const { dr, enemy, events, hit } = make();
    events.on('actor.died', (p) => void dr.revive(p.actorId, 0.5, 'script'));
    hit(enemy, 100);
    expect(enemy.dead).toBe(false);
    expect(enemy.health).toBe(15);
  });
});

describe('kill', () => {
  it('scripted kill ignores i-frames and modifiers, reports killer, applies kind script', () => {
    const { dr, enemy, player, of } = make();
    enemy.invulnerable = true;
    const m = vi.fn();
    dr.addModifier('m', m);
    dr.kill(enemy.id, player.id);
    expect(enemy.dead).toBe(true);
    expect(m).not.toHaveBeenCalled();
    expect(of('actor.died')[0].killerId).toBe(player.id);
    expect(of('damage.dealt')[0]).toMatchObject({ kind: 'script', attackerId: null, outcome: 'hit' });
  });
  it('bypasses the team rule', () => {
    const { dr, player, of } = make();
    dr.kill(player.id);
    expect(player.dead).toBe(true);
    expect(of('actor.died')[0].killerId).toBeNull();
  });
  it('lethal handlers may still prevent it', () => {
    const { dr, enemy } = make();
    dr.addLethalHandler('h', (t) => ((t.health = 5), true));
    dr.kill(enemy.id);
    expect(enemy.dead).toBe(false);
    expect(enemy.health).toBe(5);
  });
  it('unknown and already dead are no-ops', () => {
    const { dr, enemy, of } = make();
    dr.kill('ghost');
    dr.kill(enemy.id);
    dr.kill(enemy.id);
    expect(of('actor.died')).toHaveLength(1);
  });
  it('does not touch poise', () => {
    const { dr, enemy } = make();
    dr.kill(enemy.id);
    expect(enemy.poise).toBe(20);
  });
});

describe('despawn during actor.died', () => {
  it('the hit still returns its result', () => {
    const { dr, enemy, actors, events, hit } = make();
    void dr;
    events.on('actor.died', (p) => actors.despawn(p.actorId));
    const r = hit(enemy, 100);
    expect(r?.killed).toBe(true);
    expect(actors.get(enemy.id)).toBeUndefined();
  });
});

describe('payload geometry', () => {
  it('passes point, normal and direction through to the result', () => {
    const { enemy, hit } = make();
    const point = new THREE.Vector3(1, 2, 3);
    const r = hit(enemy, 1, { point, bone: 'head', attackId: 'x', swingId: 4 })!;
    expect(r.point).toBe(point);
    expect(r).toMatchObject({ bone: 'head', attackId: 'x', swingId: 4 });
  });
});

describe('lead additions', () => {
  it('a parry modifier staggering the attacker delivers damage.dealt (parried) before actor.staggered', () => {
    const t = make();
    t.dr.addModifier('parry', (req) => {
      req.outcome = 'parried';
      t.dr.stagger(req.attackerId!, req.targetId, 100);
    });
    const res = t.dr.apply({ attackerId: t.enemy.id, targetId: t.player.id, amount: 10, kind: 'melee' });
    expect(res).toMatchObject({ outcome: 'parried', dealt: 0, poiseDealt: 0 });
    expect(t.log).toEqual(['damage.dealt', 'actor.staggered']);
    expect(t.of('actor.staggered')[0]).toEqual({ actorId: t.enemy.id, byId: t.player.id });
  });

  it('events of a nested apply queued by a dropped outer hit are still delivered', () => {
    const t = make();
    t.dr.addModifier('chain', (req) => {
      if (req.targetId === t.enemy.id) {
        t.dr.apply({ attackerId: t.player.id, targetId: t.dummy.id, amount: 1, kind: 'melee' });
        t.actors.despawn(t.enemy.id); // the outer target vanishes mid-resolution
      }
    });
    expect(t.hit(t.enemy, 5)).toBeNull();
    expect(t.of('damage.dealt').map((d) => d.targetId)).toEqual([t.dummy.id]);
  });

  it('a scripted kill works on a non-hittable NPC', () => {
    const t = make();
    t.dr.kill(t.npc.id, null);
    expect(t.npc.dead).toBe(true);
    expect(t.of('actor.died')).toHaveLength(1);
  });

  it('stagger outside any hit emits at once', () => {
    const t = make();
    expect(t.dr.stagger(t.enemy.id, null, 25)).toBe(true);
    expect(t.log).toEqual(['actor.staggered']);
  });
});

describe('unblockable', () => {
  it('undoes a defender modifier that blocks or parries an unblockable hit, warning once per modifier', () => {
    const t = make();
    t.dr.addModifier('block', (req) => {
      req.outcome = 'blocked';
      req.amount *= 0.2;
    }, -50);
    const a = t.dr.apply({ attackerId: t.enemy.id, targetId: t.player.id, amount: 10, kind: 'melee', unblockable: true });
    expect(a).toMatchObject({ outcome: 'hit', dealt: 10 });
    t.dr.apply({ attackerId: t.enemy.id, targetId: t.player.id, amount: 10, kind: 'melee', unblockable: true });
    expect(t.warn.mock.calls.filter((c) => String(c[0]).includes('unblockable'))).toHaveLength(1);
    const blocked = t.dr.apply({ attackerId: t.enemy.id, targetId: t.player.id, amount: 10, kind: 'melee' });
    expect(blocked).toMatchObject({ outcome: 'blocked', dealt: 2 });
  });

  it('an attacker-side modifier can mark the hit unblockable before the defender band runs', () => {
    const t = make();
    t.dr.addModifier('red-sweep', (req) => void (req.unblockable = true), -150);
    t.dr.addModifier('parry', (req) => void (req.outcome = 'parried'), -50);
    expect(t.dr.apply({ attackerId: t.enemy.id, targetId: t.player.id, amount: 5, kind: 'melee' })?.outcome).toBe('hit');
  });

  it('i-frames still make an unblockable hit immune', () => {
    const t = make();
    t.player.invulnerable = true;
    expect(t.dr.apply({ attackerId: t.enemy.id, targetId: t.player.id, amount: 5, kind: 'melee', unblockable: true })).toMatchObject({ outcome: 'immune', dealt: 0 });
  });
});
