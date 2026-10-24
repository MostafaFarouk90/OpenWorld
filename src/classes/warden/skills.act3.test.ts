import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver, type DamageRequest } from '../../actors/DamageResolver';
import type { MercyState } from '../../actors/Actor';
import { playerInit } from '../../actors/teams';
import { COMBAT } from '../../config/constants';
import { GameEvents } from '../../core/events';
import { FakeActor, FakeActors } from '../../spells/testHost';
import { Earthroot, FrenziedHearth, Skullsplitter, StaggerWatch } from './skills.act3';
import { EARTHROOT, FRENZIED_HEARTH, SKILL_IDS, SKULLSPLITTER } from './tuning';
import '../../hud/events';

const events = () => new GameEvents(() => {});

describe('StaggerWatch', () => {
  function rig() {
    const e = events();
    const player = new FakeActor('player', 'player');
    const actors = new FakeActors(player);
    const clock = { t: 0 };
    const view = new Map<string, string>();
    const w = new StaggerWatch({ events: e as never, actors, now: () => clock.t, enemyState: (id) => view.get(id) });
    const foe = actors.add(new FakeActor('foe', 'hostile', 1, 0)) as FakeActor & { poise?: number; maxPoise?: number };
    return { e, clock, w, foe, view };
  }

  it('is true for 1.2 s after an actor.staggered (fake clock at 1.19 and 1.21 s)', () => {
    const r = rig();
    expect(r.w.isStaggered('foe')).toBe(false);
    r.clock.t = 10;
    r.e.emit('actor.staggered', { actorId: 'foe', byId: 'player' });
    expect(r.w.isStaggered('foe', 10)).toBe(true);
    expect(r.w.isStaggered('foe', 11.19)).toBe(true);
    expect(r.w.isStaggered('foe', 11.21)).toBe(false);
    r.clock.t = 11.19;
    expect(r.w.isStaggered('foe')).toBe(true);
    expect(r.w.isStaggered('other', 10)).toBe(false);
  });

  it('is true when an actor with a poise bar is at 0 poise, and not for one without a bar', () => {
    const r = rig();
    r.foe.maxPoise = 20;
    r.foe.poise = 1;
    expect(r.w.isStaggered('foe')).toBe(false);
    r.foe.poise = 0;
    expect(r.w.isStaggered('foe')).toBe(true);
    r.foe.maxPoise = 0;
    expect(r.w.isStaggered('foe')).toBe(false);
  });

  it('is true while the enemies view state is stagger', () => {
    const r = rig();
    r.view.set('foe', 'chase');
    expect(r.w.isStaggered('foe')).toBe(false);
    r.view.set('foe', 'stagger');
    expect(r.w.isStaggered('foe')).toBe(true);
  });

  it('forgets an actor on died, despawned, calm and save.loaded; dispose stops listening', () => {
    const r = rig();
    const stagger = () => r.e.emit('actor.staggered', { actorId: 'foe', byId: null });
    stagger();
    r.e.emit('actor.died', { actorId: 'foe', killerId: null, kind: 'x', team: 'hostile', level: 1 } as never);
    expect(r.w.isStaggered('foe')).toBe(false);
    stagger();
    r.e.emit('actor.despawned', { actorId: 'foe' });
    expect(r.w.isStaggered('foe')).toBe(false);
    stagger();
    r.e.emit('ai.calm', { actorId: 'foe' });
    expect(r.w.isStaggered('foe')).toBe(false);
    stagger();
    r.e.emit('save.loaded' as never, {} as never);
    expect(r.w.isStaggered('foe')).toBe(false);
    r.w.dispose();
    stagger();
    expect(r.w.isStaggered('foe')).toBe(false);
  });
});

describe('Skullsplitter', () => {
  function rig() {
    const player = new FakeActor('player', 'player', 0, 0);
    const actors = new FakeActors(player);
    const applied: any[] = [];
    const st = { blocked: null as string | null, clip: true, interrupted: false, staggered: new Set<string>(), yaw: 0 };
    const clips: string[] = [];
    const triggers: string[] = [];
    const fxCalls: boolean[] = [];
    const h = new Skullsplitter(
      {
        actors,
        damage: { apply: (r) => void applied.push(r) },
        stagger: { isStaggered: (id) => st.staggered.has(id) },
        now: () => 0,
        feet: () => ({ x: 0, y: 0, z: 0 }),
        facingYaw: () => st.yaw,
        blockedReason: () => st.blocked,
        playClip: (c) => (clips.push(c), st.clip),
        interrupted: () => st.interrupted,
        reportTrigger: (id) => void triggers.push(id),
        fx: { chop: (_at, _yaw, s) => void fxCalls.push(s) },
        skillId: SKILL_IDS.skullsplitter,
      },
      () => 'player',
    );
    // Yaw 0 faces -z.
    const foe = (id: string, x: number, z: number) => actors.add(new FakeActor(id, 'hostile', x, z));
    const run = (n: number) => {
      for (let i = 0; i < n; i++) h.tick();
    };
    return { player, actors, applied, st, clips, triggers, fxCalls, h, foe, run };
  }

  it('plays the chop clip, reports the trigger, and lands nothing before the blade is hot', () => {
    const r = rig();
    r.foe('a', 0, -1);
    expect(r.h.start()).toEqual({ ok: true });
    expect(r.clips).toEqual([SKULLSPLITTER.clip]);
    expect(r.triggers).toEqual([SKILL_IDS.skullsplitter]);
    r.run(SKULLSPLITTER.hitFromTick - 1);
    expect(r.applied).toEqual([]);
    r.run(1);
    expect(r.applied).toHaveLength(1);
  });

  it('hits the nearest foe once: 1.6x the weapon base, poise 40, kind melee', () => {
    const r = rig();
    r.foe('far', 0, -2);
    r.foe('near', 0, -1);
    r.h.start();
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]).toMatchObject({ attackerId: 'player', targetId: 'near', poise: 40, kind: 'melee', attackId: SKULLSPLITTER.attackId });
    expect(r.applied[0].amount).toBeCloseTo(COMBAT.baseDamage * 1.6);
    expect(r.fxCalls).toEqual([false]);
    expect(r.h.chopping).toBe(false);
  });

  it('doubles the damage on a staggered target and tells the effect', () => {
    const r = rig();
    r.foe('a', 0, -1);
    r.st.staggered.add('a');
    r.h.start();
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied[0].amount).toBeCloseTo(COMBAT.baseDamage * 1.6 * 2);
    expect(r.applied[0].poise).toBe(40);
    expect(r.fxCalls).toEqual([true]);
  });

  it('keeps to the 90 degree front arc and the 2.6 m reach', () => {
    const r = rig();
    r.foe('behind', 0, 1);
    r.foe('side', 2, 0);
    r.foe('out', 0, -2.7);
    r.foe('in44', Math.sin((44 * Math.PI) / 180) * 2, -Math.cos((44 * Math.PI) / 180) * 2);
    r.foe('out46', Math.sin((46 * Math.PI) / 180) * 1.5, -Math.cos((46 * Math.PI) / 180) * 1.5);
    r.foe('edge', 0, -2.6);
    r.h.start();
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied.map((a) => a.targetId)).toEqual(['in44']);
    const r2 = rig();
    r2.foe('edge', 0, -2.6);
    r2.h.start();
    r2.run(SKULLSPLITTER.ticks);
    expect(r2.applied.map((a) => a.targetId)).toEqual(['edge']);
  });

  it('follows the facing yaw', () => {
    const r = rig();
    r.st.yaw = Math.PI / 2; // faces -x
    r.foe('west', -1.5, 0);
    r.foe('east', 1.5, 0);
    r.h.start();
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied.map((a) => a.targetId)).toEqual(['west']);
  });

  it('a foe that walks into the arc during the window is hit then, once', () => {
    const r = rig();
    const f = r.foe('walker', 0, -5);
    r.h.start();
    r.run(SKULLSPLITTER.hitFromTick + 2);
    expect(r.applied).toEqual([]);
    f.pos.set(0, 0, -1);
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied).toHaveLength(1);
  });

  it('skips the dead, the unhittable, allies, neutrals and every mercy state; a throwing reader counts as none', () => {
    const r = rig();
    r.foe('dead', 0, -1).kill();
    r.foe('ghost', 0, -1.1).hittable = false;
    r.actors.add(new FakeActor('ally', 'ally', 0, -1.2));
    r.actors.add(new FakeActor('npc', 'neutral', 0, -1.2));
    for (const s of ['yielding', 'staggered', 'calming', 'releasing', 'leaving'] as MercyState[]) {
      (r.foe(`m-${s}`, 0, -1.3) as any).mercyState = () => s;
    }
    (r.foe('throws', 0, -2) as any).mercyState = () => {
      throw new Error('boom');
    };
    r.h.start();
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied.map((a) => a.targetId)).toEqual(['throws']);
  });

  it('refuses while blocked or when the clip is refused, and cannot start twice', () => {
    const r = rig();
    for (const why of ['dead', 'staggered', 'busy']) {
      r.st.blocked = why;
      expect(r.h.start()).toEqual({ ok: false, reason: why });
    }
    r.st.blocked = null;
    r.st.clip = false;
    expect(r.h.start()).toEqual({ ok: false, reason: 'busy' });
    expect(r.triggers).toEqual([]);
    r.st.clip = true;
    r.h.start();
    expect(r.h.start()).toEqual({ ok: false, reason: 'chopping' });
  });

  it('a stagger, death or dodge cancels the chop; cancel() ends it at once', () => {
    const r = rig();
    r.foe('a', 0, -1);
    r.h.start();
    r.run(3);
    r.st.interrupted = true;
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied).toEqual([]);
    expect(r.h.chopping).toBe(false);
    r.st.interrupted = false;
    r.h.start();
    r.h.cancel();
    r.run(SKULLSPLITTER.ticks);
    expect(r.applied).toEqual([]);
  });
});

function world() {
  const e = events();
  const actors = new ActorRegistry(e);
  const dr = new DamageResolver(actors, e, () => {});
  const player = actors.spawn(playerInit());
  const foe = actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 500, maxPoise: 20 });
  return { e, actors, dr, player, foe };
}

describe('Earthroot', () => {
  function rig(learned = true) {
    const player = new FakeActor('player', 'player', 0, 0);
    const actors = new FakeActors(player);
    const e = events();
    const applied: any[] = [];
    const st = {
      t: 0,
      learned,
      blocked: null as string | null,
      dodging: false,
      locks: 0,
      unlocks: 0,
      fxStarted: 0,
      fxStopped: 0,
      shocks: 0,
      triggers: [] as string[],
    };
    const r = new Earthroot(
      {
        events: e as never,
        actors,
        damage: { apply: (q) => void applied.push(q) },
        now: () => st.t,
        learned: () => st.learned,
        feet: () => ({ x: 0, y: 0, z: 0 }),
        blockedReason: () => st.blocked,
        lockMove: () => (st.locks++, () => void st.unlocks++),
        dodging: () => st.dodging,
        fx: () => (st.fxStarted++, () => void st.fxStopped++),
        shockFx: () => void st.shocks++,
        reportTrigger: (id) => void st.triggers.push(id),
        skillId: SKILL_IDS.earthroot,
      },
      () => 'player',
    );
    const foe = (id: string, x: number, z: number) => actors.add(new FakeActor(id, 'hostile', x, z));
    const hurt = (extra: Record<string, unknown> = {}) =>
      e.emit('damage.dealt', { attackerId: 'wolf', targetId: 'player', amount: 10, poise: 10, kind: 'melee', outcome: 'hit', dealt: 10, poiseDealt: 10, healthAfter: 90, killed: false, saved: false, staggered: false, ...extra } as never);
    foe('wolf', 5, 5);
    return { actors, e, applied, st, r, foe, hurt };
  }

  it('plants: locks movement, starts the strips, reports the trigger; expires after 5 s', () => {
    const { r, st } = rig();
    expect(r.start()).toEqual({ ok: true });
    expect(st).toMatchObject({ locks: 1, fxStarted: 1, triggers: [SKILL_IDS.earthroot] });
    expect(r.active).toBe(true);
    st.t = 4.99;
    r.tick();
    expect(r.active).toBe(true);
    st.t = 5;
    r.tick();
    expect(r.active).toBe(false);
    expect(st).toMatchObject({ unlocks: 1, fxStopped: 1 });
  });

  it('refuses while blocked, while already rooted, and costs nothing then', () => {
    const { r, st } = rig();
    for (const why of ['dead', 'staggered', 'busy']) {
      st.blocked = why;
      expect(r.start()).toEqual({ ok: false, reason: why });
    }
    expect(st.locks).toBe(0);
    st.blocked = null;
    r.start();
    expect(r.start()).toEqual({ ok: false, reason: 'rooted' });
    expect(st.locks).toBe(1);
  });

  it('a dodge (rising edge of the dodge action) ends it early', () => {
    const { r, st } = rig();
    r.start();
    r.tick();
    expect(r.active).toBe(true);
    st.dodging = true;
    r.tick();
    expect(r.active).toBe(false);
    expect(st.unlocks).toBe(1);
  });

  it('ends on death, save.loaded, a respec (not learned) and dispose', () => {
    for (const how of ['died', 'load', 'respec', 'dispose'] as const) {
      const { r, st, e } = rig();
      r.start();
      if (how === 'died') e.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1 } as never);
      if (how === 'load') e.emit('save.loaded' as never, {} as never);
      if (how === 'respec') {
        st.learned = false;
        r.tick();
      }
      if (how === 'dispose') r.dispose();
      expect(r.active, how).toBe(false);
      expect(st.unlocks, how).toBe(1);
    }
  });

  it('another actor dying does not end it', () => {
    const { r, e } = rig();
    r.start();
    e.emit('actor.died', { actorId: 'wolf', killerId: null, kind: 'x', team: 'hostile', level: 1 } as never);
    expect(r.active).toBe(true);
  });

  it('zeroes the poise of hits on the player while rooted and nothing else', () => {
    const { r } = rig();
    const q = { poise: 30 };
    r.modify(q, 'player');
    expect(q.poise).toBe(30);
    r.start();
    r.modify(q, 'wolf');
    expect(q.poise).toBe(30);
    r.modify(q, 'player');
    expect(q.poise).toBe(0);
  });

  it('with a real DamageResolver: runs after the guard (-50) and Oathward (-40), keeps the blocked outcome, leaves the health damage', () => {
    const w = world();
    const q = new Earthroot(
      {
        events: w.e as never,
        actors: new FakeActors(new FakeActor('player', 'player')),
        damage: { apply: () => {} },
        now: () => 0,
        learned: () => true,
        feet: () => ({ x: 0, y: 0, z: 0 }),
        blockedReason: () => null,
        lockMove: () => () => {},
        dodging: () => false,
        reportTrigger: () => {},
        skillId: SKILL_IDS.earthroot,
      },
      () => w.player.id,
    );
    q.start();
    const order: string[] = [];
    // A stand-in guard at -50: blocks, scales the amount and the poise.
    w.dr.addModifier('fake-guard', (req, target) => {
      if (target.id !== w.player.id) return;
      order.push('guard');
      req.outcome = 'blocked';
      req.amount *= 0.2;
      req.poise *= 0.2;
    }, -50);
    w.dr.addModifier(EARTHROOT.modifierId, (req, target) => (order.push('root'), q.modify(req, target.id)), EARTHROOT.order);
    let seenPoise = -1;
    w.dr.addModifier('probe', (req, target) => void (target.id === w.player.id && (seenPoise = req.poise)), 0);
    const res = w.dr.apply({ attackerId: w.foe.id, targetId: w.player.id, amount: 20, poise: 50, kind: 'melee' } as DamageRequest)!;
    expect(order).toEqual(['guard', 'root']);
    expect(EARTHROOT.order).toBeLessThan(0);
    expect(EARTHROOT.order).toBeGreaterThan(-50);
    expect(seenPoise).toBe(0);
    expect(res.outcome).toBe('blocked');
    expect(res.dealt).toBeCloseTo(4);
    expect(res.staggered).toBe(false);
  });

  it('a hostile hit released a shockwave: 0.5x base and poise 20 on hostiles within 3 m, none on allies or mercy foes', () => {
    const { r, st, applied, foe, actors, hurt } = rig();
    foe('near', 2, 0);
    foe('edge', 0, 3);
    foe('far', 3.1, 0);
    actors.add(new FakeActor('ally', 'ally', 1, 0));
    (foe('yielding', 1, 1) as any).mercyState = () => 'yielding';
    foe('dead', 1, -1).kill();
    r.start();
    hurt();
    expect(applied.map((a) => a.targetId).sort()).toEqual(['edge', 'near']);
    for (const a of applied) {
      expect(a).toMatchObject({ attackerId: 'player', poise: 20, kind: 'melee', attackId: EARTHROOT.attackId });
      expect(a.amount).toBeCloseTo(COMBAT.baseDamage * 0.5);
    }
    expect(st.shocks).toBe(1);
  });

  it('at most once per 0.75 s', () => {
    const { r, st, applied, foe, hurt } = rig();
    foe('near', 1, 0);
    r.start();
    hurt();
    st.t = 0.74;
    hurt();
    expect(applied).toHaveLength(1);
    st.t = 0.75;
    hurt();
    expect(applied).toHaveLength(2);
  });

  it('ignores blocked, parried and immune hits, status ticks, hits on others, ally attackers, and hits while not rooted', () => {
    const { r, applied, foe, hurt, actors } = rig();
    foe('near', 1, 0);
    actors.add(new FakeActor('buddy', 'ally', 4, 4));
    hurt();
    expect(applied).toEqual([]);
    r.start();
    for (const outcome of ['blocked', 'parried', 'immune']) hurt({ outcome });
    hurt({ kind: 'status' });
    hurt({ targetId: 'wolf' });
    hurt({ attackerId: 'buddy' });
    hurt({ attackerId: null });
    expect(applied).toEqual([]);
  });

  it('the shockwave does not fire after the root ends', () => {
    const { r, st, applied, foe, hurt } = rig();
    foe('near', 1, 0);
    r.start();
    st.t = 5.1;
    r.tick();
    hurt();
    expect(applied).toEqual([]);
  });
});

describe('Frenzied Hearth', () => {
  function rig(learned = true) {
    const w = world();
    const st = { learned, tick: 0, fxStarted: 0, fxStopped: 0 };
    const heals: Array<{ id: string; amount: number }> = [];
    const f = new FrenziedHearth(
      {
        events: w.e as never,
        actor: () => w.player as never,
        tick: () => st.tick,
        learned: () => st.learned,
        heal: (id, amount) => void heals.push({ id, amount }),
        fx: () => (st.fxStarted++, () => void st.fxStopped++),
        skillId: SKILL_IDS.frenziedHearth,
      },
      () => w.player.id,
    );
    w.dr.addModifier(FRENZIED_HEARTH.modifierId, (req, target) => f.modify(req, target.id), FRENZIED_HEARTH.order);
    const hit = (amount = 10, poise = 40) =>
      w.dr.apply({ attackerId: w.foe.id, targetId: w.player.id, amount, poise, kind: 'melee' } as DamageRequest)!;
    const dealt = (extra: Record<string, unknown> = {}) =>
      w.e.emit('damage.dealt', { attackerId: w.player.id, targetId: w.foe.id, amount: 5, poise: 5, kind: 'melee', outcome: 'hit', dealt: 5, poiseDealt: 0, healthAfter: 90, killed: false, saved: false, staggered: false, ...extra } as never);
    return { ...w, st, heals, f, hit, dealt };
  }

  it('is below only strictly under 30%: exactly 30% is not', () => {
    const r = rig();
    r.player.maxHealth = 200;
    r.player.health = 60;
    expect(r.f.below).toBe(false);
    r.player.health = 59.9;
    expect(r.f.below).toBe(true);
    r.player.health = 120;
    expect(r.f.below).toBe(false);
  });

  it('reads the live max health: a max lowered as Burn would lowers the threshold with it', () => {
    const r = rig();
    r.player.maxHealth = 150;
    r.player.health = 60; // 40% of 150
    expect(r.f.below).toBe(false);
    r.player.maxHealth = 105; // Burn has lowered the maximum: the same 60 health is now 57%
    r.player.health = 31.5; // exactly 30% of the reduced max
    expect(r.f.below).toBe(false);
    r.player.health = 31.4;
    expect(r.f.below).toBe(true);
    // A raised maximum moves the line up: 74 of 250 is 29.6%.
    r.player.maxHealth = 250;
    r.player.health = 74;
    expect(r.f.below).toBe(true);
  });

  it('zeroes the poise of incoming hits below 30%, not at exactly 30%, and not when unlearned', () => {
    const r = rig();
    r.player.maxHealth = 100;
    r.player.health = 100;
    expect(r.hit(1, 40).poiseDealt).toBeGreaterThan(0);
    r.player.health = 30;
    expect(r.hit(1, 40).poise).toBe(40);
    r.player.health = 29;
    const res = r.hit(1, 40);
    expect(res.poise).toBe(0);
    expect(res.poiseDealt).toBe(0);
    expect(res.staggered).toBe(false);
    r.st.learned = false;
    expect(r.hit(1, 40).poise).toBe(40);
  });

  it('only changes hits on the player', () => {
    const r = rig();
    r.player.maxHealth = 100;
    r.player.health = 10;
    const q = { poise: 25 };
    r.f.modify(q, r.foe.id);
    expect(q.poise).toBe(25);
  });

  it('refills the poise bar each tick while below, and runs the effect until the health is back at 30%', () => {
    const r = rig();
    r.player.maxHealth = 100;
    r.player.health = 20;
    r.player.poise = 0;
    r.f.tick();
    expect(r.player.poise).toBe(r.player.maxPoise);
    expect(r.st.fxStarted).toBe(1);
    r.player.poise = 3;
    r.f.tick();
    expect(r.player.poise).toBe(r.player.maxPoise);
    expect(r.st.fxStarted).toBe(1);
    r.player.health = 30;
    r.player.poise = 3;
    r.f.tick();
    expect(r.player.poise).toBe(3);
    expect(r.st.fxStopped).toBe(1);
  });

  it('does not refill when unlearned and stops the effect on a respec', () => {
    const r = rig();
    r.player.maxHealth = 100;
    r.player.health = 20;
    r.f.tick();
    r.st.learned = false;
    r.player.poise = 1;
    r.f.tick();
    expect(r.player.poise).toBe(1);
    expect(r.st.fxStopped).toBe(1);
  });

  it('heals 2% of the current max for each melee hit landed below 30%, once per swing id', () => {
    const r = rig();
    r.player.maxHealth = 150 * 0.7;
    r.player.health = 20;
    r.dealt({ swingId: 4 });
    r.dealt({ swingId: 4 });
    expect(r.heals).toHaveLength(1);
    expect(r.heals[0].id).toBe(r.player.id);
    expect(r.heals[0].amount).toBeCloseTo(105 * 0.02);
    r.dealt({ swingId: 5 });
    expect(r.heals).toHaveLength(2);
    r.dealt({ swingId: 4 });
    expect(r.heals).toHaveLength(2);
  });

  it('without a swing id the key is attack id plus tick', () => {
    const r = rig();
    r.player.maxHealth = 100;
    r.player.health = 10;
    r.st.tick = 7;
    r.dealt({ attackId: 'warden.whirlingHew' });
    r.dealt({ attackId: 'warden.whirlingHew' });
    expect(r.heals).toHaveLength(1);
    r.st.tick = 8;
    r.dealt({ attackId: 'warden.whirlingHew' });
    expect(r.heals).toHaveLength(2);
  });

  it('heals nothing at 30% or more, unlearned, or for hits that are not the player\'s landed melee', () => {
    const r = rig();
    r.player.maxHealth = 100;
    r.player.health = 30;
    r.dealt({ swingId: 1 });
    r.player.health = 20;
    r.dealt({ swingId: 2, kind: 'spell' });
    r.dealt({ swingId: 3, kind: 'status' });
    r.dealt({ swingId: 4, outcome: 'blocked' });
    r.dealt({ swingId: 5, outcome: 'parried' });
    r.dealt({ swingId: 6, dealt: 0 });
    r.dealt({ swingId: 7, attackerId: r.foe.id });
    r.dealt({ swingId: 8, attackerId: null });
    expect(r.heals).toEqual([]);
    r.st.learned = false;
    r.dealt({ swingId: 9 });
    expect(r.heals).toEqual([]);
  });

  it('forgets the swings it healed on death and load, and stops the effect', () => {
    const r = rig();
    r.player.maxHealth = 100;
    r.player.health = 10;
    r.f.tick();
    r.dealt({ swingId: 1 });
    r.e.emit('save.loaded' as never, {} as never);
    expect(r.st.fxStopped).toBe(1);
    r.dealt({ swingId: 1 });
    expect(r.heals).toHaveLength(2);
    r.f.dispose();
    r.dealt({ swingId: 2 });
    expect(r.heals).toHaveLength(2);
  });
});
