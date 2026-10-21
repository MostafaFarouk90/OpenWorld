import { beforeEach, describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver, type DamageRequest } from '../../actors/DamageResolver';
import type { MercyState } from '../../actors/Actor';
import { playerInit } from '../../actors/teams';
import { GameEvents } from '../../core/events';
import { COMBAT } from '../../config/constants';
import { StatusEngine } from '../../status/StatusEngine';
import { FakeActor, FakeActors } from '../../spells/testHost';
import { BloodChant, GritTeeth, WhirlingHew } from './tier3';
import { BLOOD_CHANT, DEEP_WOUND, GRIT_TEETH, SKILL_IDS, WHIRLING_HEW } from './tuning';
import '../../hud/events';

describe('Whirling Hew', () => {
  function rig() {
    const player = new FakeActor('player', 'player', 0, 0);
    const actors = new FakeActors(player);
    const applied: any[] = [];
    const st = { blocked: null as string | null, clip: true, interrupted: false };
    const clips: string[] = [];
    const triggers: string[] = [];
    const h = new WhirlingHew(
      {
        actors,
        damage: { apply: (r) => void applied.push(r) },
        feet: () => ({ x: 0, y: 0, z: 0 }),
        blockedReason: () => st.blocked,
        playClip: (c) => (clips.push(c), st.clip),
        interrupted: () => st.interrupted,
        reportTrigger: (id) => void triggers.push(id),
        skillId: SKILL_IDS.whirlingHew,
      },
      () => 'player',
    );
    const foe = (id: string, x: number, z: number) => actors.add(new FakeActor(id, 'hostile', x, z));
    const run = (n: number) => {
      for (let i = 0; i < n; i++) h.tick();
    };
    return { player, actors, applied, st, clips, triggers, h, foe, run };
  }
  let r: ReturnType<typeof rig>;
  beforeEach(() => (r = rig()));

  it('plays the spinning clip, reports the trigger and hits nothing before the blade is hot', () => {
    r.foe('a', 1, 0);
    expect(r.h.start()).toEqual({ ok: true });
    expect(r.clips).toEqual([WHIRLING_HEW.clip]);
    expect(r.triggers).toEqual([SKILL_IDS.whirlingHew]);
    r.run(WHIRLING_HEW.hitFromTick - 1);
    expect(r.applied).toEqual([]);
    r.run(1);
    expect(r.applied).toHaveLength(1);
  });

  it('hits all around within 2.6 m, 1.2x the weapon base with the same poise, once per enemy', () => {
    r.foe('front', 0, -2);
    r.foe('behind', 0, 2.5);
    r.foe('side', -2.6, 0);
    r.foe('far', 2.7, 0);
    r.h.start();
    r.run(WHIRLING_HEW.ticks);
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['behind', 'front', 'side']);
    for (const a of r.applied) {
      expect(a).toMatchObject({ attackerId: 'player', kind: 'melee', attackId: WHIRLING_HEW.attackId });
      expect(a.amount).toBeCloseTo(COMBAT.baseDamage * 1.2);
      expect(a.poise).toBe(a.amount);
    }
    expect(r.h.spinning).toBe(false);
  });

  it('a foe that walks into reach during the window is hit then, and only once', () => {
    const f = r.foe('walker', 5, 0);
    r.h.start();
    r.run(WHIRLING_HEW.hitFromTick + 2);
    expect(r.applied).toEqual([]);
    f.pos.set(1, 0, 0);
    r.run(5);
    f.pos.set(2, 0, 0);
    r.run(WHIRLING_HEW.ticks);
    expect(r.applied).toHaveLength(1);
  });

  it('skips the dead, the unhittable, allies, neutrals and every foe whose mercy state is not none', () => {
    const dead = r.foe('dead', 1, 0);
    dead.kill();
    r.foe('ghost', 1, 1).hittable = false;
    r.actors.add(new FakeActor('ally', 'ally', 1, 0));
    r.actors.add(new FakeActor('npc', 'neutral', 1, 0));
    for (const s of ['yielding', 'staggered', 'calming', 'releasing', 'leaving'] as MercyState[]) {
      (r.foe(`m-${s}`, 1, -1) as any).mercyState = () => s;
    }
    (r.foe('none', 1, -1) as any).mercyState = () => 'none';
    (r.foe('throws', -1, 0) as any).mercyState = () => {
      throw new Error('boom');
    };
    r.h.start();
    r.run(WHIRLING_HEW.ticks);
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['none', 'throws']);
  });

  it('refuses while blocked (dead, staggered, busy) or when the clip is refused, and costs nothing then', () => {
    for (const why of ['dead', 'staggered', 'busy']) {
      r.st.blocked = why;
      expect(r.h.start()).toEqual({ ok: false, reason: why });
    }
    r.st.blocked = null;
    r.st.clip = false;
    expect(r.h.start()).toEqual({ ok: false, reason: 'busy' });
    expect(r.triggers).toEqual([]);
    expect(r.h.spinning).toBe(false);
  });

  it('cannot start twice at once', () => {
    r.h.start();
    expect(r.h.start()).toEqual({ ok: false, reason: 'spinning' });
  });

  it('a stagger, death or dodge before the blade is hot cancels the swing', () => {
    r.foe('a', 1, 0);
    r.h.start();
    r.run(3);
    r.st.interrupted = true;
    r.run(WHIRLING_HEW.ticks);
    expect(r.applied).toEqual([]);
    expect(r.h.spinning).toBe(false);
    r.st.interrupted = false;
    expect(r.h.start()).toEqual({ ok: true });
  });

  it('cancel() ends it at once', () => {
    r.foe('a', 1, 0);
    r.h.start();
    r.h.cancel();
    r.run(WHIRLING_HEW.ticks);
    expect(r.applied).toEqual([]);
  });
});

function world() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const ally = actors.spawn({ kind: 'companion:hrolf', team: 'ally', maxHealth: 80 });
  const foe = actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 500, maxPoise: 20 });
  const clock = { t: 0 };
  const of = (type: string) => {
    const out: any[] = [];
    events.onAny((t, p) => t === type && out.push(p));
    return out;
  };
  return { events, actors, dr, player, ally, foe, clock, of };
}

describe('Grit Teeth with a real DamageResolver', () => {
  function rig(learned = true) {
    const w = world();
    const st = { learned, staggered: false, fxStarted: 0, fxStopped: 0 };
    const g = new GritTeeth(
      {
        events: w.events as never,
        now: () => w.clock.t,
        learned: () => st.learned,
        staggered: () => st.staggered,
        fx: () => (st.fxStarted++, () => void st.fxStopped++),
        skillId: SKILL_IDS.gritTeeth,
      },
      () => w.player.id,
    );
    const off = w.dr.addModifier(GRIT_TEETH.modifierId, (req, target) => g.modify(req, target.id), GRIT_TEETH.order);
    const buffs = { applied: w.of('buff.applied'), removed: w.of('buff.removed') };
    const hit = (amount = 10, extra: Partial<DamageRequest> = {}) =>
      w.dr.apply({ attackerId: w.foe.id, targetId: w.player.id, amount, kind: 'melee', ...extra })!;
    const stagger = () => w.events.emit('actor.staggered', { actorId: w.player.id, byId: w.foe.id });
    return { ...w, st, g, off, buffs, hit, stagger, advance: (s: number) => ((w.clock.t += s), g.tick()) };
  }

  it('halves damage taken for 4 s after the player is staggered, then ends with a buff.removed', () => {
    const r = rig();
    expect(r.hit().dealt).toBe(10);
    r.stagger();
    expect(r.buffs.applied).toEqual([{ id: GRIT_TEETH.buffId, nameKey: GRIT_TEETH.nameKey, seconds: 4 }]);
    expect(r.st.fxStarted).toBe(1);
    expect(r.hit().dealt).toBe(5);
    r.advance(3.9);
    expect(r.hit().dealt).toBe(5);
    r.advance(0.2);
    expect(r.hit().dealt).toBe(10);
    expect(r.buffs.removed).toEqual([{ id: GRIT_TEETH.buffId }]);
    expect(r.st.fxStopped).toBe(1);
  });

  it('does not stack or extend inside the window, and has a 10 s internal cooldown from its start', () => {
    const r = rig();
    r.stagger();
    r.advance(2);
    r.stagger();
    expect(r.buffs.applied).toHaveLength(1);
    expect(r.hit().dealt).toBe(5);
    r.advance(2.1);
    expect(r.hit().dealt).toBe(10);
    r.stagger(); // t = 4.1, inside the 10 s
    expect(r.hit().dealt).toBe(10);
    r.advance(5.8); // t = 9.9
    r.stagger();
    expect(r.hit().dealt).toBe(10);
    r.advance(0.2); // t = 10.1
    r.stagger();
    expect(r.hit().dealt).toBe(5);
    expect(r.buffs.applied).toHaveLength(2);
  });

  it('the stagger edge of the combat verbs opens it too (a heavy hit staggers without a poise break)', () => {
    const r = rig();
    r.st.staggered = true;
    r.advance(0.1);
    expect(r.hit().dealt).toBe(5);
    r.advance(0.1); // still staggered: no retrigger
    expect(r.buffs.applied).toHaveLength(1);
  });

  it('a real poise break of the player opens it, and the breaking hit is not halved', () => {
    const r = rig();
    r.player.maxPoise = 10;
    r.player.restorePoise?.();
    const res = r.hit(10, { poise: 50 });
    expect(res.staggered).toBe(true);
    expect(res.dealt).toBe(10);
    expect(r.hit().dealt).toBe(5);
  });

  it('not learned: nothing happens; a respec during the window ends it', () => {
    const r = rig(false);
    r.stagger();
    expect(r.hit().dealt).toBe(10);
    expect(r.buffs.applied).toEqual([]);
    r.st.learned = true;
    r.stagger();
    expect(r.hit().dealt).toBe(5);
    r.st.learned = false;
    r.advance(0.1);
    expect(r.hit().dealt).toBe(10);
    expect(r.buffs.removed).toHaveLength(1);
  });

  it('only the player is halved; block chip damage is halved too; status ticks are halved', () => {
    const r = rig();
    r.stagger();
    expect(r.dr.apply({ attackerId: r.player.id, targetId: r.foe.id, amount: 10, kind: 'melee' })!.dealt).toBe(10);
    expect(r.dr.apply({ attackerId: r.foe.id, targetId: r.ally.id, amount: 10, kind: 'melee' })!.dealt).toBe(10);
    const blocker = r.dr.addModifier('test.block', (req) => void ((req.outcome = 'blocked'), (req.amount *= 0.4)), -50);
    expect(r.hit().dealt).toBe(2);
    blocker();
    expect(r.hit(8, { kind: 'status', statusId: 'x', statusKind: 'bleed' }).dealt).toBe(4);
  });

  it('death and save.loaded clear the window and the cooldown', () => {
    const r = rig();
    r.stagger();
    r.events.emit('save.loaded', { slot: 'a' } as never);
    expect(r.hit().dealt).toBe(10);
    r.stagger();
    expect(r.hit().dealt).toBe(5);
  });

  it('dispose releases its listeners and the modifier can be re-registered', () => {
    const r = rig();
    r.g.dispose();
    r.stagger();
    expect(r.hit().dealt).toBe(10);
    r.off();
    expect(() => r.dr.addModifier(GRIT_TEETH.modifierId, () => {}, GRIT_TEETH.order)).not.toThrow();
  });

  it('the order is inside the buffs band', () => {
    expect(GRIT_TEETH.order).toBeGreaterThanOrEqual(0);
    expect(GRIT_TEETH.order).toBeLessThanOrEqual(99);
  });
});

describe('Blood Chant with a real DamageResolver and StatusEngine', () => {
  function rig(opts: { learned?: boolean; status?: boolean } = {}) {
    const w = world();
    const st = { learned: opts.learned ?? true, blocked: null as string | null, triggers: [] as string[], warns: [] as string[], fxStopped: 0 };
    const engine = new StatusEngine({
      actor: (id) => w.actors.get(id) ?? undefined,
      tick: (req) => w.dr.apply(req) !== null,
      applied: () => {},
      expired: () => {},
      view: () => {},
    });
    const c = new BloodChant(
      {
        events: w.events as never,
        actors: w.actors as never,
        now: () => w.clock.t,
        learned: () => st.learned,
        status: () => (opts.status === false ? undefined : engine),
        blockedReason: () => st.blocked,
        fx: () => () => void st.fxStopped++,
        reportTrigger: (id) => void st.triggers.push(id),
        deepWoundId: DEEP_WOUND.id,
        skillId: SKILL_IDS.bloodChant,
        warn: (m) => void st.warns.push(m),
      },
      () => w.player.id,
    );
    const buffs = { applied: w.of('buff.applied'), removed: w.of('buff.removed') };
    const hitBy = (attackerId: string, extra: Partial<DamageRequest> = {}) =>
      w.dr.apply({ attackerId, targetId: w.foe.id, amount: 5, kind: 'melee', ...extra });
    const bleeds = () => engine.list(w.foe.id).map((e) => e.id);
    return { ...w, st, c, engine, buffs, hitBy, bleeds };
  }

  it('starts a 20 s buff with the buff bar convention and reports the trigger', () => {
    const r = rig();
    expect(r.c.start()).toEqual({ ok: true });
    expect(r.buffs.applied).toEqual([{ id: BLOOD_CHANT.buffId, nameKey: BLOOD_CHANT.nameKey, seconds: 20 }]);
    expect(r.st.triggers).toEqual([SKILL_IDS.bloodChant]);
    expect(r.c.active).toBe(true);
  });

  it('an ally hit on a hostile applies a 2 dps, 5 s bleed under its own id; the player hit does not', () => {
    const r = rig();
    r.c.start();
    r.hitBy(r.player.id);
    expect(r.bleeds()).toEqual([]);
    r.hitBy(r.ally.id);
    expect(r.bleeds()).toEqual([BLOOD_CHANT.bleed.id]);
    expect(BLOOD_CHANT.bleed).toEqual({ id: 'warden.bloodChant.bleed', seconds: 5, dps: 2 });
    const entry = r.engine.list(r.foe.id)[0];
    expect(entry).toMatchObject({ kind: 'bleed', remaining: 5, sourceId: r.ally.id });
  });

  it('the bleed ticks as ally damage and its own tick does not apply another', () => {
    const r = rig();
    r.c.start();
    r.hitBy(r.ally.id);
    const before = r.foe.health;
    for (let i = 0; i < 61; i++) r.engine.update(1 / 60);
    expect(r.foe.health).toBeCloseTo(before - 2, 5);
    expect(r.bleeds()).toEqual([BLOOD_CHANT.bleed.id]);
  });

  it('a second ally hit refreshes rather than stacks', () => {
    const r = rig();
    r.c.start();
    r.hitBy(r.ally.id);
    r.hitBy(r.ally.id);
    expect(r.bleeds()).toEqual([BLOOD_CHANT.bleed.id]);
  });

  it('does not stack with Deep Wound: a target already bleeding from it gets no second bleed', () => {
    const r = rig();
    r.c.start();
    r.engine.apply(r.foe.id, { id: DEEP_WOUND.id, kind: 'bleed', dps: 2, seconds: 5, sourceId: r.player.id });
    r.hitBy(r.ally.id);
    expect(r.bleeds()).toEqual([DEEP_WOUND.id]);
  });

  it('the status ids differ from Deep Wound, so each blocks nothing else', () => {
    expect(BLOOD_CHANT.bleed.id).not.toBe(DEEP_WOUND.id);
  });

  it('ally hits on foes in a mercy state are dropped upstream, so no bleed lands', () => {
    for (const s of ['yielding', 'calming', 'releasing', 'leaving'] as MercyState[]) {
      const r = rig();
      r.foe.mercyState = () => s;
      r.c.start();
      expect(r.hitBy(r.ally.id)).toBeNull();
      expect(r.bleeds()).toEqual([]);
    }
  });

  it('a blocked ally hit and a hit on an ally or the player leave no bleed', () => {
    const r = rig();
    r.c.start();
    const undo = r.dr.addModifier('test.block', (req) => void (req.outcome = 'blocked'), -50);
    r.hitBy(r.ally.id);
    undo();
    expect(r.bleeds()).toEqual([]);
    r.dr.apply({ attackerId: r.foe.id, targetId: r.ally.id, amount: 5, kind: 'melee' });
    expect(r.engine.list(r.ally.id)).toEqual([]);
  });

  it('expires after 20 s with buff.removed; hits afterwards leave no bleed', () => {
    const r = rig();
    r.c.start();
    r.clock.t = 19.9;
    r.c.tick();
    r.hitBy(r.ally.id);
    expect(r.bleeds()).toHaveLength(1);
    r.engine.clear(r.foe.id);
    r.clock.t = 20.1;
    r.c.tick();
    expect(r.buffs.removed).toEqual([{ id: BLOOD_CHANT.buffId }]);
    expect(r.st.fxStopped).toBe(1);
    r.hitBy(r.ally.id);
    expect(r.bleeds()).toEqual([]);
  });

  it('a recast renews the 20 s', () => {
    const r = rig();
    r.c.start();
    r.clock.t = 15;
    r.c.start();
    r.clock.t = 30;
    r.c.tick();
    expect(r.c.active).toBe(true);
  });

  it('refuses when blocked; a respec, death and load end it', () => {
    const r = rig();
    r.st.blocked = 'dead';
    expect(r.c.start()).toEqual({ ok: false, reason: 'dead' });
    r.st.blocked = null;
    r.c.start();
    r.st.learned = false;
    r.c.tick();
    expect(r.c.active).toBe(false);
    r.st.learned = true;
    r.c.start();
    r.events.emit('save.loaded', { slot: 'a' } as never);
    expect(r.c.active).toBe(false);
    r.c.start();
    r.events.emit('actor.died', { actorId: r.player.id, killerId: null, kind: 'player', team: 'player', level: 1 } as never);
    expect(r.c.active).toBe(false);
  });

  it('without the status service it warns once and does not throw', () => {
    const r = rig({ status: false });
    r.c.start();
    r.hitBy(r.ally.id);
    r.hitBy(r.ally.id);
    expect(r.st.warns).toHaveLength(1);
  });

  it('dispose ends the buff and detaches the listeners', () => {
    const r = rig();
    r.c.start();
    r.c.dispose();
    r.hitBy(r.ally.id);
    expect(r.bleeds()).toEqual([]);
    expect(r.buffs.removed).toHaveLength(1);
  });
});
