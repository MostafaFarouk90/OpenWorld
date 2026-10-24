import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Actor } from '../../actors/Actor';
import type { DamageModifier, DamageRequest, DamageResult, ModifiableRequest } from '../../actors/DamageResolver';
import type { StatusEntry, StatusSpec } from '../../actors/status';
import type { PerceptionProvider } from '../../enemies/perceptionHook';
import { backSlitModifier, BACK_SLIT_ORDER } from './passives';
import {
  CinderMark, DecoyFootprints, PhoenixRoll,
  type CinderMarkPorts, type DecoyFootprintsPorts, type FoeView, type PhoenixRollPorts,
} from './skills.act3';
import { CINDER_MARK, PHOENIX_ROLL, SKILL } from './tuning';

const foe = (id: string, x: number, z: number, over: Partial<FoeView> = {}): FoeView => ({ id, x, y: 0, z, live: true, mercy: undefined, ...over });

/** Shared fake world: a clock, the player at the origin facing -Z, and a mutable foe table. */
function world(over: { learned?: boolean; ashblade?: boolean; blocked?: string | null } = {}) {
  const w = {
    t: 0,
    learned: over.learned ?? true,
    ashblade: over.ashblade ?? true,
    blocked: over.blocked ?? null,
    yaw: 0,
    lock: null as string | null,
    foes: new Map<string, FoeView>(),
    stops: [] as string[],
    triggers: [] as string[],
    fx: [] as Array<{ id: string; attach: string | null }>,
    add(f: FoeView) {
      w.foes.set(f.id, f);
      return f;
    },
  };
  const base = {
    playerId: () => 'player',
    isAshblade: () => w.ashblade,
    learned: () => w.learned,
    blockedReason: () => w.blocked,
    now: () => w.t,
    feet: () => ({ x: 0, y: 0, z: 0 }),
    facingYaw: () => w.yaw,
    effect: (id: string, _at: unknown, _yaw: number, attach: string | null) => {
      w.fx.push({ id, attach });
      return () => void w.stops.push(id);
    },
    reportTrigger: (id: string) => void w.triggers.push(id),
  };
  return { w, base };
}

describe('Cinder Mark: casting', () => {
  const make = (over: Parameters<typeof world>[0] = {}) => {
    const { w, base } = world(over);
    const mark = new CinderMark({ ...base, lockTarget: () => w.lock, foe: (id) => w.foes.get(id) ?? null, foes: () => w.foes.values() } as CinderMarkPorts);
    return { w, mark };
  };

  it('marks the nearest live hostile in the front cone, reports the trigger and attaches the glyph effect to it', () => {
    const { w, mark } = make();
    w.add(foe('far', 0, -9));
    w.add(foe('near', 1, -5));
    expect(mark.cast()).toEqual({ ok: true });
    expect(mark.target).toBe('near');
    expect(w.triggers).toEqual([SKILL.cinderMark]);
    expect(w.fx).toEqual([{ id: 'cinder-mark', attach: 'near' }]);
  });

  it('prefers a live hostile lock-on at any distance, over a nearer foe in the cone', () => {
    const { w, mark } = make();
    w.add(foe('near', 0, -3));
    w.add(foe('locked', 40, 40));
    w.lock = 'locked';
    expect(mark.cast()).toEqual({ ok: true });
    expect(mark.target).toBe('locked');
  });

  it('falls back to the cone when the lock-on is dead, gone, yielding or not hostile', () => {
    for (const bad of [foe('l', 0, -4, { live: false }), foe('l', 0, -4, { mercy: 'yielding' }), null]) {
      const { w, mark } = make();
      w.add(foe('cone', 0, -6));
      if (bad) w.add(bad);
      w.lock = 'l';
      expect(mark.cast()).toEqual({ ok: true });
      expect(mark.target).toBe('cone');
    }
  });

  it('refuses no-target with nothing in range, out of the cone, behind, dead or in a mercy state', () => {
    const cases: FoeView[] = [
      foe('out', 0, -12.5),
      foe('side', 5, 0),
      foe('behind', 0, 4),
      foe('wide', 6, -6),
      foe('dead', 0, -4, { live: false }),
      foe('yield', 0, -4, { mercy: 'yielding' }),
      foe('calm', 0, -4, { mercy: 'calming' }),
    ];
    const { w, mark } = make();
    for (const c of cases) w.add(c);
    expect(mark.cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(mark.target).toBeNull();
    expect(w.triggers).toEqual([]);
  });

  it('range edge: 11.9 m is in, 12.1 m is out; cone edge: 29 degrees is in, 31 degrees is out', () => {
    const polar = (d: number, deg: number) => foe('f', Math.sin((deg * Math.PI) / 180) * d, -Math.cos((deg * Math.PI) / 180) * d);
    for (const [f, ok] of [[polar(11.9, 0), true], [polar(12.1, 0), false], [polar(6, 29), true], [polar(6, 31), false], [polar(6, -29), true], [polar(6, -31), false]] as const) {
      const { w, mark } = make();
      w.add(f);
      expect(mark.cast().ok).toBe(ok);
    }
  });

  it('follows the facing: turned to +X the foe at +X is in the cone', () => {
    const { w, mark } = make();
    w.add(foe('east', 6, 0));
    expect(mark.cast().ok).toBe(false);
    w.yaw = -Math.PI / 2;
    expect(mark.cast()).toEqual({ ok: true });
  });

  it('refuses another class, an unlearned skill, a dead, staggered or busy player', () => {
    for (const [over, reason] of [
      [{ ashblade: false }, 'class'],
      [{ learned: false }, 'not-learned'],
      [{ blocked: 'dead' }, 'dead'],
      [{ blocked: 'staggered' }, 'staggered'],
      [{ blocked: 'busy' }, 'busy'],
    ] as const) {
      const { w, mark } = make(over);
      w.add(foe('f', 0, -4));
      expect(mark.cast()).toEqual({ ok: false, reason });
      expect(mark.target).toBeNull();
      expect(w.triggers).toEqual([]);
    }
  });

  it('a new cast replaces the mark and stops the old effect; the old foe is no longer scaled', () => {
    const { w, mark } = make();
    w.add(foe('a', 0, -4));
    w.add(foe('b', 1, -8));
    mark.cast();
    expect(mark.target).toBe('a');
    w.lock = 'b';
    mark.cast();
    expect(mark.target).toBe('b');
    expect(w.stops).toEqual(['cinder-mark']);
    const onA: ModifiableRequest = { attackerId: 'player', targetId: 'a', amount: 10, poise: 5, kind: 'melee', outcome: 'hit' };
    mark.modifier(onA, null as never, null);
    expect(onA.amount).toBe(10);
  });
});

describe('Cinder Mark: the damage modifier', () => {
  const marked = () => {
    const { w, base } = world();
    const mark = new CinderMark({ ...base, lockTarget: () => w.lock, foe: (id) => w.foes.get(id) ?? null, foes: () => w.foes.values() } as CinderMarkPorts);
    w.add(foe('boss', 0, -5));
    mark.cast();
    return { w, mark };
  };
  const req = (over: Partial<ModifiableRequest> = {}): ModifiableRequest => ({ attackerId: 'player', targetId: 'boss', amount: 10, poise: 8, kind: 'melee', outcome: 'hit', ...over });
  const run = (mark: CinderMark, r: ModifiableRequest) => (mark.modifier(r, null as never, null), r);

  it('multiplies melee and spell hits by the player on the marked foe by 1.5 (amount only), bosses included', () => {
    const { mark } = marked();
    const a = run(mark, req());
    expect(a.amount).toBe(15);
    expect(a.poise).toBe(8);
    expect(run(mark, req({ kind: 'spell' })).amount).toBe(15);
  });

  it('leaves other attackers, other targets, status and script damage, and non-hit outcomes alone', () => {
    const { mark } = marked();
    expect(run(mark, req({ attackerId: 'ally' })).amount).toBe(10);
    expect(run(mark, req({ attackerId: null })).amount).toBe(10);
    expect(run(mark, req({ targetId: 'other' })).amount).toBe(10);
    expect(run(mark, req({ kind: 'status' })).amount).toBe(10);
    expect(run(mark, req({ kind: 'script' })).amount).toBe(10);
    for (const outcome of ['blocked', 'parried', 'immune'] as const) expect(run(mark, req({ outcome })).amount).toBe(10);
  });

  it('is inert with no mark', () => {
    const { w, base } = world();
    const mark = new CinderMark({ ...base, lockTarget: () => null, foe: () => null, foes: () => w.foes.values() } as CinderMarkPorts);
    expect(run(mark, req()).amount).toBe(10);
  });

  it('runs after Back-Slit: the order numbers are read from the Ashblade code, and a back stab on a marked foe is 3x', () => {
    expect(BACK_SLIT_ORDER).toBe(-150);
    expect(CINDER_MARK.order).toBe(-149);
    expect(CINDER_MARK.order).toBeGreaterThan(BACK_SLIT_ORDER);
    const { mark } = marked();
    const slit = backSlitModifier({ playerId: () => 'player', active: () => true });
    const pipeline: Array<[number, DamageModifier]> = [[CINDER_MARK.order, mark.modifier], [BACK_SLIT_ORDER, slit]];
    pipeline.sort((a, b) => a[0] - b[0]);
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const target = new Actor('boss', { kind: 'test', team: 'hostile', maxHealth: 100, maxPoise: 10, maxStamina: 0, root });
    const r = req({ direction: new THREE.Vector3(0, 0, -1) });
    for (const [, fn] of pipeline) fn(r, target, null);
    expect(r.amount).toBe(30);
    const front = req({ direction: new THREE.Vector3(0, 0, 1) });
    for (const [, fn] of pipeline) fn(front, target, null);
    expect(front.amount).toBe(15);
  });
});

describe('Cinder Mark: when it ends', () => {
  const make = () => {
    const { w, base } = world();
    const mark = new CinderMark({ ...base, lockTarget: () => w.lock, foe: (id) => w.foes.get(id) ?? null, foes: () => w.foes.values() } as CinderMarkPorts);
    const f = w.add(foe('f', 0, -5));
    mark.cast();
    return { w, mark, f };
  };

  it('lasts 10 s: still marked at 9.99 s, gone at 10 s, effect stopped', () => {
    const { w, mark } = make();
    w.t = 9.99;
    mark.update();
    expect(mark.target).toBe('f');
    w.t = 10;
    mark.update();
    expect(mark.target).toBeNull();
    expect(w.stops).toEqual(['cinder-mark']);
  });

  it('ends when the foe dies, despawns, enters a mercy state, or the events say it is gone', () => {
    for (const how of ['dead', 'despawn', 'yielding', 'event'] as const) {
      const { w, mark, f } = make();
      if (how === 'dead') f.live = false;
      if (how === 'despawn') w.foes.delete('f');
      if (how === 'yielding') f.mercy = 'yielding';
      if (how === 'event') mark.onGone('f');
      mark.update();
      expect(mark.target, how).toBeNull();
      expect(w.stops, how).toEqual(['cinder-mark']);
    }
  });

  it('another actor going does not end it', () => {
    const { mark } = make();
    mark.onGone('someone-else');
    mark.update();
    expect(mark.target).toBe('f');
  });

  it('ends on a class change, a respec and reset (load, death, dispose)', () => {
    const a = make();
    a.w.ashblade = false;
    a.mark.update();
    expect(a.mark.target).toBeNull();
    const b = make();
    b.w.learned = false;
    b.mark.update();
    expect(b.mark.target).toBeNull();
    const c = make();
    c.mark.end();
    expect(c.mark.target).toBeNull();
    expect(c.w.stops).toEqual(['cinder-mark']);
  });
});

// ---- Decoy Footprints ---------------------------------------------------------------------------------------------------

function decoyRig(over: { stealth?: boolean; perception?: boolean } & Parameters<typeof world>[0] = {}) {
  const { w, base } = world(over);
  const scales = new Map<string, number>();
  const providers: PerceptionProvider[] = [];
  const warn = vi.fn();
  const decoy = new DecoyFootprints({
    ...base,
    stealth: () => (over.stealth === false ? undefined : { addNoiseScale: (s: string, v: number) => (scales.set(s, v), () => void scales.delete(s)) }),
    perception: () => (over.perception === false ? undefined : { register: (p: PerceptionProvider) => (providers.push(p), () => void providers.splice(providers.indexOf(p), 1)) }),
    warn,
  } as DecoyFootprintsPorts);
  const sight = (state: string, target = 'player') =>
    providers[0].modifiers(target, { state, feet: { x: 0, y: 0, z: 0 }, yaw: 0, observerOnly: false } as never);
  return { w, decoy, scales, providers, warn, sight };
}

describe('Decoy Footprints', () => {
  it('silences the player (noise scale 0) and registers a perception provider for 6 s, then releases both', () => {
    const { w, decoy, scales, providers } = decoyRig();
    expect(decoy.cast()).toEqual({ ok: true });
    expect(scales.get('ashblade.decoyFootprints')).toBe(0);
    expect(providers).toHaveLength(1);
    expect(w.triggers).toEqual([SKILL.decoyFootprints]);
    expect(w.fx).toEqual([{ id: 'decoy-footprints', attach: null }]);
    w.t = 5.99;
    decoy.update();
    expect(decoy.active).toBe(true);
    w.t = 6;
    decoy.update();
    expect(decoy.active).toBe(false);
    expect(scales.size).toBe(0);
    expect(providers).toHaveLength(0);
    expect(w.stops).toEqual(['decoy-footprints']);
  });

  it('gives sight 0.6 to observers that have not noticed the player, and leaves every alerted or fighting foe alone', () => {
    const { decoy, sight } = decoyRig();
    decoy.cast();
    for (const state of ['spawn', 'idle', 'patrol']) {
      expect(sight(state), state).toMatchObject({ sightRangeScale: 0.6, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1 });
    }
    for (const state of ['notice', 'chase', 'telegraph', 'attack', 'recover', 'stagger']) expect(sight(state), state).toBeNull();
  });

  it('only applies to the player as the target, and not at all once it has ended', () => {
    const { w, decoy, sight, providers } = decoyRig();
    decoy.cast();
    expect(sight('idle', 'ally')).toBeNull();
    const p = providers[0];
    w.t = 6;
    decoy.update();
    expect(p.modifiers('player', { state: 'idle' } as never)).toBeNull();
  });

  it('refuses another class, unlearned, dead, staggered, busy, and no-stealth with neither service', () => {
    for (const [over, reason] of [
      [{ ashblade: false }, 'class'],
      [{ learned: false }, 'not-learned'],
      [{ blocked: 'dead' }, 'dead'],
      [{ blocked: 'staggered' }, 'staggered'],
      [{ blocked: 'busy' }, 'busy'],
      [{ stealth: false, perception: false }, 'no-stealth'],
    ] as const) {
      const r = decoyRig(over);
      expect(r.decoy.cast(), reason).toEqual({ ok: false, reason });
      expect(r.decoy.active).toBe(false);
      expect(r.w.triggers).toEqual([]);
    }
  });

  it('works with only one of the two services, warning once when perception is missing', () => {
    const noPerception = decoyRig({ perception: false });
    expect(noPerception.decoy.cast()).toEqual({ ok: true });
    noPerception.decoy.end();
    noPerception.decoy.cast();
    expect(noPerception.warn).toHaveBeenCalledOnce();
    const noStealth = decoyRig({ stealth: false });
    expect(noStealth.decoy.cast()).toEqual({ ok: true });
    expect(noStealth.providers).toHaveLength(1);
  });

  it('a recast restarts the 6 s without a second registration; class change, respec and reset release everything', () => {
    const r = decoyRig();
    r.decoy.cast();
    r.w.t = 4;
    r.decoy.cast();
    expect(r.providers).toHaveLength(1);
    r.w.t = 9;
    r.decoy.update();
    expect(r.decoy.active).toBe(true);
    r.w.ashblade = false;
    r.decoy.update();
    expect(r.decoy.active).toBe(false);
    expect(r.scales.size).toBe(0);
    expect(r.providers).toHaveLength(0);
    for (const how of ['respec', 'reset'] as const) {
      const x = decoyRig();
      x.decoy.cast();
      if (how === 'respec') {
        x.w.learned = false;
        x.decoy.update();
      } else x.decoy.end();
      expect(x.scales.size, how).toBe(0);
      expect(x.providers, how).toHaveLength(0);
    }
  });
});

// ---- Phoenix Roll ----------------------------------------------------------------------------------------------------------

function phoenixRig(over: Parameters<typeof world>[0] = {}) {
  const { w, base } = world(over);
  const state = {
    dodging: false,
    statuses: [] as StatusEntry[],
    cleared: [] as string[],
    applied: [] as DamageRequest[],
    ignited: [] as Array<{ id: string; spec: StatusSpec }>,
    outcome: 'hit' as DamageResult['outcome'],
    yieldOnHit: false,
  };
  const phoenix = new PhoenixRoll({
    ...base,
    statuses: () => state.statuses,
    clearStatus: (_a, id) => {
      state.cleared.push(id);
      state.statuses = state.statuses.filter((s) => s.id !== id);
    },
    dodging: () => state.dodging,
    foes: () => w.foes.values(),
    foe: (id) => w.foes.get(id) ?? null,
    apply: (req) => {
      state.applied.push(req);
      if (state.yieldOnHit) {
        const f = w.foes.get(req.targetId);
        if (f) f.mercy = 'yielding';
      }
      return { outcome: state.outcome, killed: false } as DamageResult;
    },
    ignite: (id, spec) => (state.ignited.push({ id, spec }), true),
  } as PhoenixRollPorts);
  const burning = (...ids: string[]) => (state.statuses = ids.map((id) => ({ id, kind: 'ignite', remaining: 3, sourceId: 'x' })));
  /** Advance the clock by `seconds` in 1/60 steps, updating each step. */
  const step = (seconds: number) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      w.t += 1 / 60;
      phoenix.update();
    }
  };
  /** One dodge: the rising edge, then released. */
  const dodge = () => {
    state.dodging = true;
    phoenix.update();
    state.dodging = false;
    phoenix.update();
  };
  return { w, state, phoenix, burning, step, dodge };
}

describe('Phoenix Roll', () => {
  it('a dodge while ignited clears every ignite entry (any id, any source) and leaves a patch', () => {
    const r = phoenixRig();
    r.burning('enemy.fire', 'ashblade.bleedingEmber', 'x.y');
    r.state.statuses.push({ id: 'bleed1', kind: 'bleed', remaining: 3, sourceId: null });
    r.dodge();
    expect(r.state.cleared).toEqual(['enemy.fire', 'ashblade.bleedingEmber', 'x.y']);
    expect(r.state.statuses.map((s) => s.id)).toEqual(['bleed1']);
    expect(r.phoenix.patchActive).toBe(true);
    expect(r.w.triggers).toEqual([SKILL.phoenixRoll]);
    expect(r.w.fx).toEqual([{ id: 'phoenix-patch', attach: null }]);
  });

  it('does nothing when the player is not ignited (a bleed alone is not fire)', () => {
    const r = phoenixRig();
    r.dodge();
    expect(r.phoenix.patchActive).toBe(false);
    r.state.statuses = [{ id: 'b', kind: 'bleed', remaining: 3, sourceId: null }];
    r.step(5);
    r.dodge();
    expect(r.phoenix.patchActive).toBe(false);
    expect(r.state.cleared).toEqual([]);
    expect(r.w.triggers).toEqual([]);
  });

  it('does nothing in another class, unlearned or dead', () => {
    for (const over of [{ ashblade: false }, { learned: false }, { blocked: 'dead' }]) {
      const r = phoenixRig(over);
      r.burning('f');
      r.dodge();
      expect(r.phoenix.patchActive).toBe(false);
      expect(r.state.cleared).toEqual([]);
    }
  });

  it('only the rising edge counts: a held dodge does not roll twice', () => {
    const r = phoenixRig();
    r.burning('a');
    r.state.dodging = true;
    r.phoenix.update();
    r.burning('b');
    r.phoenix.update();
    r.phoenix.update();
    expect(r.state.cleared).toEqual(['a']);
  });

  it('every 0.5 s a foe inside takes 2.5 fire as a player spell, and catches the skill ignite; 8 ticks over 4 s', () => {
    const r = phoenixRig();
    r.w.add(foe('in', 1.5, 0));
    r.w.add(foe('edge', 0, 2));
    r.w.add(foe('out', 2.1, 0));
    r.w.add(foe('high', 0, 0, { y: 2.5 }));
    r.burning('f');
    r.dodge();
    r.step(0.49);
    expect(r.state.applied).toHaveLength(0);
    r.step(0.02);
    expect(r.state.applied.map((q) => q.targetId)).toEqual(['in', 'edge']);
    expect(r.state.applied[0]).toMatchObject({ attackerId: 'player', amount: 2.5, poise: 0, kind: 'spell', attackId: 'ashblade.phoenixRoll' });
    expect(r.state.ignited[0]).toEqual({ id: 'in', spec: { id: 'ashblade.phoenixRoll', kind: 'ignite', dps: PHOENIX_ROLL.igniteDps, seconds: PHOENIX_ROLL.igniteSeconds, sourceId: 'player' } });
    r.step(3.6);
    expect(r.state.applied).toHaveLength(16);
    expect(r.phoenix.patchActive).toBe(false);
    expect(r.w.stops).toEqual(['phoenix-patch']);
    r.step(2);
    expect(r.state.applied).toHaveLength(16);
  });

  it('the patch stays where the dodge started, though the player moves on', () => {
    const r = phoenixRig();
    r.w.add(foe('at-start', 1, 1));
    r.burning('f');
    r.dodge();
    r.step(0.51);
    expect(r.state.applied).toHaveLength(1);
  });

  it('skips dead, non-hostile and mercy-state foes, and does not ignite a foe the hit made yield', () => {
    const r = phoenixRig();
    r.w.add(foe('dead', 1, 0, { live: false }));
    r.w.add(foe('yield', 0, 1, { mercy: 'yielding' }));
    r.w.add(foe('calm', 1, 1, { mercy: 'calming' }));
    r.burning('f');
    r.dodge();
    r.step(0.51);
    expect(r.state.applied).toHaveLength(0);
    const y = phoenixRig();
    y.w.add(foe('live', 1, 0));
    y.state.yieldOnHit = true;
    y.burning('f');
    y.dodge();
    y.step(0.51);
    expect(y.state.applied).toHaveLength(1);
    expect(y.state.ignited).toHaveLength(0);
  });

  it('does not ignite a foe whose hit was blocked or immune', () => {
    const r = phoenixRig();
    r.w.add(foe('a', 1, 0));
    r.state.outcome = 'immune';
    r.burning('f');
    r.dodge();
    r.step(0.51);
    expect(r.state.applied).toHaveLength(1);
    expect(r.state.ignited).toHaveLength(0);
  });

  it('at most once per 4 s: an ignited roll inside the window changes nothing, one after it works', () => {
    const r = phoenixRig();
    r.burning('a');
    r.dodge();
    r.step(1);
    r.burning('b');
    r.dodge();
    expect(r.state.cleared).toEqual(['a']);
    r.step(2.9);
    r.burning('c');
    r.dodge();
    expect(r.state.cleared).toEqual(['a']);
    r.step(0.2);
    r.dodge();
    expect(r.state.cleared).toEqual(['a', 'c']);
  });

  it('class change, respec and reset end the patch; a reset forgets a dodge in progress', () => {
    const a = phoenixRig();
    a.burning('f');
    a.dodge();
    a.w.ashblade = false;
    a.step(0.1);
    expect(a.phoenix.patchActive).toBe(false);
    const b = phoenixRig();
    b.burning('f');
    b.dodge();
    b.w.learned = false;
    b.step(0.1);
    expect(b.phoenix.patchActive).toBe(false);
    const c = phoenixRig();
    c.burning('f');
    c.dodge();
    c.state.dodging = true;
    c.phoenix.reset();
    expect(c.phoenix.patchActive).toBe(false);
    expect(c.w.stops).toEqual(['phoenix-patch']);
    c.burning('g');
    c.w.t += 5;
    c.phoenix.update();
    expect(c.state.cleared).toEqual(['f', 'g']);
  });
});
