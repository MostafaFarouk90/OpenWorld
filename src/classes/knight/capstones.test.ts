import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import { WeaponTracer } from '../../combat/WeaponTracer';
import { GameEvents } from '../../core/events';
import { BannerOfTheSunforge, HeartshardSmite, UnbrokenOath, type SmiteBlade } from './capstones';
import { HEARTSHARD_SMITE, SUNFORGE, UNBROKEN_OATH } from './tuning';

// ---------------------------------------------------------------------------------------------------------------------
// Unbroken Oath
// ---------------------------------------------------------------------------------------------------------------------

function oathRig(over: { classId?: string | null; learned?: boolean; blocked?: string | null } = {}) {
  const st = {
    now: 0,
    tick: 0,
    dead: false,
    learned: over.learned ?? true,
    classId: over.classId === undefined ? null : over.classId,
    blocked: over.blocked ?? null,
    stamina: 100,
  };
  const stop = vi.fn();
  const beat = vi.fn();
  const trig = vi.fn();
  const restore = vi.fn((n: number) => void (st.stamina += n));
  const oath = new UnbrokenOath({
    now: () => st.now,
    tick: () => st.tick,
    playerId: () => 'player',
    classId: () => st.classId,
    learned: () => st.learned,
    dead: () => st.dead,
    blockedReason: () => st.blocked,
    stamina: () => st.stamina,
    restoreStamina: restore,
    shell: () => stop,
    heartbeat: beat,
    reportTrigger: trig,
    skillId: 'knight.unbrokenOath',
  });
  return { oath, st, stop, beat, trig, restore };
}

describe('Unbroken Oath: casting', () => {
  it('succeeds, shows the shell and reports the trigger', () => {
    const r = oathRig();
    expect(r.oath.cast()).toEqual({ ok: true });
    expect(r.oath.active).toBe(true);
    expect(r.trig).toHaveBeenCalledWith('knight.unbrokenOath');
  });

  it.each([
    ['wrong class', { classId: 'warden' }, 'wrong-class'],
    ['not learned', { learned: false }, 'not-learned'],
    ['dead', { blocked: 'dead' }, 'dead'],
    ['staggered', { blocked: 'staggered' }, 'staggered'],
    ['busy', { blocked: 'busy' }, 'busy'],
  ])('refuses when %s', (_n, over, reason) => {
    const r = oathRig(over);
    expect(r.oath.cast()).toEqual({ ok: false, reason });
    expect(r.oath.active).toBe(false);
    expect(r.trig).not.toHaveBeenCalled();
  });

  it("the Knight's null class and 'knight' both cast", () => {
    expect(oathRig({ classId: null }).oath.cast().ok).toBe(true);
    expect(oathRig({ classId: 'knight' }).oath.cast().ok).toBe(true);
  });

  it('the lethal handler checks the time itself: it holds at 7.99 s and lets go at 8 s before any tick', () => {
    const r = oathRig();
    r.oath.cast();
    r.st.now = 7.99;
    expect(r.oath.lethal('player', 'melee')).toBe(true);
    r.st.now = 8;
    expect(r.oath.lethal('player', 'melee')).toBe(false);
    expect(r.oath.active).toBe(false);
  });

  it('a recast restarts the 8 s and replaces the shell', () => {
    const r = oathRig();
    r.oath.cast();
    r.st.now = 6;
    r.oath.cast();
    expect(r.stop).toHaveBeenCalledTimes(1);
    r.st.now = 13;
    r.oath.tick();
    expect(r.oath.active).toBe(true);
    r.st.now = 14.01;
    r.oath.tick();
    expect(r.oath.active).toBe(false);
  });
});

describe('Unbroken Oath: lasting', () => {
  it('lasts exactly 8 s, beating once a second', () => {
    const r = oathRig();
    r.oath.cast();
    for (let t = 0; t <= 7.99; t += 0.25) {
      r.st.now = t;
      r.oath.tick();
    }
    expect(r.oath.active).toBe(true);
    expect(r.beat).toHaveBeenCalledTimes(7);
    r.st.now = UNBROKEN_OATH.seconds;
    r.oath.tick();
    expect(r.oath.active).toBe(false);
    expect(r.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['death', (r: ReturnType<typeof oathRig>) => (r.st.dead = true)],
    ['a class change', (r: ReturnType<typeof oathRig>) => (r.st.classId = 'warden')],
    ['an unlearn', (r: ReturnType<typeof oathRig>) => (r.st.learned = false)],
  ])('ends on %s', (_n, change) => {
    const r = oathRig();
    r.oath.cast();
    change(r);
    r.oath.tick();
    expect(r.oath.active).toBe(false);
    expect(r.oath.lethal('player', 'melee')).toBe(false);
  });

  it('clear() ends it (load, dispose)', () => {
    const r = oathRig();
    r.oath.cast();
    r.oath.clear();
    expect(r.oath.active).toBe(false);
    expect(r.stop).toHaveBeenCalled();
  });
});

describe('Unbroken Oath: the lethal handler', () => {
  it('holds the Knight against every kind but script, and only the Knight', () => {
    const r = oathRig();
    expect(r.oath.lethal('player', 'melee')).toBe(false); // not cast yet
    r.oath.cast();
    for (const kind of ['melee', 'spell', 'fall', 'status']) expect(r.oath.lethal('player', kind), kind).toBe(true);
    expect(r.oath.lethal('player', 'script')).toBe(false);
    expect(r.oath.lethal('someone-else', 'melee')).toBe(false);
  });

  describe('through the real damage resolver', () => {
    function world() {
      const events = new GameEvents(() => {});
      const actors = new ActorRegistry(events);
      const damage = new DamageResolver(actors, events, () => {});
      const player = actors.spawn(playerInit());
      const foe = actors.spawn({ kind: 'foe', team: 'hostile', maxHealth: 100, maxPoise: 20 });
      const r = oathRig();
      // Second Wind stand-in at -100: it records whether it was reached.
      const secondWind = vi.fn(() => false);
      damage.addLethalHandler('second-wind', secondWind, -100);
      damage.addLethalHandler(
        UNBROKEN_OATH.handlerId,
        (target, result) => {
          if (!r.oath.lethal(target.id, result.kind)) return false;
          target.health = Math.min(1, target.maxHealth);
          return true;
        },
        UNBROKEN_OATH.handlerOrder,
      );
      // The oath rig's player id is 'player'; the real one is the registry's.
      return { events, actors, damage, player, foe, r, secondWind };
    }

    it('a lethal hit leaves 1 HP, does not consume Second Wind, and the Knight lives', () => {
      const w = world();
      (w.r.oath as unknown as { p: { playerId(): string } }).p.playerId = () => w.player.id;
      w.r.oath.cast();
      const res = w.damage.apply({ attackerId: w.foe.id, targetId: w.player.id, amount: 5000, kind: 'melee' });
      expect(res?.saved).toBe(true);
      expect(res?.killed).toBe(false);
      expect(w.player.dead).toBe(false);
      expect(w.player.health).toBe(1);
      expect(w.secondWind).not.toHaveBeenCalled();
    });

    it('a script hit still kills, and Second Wind is then asked', () => {
      const w = world();
      (w.r.oath as unknown as { p: { playerId(): string } }).p.playerId = () => w.player.id;
      w.r.oath.cast();
      const res = w.damage.apply({ attackerId: null, targetId: w.player.id, amount: 5000, kind: 'script' });
      expect(res?.killed).toBe(true);
      expect(w.player.dead).toBe(true);
      expect(w.secondWind).toHaveBeenCalled();
    });

    it('a bleed tick at 1 HP leaves it at 1', () => {
      const w = world();
      (w.r.oath as unknown as { p: { playerId(): string } }).p.playerId = () => w.player.id;
      w.r.oath.cast();
      w.player.health = 1;
      const res = w.damage.apply({ attackerId: null, targetId: w.player.id, amount: 3, poise: 0, kind: 'status', statusId: 'b', statusKind: 'bleed' });
      expect(res?.killed).toBe(false);
      expect(w.player.health).toBe(1);
      expect(w.player.dead).toBe(false);
    });

    it('without the Oath the same hit kills (Second Wind is asked)', () => {
      const w = world();
      (w.r.oath as unknown as { p: { playerId(): string } }).p.playerId = () => w.player.id;
      const res = w.damage.apply({ attackerId: w.foe.id, targetId: w.player.id, amount: 5000, kind: 'melee' });
      expect(res?.killed).toBe(true);
      expect(w.secondWind).toHaveBeenCalled();
    });

    it('other actors die as usual', () => {
      const w = world();
      (w.r.oath as unknown as { p: { playerId(): string } }).p.playerId = () => w.player.id;
      w.r.oath.cast();
      const res = w.damage.apply({ attackerId: w.player.id, targetId: w.foe.id, amount: 5000, kind: 'melee' });
      expect(res?.killed).toBe(true);
    });
  });
});

describe('Unbroken Oath: free counterattacks', () => {
  const stab = { attackerId: 'player', attackId: UNBROKEN_OATH.stabAttackId, outcome: 'hit' };

  it('the riposte stab that lands after a parry hands back the stamina spent since the parry', () => {
    const r = oathRig();
    r.oath.cast();
    r.st.tick = 100;
    r.oath.onParried();
    r.st.stamina = 82; // a heavy swing chained in before the stab
    r.st.tick = 130;
    expect(r.oath.onDealt(stab)).toBe(18);
    expect(r.restore).toHaveBeenCalledWith(18);
    expect(r.st.stamina).toBe(100);
  });

  it('is spent by the first stab: a second one gets nothing', () => {
    const r = oathRig();
    r.oath.cast();
    r.oath.onParried();
    r.st.stamina = 80;
    expect(r.oath.onDealt(stab)).toBe(20);
    r.st.stamina = 60;
    expect(r.oath.onDealt(stab)).toBe(0);
  });

  it('nothing outside the window, without a parry, or without the Oath', () => {
    const r = oathRig();
    r.oath.onParried(); // no Oath yet: no window
    r.oath.cast();
    r.st.stamina = 70;
    expect(r.oath.onDealt(stab)).toBe(0);
    r.st.stamina = 100;
    r.oath.onParried();
    r.st.stamina = 70;
    r.st.tick = UNBROKEN_OATH.counterWindowTicks + 1;
    expect(r.oath.onDealt(stab)).toBe(0);
    expect(r.restore).not.toHaveBeenCalled();
  });

  it('only the Knight\'s own landed stab counts', () => {
    const r = oathRig();
    r.oath.cast();
    r.oath.onParried();
    r.st.stamina = 70;
    expect(r.oath.onDealt({ ...stab, attackerId: 'foe' })).toBe(0);
    expect(r.oath.onDealt({ ...stab, attackId: 'other' })).toBe(0);
    expect(r.oath.onDealt({ ...stab, outcome: 'blocked' })).toBe(0);
    expect(r.oath.onDealt(stab)).toBe(30);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Heartshard Smite
// ---------------------------------------------------------------------------------------------------------------------

/** A KayKit-like sword: the blade runs along +Y from the grip; the hand slot above it is scaled like the real rig's. */
function sword(bladeLength = 1.2, slotScale = 1) {
  const slot = new THREE.Group();
  slot.scale.setScalar(slotScale);
  slot.position.set(10, 2, -4);
  const weapon = new THREE.Group();
  weapon.scale.set(1, 1, 1);
  weapon.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, bladeLength, 0.02).translate(0, bladeLength / 2, 0)));
  const hilt = new THREE.Object3D();
  const tip = new THREE.Object3D();
  tip.position.set(0, bladeLength, 0);
  weapon.add(hilt, tip);
  slot.add(weapon);
  slot.updateMatrixWorld(true);
  return { slot, blade: { weapon, hilt, tip } as SmiteBlade };
}

function smiteRig(over: { classId?: string | null; learned?: boolean; blade?: SmiteBlade | null } = {}) {
  const s = sword();
  const st = {
    now: 0,
    dead: false,
    learned: over.learned ?? true,
    classId: over.classId === undefined ? null : over.classId,
    blade: over.blade === undefined ? s.blade : over.blade,
    foe: { dead: false, team: 'hostile', mercyState: () => 'none' } as { dead: boolean; team: string; mercyState: () => string } | null,
  };
  const ignite = vi.fn(() => true);
  const stopFx = vi.fn();
  const fx = vi.fn((_w: THREE.Object3D, _r: number) => stopFx);
  const smite = new HeartshardSmite({
    now: () => st.now,
    playerId: () => 'player',
    classId: () => st.classId,
    learned: () => st.learned,
    dead: () => st.dead,
    blade: () => st.blade,
    foe: () => st.foe,
    ignite,
    fx,
  });
  return { smite, st, ignite, fx, stopFx, ...s };
}

const reach = (b: SmiteBlade): number => {
  b.weapon.updateWorldMatrix(true, true);
  return new THREE.Vector3().setFromMatrixPosition(b.hilt.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(b.tip.matrixWorld));
};

describe('Heartshard Smite: the Surge trigger', () => {
  it('turns on for the Knight\'s own heartshard-surge and for nothing else', () => {
    const r = smiteRig();
    expect(r.smite.onReleased('player', 'rally-cry')).toBe(false);
    expect(r.smite.onReleased('someone', 'heartshard-surge')).toBe(false);
    expect(r.smite.active).toBe(false);
    expect(r.smite.onReleased('player', 'heartshard-surge')).toBe(true);
    expect(r.smite.active).toBe(true);
    expect(r.fx).toHaveBeenCalledWith(r.blade.weapon, 5);
  });

  it.each([
    ['wrong class', { classId: 'warden' }],
    ['not learned', { learned: false }],
    ['no avatar', { blade: null }],
  ])('does nothing when %s', (_n, over) => {
    const r = smiteRig(over);
    expect(r.smite.onReleased('player', 'heartshard-surge')).toBe(false);
    expect(r.smite.active).toBe(false);
  });

  it('does nothing when dead', () => {
    const r = smiteRig();
    r.st.dead = true;
    expect(r.smite.onReleased('player', 'heartshard-surge')).toBe(false);
  });
});

describe('Heartshard Smite: the 5 m blade', () => {
  it('scales the blade along its long axis only so the hilt-to-tip distance is 5 m, and restores it', () => {
    const r = smiteRig();
    expect(reach(r.blade)).toBeCloseTo(1.2);
    r.smite.onReleased('player', 'heartshard-surge');
    expect(reach(r.blade)).toBeCloseTo(5, 6);
    expect(r.blade.weapon.scale.x).toBe(1);
    expect(r.blade.weapon.scale.z).toBe(1);
    r.st.now = 8;
    r.smite.tick();
    expect(r.smite.active).toBe(false);
    expect(r.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
    expect(reach(r.blade)).toBeCloseTo(1.2);
    expect(r.stopFx).toHaveBeenCalledTimes(1);
  });

  it('measures the reach in metres through a scaled hand slot', () => {
    const s = sword(0.6, 0.5);
    const r = smiteRig({ blade: s.blade });
    r.smite.onReleased('player', 'heartshard-surge');
    expect(reach(s.blade)).toBeCloseTo(5, 6);
  });

  it('the real weapon tracer sweeps the 5 m: the tip it traces is 5 m from the hilt (axis and reach)', () => {
    const r = smiteRig();
    // The tracer fixes the endpoints in weapon-local space when it is built, as the world does at attachPlayer.
    const tracer = new WeaponTracer({ attacker: {}, weapon: r.blade.weapon, hilt: r.blade.hilt, tip: r.blade.tip });
    const traced = () => {
      tracer.tick(true, []);
      const t = tracer as unknown as { curHilt: THREE.Vector3; curTip: THREE.Vector3 };
      return { len: t.curHilt.distanceTo(t.curTip), dir: t.curTip.clone().sub(t.curHilt).normalize() };
    };
    const before = traced();
    expect(before.len).toBeCloseTo(1.2);
    r.smite.onReleased('player', 'heartshard-surge');
    const during = traced();
    expect(during.len).toBeCloseTo(5, 6);
    // the blade still points the same way (world +Y here) and the hilt has not moved
    expect(during.dir.dot(before.dir)).toBeCloseTo(1);
    const t = tracer as unknown as { curHilt: THREE.Vector3 };
    expect(t.curHilt.toArray()).toEqual([10, 2, -4]);
    r.smite.clear();
    expect(traced().len).toBeCloseTo(1.2);
  });

  it('a second Surge restarts the 8 s without scaling twice', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    r.st.now = 6;
    r.smite.onReleased('player', 'heartshard-surge');
    expect(reach(r.blade)).toBeCloseTo(5, 6);
    expect(r.fx).toHaveBeenCalledTimes(1);
    r.st.now = 13.9;
    r.smite.tick();
    expect(r.smite.active).toBe(true);
    r.st.now = 14;
    r.smite.tick();
    expect(r.smite.active).toBe(false);
    expect(reach(r.blade)).toBeCloseTo(1.2);
    expect(r.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('an avatar swap (another weapon object) restores the old weapon and ends the Smite', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    const other = sword();
    r.st.blade = other.blade;
    r.smite.tick();
    expect(r.smite.active).toBe(false);
    expect(r.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
    expect(other.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('a Surge on a new avatar after the swap scales the new weapon, not the old one', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    const other = sword(0.8);
    r.st.blade = other.blade;
    r.smite.onReleased('player', 'heartshard-surge');
    expect(r.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
    expect(reach(other.blade)).toBeCloseTo(5, 6);
  });

  it.each([
    ['death', (r: ReturnType<typeof smiteRig>) => (r.st.dead = true)],
    ['a class change', (r: ReturnType<typeof smiteRig>) => (r.st.classId = 'ashblade')],
    ['an unlearn', (r: ReturnType<typeof smiteRig>) => (r.st.learned = false)],
  ])('ends on %s and restores the scale', (_n, change) => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    change(r);
    r.smite.tick();
    expect(r.smite.active).toBe(false);
    expect(r.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('clear() restores the scale and is safe twice (load, dispose)', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    r.smite.clear();
    r.smite.clear();
    expect(r.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('an unusable blade (zero length) is refused and nothing is scaled', () => {
    const s = sword(1);
    s.blade.tip.position.set(0, 0, 0);
    const r = smiteRig({ blade: s.blade });
    expect(r.smite.onReleased('player', 'heartshard-surge')).toBe(false);
    expect(s.blade.weapon.scale.toArray()).toEqual([1, 1, 1]);
  });
});

describe('Heartshard Smite: fire and ignite', () => {
  const hit = (over: Record<string, unknown> = {}) => ({ attackerId: 'player', amount: 10, kind: 'melee', outcome: 'hit', ...over }) as { attackerId: string; amount: number; kind: string; outcome: string; element?: 'fire' };

  it('the modifier checks the time itself: no effect at 8 s even before the tick ends it', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    r.st.now = 7.99;
    const early = hit();
    r.smite.modify(early);
    expect(early.amount).toBe(15);
    r.st.now = 8;
    const late = hit();
    r.smite.modify(late);
    expect(late.amount).toBe(10);
    expect(late.element).toBeUndefined();
  });

  it('melee hits of the Knight deal x1.5 as fire while it lasts, and not before or after', () => {
    const r = smiteRig();
    const before = hit();
    r.smite.modify(before);
    expect(before.amount).toBe(10);
    r.smite.onReleased('player', 'heartshard-surge');
    const during = hit();
    r.smite.modify(during);
    expect(during.amount).toBe(15);
    expect(during.element).toBe('fire');
    r.st.now = 8;
    r.smite.tick();
    const after = hit();
    r.smite.modify(after);
    expect(after.amount).toBe(10);
  });

  it('leaves blocked hits, spells, status ticks, other attackers and zero-damage hits alone', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    for (const over of [{ outcome: 'blocked' }, { outcome: 'parried' }, { kind: 'spell' }, { kind: 'status' }, { attackerId: 'foe' }, { amount: 0 }]) {
      const q = hit(over);
      r.smite.modify(q);
      expect(q.amount, JSON.stringify(over)).toBe(over.amount ?? 10);
      expect(q.element).toBeUndefined();
    }
  });

  const dealt = (over: Record<string, unknown> = {}) => ({ attackerId: 'player', targetId: 'foe', kind: 'melee', outcome: 'hit', dealt: 15, killed: false, ...over }) as never;

  it('ignites (2 a second for 3 s) a foe the Smite hit, on the next tick', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    r.smite.onDealt(dealt());
    expect(r.ignite).not.toHaveBeenCalled();
    r.smite.tick();
    expect(r.ignite).toHaveBeenCalledWith('foe', { id: 'knight.heartshardSmite.ignite', kind: 'ignite', dps: 2, seconds: 3, sourceId: 'player' });
  });

  it('does not ignite a killed foe, a mercy foe, a dead foe, a non-hostile, a blocked hit or a hit with no damage', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    r.smite.onDealt(dealt({ killed: true }));
    r.smite.onDealt(dealt({ outcome: 'blocked' }));
    r.smite.onDealt(dealt({ dealt: 0 }));
    r.smite.onDealt(dealt({ kind: 'spell' }));
    r.smite.onDealt(dealt({ attackerId: 'foe' }));
    r.smite.tick();
    expect(r.ignite).not.toHaveBeenCalled();
    for (const foe of [
      { dead: false, team: 'hostile', mercyState: () => 'yielding' },
      { dead: true, team: 'hostile', mercyState: () => 'none' },
      { dead: false, team: 'ally', mercyState: () => 'none' },
    ]) {
      r.st.foe = foe;
      r.smite.onDealt(dealt());
      r.smite.tick();
    }
    r.st.foe = null;
    r.smite.onDealt(dealt());
    r.smite.tick();
    expect(r.ignite).not.toHaveBeenCalled();
  });

  it('queues nothing once it has ended', () => {
    const r = smiteRig();
    r.smite.onReleased('player', 'heartshard-surge');
    r.smite.clear();
    r.smite.onDealt(dealt());
    r.smite.tick();
    expect(r.ignite).not.toHaveBeenCalled();
  });

  it('keeps the numbers of its tuning', () => {
    expect(HEARTSHARD_SMITE).toMatchObject({ seconds: 8, reach: 5, fireFactor: 1.5, igniteDps: 2, igniteSeconds: 3 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Banner of the Sunforge
// ---------------------------------------------------------------------------------------------------------------------

function sunRig(over: { classId?: string | null; learned?: boolean; blocked?: string | null; hasSpells?: boolean } = {}) {
  const st = {
    classId: over.classId === undefined ? null : over.classId,
    learned: over.learned ?? true,
    blocked: over.blocked ?? null,
    dead: false,
    feet: { x: 0, y: 0, z: 0 },
    banner: null as { position: { x: number; y: number; z: number }; radius: number } | null,
  };
  const plant = vi.fn((radius: number) => {
    if (over.hasSpells === false) return false;
    st.banner = { position: { x: 0, y: 0, z: -2 }, radius };
    return true;
  });
  const fx = vi.fn();
  const trig = vi.fn();
  const banner = new BannerOfTheSunforge({
    playerId: () => 'player',
    classId: () => st.classId,
    learned: () => st.learned,
    blockedReason: () => st.blocked,
    plant,
    banner: () => st.banner,
    dead: () => st.dead,
    feet: () => st.feet,
    fx,
    reportTrigger: trig,
    skillId: 'knight.bannerOfTheSunforge',
  });
  return { banner, st, plant, fx, trig };
}

describe('Banner of the Sunforge: casting', () => {
  it('plants a 20 m banner, draws it and reports the trigger', () => {
    const r = sunRig();
    expect(r.banner.cast()).toEqual({ ok: true });
    expect(r.plant).toHaveBeenCalledWith(20);
    expect(r.fx).toHaveBeenCalledWith({ x: 0, y: 0, z: -2 }, 20, 20);
    expect(r.trig).toHaveBeenCalledWith('knight.bannerOfTheSunforge');
  });

  it.each([
    ['wrong class', { classId: 'pathfinder' }, 'wrong-class'],
    ['not learned', { learned: false }, 'not-learned'],
    ['dead', { blocked: 'dead' }, 'dead'],
    ['staggered', { blocked: 'staggered' }, 'staggered'],
    ['busy', { blocked: 'busy' }, 'busy'],
    ['no spells service', { hasSpells: false }, 'unavailable'],
  ])('refuses when %s', (_n, over, reason) => {
    const r = sunRig(over);
    expect(r.banner.cast()).toEqual({ ok: false, reason });
    expect(r.trig).not.toHaveBeenCalled();
    expect(r.fx).not.toHaveBeenCalled();
  });
});

describe('Banner of the Sunforge: the regeneration multiplier', () => {
  it('is 1 with no banner, doubled inside 20 m of the great banner (inclusive) and 1 outside', () => {
    const r = sunRig();
    expect(r.banner.regenFactor()).toBe(1);
    r.banner.cast();
    expect(r.banner.regenFactor()).toBe(2);
    r.st.feet = { x: 20, y: 0, z: -2 };
    expect(r.banner.regenFactor()).toBe(2);
    r.st.feet = { x: 20.01, y: 0, z: -2 };
    expect(r.banner.regenFactor()).toBe(1);
    r.st.feet = { x: 0, y: 50, z: -2 + 19.9 }; // height does not count
    expect(r.banner.regenFactor()).toBe(2);
  });

  it('is 1 for a normal 8 m banner, for the dead, another class and an unlearned skill', () => {
    const r = sunRig();
    r.st.banner = { position: { x: 0, y: 0, z: 0 }, radius: 8 };
    expect(r.banner.regenFactor()).toBe(1);
    r.banner.cast();
    expect(r.banner.regenFactor()).toBe(2);
    r.st.banner = { position: { x: 0, y: 0, z: 0 }, radius: 8 }; // a normal Banner Plant replaced it
    expect(r.banner.regenFactor()).toBe(1);
    r.banner.cast();
    r.st.dead = true;
    expect(r.banner.regenFactor()).toBe(1);
    r.st.dead = false;
    r.st.classId = 'warden';
    expect(r.banner.regenFactor()).toBe(1);
    r.st.classId = 'knight';
    r.st.learned = false;
    expect(r.banner.regenFactor()).toBe(1);
  });

  it('keeps the numbers of its tuning', () => {
    expect(SUNFORGE).toMatchObject({ radius: 20, seconds: 20, regenFactor: 2, cooldown: 60, emberCost: 30 });
    expect(UNBROKEN_OATH).toMatchObject({ seconds: 8, cooldown: 60, emberCost: 30, handlerOrder: -140 });
  });
});
