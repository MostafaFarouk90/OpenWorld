import { afterEach, describe, expect, it } from 'vitest';
import { ATTACKS, BOLT, CINDER_RING, FLAME_BALL, FORGE_SPARK, GUST_STEP, IGNITE, SPARK_BURST, STAFF_TAP } from './tuning';
import { EMBERWRIGHT_ATTACK_SET } from './tuning';
import { attackSetProblem } from '../../player/attackSets';
import { makeRig, SKILL, type Rig } from './testkit';
import { FakeActor } from '../../spells/testHost';

let rig: Rig;
afterEach(() => rig?.rt.dispose());

describe('attack set', () => {
  it('is playable, heavy on key 3, and every clip is in the Mage glb', () => {
    expect(attackSetProblem(EMBERWRIGHT_ATTACK_SET)).toBeNull();
    expect(EMBERWRIGHT_ATTACK_SET.heavyIndex).toBe(2);
    expect(ATTACKS.map((a) => a.ember)).toEqual([3, 5, 12, 6]);
  });
});

describe('key 1: bolt', () => {
  it('spends Ember at the window open, flies at the target and applies damage and poise', () => {
    rig = makeRig();
    rig.hostile('a', 0, 6);
    rig.w.player.facingYaw = 0;
    rig.window('Spellcast_Shoot');
    expect(rig.ember.value).toBe(97);
    rig.step(0.6);
    const hit = rig.applied().find((r) => r.targetId === 'a')!;
    expect(hit).toMatchObject({ attackerId: 'player', amount: BOLT.damage, poise: BOLT.poise, kind: 'spell' });
    expect(rig.statusCalls).toHaveLength(0);
  });

  it('Ember Bolt adds ignite as emberwright.ignite sourced by the player, never kind burn', () => {
    rig = makeRig({ learned: [SKILL.emberBolt] });
    rig.hostile('a', 0, 6);
    rig.window('Spellcast_Shoot');
    rig.step(0.6);
    expect(rig.statusCalls).toHaveLength(1);
    expect(rig.statusCalls[0]).toMatchObject({ id: 'a', spec: { id: IGNITE.id, kind: 'ignite', dps: IGNITE.dps, seconds: IGNITE.seconds, sourceId: 'player' } });
  });

  it('skips ignite on a poise-breaking hit and on a kneeling target', () => {
    rig = makeRig({ learned: [SKILL.emberBolt] });
    rig.hostile('a', 0, 6);
    rig.result = { staggered: true };
    rig.window('Spellcast_Shoot');
    rig.step(0.6);
    expect(rig.statusCalls).toHaveLength(0);
    rig.result = {};
    rig.state.yielding.add('a');
    rig.window('Spellcast_Shoot', 2);
    rig.step(0.6);
    expect(rig.statusCalls).toHaveLength(0);
  });

  it('too little Ember: no spell, no spend, the swing is a staff tap at 40%', () => {
    rig = makeRig();
    rig.ember.value = 2;
    rig.hostile('a', 0, 4);
    rig.window('Spellcast_Shoot', 7);
    rig.step(0.5);
    expect(rig.ember.value).toBe(2);
    expect(rig.applied()).toHaveLength(0);
    const req = { kind: 'melee', attackerId: 'player', swingId: 7, amount: 10, poise: 10, outcome: 'hit' };
    rig.rt.meleeModifier(req);
    expect(req).toMatchObject({ amount: 10 * STAFF_TAP, poise: 10 * STAFF_TAP, outcome: 'hit' });
  });

  it('the fizzle cue plays at clip start only when Ember is short', () => {
    rig = makeRig();
    rig.rt.onClipStart('Spellcast_Shoot');
    expect(rig.fizzles).toBe(0);
    rig.ember.value = 1;
    rig.rt.onClipStart('Spellcast_Shoot');
    rig.rt.onClipStart('Idle');
    expect(rig.fizzles).toBe(1);
  });

  it('a fired swing makes its tracer contact immune; other classes and kinds are untouched', () => {
    rig = makeRig();
    rig.window('Spellcast_Shoot', 3);
    const fired = { kind: 'melee', attackerId: 'player', swingId: 3, amount: 10, poise: 10, outcome: 'hit' };
    rig.rt.meleeModifier(fired);
    expect(fired.outcome).toBe('immune');
    const spell = { kind: 'spell', attackerId: 'player', swingId: 3, amount: 10, poise: 10, outcome: 'hit' };
    rig.rt.meleeModifier(spell);
    expect(spell).toMatchObject({ amount: 10, outcome: 'hit' });
    rig.state.avatarClass = 'knight';
    const knight = { kind: 'melee', attackerId: 'player', swingId: 3, amount: 10, poise: 10, outcome: 'hit' };
    rig.rt.meleeModifier(knight);
    expect(knight).toMatchObject({ amount: 10, outcome: 'hit' });
  });

  it('fires nothing when dead, staggered, stunned, in a dialogue, or when the class does not match (respec mid-swing)', () => {
    rig = makeRig();
    rig.state.classId = 'knight';
    rig.window('Spellcast_Shoot');
    rig.state.classId = 'emberwright';
    rig.state.avatarClass = 'knight';
    rig.window('Spellcast_Shoot', 2);
    rig.state.avatarClass = 'emberwright';
    rig.state.stunned = true;
    rig.window('Spellcast_Shoot', 3);
    rig.state.stunned = false;
    rig.w.events.emit('actor.staggered', { actorId: 'player' } as never);
    rig.window('Spellcast_Shoot', 4);
    rig.step(1);
    rig.w.events.emit('dialogue.started', {} as never);
    rig.window('Spellcast_Shoot', 5);
    rig.w.events.emit('dialogue.ended', {} as never);
    rig.w.player.actor.kill();
    rig.window('Spellcast_Shoot', 6);
    expect(rig.ember.value).toBe(100);
    rig.step(1);
    expect(rig.applied()).toHaveLength(0);
  });

  it('a bolt stops at a wall instead of reaching the hostile behind it', () => {
    rig = makeRig();
    rig.hostile('behind-wall', 0, 8);
    rig.state.wallZ = 4;
    rig.window('Spellcast_Shoot');
    rig.step(0.8);
    expect(rig.applied()).toHaveLength(0);
    rig.state.wallZ = null;
    rig.window('Spellcast_Shoot', 2);
    rig.step(0.8);
    expect(rig.applied()).toHaveLength(1);
  });

  it('a neutral in the way absorbs the bolt and is never hurt', () => {
    rig = makeRig();
    rig.w.actors.add(new FakeActor('npc', 'neutral', 0, 3));
    rig.hostile('far', 0, 8);
    rig.window('Spellcast_Shoot');
    rig.step(0.6);
    expect(rig.applied()).toHaveLength(0);
  });

  it('aims at the lock-on target when there is one', () => {
    rig = makeRig();
    rig.hostile('side', 6, 0);
    rig.state.lockOn = 'side';
    rig.window('Spellcast_Shoot');
    rig.step(0.6);
    expect(rig.applied().map((r) => r.targetId)).toEqual(['side']);
  });
});

describe('key 2: spark burst and Forge Spark', () => {
  it('three short bolts whose total at point blank is the design 10 damage and 10 poise', () => {
    rig = makeRig();
    rig.hostile('a', 0, 2);
    rig.window('2H_Ranged_Shoot');
    expect(rig.ember.value).toBe(95);
    rig.step(0.4);
    const hits = rig.applied().filter((r) => r.targetId === 'a');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.length * SPARK_BURST.damage).toBeLessThanOrEqual(10 + 1e-9);
    expect(hits.reduce((s, r) => s + r.poise, 0)).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('Forge Spark chains to at most two others within 4 m, once each, hostile only, at half damage; chains do not chain', () => {
    rig = makeRig({ learned: [SKILL.forgeSpark] });
    rig.hostile('t', 0, 6);
    rig.hostile('n1', 2, 6);
    rig.hostile('n2', -2, 6);
    rig.hostile('n3', 0, 9);
    rig.hostile('out', 0, 12);
    rig.w.actors.add(new FakeActor('npc', 'neutral', 1, 6));
    rig.window('2H_Ranged_Shoot');
    rig.step(0.6);
    const chain = rig.applied().filter((r) => r.attackId === 'emberwright.forgeSpark');
    expect(chain.length).toBeLessThanOrEqual(FORGE_SPARK.chains * SPARK_BURST.bolts);
    for (const c of chain) expect(c.amount).toBeCloseTo(SPARK_BURST.damage * FORGE_SPARK.fraction);
    const ids = chain.map((c) => c.targetId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('t');
    expect(ids).not.toContain('npc');
    expect(ids).not.toContain('out');
  });

  it('without Forge Spark nothing chains', () => {
    rig = makeRig();
    rig.hostile('t', 0, 6);
    rig.hostile('n1', 2, 6);
    rig.window('2H_Ranged_Shoot');
    rig.step(0.6);
    expect(rig.applied().some((r) => r.attackId === 'emberwright.forgeSpark')).toBe(false);
  });
});

describe('key 3 and 4', () => {
  it('the flame ball bursts on impact with a hostile-only splash at 60%', () => {
    rig = makeRig();
    rig.hostile('t', 0, 8);
    rig.hostile('near', 1.5, 8);
    rig.hostile('away', 5, 8);
    rig.w.actors.add(new FakeActor('ally', 'ally', 0.5, 8));
    rig.window('Spellcast_Long');
    expect(rig.ember.value).toBe(88);
    rig.step(1.5);
    const t = rig.applied().find((r) => r.targetId === 't')!;
    const near = rig.applied().find((r) => r.targetId === 'near')!;
    expect(t).toMatchObject({ amount: FLAME_BALL.damage, poise: FLAME_BALL.poise });
    expect(near.amount).toBeCloseTo(FLAME_BALL.damage * FLAME_BALL.splash);
    expect(rig.applied().some((r) => r.targetId === 'away' || r.targetId === 'ally')).toBe(false);
  });

  it('the flame ball that reaches the end of its range still bursts there', () => {
    rig = makeRig();
    rig.hostile('t', 0, 19.2);
    rig.window('Spellcast_Long');
    rig.step(2);
    expect(rig.applied().some((r) => r.targetId === 't')).toBe(true);
  });

  it('the cinder ring hits hostiles within 3 m, pushes them through the adapter, skips walled ones', () => {
    rig = makeRig();
    rig.hostile('in', 2, 0);
    rig.hostile('out', 4, 0);
    rig.window('2H_Melee_Attack_Spinning');
    expect(rig.ember.value).toBe(94);
    expect(rig.applied().map((r) => r.targetId)).toEqual(['in']);
    expect(rig.applied()[0]).toMatchObject({ amount: CINDER_RING.damage, poise: CINDER_RING.poise });
    expect(rig.pushes).toEqual([{ id: 'in', dir: { x: 1, y: 0, z: 0 }, metres: CINDER_RING.pushMetres }]);
    rig.applied().length = 0;
    rig.pushes.length = 0;
    rig.state.walls = true;
    rig.window('2H_Melee_Attack_Spinning', 2);
    expect(rig.applied()).toHaveLength(0);
  });
});

describe('Gust Step', () => {
  it('gives 8 Ember per avoided swing once learned, and only for the Emberwright', () => {
    rig = makeRig();
    rig.ember.value = 50;
    rig.w.events.emit('player.dodged', { attackerId: 'x', swingId: 1 });
    expect(rig.ember.value).toBe(50);
    rig.learned.add(SKILL.gustStep);
    rig.w.events.emit('player.dodged', { attackerId: 'x', swingId: 1 });
    expect(rig.ember.value).toBe(50 + GUST_STEP.ember);
    rig.state.avatarClass = 'knight';
    rig.w.events.emit('player.dodged', { attackerId: 'x', swingId: 2 });
    expect(rig.ember.value).toBe(58);
    rig.state.avatarClass = 'emberwright';
    rig.ember.value = 95;
    rig.w.events.emit('player.dodged', { attackerId: 'x', swingId: 3 });
    expect(rig.ember.value).toBe(100);
  });

  it('a dodge clip start pushes hostiles within 2 m by 1.5 m with no damage', () => {
    rig = makeRig({ learned: [SKILL.gustStep] });
    rig.hostile('close', 1, 0);
    rig.hostile('far', 3, 0);
    rig.rt.onClipStartDodge('Dodge_Forward');
    rig.rt.onClipStartDodge('Running_A');
    expect(rig.pushes.map((p) => [p.id, p.metres])).toEqual([['close', GUST_STEP.pushMetres]]);
    expect(rig.applied()).toHaveLength(0);
  });

  it('a Gust Step dodge also sends a cooling hit (radius 2 m) for Slag Crawlers; without the skill it does not', () => {
    rig = makeRig({ learned: [SKILL.gustStep] });
    rig.rt.onClipStartDodge('Dodge_Forward');
    rig.rt.onClipStartDodge('Running_A');
    expect(rig.cools.map((c) => c.radius)).toEqual([GUST_STEP.pushRadius]);
    rig = makeRig();
    rig.rt.onClipStartDodge('Dodge_Forward');
    expect(rig.cools).toHaveLength(0);
  });

  it('without the skill nothing is pushed; with no push service the adapter just reports false', () => {
    rig = makeRig();
    rig.hostile('close', 1, 0);
    rig.rt.onClipStartDodge('Dodge_Forward');
    expect(rig.pushes).toHaveLength(0);
  });
});

describe('lifecycle', () => {
  it('a class change clears projectiles, pending impacts and burning ground', () => {
    rig = makeRig();
    rig.hostile('t', 0, 8);
    rig.window('Spellcast_Long');
    rig.rt.addGround(0, 0, 0);
    rig.w.events.emit('class.changed', { classId: 'knight', previous: 'emberwright', free: true, cost: 0 } as never);
    expect(rig.rt.groundCount()).toBe(0);
    rig.step(2);
    expect(rig.applied()).toHaveLength(0);
  });

  it('dispose is idempotent and silences every listener', () => {
    rig = makeRig();
    rig.rt.dispose();
    rig.rt.dispose();
    rig.window('Spellcast_Shoot');
    expect(rig.ember.value).toBe(100);
  });
});

describe('review fixes', () => {
  it('a flame ball in flight deals nothing after a save load, a class change or a rest', () => {
    for (const ev of ['save.loaded', 'class.changed', 'rest'] as const) {
      rig = makeRig();
      rig.hostile('t', 0, 8);
      rig.window('Spellcast_Long');
      rig.step(0.05);
      rig.w.events.emit(ev as never, {} as never);
      rig.step(2);
      expect(rig.applied(), ev).toHaveLength(0);
      rig.rt.dispose();
    }
  });

  it('props the player must break (toll-post, dummies) take spell hits; neutral people still do not', () => {
    rig = makeRig();
    const post = rig.w.actors.add(new FakeActor('post', 'neutral', 0, 6));
    post.kind = 'toll-post';
    rig.window('Spellcast_Long');
    rig.step(2);
    expect(rig.applied().map((r) => r.targetId)).toEqual(['post']);
    expect(rig.applied()[0].poise).toBe(FLAME_BALL.poise);
  });

  it('a cancel request left over from a same-tick stagger does not kill the next cast', async () => {
    rig = makeRig();
    rig.hostile('on', 0, 6);
    rig.rt.castAbility(SKILL.flameLash);
    rig.step(0.1);
    rig.w.events.emit('ui.modal' as never, { id: 'inv', open: true } as never);
    rig.w.events.emit('actor.staggered', { actorId: 'player' } as never);
    rig.step(1);
    expect(rig.rt.castAbility(SKILL.flameLash)).toEqual({ ok: true });
    rig.step(2);
    expect(rig.applied()).toHaveLength(1);
  });

  it('Anvil Drop refuses a lock-on target beyond 12 m or behind a wall; Warm Breath refuses with no ally in the cone', () => {
    rig = makeRig();
    rig.hostile('far', 0, 20);
    rig.state.lockOn = 'far';
    expect(rig.rt.castAbility(SKILL.anvilDrop)).toEqual({ ok: false, reason: 'no-target' });
    rig.hostile('near', 0, 5);
    rig.state.lockOn = 'near';
    rig.state.walls = true;
    expect(rig.rt.castAbility(SKILL.anvilDrop)).toEqual({ ok: false, reason: 'no-target' });
    expect(rig.rt.castAbility(SKILL.warmBreath)).toEqual({ ok: false, reason: 'no-target' });
  });
});
