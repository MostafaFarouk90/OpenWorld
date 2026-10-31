// The summit director's named rules on the rig: M31's trial restarts (with K0's real Trials), its outcome and favour once, M32's flag after the scene and
// Keeper's Understanding, M33's witnesses, D06's landing, Skarl's arm gate, the spared staging, the shard-gem, and that D06 pays no favour of its own.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../../../actors/ActorRegistry';
import { DamageResolver } from '../../../../actors/DamageResolver';
import { playerInit } from '../../../../actors/teams';
import { Trials } from '../../../../companions/trials';
import { Burn } from '../../../../spells/Burn';
import { skarlArmFlag } from '../../../../bosses/skarl/armGate';
import { grantBossGem, retroGrant, type GrantPorts } from '../../../../gear/sockets/grants';
import { GEM_BOSSES, grantedFlag } from '../../../../gear/sockets/tuning';
import { makeRig, anchorPos, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll } from './director/autoplay.testkit';
import { ARENA, ARENA_LEAVE, RESTART_GRACE_POLLS, TRIAL_ID } from './director/trial';
import { KEEPER_DECAY_SCALE, PERCH_SETTLE_TICKS, TALK_RADIUS } from './director/reveal';
import { FLIGHT_TICKS, WITNESS_CAP } from './director/net';
import { LANDING, STAGE_POLLS } from './director/aerie';
import { M31_AT_GATE, M31_CHOICE, M31_FAVOURED, M31_RESPECT, M31_TRIAL_BEGUN } from './m31.quest';
import { M32_COMPLETE, M32_TALK } from './m32.quest';
import { M33_ANCHOR_FLAGS, M33_FLIGHT, M33_PACK_GROUPS, M33_WITNESSES } from './m33.quest';
import { D06_COURTYARD_CLEAR, D06_GROUP, D06_LANDED, D06_LED_OFF, D06_SKARL_OUTCOME } from './d06.quest';
import { D06_SPARED_SCENE } from './npcs';

let rig: Rig | null = null;
afterEach(() => { rig?.dispose(); rig = null; });
const fresh = (o: Parameters<typeof makeRig>[0] = {}): Rig => (rig = makeRig(o));
const ORDER = ['m31', 'm32', 'm33', 'm34', 'd06'];
const before = (q: string): string[] => ORDER.slice(0, ORDER.indexOf(q));
const upTo = (r: Rig, q: string, at: string, opts: Parameters<typeof autoplay>[2] = {}): void => {
  autoplayAll(r, before(q), opts);
  r.manager.start(q);
  autoplay(r, q, { ...opts, stopAt: [q, at] });
  r.step(2);
};
const SECOND = 60;

/** K0's real Trials behind the rig's Ysmeryth stub: `beginTrial` starts the real trial the way K6a does (the arena centre, 80 m, Yield after two breaks). */
function realTrials(r: Rig) {
  const events = r.events as never;
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const opp = actors.spawn({ kind: 'ysmeryth', team: 'hostile', maxHealth: 120, maxPoise: 45 });
  const trials = new Trials({
    events, actors, addLethalHandler: (id, fn, order) => dr.addLethalHandler(id, fn, order), heal: (id, n) => dr.heal(id, n), playerFeet: () => r.player.feet,
  });
  const centre = anchorPos(ARENA);
  const ended: string[] = [];
  r.events.on('trial.ended' as never, ((e: { reason: string }) => void ended.push(e.reason)) as never);
  r.ys.beginTrial = () => {
    if (trials.state()) return true;
    r.ys.begins++;
    return trials.start({ id: TRIAL_ID, opponentId: opp.id, allowYield: { afterBreaks: 2 }, leaveDistance: ARENA_LEAVE, arenaCentre: { x: centre.x, z: centre.z }, onLoss: 'restart' });
  };
  r.trials.state = () => trials.state() as never;
  const tick = (s: number): void => { for (let t = 0; t < s; t += 1 / 60) trials.fixedUpdate(1 / 60); };
  /** A break scored (by Cael on her, or by her on Cael) and the pause that follows it. */
  const breakBy = (who: 'player' | 'opponent'): void => {
    r.emit('actor.staggered', who === 'player' ? { actorId: opp.id, byId: player.id } : { actorId: player.id, byId: opp.id });
    tick(2.1);
  };
  return { trials, opp, player, ended, tick, breakBy, centre, dispose: () => trials.dispose() };
}

const inTrial = (): { r: Rig; t: ReturnType<typeof realTrials> } => {
  const r = fresh();
  autoplayAll(r, before('m31'));
  r.manager.start('m31');
  autoplay(r, 'm31', { stopAt: ['m31', 'trial'] });
  const t = realTrials(r);
  r.at(ARENA);
  r.step(RESTART_GRACE_POLLS * SECOND + SECOND);
  return { r, t };
};

describe('M31: the trial restarts on any end that is not an outcome', () => {
  it('starts once Cael is in the arena and the grace has passed, silently the first time', () => {
    const { r, t } = inTrial();
    expect(r.ys.begins).toBe(1);
    expect(t.trials.state()?.id).toBe(TRIAL_ID);
    expect(r.flag(M31_TRIAL_BEGUN)).toBe(true);
    expect(r.toasts).not.toContain('dragonspine.q.m31.called');
    r.step(SECOND * 10);
    expect(r.ys.begins).toBe(1); // idempotent while it runs
  });

  it('does not start from outside the arena, and waits for Cael to come back', () => {
    const r = fresh();
    autoplayAll(r, before('m31'));
    r.manager.start('m31');
    autoplay(r, 'm31', { stopAt: ['m31', 'trial'] });
    r.at('dragonspine.hearth.entry');
    r.step(SECOND * 12);
    expect(r.ys.begins).toBe(0);
    r.at(ARENA);
    r.step(SECOND * 5);
    expect(r.ys.begins).toBe(1);
  });

  it('restarts after the distance rule ended it, once Cael is back inside (and says she calls him back)', () => {
    const { r, t } = inTrial();
    const p = r.player.feet;
    while (t.ended.length === 0) { r.player.feet = { ...p, x: r.player.feet.x + 5 }; t.tick(1 / 60); }
    expect(t.ended).toEqual(['distance']);
    r.step(SECOND * 8);
    expect(r.ys.begins).toBe(1); // still far: she waits
    r.at(ARENA);
    t.tick(1 / 60);
    r.step(SECOND * 5);
    expect(r.ys.begins).toBe(2);
    expect(r.toasts).toContain('dragonspine.q.m31.called');
    expect(r.str(M31_CHOICE)).toBe('');
  });

  it('restarts after a teleport', () => {
    const { r, t } = inTrial();
    r.emit('fastTravel', { from: 'a', to: 'b' });
    expect(t.ended).toEqual(['teleport']);
    r.step(SECOND * 5);
    expect(r.ys.begins).toBe(2);
    expect(r.str(M31_CHOICE)).toBe('');
  });

  it('restarts after a load, and the saved state holds no choice', () => {
    const { r, t } = inTrial();
    r.saveLoad();
    expect(t.ended).toEqual(['loaded']);
    r.step(SECOND * 5);
    expect(r.ys.begins).toBe(2);
    expect(r.current('m31', 'trial')).toBe(true);
  });

  it('retries a start that did not take', () => {
    const r = fresh();
    autoplayAll(r, before('m31'));
    r.manager.start('m31');
    autoplay(r, 'm31', { stopAt: ['m31', 'trial'] });
    r.ys.falseStarts = 2;
    r.at(ARENA);
    r.step(SECOND * 8);
    expect(r.ys.begins).toBe(1);
  });

  it('a loss restarts inside K6a and writes nothing: no choice, no favour, no flag, no restart from here', () => {
    const { r } = inTrial();
    const begins = r.ys.begins;
    const dragons = r.state.favour('dragons');
    r.emit('trial.ended', { trialId: TRIAL_ID, reason: 'lost' });
    r.step(SECOND * 8);
    expect(r.str(M31_CHOICE)).toBe('');
    expect(r.flag(M31_FAVOURED)).toBe(false);
    expect(r.state.favour('dragons')).toBe(dragons);
    expect(r.ys.begins).toBe(begins);
    expect(r.spellCalls.surge).toEqual([]);
  });

  it('Yield: refused before two breaks, works after them, writes yielded and pays dragons +8 once', () => {
    const { r, t } = inTrial();
    const dragons = r.state.favour('dragons');
    expect(t.trials.canYield()).toBe(false);
    t.breakBy('player');
    expect(t.trials.yield(TRIAL_ID)).toBe(false);
    t.breakBy('opponent');
    expect(t.trials.canYield()).toBe(true);
    expect(t.trials.yield(TRIAL_ID)).toBe(true);
    r.step(5);
    expect(r.str(M31_CHOICE)).toBe('yielded');
    expect(r.state.favour('dragons')).toBe(dragons + 8);
    expect(r.spellCalls.surge).toEqual([]);
    expect(r.ys.ends).toBe(1);
    r.saveLoad();
    r.step(SECOND * 8);
    expect(r.state.favour('dragons')).toBe(dragons + 8);
    expect(r.ys.begins).toBe(1); // no restart once there is an outcome
    expect(r.done('m31', 'trial')).toBe(true);
  });

  it('Win: three breaks write won, dragons +3 once and one Surge charge once (also across a load)', () => {
    const { r, t } = inTrial();
    const dragons = r.state.favour('dragons');
    t.breakBy('player'); t.breakBy('player'); t.breakBy('player');
    r.step(5);
    expect(t.ended).toEqual(['won']);
    expect(r.str(M31_CHOICE)).toBe('won');
    expect(r.state.favour('dragons')).toBe(dragons + 3);
    expect(r.spellCalls.surge).toEqual([[1, 'dragons-respect']]);
    expect(r.flag(M31_RESPECT)).toBe(true);
    r.saveLoad();
    r.step(SECOND * 3);
    expect(r.state.favour('dragons')).toBe(dragons + 3);
    expect(r.spellCalls.surge.length).toBe(1);
    // a second trial.ended (a replay, a duplicate event) changes nothing
    r.emit('trial.ended', { trialId: TRIAL_ID, reason: 'won' });
    expect(r.state.favour('dragons')).toBe(dragons + 3);
    expect(r.spellCalls.surge.length).toBe(1);
  });

  it('the Surge charge waits for the spells service, then is paid once', () => {
    const r = fresh({ noSpells: true });
    autoplayAll(r, before('m31'));
    r.manager.start('m31');
    autoplay(r, 'm31', { stopAt: ['m31', 'trial'] });
    r.emit('trial.ended', { trialId: TRIAL_ID, reason: 'won' });
    r.step(SECOND * 2);
    expect(r.flag(M31_RESPECT)).toBe(false);
    r.ctx.services.provide('spells' as never, r.spells as never);
    r.step(SECOND * 2);
    expect(r.flag(M31_RESPECT)).toBe(true);
    r.step(SECOND * 5);
    expect(r.spellCalls.surge.length).toBe(1);
  });

  it('other trials are not the Coal-Mother\'s', () => {
    const r = fresh();
    autoplayAll(r, before('m31'));
    r.manager.start('m31');
    autoplay(r, 'm31', { stopAt: ['m31', 'trial'] });
    r.emit('trial.ended', { trialId: 'hrolf-trial', reason: 'won' });
    r.step(5);
    expect(r.str(M31_CHOICE)).toBe('');
  });
});

describe('M31: the climb', () => {
  it('the ledge flags are only the top of each ledge: standing at the foot is not enough', () => {
    const r = fresh();
    autoplayAll(r, before('m31'));
    r.manager.start('m31');
    autoplay(r, 'm31', { stopAt: ['m31', 'gate'] });
    const gate = r.at('dragonspine.summit-gate');
    r.step(40);
    expect(r.flag(M31_AT_GATE)).toBe(true);
    const leap = anchorPos('dragonspine.roost.leap.1');
    r.player.feet = { x: leap.x, y: leap.y - 4, z: leap.z };
    r.step(40);
    expect(r.flag('story.m31.ledge1')).toBe(false);
    r.player.feet = { ...leap };
    r.step(40);
    expect(r.flag('story.m31.ledge1')).toBe(true);
    void gate;
  });
});

describe('M32: Ysmeryth speaks', () => {
  it('her talk prompt exists, is live only after M31, and poses her for the account', () => {
    const r = fresh();
    const talk = r.registered.get(M32_TALK)!;
    expect(talk).toBeTruthy();
    expect(talk.enabled()).toBe(false);
    autoplayAll(r, ['m31']);
    expect(talk.enabled()).toBe(true);
    talk.onInteract();
    expect(r.ys.poses.at(-1)).toBe('land');
    expect(r.dialogue.started.at(-1)).toEqual(['npc-ysmeryth', 'ysmeryth']);
    r.dialogue.active = true;
    expect(talk.enabled()).toBe(false);
    const out = { x: 0, y: 0, z: 0 };
    talk.position(out);
    const land = anchorPos('dragonspine.hearth.ysmeryth.land');
    expect(Math.hypot(out.x - land.x, out.z - land.z)).toBeLessThan(0.01);
    expect(TALK_RADIUS).toBeGreaterThan(5);
  });

  it('M34 poses her for the oath, and again on land after the companions and on the perch at the end', () => {
    const r = fresh();
    autoplayAll(r, ['m31', 'm32', 'm33']);
    r.manager.start('m34');
    const talk = r.registered.get(M32_TALK)!;
    talk.onInteract();
    expect(r.ys.poses.at(-1)).toBe('oath');
    r.talk('ysmeryth');
    autoplay(r, 'm34', { stopAt: ['m34', 'companions'] });
    r.step(70);
    r.scene('scene-m34-companions', 'scene.m34.companions');
    r.step(5);
    expect(r.ys.poses.at(-1)).toBe('land');
    autoplay(r, 'm34');
    expect(r.qs('m34')).toBe('completed');
    expect(r.ys.poses.at(-1)).toBe('perch');
  });

  it('the vision holds the camera over the keeper-stone and poses her, and the scene end releases both', () => {
    const r = fresh();
    autoplayAll(r, ['m31']);
    r.manager.start('m32');
    r.talk('ysmeryth');
    r.step(70);
    expect(r.dialogue.started.at(-1)?.[0]).toBe('scene-m32-vision');
    expect(r.ys.poses.at(-1)).toBe('reveal');
    expect(r.camera.shots.length).toBe(1);
    r.scene('scene-m32-vision', 'scene.m32.vision');
    r.step(5);
    expect(r.camera.released).toBe(1);
    expect(r.ys.poses.at(-1)).toBe('land');
  });

  it('a load during the vision releases the hold and puts her back; the scene is offered again', () => {
    const r = fresh();
    autoplayAll(r, ['m31']);
    r.manager.start('m32');
    r.talk('ysmeryth');
    r.step(70);
    expect(r.camera.shots.length).toBe(1);
    r.saveLoad();
    expect(r.camera.released).toBe(1);
    expect(r.ys.poses.at(-1)).toBe('land');
    r.step(700);
    expect(r.camera.shots.length).toBe(2);
  });

  it('writes story.m32.complete only after the scene has ended and she has perched', () => {
    const r = fresh();
    upTo(r, 'm32', 'axe');
    expect(r.flag(M32_COMPLETE)).toBe(false);
    r.step(70);
    expect(r.dialogue.started.at(-1)?.[0]).toBe('scene-m32-axe');
    expect(r.flag(M32_COMPLETE)).toBe(false); // the scene is still open
    r.scene('scene-m32-axe', 'scene.m32.axe');
    r.step(2);
    expect(r.qs('m32')).toBe('completed');
    expect(r.ys.poses.at(-1)).toBe('perch');
    expect(r.flag(M32_COMPLETE)).toBe(false);
    r.step(PERCH_SETTLE_TICKS + 2);
    expect(r.flag(M32_COMPLETE)).toBe(true);
    expect(r.toasts).toContain('dragonspine.q.m32.perk');
  });

  it('a load between the scene and the flag writes the flag at once', () => {
    const r = fresh();
    upTo(r, 'm32', 'axe');
    r.step(70);
    r.scene('scene-m32-axe', 'scene.m32.axe');
    r.step(2);
    expect(r.flag(M32_COMPLETE)).toBe(false);
    r.saveLoad();
    expect(r.flag(M32_COMPLETE)).toBe(true);
  });
});

describe("Keeper's Understanding: Burn decays twice as fast while walking on foot", () => {
  const complete = (): Rig => {
    const r = fresh();
    autoplayAll(r, ['m31', 'm32']);
    r.step(PERCH_SETTLE_TICKS + 5);
    expect(r.flag(M32_COMPLETE)).toBe(true);
    return r;
  };
  const scale = (r: Rig): number => r.spellCalls.decay!();

  it('is bound to the spells service on setup, and reads 1 before M32 is done', () => {
    const r = fresh();
    expect(r.spellCalls.decay).toBeTypeOf('function');
    r.player.moving = true;
    expect(scale(r)).toBe(1);
  });

  it('is 2 walking or sprinting on foot, and 1 standing, mounted, gliding or hauling', () => {
    const r = complete();
    r.player.moving = true;
    expect(scale(r)).toBe(KEEPER_DECAY_SCALE);
    r.player.moving = false;
    expect(scale(r)).toBe(1);
    r.player.moving = true;
    r.mount.on = true;
    expect(scale(r)).toBe(1);
    r.mount.on = false;
    for (const mode of ['glide', 'haul', 'ferry', 'dive'] as const) {
      r.movement.current = mode;
      expect(scale(r), mode).toBe(1);
    }
    r.movement.current = 'walk';
    expect(scale(r)).toBe(2);
  });

  it('survives a load (derived from the flag) and drives the real Burn', () => {
    const r = complete();
    r.saveLoad();
    r.player.moving = true;
    expect(scale(r)).toBe(2);
    const burn = new Burn();
    burn.add(50, 't');
    burn.setDecayScale(r.spellCalls.decay!);
    burn.decay(10, false);
    const walking = burn.value;
    r.player.moving = false;
    burn.add(50 - walking, 't');
    burn.decay(10, false);
    const standing = burn.value;
    expect(50 - walking).toBeCloseTo(2 * (50 - standing));
  });

  it('binds when the spells service comes up late', () => {
    const r = fresh({ noSpells: true });
    expect(r.spellCalls.decay).toBeNull();
    r.ctx.services.provide('spells' as never, r.spells as never);
    r.step(SECOND + 2);
    expect(r.spellCalls.decay).toBeTypeOf('function');
  });

  it('is undone when the director is disposed', () => {
    const r = fresh();
    expect(r.spellCalls.decay).toBeTypeOf('function');
    r.dispose();
    expect(r.spellCalls.decay).toBeNull();
    rig = null;
  });
});

describe('M33: the spared hunters are counted as witnesses', () => {
  const atPacks = (): Rig => {
    const r = fresh();
    upTo(r, 'm33', 'packs');
    for (const g of M33_PACK_GROUPS) r.standing.set(g, ['a1', 'a2', 'a3', 'a4']);
    r.step(40);
    return r;
  };

  it('a mercy on a member of a pack counts once; one on a stranger or the same twice does not', () => {
    const r = atPacks();
    r.emit('mercy', { actorId: 'a1' });
    expect(r.num(M33_WITNESSES)).toBe(1);
    r.emit('mercy', { actorId: 'a1' });
    expect(r.num(M33_WITNESSES)).toBe(1);
    r.emit('mercy', { actorId: 'someone-else' });
    expect(r.num(M33_WITNESSES)).toBe(1);
    r.emit('mercy', { actorId: 'a2' });
    expect(r.num(M33_WITNESSES)).toBe(2);
    expect(r.toasts.filter((t) => t === 'dragonspine.q.m33.witness').length).toBe(1);
  });

  it('the packs clear with a member spared mid-fight, and the count is what Thorgar names', () => {
    const r = atPacks();
    r.emit('mercy', { actorId: 'a1' });
    r.emit('mercy', { actorId: 'a3' });
    for (const g of M33_PACK_GROUPS) r.standing.set(g, ['a2', 'a4']);
    r.step(40);
    expect(r.done('m33', 'packs')).toBe(false);
    for (const g of M33_PACK_GROUPS) r.standing.set(g, []);
    r.step(40);
    expect(r.done('m33', 'packs')).toBe(true);
    expect(r.num(M33_WITNESSES)).toBe(2);
    r.saveLoad();
    expect(r.num(M33_WITNESSES)).toBe(2);
  });

  it('a load keeps the count and adds to it, and the count is capped at what Thorgar can name', () => {
    const r = atPacks();
    r.emit('mercy', { actorId: 'a1' });
    r.saveLoad();
    for (const g of M33_PACK_GROUPS) r.standing.set(g, Array.from({ length: 12 }, (_, i) => `b${i}`));
    r.emit('mercy', { actorId: 'b1' });
    expect(r.num(M33_WITNESSES)).toBe(2);
    for (let i = 2; i < 12; i++) r.emit('mercy', { actorId: `b${i}` });
    expect(r.num(M33_WITNESSES)).toBe(WITNESS_CAP);
  });

  it('D06\'s courtyard counts into the same flag', () => {
    const r = fresh();
    upTo(r, 'd06', 'courtyard');
    r.standing.set(D06_GROUP, ['h1', 'h2']);
    r.step(40);
    const base = r.num(M33_WITNESSES);
    r.emit('mercy', { actorId: 'h1' });
    expect(r.num(M33_WITNESSES)).toBe(base + 1);
  });

  it('cutting an anchor toasts, and the six flags are what the prop used flags write', () => {
    const r = fresh();
    upTo(r, 'm33', 'anchors');
    r.use('use:net-anchor-3');
    expect(r.flag(M33_ANCHOR_FLAGS[2]!)).toBe(true);
    expect(r.toasts).toContain('dragonspine.q.m33.cut');
  });

  it('the flight holds the camera, credits after its time, and a load mid-hold starts it again', () => {
    const r = fresh();
    upTo(r, 'm33', 'flight');
    const shots = r.camera.shots.length;
    const released = r.camera.released;
    r.at('dragonspine.skyhold.camp');
    r.step(40);
    expect(r.camera.shots.length).toBe(shots + 1);
    r.step(FLIGHT_TICKS / 2);
    r.saveLoad();
    expect(r.camera.released).toBe(released + 1);
    expect(r.flag(M33_FLIGHT)).toBe(false);
    r.step(FLIGHT_TICKS + 80);
    expect(r.flag(M33_FLIGHT)).toBe(true);
  });

  it('the flight still credits with no camera rig', () => {
    const r = fresh({ noCamera: true });
    upTo(r, 'm33', 'flight');
    r.at('dragonspine.skyhold.camp');
    r.step(FLIGHT_TICKS + 80);
    expect(r.flag(M33_FLIGHT)).toBe(true);
  });
});

describe('D06: the Aerie', () => {
  it('the landing counts for a glide that lands on the shelf, not for a far one or a dropped one', () => {
    const r = fresh();
    upTo(r, 'd06', 'land');
    r.emit('glide.started', { ledgeId: 'summit-aerie' });
    r.emit('glide.ended', { reason: 'cancelled' });
    r.step(40);
    expect(r.flag(D06_LANDED)).toBe(false);
    r.emit('glide.landed', { at: anchorPos('dragonspine.hearth.entry') });
    r.step(40);
    expect(r.flag(D06_LANDED)).toBe(false);
    r.emit('glide.ended', { reason: 'hit' });
    r.step(40);
    expect(r.flag(D06_LANDED)).toBe(false);
    r.emit('glide.landed', { at: anchorPos(LANDING) });
    r.step(2);
    expect(r.flag(D06_LANDED)).toBe(true);
    expect(r.toasts).toContain('dragonspine.q.d06.landed');
  });

  it('standing in the arrival volume on foot also counts (a return by the waystone), but not while gliding', () => {
    const r = fresh();
    upTo(r, 'd06', 'land');
    r.inside.add('trg.dragonspine.aerie.arrival');
    r.movement.current = 'glide';
    r.step(40);
    expect(r.flag(D06_LANDED)).toBe(false);
    r.movement.current = 'walk';
    r.step(40);
    expect(r.flag(D06_LANDED)).toBe(true);
  });

  it('leaving by the Aerie waystone mid-dungeon and coming back keeps every step', () => {
    const r = fresh();
    upTo(r, 'd06', 'courtyard');
    r.use('use:aerie-hawk-cage');
    r.at('dragonspine.hearth.entry');
    r.step(SECOND * 10);
    r.saveLoad();
    r.at(LANDING);
    r.inside.add('trg.dragonspine.aerie.arrival');
    r.step(SECOND * 3);
    expect(r.current('d06', 'courtyard')).toBe(true);
    expect(r.done('d06', 'winch')).toBe(true);
    autoplay(r, 'd06', { d06: 'defeated' });
    expect(r.qs('d06')).toBe('completed');
  });

  it("gives K8's Skarl the courtyard flag while the director runs, and takes it away on dispose", () => {
    const r = fresh();
    expect(skarlArmFlag()).toBe(D06_COURTYARD_CLEAR);
    r.dispose();
    expect(skarlArmFlag()).toBeNull();
    rig = null;
  });

  it('the courtyard flag is the group row\'s down flag, so the fight arms only after the courtyard is clear', () => {
    const r = fresh();
    upTo(r, 'd06', 'courtyard');
    expect(r.flag(D06_COURTYARD_CLEAR)).toBe(false);
    r.standing.set(D06_GROUP, ['h1']);
    r.step(40);
    expect(r.flag(D06_COURTYARD_CLEAR)).toBe(false);
    r.standing.set(D06_GROUP, []);
    r.step(40);
    expect(r.flag(D06_COURTYARD_CLEAR)).toBe(true);
  });

  it("defines Thorgar's two summit posts, and removes them on dispose", () => {
    const r = fresh();
    expect(r.defined.has('dragonspine.d06.thorgar')).toBe(true);
    expect(r.defined.has('dragonspine.m34.thorgar')).toBe(true);
    r.dispose();
    expect(r.defined.size).toBe(0);
    rig = null;
  });

  it('D06 pays no favour of its own on either branch (K8 pays its dragons and Oswin change once)', () => {
    for (const branch of ['spared', 'defeated'] as const) {
      const r = fresh();
      const add = vi.spyOn(r.state, 'addFavour');
      autoplayAll(r, before('d06'));
      add.mockClear();
      r.manager.start('d06');
      autoplay(r, 'd06', { d06: branch });
      r.step(SECOND * 5);
      expect(r.qs('d06')).toBe('completed');
      expect(add).not.toHaveBeenCalled();
      r.dispose();
      rig = null;
    }
  });

  it('a spared Skarl is staged after a delay, the scene waits for it, and two hunters lead him off when it ends', () => {
    const r = fresh();
    upTo(r, 'd06', 'skarl');
    r.state.setFlag(D06_SKARL_OUTCOME, 'spared');
    r.emit('boss.spared', { bossId: 'corvin-skarl', actorId: 'skarl' });
    r.step(2);
    expect(r.flag(D06_SPARED_SCENE)).toBe(false);
    r.step(STAGE_POLLS * 30 + 40);
    expect(r.flag(D06_SPARED_SCENE)).toBe(true);
    expect(r.flag(D06_LED_OFF)).toBe(false);
    r.step(70);
    expect(r.dialogue.started.at(-1)?.[0]).toBe('scene-d06-outcome');
    r.scene('scene-d06-outcome', 'scene.d06.outcome');
    r.step(2);
    expect(r.flag(D06_LED_OFF)).toBe(true);
  });

  it('a spared Skarl staged by a load: the flag is derived, not lost', () => {
    const r = fresh();
    upTo(r, 'd06', 'skarl');
    r.state.setFlag(D06_SKARL_OUTCOME, 'spared');
    r.saveLoad();
    r.step(STAGE_POLLS * 30 + 40);
    expect(r.flag(D06_SPARED_SCENE)).toBe(true);
  });

  it('a defeated Skarl is never staged and the outcome scene is offered at once', () => {
    const r = fresh();
    upTo(r, 'd06', 'skarl');
    r.state.setFlag(D06_SKARL_OUTCOME, 'defeated');
    r.emit('boss.defeated', { bossId: 'corvin-skarl', actorId: 'skarl' });
    r.step(70);
    expect(r.flag(D06_SPARED_SCENE)).toBe(false);
    expect(r.dialogue.started.at(-1)?.[0]).toBe('scene-d06-outcome');
  });
});

describe("the shard-gem: K10 pays Skarl's, once, from K8's outcome", () => {
  const ports = (flags: Record<string, unknown>, quests: string[] = []): { p: GrantPorts; bag: string[] } => {
    const bag: string[] = [];
    return {
      bag,
      p: { getFlag: (k) => flags[k], setFlag: (k, v) => { flags[k] = v; }, classId: () => 'knight' as never, add: (id) => { bag.push(id); return 1; }, questDone: (q) => quests.includes(q) },
    };
  };
  it('corvin-skarl is a gem boss on D06; the live drop and the retro-grant pay one gem between them', () => {
    expect(GEM_BOSSES).toContainEqual({ bossId: 'corvin-skarl', variant: 'b', questId: 'd06' });
    const flags: Record<string, unknown> = {};
    const { p, bag } = ports(flags);
    expect(grantBossGem(p, 'corvin-skarl')).not.toBeNull();
    expect(flags[grantedFlag('corvin-skarl')]).toBe(true);
    expect(grantBossGem(p, 'corvin-skarl')).toBeNull();
    flags[D06_SKARL_OUTCOME.replace('boss.corvin-skarl.outcome', 'boss.corvin-skarl.outcome')] = 'spared';
    expect(retroGrant(p).filter(Boolean)).toEqual([]);
    expect(bag.length).toBe(1);
  });
  it('a save with D06 done and no live drop is paid on the load, once', () => {
    const flags: Record<string, unknown> = { [D06_SKARL_OUTCOME]: 'defeated' };
    const { p, bag } = ports(flags, ['d06']);
    expect(retroGrant(p).filter(Boolean).length).toBe(1);
    expect(retroGrant(p).filter(Boolean).length).toBe(0);
    expect(bag.length).toBe(1);
  });
});
