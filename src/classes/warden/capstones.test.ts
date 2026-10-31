import { describe, expect, it, vi } from 'vitest';
import { COMBAT } from '../../config/constants';
import '../../hud/events';
import { FakeActor, makeWorld } from '../../spells/testHost';
import { CrackedMarks, MountainUnmoved, VoiceOfTheMountain, Wyrmbreaker } from './capstones';
import { inFissure } from './surge';
import { FISSURE, MOUNTAIN_UNMOVED, VOICE_OF_THE_MOUNTAIN, WYRMBREAKER } from './tuning';

const hitOutcome = (req: any) => ({ ...req, outcome: 'hit', dealt: req.amount, poiseDealt: req.poise, healthAfter: 1, killed: false, saved: false, staggered: false });

function wyrmRig(opts: { x?: number; yaw?: number } = {}) {
  const w = makeWorld();
  const flags = { warden: true, learned: true, blocked: null as string | null, broken: false, chargeBroken: false, clip: true, flinching: false };
  const applied: any[] = [];
  const marked: string[] = [];
  const unlock = vi.fn();
  const lockMove = vi.fn(() => unlock);
  const stopCharge = vi.fn();
  const fissure = vi.fn();
  const clips: string[] = [];
  const phases: string[] = [];
  let outcome: (req: any) => any = hitOutcome;
  const wyrm = new Wyrmbreaker(
    {
      actors: w.actors as never,
      damage: { apply: (req: any) => (applied.push(req), outcome(req)) },
      marks: { mark: (id: string) => void marked.push(id) },
      isWarden: () => flags.warden,
      learned: () => flags.learned,
      blockedReason: () => flags.blocked,
      feet: () => ({ x: opts.x ?? 0, y: 0, z: 0 }),
      facingYaw: () => opts.yaw ?? 0,
      playClip: (c) => (clips.push(c), flags.clip),
      interrupted: (phase) => (phases.push(phase), phase === 'charge' ? flags.chargeBroken : flags.broken),
      flinching: () => flags.flinching,
      lockMove,
      reportTrigger: vi.fn(),
      fx: { charge: () => stopCharge, fissure },
      skillId: 'warden.wyrmbreaker',
    },
    () => 'player',
  );
  const run = (n: number) => { for (let i = 0; i < n; i++) wyrm.tick(); };
  return { w, wyrm, flags, applied, marked, unlock, lockMove, stopCharge, fissure, clips, phases, run, setOutcome: (f: (req: any) => any) => (outcome = f) };
}
const foe = (w: ReturnType<typeof makeWorld>, id: string, x: number, z: number) => w.actors.add(new FakeActor(id, 'hostile', x, z));

describe('inFissure (parametrised)', () => {
  it('keeps the Blaze defaults and takes a size', () => {
    const feet = { x: 0, y: 0, z: 0 };
    expect(inFissure(feet, 0, { x: 0, y: 0, z: -FISSURE.length })).toBe(true);
    expect(inFissure(feet, 0, { x: 0, y: 0, z: -FISSURE.length - 0.01 })).toBe(false);
    expect(inFissure(feet, 0, { x: 0, y: 0, z: -11 }, 12, 4)).toBe(true);
    expect(inFissure(feet, 0, { x: 2, y: 0, z: -5 }, 12, 4)).toBe(true);
    expect(inFissure(feet, 0, { x: 2.01, y: 0, z: -5 }, 12, 4)).toBe(false);
  });
});

describe('Wyrmbreaker', () => {
  it('refuses the wrong class, an unlearned skill and a blocked player, and starts nothing', () => {
    const r = wyrmRig();
    r.flags.warden = false;
    expect(r.wyrm.start()).toEqual({ ok: false, reason: 'wrong-class' });
    r.flags.warden = true;
    r.flags.learned = false;
    expect(r.wyrm.start()).toEqual({ ok: false, reason: 'not-learned' });
    r.flags.learned = true;
    for (const reason of ['dead', 'staggered', 'busy']) {
      r.flags.blocked = reason;
      expect(r.wyrm.start()).toEqual({ ok: false, reason });
    }
    expect(r.lockMove).not.toHaveBeenCalled();
    expect(r.wyrm.casting).toBe(false);
  });

  it('charges 0.8 s locked in place with the glow, then plays the chop and lands the fissure on the first hot tick', () => {
    const r = wyrmRig();
    foe(r.w, 'wolf', 0, -5);
    expect(r.wyrm.start()).toEqual({ ok: true });
    expect(r.wyrm.start()).toEqual({ ok: false, reason: 'casting' });
    expect(r.lockMove).toHaveBeenCalledTimes(1);
    r.run(WYRMBREAKER.chargeTicks - 1);
    expect(r.clips).toEqual([]);
    expect(r.unlock).not.toHaveBeenCalled();
    r.run(1);
    expect(r.clips).toEqual([WYRMBREAKER.clip]);
    expect(r.unlock).toHaveBeenCalledTimes(1);
    expect(r.stopCharge).toHaveBeenCalledTimes(1);
    r.run(WYRMBREAKER.hitTick - 1);
    expect(r.applied).toEqual([]);
    r.run(1);
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]).toMatchObject({ attackerId: 'player', targetId: 'wolf', poise: 60, kind: 'melee', attackId: WYRMBREAKER.attackId });
    expect(r.applied[0].amount).toBeCloseTo(COMBAT.baseDamage * 2.5);
    expect(r.applied[0].direction.z).toBeCloseTo(-1);
    expect(r.marked).toEqual(['wolf']);
    expect(r.fissure).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 }, 0, 1);
    // Once per cast; the cast then ends.
    r.run(WYRMBREAKER.chopTicks);
    expect(r.applied).toHaveLength(1);
    expect(r.wyrm.casting).toBe(false);
    expect(r.wyrm.start()).toEqual({ ok: true });
  });

  it('the fissure is 12 m by 4 m: the far end and the half width are inside, a hair past is not, behind is not', () => {
    const r = wyrmRig();
    foe(r.w, 'end', 0, -12);
    foe(r.w, 'past', 0, -12.01);
    foe(r.w, 'edge', 2, -6);
    foe(r.w, 'wide', 2.01, -6);
    foe(r.w, 'behind', 0, 1);
    foe(r.w, 'ally', 0, -3).team = 'ally';
    foe(r.w, 'neutral', 1, -3).team = 'neutral';
    r.wyrm.start();
    r.run(WYRMBREAKER.chargeTicks + WYRMBREAKER.hitTick);
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['edge', 'end']);
  });

  it('follows the facing (yaw pi/2 points to -x) and hits several foes in one cast', () => {
    const r = wyrmRig({ yaw: Math.PI / 2 });
    foe(r.w, 'a', -3, 0);
    foe(r.w, 'b', -10, 1);
    foe(r.w, 'c', 3, 0);
    r.wyrm.start();
    r.run(WYRMBREAKER.chargeTicks + WYRMBREAKER.hitTick);
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['a', 'b']);
    expect(r.marked.sort()).toEqual(['a', 'b']);
  });

  it('skips foes in a mercy state, dead and unhittable foes; a boss is hit like any other', () => {
    const r = wyrmRig();
    for (const [id, s] of [['yield', 'yielding'], ['calm', 'calming'], ['leave', 'leaving'], ['stag', 'staggered']] as const) {
      (foe(r.w, id, 0, -4) as any).mercyState = () => s;
    }
    foe(r.w, 'dead', 0, -4).kill();
    foe(r.w, 'ghost', 0, -4).hittable = false;
    foe(r.w, 'boss', 0, -8);
    (foe(r.w, 'broken', 0, -3) as any).mercyState = () => { throw new Error('x'); };
    r.wyrm.start();
    r.run(WYRMBREAKER.chargeTicks + WYRMBREAKER.hitTick);
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['boss', 'broken']);
  });

  it('cracks only foes the hit landed on (a blocked or refused hit leaves no crack)', () => {
    const r = wyrmRig();
    foe(r.w, 'hit', 0, -2);
    foe(r.w, 'blocked', 0, -3);
    foe(r.w, 'none', 0, -4);
    r.setOutcome((req) => (req.targetId === 'hit' ? hitOutcome(req) : req.targetId === 'blocked' ? { ...hitOutcome(req), outcome: 'blocked' } : null));
    r.wyrm.start();
    r.run(WYRMBREAKER.chargeTicks + WYRMBREAKER.hitTick);
    expect(r.applied).toHaveLength(3);
    expect(r.marked).toEqual(['hit']);
    expect(r.fissure.mock.calls[0][2]).toBe(1);
  });

  it('a broken state during the charge (a dodge, another attack, a stagger) cancels: no clip, no damage, the lock and glow released, Ember not refunded here', () => {
    const r = wyrmRig();
    foe(r.w, 'wolf', 0, -4);
    r.wyrm.start();
    r.run(10);
    r.flags.chargeBroken = true;
    r.run(1);
    expect(r.wyrm.casting).toBe(false);
    expect(r.unlock).toHaveBeenCalledTimes(1);
    expect(r.stopCharge).toHaveBeenCalledTimes(1);
    r.flags.chargeBroken = false;
    r.run(200);
    expect(r.clips).toEqual([]);
    expect(r.applied).toEqual([]);
    expect(r.phases[0]).toBe('charge');
  });

  it('a flinch at the end of the charge delays the chop until it ends; one longer than the grace cancels', () => {
    const r = wyrmRig();
    foe(r.w, 'wolf', 0, -4);
    r.flags.flinching = true;
    r.wyrm.start();
    r.run(WYRMBREAKER.chargeTicks + 10);
    expect(r.clips).toEqual([]);
    expect(r.wyrm.charging).toBe(true);
    r.flags.flinching = false;
    r.run(1 + WYRMBREAKER.hitTick);
    expect(r.clips).toHaveLength(1);
    expect(r.applied.map((a) => a.targetId)).toEqual(['wolf']);

    const q = wyrmRig();
    foe(q.w, 'wolf', 0, -4);
    q.flags.flinching = true;
    q.wyrm.start();
    q.run(WYRMBREAKER.chargeTicks + WYRMBREAKER.flinchGraceTicks + 1);
    expect(q.wyrm.casting).toBe(false);
    expect(q.clips).toEqual([]);
    expect(q.unlock).toHaveBeenCalledTimes(1);
  });

  it('a flinch that replaces the chop clip cancels it with no damage', () => {
    const r = wyrmRig();
    foe(r.w, 'wolf', 0, -4);
    r.wyrm.start();
    r.run(WYRMBREAKER.chargeTicks + 5);
    r.flags.broken = true;
    r.run(WYRMBREAKER.chopTicks);
    expect(r.applied).toEqual([]);
    expect(r.wyrm.casting).toBe(false);
    expect(r.phases).toContain('chop');
  });

  it('a refused chop clip ends the cast; respec mid-charge and cancel release everything', () => {
    const r = wyrmRig();
    foe(r.w, 'wolf', 0, -4);
    r.flags.clip = false;
    r.wyrm.start();
    r.run(WYRMBREAKER.chargeTicks + 100);
    expect(r.applied).toEqual([]);
    expect(r.wyrm.casting).toBe(false);
    expect(r.unlock).toHaveBeenCalledTimes(1);
    const q = wyrmRig();
    q.wyrm.start();
    q.run(5);
    q.flags.learned = false;
    q.run(1);
    expect(q.wyrm.casting).toBe(false);
    expect(q.unlock).toHaveBeenCalledTimes(1);
    const c = wyrmRig();
    c.wyrm.start();
    c.wyrm.cancel();
    c.wyrm.cancel();
    expect(c.unlock).toHaveBeenCalledTimes(1);
    expect(c.stopCharge).toHaveBeenCalledTimes(1);
  });
});

describe('CrackedMarks', () => {
  const rig = () => {
    const w = makeWorld();
    let now = 0;
    const marks = new CrackedMarks({ events: w.events, now: () => now });
    return { w, marks, at: (n: number) => (now = n) };
  };

  it('+25% on a cracked target for 8 s (strictly until), nothing on others, refreshed by a second crack', () => {
    const { marks, at } = rig();
    marks.mark('wolf');
    const req = { amount: 8 };
    marks.modify(req, 'wolf');
    expect(req.amount).toBeCloseTo(10);
    const other = { amount: 8 };
    marks.modify(other, 'boar');
    expect(other.amount).toBe(8);
    at(7.99);
    expect(marks.isCracked('wolf')).toBe(true);
    at(8);
    expect(marks.isCracked('wolf')).toBe(false);
    const late = { amount: 8 };
    marks.modify(late, 'wolf');
    expect(late.amount).toBe(8);
    at(5);
    marks.mark('wolf');
    at(12.9);
    expect(marks.isCracked('wolf')).toBe(true);
  });

  it('prune drops the expired, death, despawn and load clear, dispose unhooks', () => {
    const { w, marks, at } = rig();
    marks.mark('a');
    marks.mark('b');
    marks.mark('c');
    marks.mark('d');
    at(9);
    marks.mark('late');
    marks.prune();
    expect(marks.size).toBe(1);
    marks.mark('x');
    w.events.emit('actor.died' as never, { actorId: 'x' } as never);
    w.events.emit('actor.despawned' as never, { actorId: 'late' } as never);
    expect(marks.size).toBe(0);
    marks.mark('y');
    w.events.emit('save.loaded' as never, {} as never);
    expect(marks.size).toBe(0);
    marks.dispose();
    expect(w.events.count()).toBe(0);
  });
});

function mountainRig() {
  let now = 0;
  const flags = { warden: true, learned: true, blocked: null as string | null };
  const dropFilter = vi.fn();
  const addKnockbackFilter = vi.fn((_id: string, _keep: () => boolean) => dropFilter);
  const stopFx = vi.fn();
  const m = new MountainUnmoved(
    {
      now: () => now,
      isWarden: () => flags.warden,
      learned: () => flags.learned,
      blockedReason: () => flags.blocked,
      addKnockbackFilter,
      fx: () => stopFx,
      reportTrigger: vi.fn(),
      skillId: 'warden.mountainUnmoved',
    },
    () => 'player',
  );
  return { m, flags, dropFilter, addKnockbackFilter, stopFx, at: (n: number) => (now = n) };
}

describe('Mountain Unmoved', () => {
  it('refuses wrong class, unlearned, blocked; refuses a re-press while up', () => {
    const r = mountainRig();
    r.flags.warden = false;
    expect(r.m.start()).toEqual({ ok: false, reason: 'wrong-class' });
    r.flags.warden = true;
    r.flags.learned = false;
    expect(r.m.start()).toEqual({ ok: false, reason: 'not-learned' });
    r.flags.learned = true;
    r.flags.blocked = 'busy';
    expect(r.m.start()).toEqual({ ok: false, reason: 'busy' });
    r.flags.blocked = null;
    expect(r.addKnockbackFilter).not.toHaveBeenCalled();
    expect(r.m.start()).toEqual({ ok: true });
    expect(r.m.start()).toEqual({ ok: false, reason: 'active' });
  });

  it('zeroes the poise of hits on the player only, and cancels knockback, for exactly 10 s', () => {
    const r = mountainRig();
    r.m.start();
    expect(r.addKnockbackFilter).toHaveBeenCalledTimes(1);
    const [id, keep] = r.addKnockbackFilter.mock.calls[0];
    expect(id).toBe(MOUNTAIN_UNMOVED.filterId);
    expect(keep()).toBe(false);
    const onPlayer = { poise: 40 };
    r.m.modify(onPlayer, 'player');
    expect(onPlayer.poise).toBe(0);
    const onFoe = { poise: 40 };
    r.m.modify(onFoe, 'wolf');
    expect(onFoe.poise).toBe(40);
    r.at(9.99);
    r.m.tick();
    expect(r.m.active).toBe(true);
    r.at(10);
    r.m.tick();
    expect(r.m.active).toBe(false);
    expect(r.dropFilter).toHaveBeenCalledTimes(1);
    expect(r.stopFx).toHaveBeenCalledTimes(1);
    const after = { poise: 40 };
    r.m.modify(after, 'player');
    expect(after.poise).toBe(40);
    // Usable again once it has ended.
    expect(r.m.start()).toEqual({ ok: true });
  });

  it('the poise modifier checks the time itself: no effect at 10 s even before the tick ends it', () => {
    const r = mountainRig();
    r.m.start();
    r.at(9.99);
    const early = { poise: 40 };
    r.m.modify(early, 'player');
    expect(early.poise).toBe(0);
    r.at(10);
    const late = { poise: 40 };
    r.m.modify(late, 'player');
    expect(late.poise).toBe(40);
    expect(r.m.active).toBe(true);
  });

  it('a respec ends it; reset is idempotent and releases the filter and the stone skin once', () => {
    const r = mountainRig();
    r.m.start();
    r.flags.learned = false;
    r.m.tick();
    expect(r.m.active).toBe(false);
    r.m.reset();
    expect(r.dropFilter).toHaveBeenCalledTimes(1);
    expect(r.stopFx).toHaveBeenCalledTimes(1);
  });

  it('works without a knockback filter service (poise still zeroed)', () => {
    const m = new MountainUnmoved(
      { now: () => 0, isWarden: () => true, learned: () => true, blockedReason: () => null, reportTrigger: vi.fn(), skillId: 'x' },
      () => 'player',
    );
    expect(m.start()).toEqual({ ok: true });
    const q = { poise: 9 };
    m.modify(q, 'player');
    expect(q.poise).toBe(0);
    m.reset();
  });
});

function voiceRig() {
  const w = makeWorld();
  const flags = { warden: true, learned: true, blocked: null as string | null };
  const applied: any[] = [];
  const stuns: Array<{ id: string; spec: any }> = [];
  const bosses = new Set<string>();
  let outcome: (req: any) => any = hitOutcome;
  const stunned = vi.fn();
  const howl = vi.fn();
  const voice = new VoiceOfTheMountain(
    {
      actors: w.actors as never,
      damage: { apply: (req: any) => (applied.push(req), outcome(req)) },
      stun: (id, spec) => (stuns.push({ id, spec }), true),
      isBoss: (id) => bosses.has(id),
      isWarden: () => flags.warden,
      learned: () => flags.learned,
      blockedReason: () => flags.blocked,
      feet: () => ({ x: 0, y: 0, z: 0 }),
      reportTrigger: vi.fn(),
      fx: { howl, stunned },
      skillId: 'warden.voiceOfTheMountain',
    },
    () => 'player',
  );
  return { w, voice, flags, applied, stuns, bosses, stunned, howl, setOutcome: (f: (req: any) => any) => (outcome = f) };
}

describe('Voice of the Mountain', () => {
  it('refuses wrong class, unlearned, blocked without touching anyone', () => {
    const r = voiceRig();
    foe(r.w, 'wolf', 0, 3);
    r.flags.warden = false;
    expect(r.voice.cast()).toEqual({ ok: false, reason: 'wrong-class' });
    r.flags.warden = true;
    r.flags.learned = false;
    expect(r.voice.cast()).toEqual({ ok: false, reason: 'not-learned' });
    r.flags.learned = true;
    for (const reason of ['dead', 'staggered', 'busy']) {
      r.flags.blocked = reason;
      expect(r.voice.cast()).toEqual({ ok: false, reason });
    }
    expect(r.applied).toEqual([]);
    expect(r.howl).not.toHaveBeenCalled();
  });

  it('poise 40 with no damage, unblockable, and a 3 s stun under its own id on every hostile within 12 m (inclusive)', () => {
    const r = voiceRig();
    foe(r.w, 'near', 0, 3);
    foe(r.w, 'edge', 12, 0);
    foe(r.w, 'past', 12.01, 0);
    foe(r.w, 'ally', 1, 1).team = 'ally';
    expect(r.voice.cast()).toEqual({ ok: true });
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['edge', 'near']);
    expect(r.applied[0]).toMatchObject({ attackerId: 'player', amount: 0, poise: 40, kind: 'melee', unblockable: true, attackId: VOICE_OF_THE_MOUNTAIN.attackId });
    expect(r.stuns.map((s) => s.id).sort()).toEqual(['edge', 'near']);
    expect(r.stuns[0].spec).toEqual({ id: 'warden.voiceOfTheMountain.stun', kind: 'stun', seconds: 3, sourceId: 'player' });
    expect(r.stunned).toHaveBeenCalledTimes(2);
    expect(r.howl).toHaveBeenCalledTimes(1);
  });

  it('a boss takes the poise hit and no stun', () => {
    const r = voiceRig();
    foe(r.w, 'boss', 0, 5);
    foe(r.w, 'wolf', 0, -5);
    r.bosses.add('boss');
    r.voice.cast();
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['boss', 'wolf']);
    expect(r.stuns.map((s) => s.id)).toEqual(['wolf']);
  });

  it('skips mercy, dead and unhittable foes; a foe the hit put into a mercy state is not stunned; a hit that did not land stuns nothing', () => {
    const r = voiceRig();
    (foe(r.w, 'yield', 0, 2) as any).mercyState = () => 'yielding';
    foe(r.w, 'dead', 0, 2).kill();
    foe(r.w, 'ghost', 0, 2).hittable = false;
    const flips = foe(r.w, 'flips', 0, 3) as any;
    let mercy = 'none';
    flips.mercyState = () => mercy;
    foe(r.w, 'blocked', 0, 4);
    foe(r.w, 'plain', 0, 5);
    r.setOutcome((req) => {
      if (req.targetId === 'flips') mercy = 'staggered';
      if (req.targetId === 'blocked') return null;
      return hitOutcome(req);
    });
    r.voice.cast();
    expect(r.applied.map((a) => a.targetId).sort()).toEqual(['blocked', 'flips', 'plain']);
    expect(r.stuns.map((s) => s.id)).toEqual(['plain']);
  });

  it("is refused 'no-target' with nothing spent when no live non-mercy hostile is within 12 m", () => {
    const r = voiceRig();
    expect(r.voice.cast()).toEqual({ ok: false, reason: 'no-target' });
    foe(r.w, 'past', 12.01, 0);
    (foe(r.w, 'yield', 0, 2) as any).mercyState = () => 'yielding';
    foe(r.w, 'dead', 0, 3).kill();
    foe(r.w, 'ally', 1, 1).team = 'ally';
    expect(r.voice.cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(r.howl).not.toHaveBeenCalled();
    expect(r.applied).toEqual([]);
    foe(r.w, 'edge', 12, 0);
    expect(r.voice.cast()).toEqual({ ok: true });
  });
});
