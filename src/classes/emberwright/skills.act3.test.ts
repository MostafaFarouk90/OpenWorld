import { describe, expect, it } from 'vitest';
import type { DamageRequest, DamageResult, ModifiableRequest } from '../../actors/DamageResolver';
import type { StatusEntry, StatusSpec } from '../../actors/status';
import {
  CinderRain, TemperWeapon, Updraft,
  type CinderRainPorts, type CompanionView, type FoeView, type TemperWeaponPorts, type UpdraftPorts,
} from './skills.act3';
import { SKILL } from './skills';
import { ATTACKS, BOLT, CINDER_RAIN, TEMPER_WEAPON, UPDRAFT } from './tuning';

const foe = (id: string, x: number, z: number, over: Partial<FoeView> = {}): FoeView => ({ id, x, y: 0, z, live: true, mercy: undefined, ...over });
const result = (over: Partial<DamageResult> = {}): DamageResult => ({ outcome: 'hit', killed: false, dealt: 5, ...over }) as DamageResult;

/** Shared fake world: a clock, the player at the origin facing -Z, and a mutable foe table. */
function world(over: { learned?: boolean; emberwright?: boolean; blocked?: string | null } = {}) {
  const w = {
    t: 0,
    learned: over.learned ?? true,
    emberwright: over.emberwright ?? true,
    blocked: over.blocked ?? null,
    yaw: 0,
    lock: null as string | null,
    foes: new Map<string, FoeView>(),
    stops: [] as string[],
    triggers: [] as string[],
    fx: [] as Array<{ id: string; at: { x: number; y: number; z: number }; attach: string | null; params: Record<string, number> }>,
    add(f: FoeView) {
      w.foes.set(f.id, f);
      return f;
    },
  };
  const base = {
    playerId: () => 'player',
    isEmberwright: () => w.emberwright,
    learned: () => w.learned,
    blockedReason: () => w.blocked,
    now: () => w.t,
    feet: () => ({ x: 0, y: 0, z: 0 }),
    facingYaw: () => w.yaw,
    effect: (id: string, at: { x: number; y: number; z: number }, _yaw: number, attach: string | null, params: Record<string, number>) => {
      w.fx.push({ id, at: { ...at }, attach, params });
      return () => void w.stops.push(id);
    },
    reportTrigger: (id: string) => void w.triggers.push(id),
  };
  return { w, base };
}

// ---- Cinder Rain ----------------------------------------------------------------------------------------------------

function rainRig(over: Parameters<typeof world>[0] = {}) {
  const { w, base } = world(over);
  const s = {
    applied: [] as DamageRequest[],
    ignited: [] as Array<{ id: string; spec: StatusSpec }>,
    outcome: 'hit' as DamageResult['outcome'],
    killed: false,
    yieldOnHit: false,
    height: undefined as ((x: number, z: number) => number) | undefined,
  };
  const rain = new CinderRain({
    ...base,
    lockTarget: () => w.lock,
    foe: (id) => w.foes.get(id) ?? null,
    foes: () => w.foes.values(),
    heightAt: (x, z) => (s.height ? s.height(x, z) : (undefined as never)),
    apply: (req) => {
      s.applied.push(req);
      if (s.yieldOnHit) {
        const f = w.foes.get(req.targetId);
        if (f) f.mercy = 'yielding';
      }
      return result({ outcome: s.outcome, killed: s.killed });
    },
    ignite: (id, spec) => (s.ignited.push({ id, spec }), true),
  } as CinderRainPorts);
  const step = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      w.t += 1 / 60;
      rain.update();
    }
  };
  return { w, s, rain, step };
}

describe('Cinder Rain: the cast and the centre', () => {
  it('centres 8 m ahead with no lock-on, reports the trigger and starts the cinder-rain effect there', () => {
    const r = rainRig();
    expect(r.rain.cast()).toEqual({ ok: true });
    expect(r.rain.centre).toEqual({ x: 0, y: 0, z: -8 });
    expect(r.w.triggers).toEqual([SKILL.cinderRain]);
    expect(r.w.fx).toEqual([{ id: 'cinder-rain', at: { x: 0, y: 0, z: -8 }, attach: null, params: { seconds: 3, radius: 5 } }]);
  });

  it('follows the facing', () => {
    const r = rainRig();
    r.w.yaw = -Math.PI / 2; // forward is +X
    r.rain.cast();
    expect(r.rain.centre.x).toBeCloseTo(8);
    expect(r.rain.centre.z).toBeCloseTo(0);
  });

  it('centres on a live hostile lock-on within 20 m (inclusive), at 20.01 m falls back to 8 m ahead', () => {
    for (const [d, onTarget] of [[19.9, true], [20, true], [20.01, false]] as const) {
      const r = rainRig();
      r.w.add(foe('t', 0, -d));
      r.w.lock = 't';
      r.rain.cast();
      expect(r.rain.centre.z, String(d)).toBeCloseTo(onTarget ? -d : -8);
    }
  });

  it('a lock-on that is dead, gone or not hostile is not a centre', () => {
    for (const bad of [foe('t', 0, -15, { live: false }), null]) {
      const r = rainRig();
      if (bad) r.w.add(bad);
      r.w.lock = 't';
      r.rain.cast();
      expect(r.rain.centre.z).toBeCloseTo(-8);
    }
  });

  it('a lock-on in a mercy state is still a centre, but is not hurt (the field, not the target, is aimed)', () => {
    const r = rainRig();
    r.w.add(foe('t', 0, -12, { mercy: 'yielding' }));
    r.w.lock = 't';
    r.rain.cast();
    expect(r.rain.centre.z).toBeCloseTo(-12);
    r.step(3.1);
    expect(r.s.applied).toEqual([]);
  });

  it('grounds the centre with heightAt: on the lock-on target and ahead', () => {
    const r = rainRig();
    r.s.height = (_x, z) => 3 + z * 0.01;
    r.rain.cast();
    expect(r.rain.centre.y).toBeCloseTo(3 - 0.08);
    const t = rainRig();
    t.s.height = () => 7;
    t.w.add({ ...foe('t', 0, -10), y: 2 });
    t.w.lock = 't';
    t.rain.cast();
    expect(t.rain.centre.y).toBe(7);
  });

  it('takes the target\'s own y with no heightAt', () => {
    const r = rainRig();
    r.w.add({ ...foe('t', 0, -10), y: 2 });
    r.w.lock = 't';
    r.rain.cast();
    expect(r.rain.centre.y).toBe(2);
  });

  it('refuses wrong class, not learned, dead, staggered and busy, with nothing started', () => {
    for (const [over, reason] of [
      [{ emberwright: false }, 'class'],
      [{ learned: false }, 'not-learned'],
      [{ blocked: 'dead' }, 'dead'],
      [{ blocked: 'staggered' }, 'staggered'],
      [{ blocked: 'busy' }, 'busy'],
    ] as const) {
      const r = rainRig(over);
      expect(r.rain.cast(), reason).toEqual({ ok: false, reason });
      expect(r.rain.active).toBe(false);
      expect(r.w.fx).toEqual([]);
      expect(r.w.triggers).toEqual([]);
    }
  });
});

describe('Cinder Rain: the field', () => {
  it('ticks every 0.5 s for 3 s: six ticks of 0.35x the base spell damage as fire, ignite on each', () => {
    const r = rainRig();
    r.w.add(foe('a', 0, -8));
    r.rain.cast();
    r.step(0.45);
    expect(r.s.applied).toHaveLength(0);
    r.step(0.1);
    expect(r.s.applied).toHaveLength(1);
    r.step(3);
    expect(r.s.applied).toHaveLength(6);
    expect(r.rain.active).toBe(false);
    expect(r.s.applied[0]).toEqual({
      attackerId: 'player', targetId: 'a', amount: BOLT.damage * 0.35, poise: 0, kind: 'spell', attackId: 'emberwright.cinderRain', element: 'fire',
    });
    expect(CINDER_RAIN.damage).toBeCloseTo(3.5);
    expect(r.s.ignited).toHaveLength(6);
    expect(r.s.ignited[0]).toEqual({ id: 'a', spec: { id: 'emberwright.cinderRain.ignite', kind: 'ignite', dps: 2, seconds: 3, sourceId: 'player' } });
    expect(r.w.stops).toEqual(['cinder-rain']);
  });

  it('boundary: a foe at exactly 5 m is inside, at 5.01 m outside (both axes and a diagonal of 5 m)', () => {
    const r = rainRig();
    r.w.yaw = 0;
    r.rain.cast(); // centre (0, 0, -8)
    r.w.add(foe('on-x', 5, -8));
    r.w.add(foe('on-z', 0, -13));
    r.w.add(foe('diag', 3, -12)); // 3-4-5 triangle
    r.w.add(foe('just-out-x', 5.01, -8));
    r.w.add(foe('just-out-z', 0, -13.01));
    r.w.add(foe('just-out-diag', 3.01, -12));
    r.step(0.55);
    expect(r.s.applied.map((q) => q.targetId).sort()).toEqual(['diag', 'on-x', 'on-z']);
  });

  it('the field stays where it was cast when the player walks away', () => {
    const r = rainRig();
    r.rain.cast();
    r.w.add(foe('a', 0, -8));
    r.step(0.55);
    expect(r.s.applied).toHaveLength(1);
  });

  it('skips a foe on another floor (more than 3 m above the ground of the field)', () => {
    const r = rainRig();
    r.rain.cast();
    r.w.add({ ...foe('high', 0, -8), y: 3.01 });
    r.w.add({ ...foe('edge', 0, -8.5), y: 3 });
    r.step(0.55);
    expect(r.s.applied.map((q) => q.targetId)).toEqual(['edge']);
  });

  it('skips dead foes and every mercy state; none is hit, none burns', () => {
    const r = rainRig();
    r.rain.cast();
    r.w.add(foe('dead', 0, -8, { live: false }));
    for (const m of ['yielding', 'staggered', 'calming', 'releasing', 'leaving']) r.w.add(foe(`m-${m}`, 1, -8, { mercy: m }));
    r.w.add(foe('clean', 0, -9, { mercy: 'none' }));
    r.step(3.1);
    expect(new Set(r.s.applied.map((q) => q.targetId))).toEqual(new Set(['clean']));
    expect(new Set(r.s.ignited.map((q) => q.id))).toEqual(new Set(['clean']));
  });

  it('a foe that is hit into a mercy state is not ignited, and is skipped next tick', () => {
    const r = rainRig();
    r.rain.cast();
    r.w.add(foe('a', 0, -8));
    r.s.yieldOnHit = true;
    r.step(1.05);
    expect(r.s.applied).toHaveLength(1);
    expect(r.s.ignited).toEqual([]);
  });

  it('no ignite on a killing hit, a blocked/immune/parried hit, or a null result', () => {
    const cases: Array<(s: ReturnType<typeof rainRig>['s']) => void> = [(s) => (s.killed = true), (s) => (s.outcome = 'immune'), (s) => (s.outcome = 'blocked'), (s) => (s.outcome = 'parried')];
    for (const set of cases) {
      const r = rainRig();
      set(r.s);
      r.rain.cast();
      r.w.add(foe('a', 0, -8));
      r.step(0.55);
      expect(r.s.applied).toHaveLength(1);
      expect(r.s.ignited).toEqual([]);
    }
  });

  it('a recast moves the field: the old effect is stopped, one field at a time', () => {
    const r = rainRig();
    r.rain.cast();
    r.step(1);
    r.w.yaw = Math.PI / 2;
    r.rain.cast();
    expect(r.w.stops).toEqual(['cinder-rain']);
    expect(r.rain.centre.x).toBeCloseTo(-8);
    r.w.add(foe('old', 0, -8));
    r.w.add(foe('new', -8, 0));
    r.step(0.55);
    expect(r.s.applied.map((q) => q.targetId)).toEqual(['new']);
  });

  it('ends at once on the player\'s death, a class change, an unlearn, and via end() (load, dispose)', () => {
    for (const how of ['dead', 'class', 'unlearn', 'end'] as const) {
      const r = rainRig();
      r.rain.cast();
      r.w.add(foe('a', 0, -8));
      r.step(0.6);
      const n = r.s.applied.length;
      if (how === 'dead') r.w.blocked = 'dead';
      if (how === 'class') r.w.emberwright = false;
      if (how === 'unlearn') r.w.learned = false;
      if (how === 'end') r.rain.end();
      r.step(1);
      expect(r.s.applied.length, how).toBe(n);
      expect(r.rain.active, how).toBe(false);
      expect(r.w.stops, how).toEqual(['cinder-rain']);
    }
  });

  it('staggered or busy after the cast does not stop a running field (the cast gate is for the cast)', () => {
    const r = rainRig();
    r.rain.cast();
    r.w.add(foe('a', 0, -8));
    r.w.blocked = 'staggered';
    r.step(3.1);
    expect(r.s.applied).toHaveLength(6);
  });
});

// ---- Temper Weapon --------------------------------------------------------------------------------------------------

function temperRig(over: Parameters<typeof world>[0] = {}) {
  const { w, base } = world(over);
  const s = {
    companions: new Map<string, CompanionView>(),
    here: new Set<string>(),
    statuses: new Map<string, StatusEntry[]>(),
    ignited: [] as Array<{ id: string; spec: StatusSpec }>,
  };
  const temper = new TemperWeapon({
    ...base,
    companions: () => s.companions.values(),
    companionHere: (id) => s.here.has(id),
    foe: (id) => w.foes.get(id) ?? null,
    statuses: (id) => s.statuses.get(id) ?? [],
    ignite: (id, spec) => (s.ignited.push({ id, spec }), true),
  } as TemperWeaponPorts);
  const comp = (id: string, x: number, z: number) => {
    s.companions.set(id, { id, x, y: 0, z });
    s.here.add(id);
  };
  const req = (over: Partial<ModifiableRequest> = {}): ModifiableRequest =>
    ({ attackerId: 'player', targetId: 'f', amount: 10, poise: 5, kind: 'spell', attackId: 'emberwright.bolt', outcome: 'hit', ...over }) as ModifiableRequest;
  const dealt = (r: ModifiableRequest, over: Partial<DamageResult> = {}) => temper.onDealt({ ...r, dealt: r.amount, killed: false, ...over } as DamageResult);
  const burning = (id: string, ...ids: string[]) => s.statuses.set(id, ids.map((x) => ({ id: x, kind: 'ignite', remaining: 2, sourceId: 'x' }) as StatusEntry));
  const step = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      w.t += 1 / 60;
      temper.update();
    }
  };
  return { w, s, temper, comp, req, dealt, burning, step };
}

describe('Temper Weapon: choosing the target', () => {
  it('the nearest companion within 10 m (inclusive); 10.01 m is out and falls back to the staff', () => {
    const r = temperRig();
    r.comp('far', 0, -9);
    r.comp('near', 3, 0);
    expect(r.temper.cast()).toEqual({ ok: true });
    expect(r.temper.target).toBe('near');
    expect(r.w.fx).toEqual([{ id: 'temper-weapon', at: { x: 0, y: 0, z: 0 }, attach: 'near', params: { seconds: 20 } }]);
    expect(r.w.triggers).toEqual([SKILL.temperWeapon]);
    const edge = temperRig();
    edge.comp('c', 0, -10);
    edge.temper.cast();
    expect(edge.temper.target).toBe('c');
    const out = temperRig();
    out.comp('c', 0, -10.01);
    out.temper.cast();
    expect(out.temper.target).toBe('player');
  });

  it('with no companion near it enchants the Emberwright\'s own staff (attached to the player)', () => {
    const r = temperRig();
    r.temper.cast();
    expect(r.temper.target).toBe('player');
    expect(r.w.fx[0]).toMatchObject({ id: 'temper-weapon', attach: 'player', at: { x: 0, y: 0, z: 0 } });
  });

  it('refuses wrong class, not learned, dead, staggered and busy, with nothing started', () => {
    for (const [over, reason] of [
      [{ emberwright: false }, 'class'],
      [{ learned: false }, 'not-learned'],
      [{ blocked: 'dead' }, 'dead'],
      [{ blocked: 'staggered' }, 'staggered'],
      [{ blocked: 'busy' }, 'busy'],
    ] as const) {
      const r = temperRig(over);
      expect(r.temper.cast(), reason).toEqual({ ok: false, reason });
      expect(r.temper.target).toBeNull();
      expect(r.w.fx).toEqual([]);
    }
  });

  it('a recast moves it: the old effect stops, only the new target is tempered', () => {
    const r = temperRig();
    r.comp('a', 2, 0);
    r.temper.cast();
    expect(r.temper.target).toBe('a');
    r.s.companions.delete('a');
    r.comp('b', 4, 0);
    r.temper.cast();
    expect(r.temper.target).toBe('b');
    expect(r.w.stops).toEqual(['temper-weapon']);
    const mine = r.req({ attackerId: 'a', attackId: 'companion.a.chop', kind: 'melee' });
    r.temper.modifier(mine, {} as never, null);
    expect(mine.amount).toBe(10);
    const his = r.req({ attackerId: 'b', attackId: 'companion.b.chop', kind: 'melee' });
    r.temper.modifier(his, {} as never, null);
    expect(his.amount).toBeCloseTo(13);
  });

  it('a recast refreshes the 20 s', () => {
    const r = temperRig();
    r.temper.cast();
    r.step(15);
    r.temper.cast();
    r.step(15);
    expect(r.temper.target).toBe('player');
    r.step(5.1);
    expect(r.temper.target).toBeNull();
  });
});

describe('Temper Weapon: the modifier', () => {
  it('on a tempered companion: its own attacks (companion.* melee/spell, outcome hit) get x1.3 and element fire', () => {
    const r = temperRig();
    r.comp('c', 2, 0);
    r.temper.cast();
    for (const kind of ['melee', 'spell'] as const) {
      const q = r.req({ attackerId: 'c', kind, attackId: 'companion.hrolf.chop' });
      r.temper.modifier(q, {} as never, null);
      expect(q.amount, kind).toBeCloseTo(13);
      expect(q.element, kind).toBe('fire');
      expect(q.poise).toBe(5);
    }
  });

  it('is not applied to: the player\'s hits, another actor, a non-hit outcome, a status tick, a foreign attack id, no attack id', () => {
    const r = temperRig();
    r.comp('c', 2, 0);
    r.temper.cast();
    const cases: Array<Partial<ModifiableRequest>> = [
      { attackerId: 'player', attackId: 'companion.hrolf.chop', kind: 'melee' },
      { attackerId: 'other', attackId: 'companion.hrolf.chop', kind: 'melee' },
      { attackerId: 'c', attackId: 'companion.hrolf.chop', kind: 'melee', outcome: 'blocked' },
      { attackerId: 'c', attackId: 'companion.hrolf.chop', kind: 'melee', outcome: 'immune' },
      { attackerId: 'c', attackId: 'companion.hrolf.chop', kind: 'status' },
      { attackerId: 'c', attackId: 'emberwright.bolt', kind: 'spell' },
      { attackerId: 'c', attackId: 'hrolf.shout', kind: 'spell' },
      { attackerId: 'c', kind: 'melee', attackId: undefined },
      { attackerId: 'c', attackId: 'emberwright.cinderRain', kind: 'spell' },
    ];
    for (const c of cases) {
      const q = r.req(c);
      r.temper.modifier(q, {} as never, null);
      expect(q.amount, JSON.stringify(c)).toBe(10);
      expect(q.element).toBeUndefined();
    }
  });

  it('on the staff: her attacks 1 to 4 (spell attack ids and the staff tap of the four clips) get x1.3 fire', () => {
    const r = temperRig();
    r.temper.cast();
    const own: Array<Partial<ModifiableRequest>> = [
      { kind: 'spell', attackId: 'emberwright.bolt' },
      { kind: 'spell', attackId: 'emberwright.sparkBurst' },
      { kind: 'spell', attackId: 'emberwright.flameBall' },
      { kind: 'spell', attackId: 'emberwright.cinderRing' },
      ...ATTACKS.map((a) => ({ kind: 'melee' as const, attackId: a.clip })),
    ];
    for (const c of own) {
      const q = r.req(c);
      r.temper.modifier(q, {} as never, null);
      expect(q.amount, JSON.stringify(c)).toBeCloseTo(13);
      expect(q.element).toBe('fire');
    }
  });

  it('on the staff: NOT her skills, Forge Spark chains, statuses/ignite ticks, companion-prefixed ids, or a melee with a spell id', () => {
    const r = temperRig();
    r.temper.cast();
    const foreign: Array<Partial<ModifiableRequest>> = [
      { kind: 'spell', attackId: 'emberwright.flameLash' },
      { kind: 'spell', attackId: 'emberwright.anvilDrop' },
      { kind: 'spell', attackId: 'emberwright.fireWall' },
      { kind: 'spell', attackId: 'emberwright.cinderRain' },
      { kind: 'spell', attackId: 'emberwright.updraft' },
      { kind: 'spell', attackId: 'emberwright.ironFamiliar' },
      { kind: 'spell', attackId: 'emberwright.forgeSpark' },
      { kind: 'status', attackId: 'emberwright.bolt' },
      { kind: 'status', attackId: undefined, statusId: 'emberwright.ignite' } as never,
      { kind: 'spell', attackId: 'companion.x.chop' },
      { kind: 'melee', attackId: 'emberwright.bolt' },
      { kind: 'spell', attackId: ATTACKS[0].clip },
      { kind: 'melee', attackId: 'Dualwield_Melee_Attack_Stab' },
      { kind: 'script', attackId: 'emberwright.bolt' },
      { kind: 'melee', attackId: 'emberwright.bolt', outcome: 'immune' },
    ];
    for (const c of foreign) {
      const q = r.req(c);
      r.temper.modifier(q, {} as never, null);
      expect(q.amount, JSON.stringify(c)).toBe(10);
    }
  });

  it('is off before the cast and after it ends', () => {
    const r = temperRig();
    const q0 = r.req();
    r.temper.modifier(q0, {} as never, null);
    expect(q0.amount).toBe(10);
    r.temper.cast();
    r.step(20.1);
    const q1 = r.req();
    r.temper.modifier(q1, {} as never, null);
    expect(q1.amount).toBe(10);
  });
});

describe('Temper Weapon: the ignite', () => {
  const tempered = () => {
    const r = temperRig();
    r.comp('c', 2, 0);
    r.w.add(foe('f', 0, -3));
    r.temper.cast();
    return r;
  };
  const hit = (r: ReturnType<typeof temperRig>, over: Partial<ModifiableRequest> = {}) => {
    const q = r.req({ attackerId: 'c', kind: 'melee', attackId: 'companion.hrolf.chop', ...over });
    r.dealt(q);
    return q;
  };

  it('a tempered hit that dealt damage and did not kill ignites the foe on the next tick, under the skill\'s id, sourced to the attacker', () => {
    const r = tempered();
    hit(r);
    expect(r.s.ignited).toEqual([]);
    r.step(0.02);
    expect(r.s.ignited).toEqual([{ id: 'f', spec: { id: 'emberwright.temperWeapon.ignite', kind: 'ignite', dps: 2, seconds: 3, sourceId: 'c' } }]);
  });

  it('not on a kill, zero damage, a non-hit outcome, a foreign attack, or another attacker', () => {
    const r = tempered();
    r.dealt(r.req({ attackerId: 'c', kind: 'melee', attackId: 'companion.hrolf.chop' }), { killed: true });
    r.dealt(r.req({ attackerId: 'c', kind: 'melee', attackId: 'companion.hrolf.chop' }), { dealt: 0 });
    hit(r, { outcome: 'blocked' });
    hit(r, { attackId: 'emberwright.fireWall', kind: 'spell' });
    hit(r, { kind: 'status' });
    hit(r, { attackerId: 'player' });
    r.step(0.1);
    expect(r.s.ignited).toEqual([]);
  });

  it('never a mercy-state foe (checked when the ignite is applied, so a foe that yielded from the hit is safe)', () => {
    for (const m of ['yielding', 'staggered', 'calming', 'releasing', 'leaving']) {
      const r = tempered();
      hit(r);
      r.w.foes.get('f')!.mercy = m;
      r.step(0.1);
      expect(r.s.ignited, m).toEqual([]);
    }
  });

  it('a foe that is dead or gone by then is not ignited', () => {
    const r = tempered();
    hit(r);
    r.w.foes.get('f')!.live = false;
    r.step(0.1);
    hit(r);
    r.w.foes.delete('f');
    r.step(0.1);
    expect(r.s.ignited).toEqual([]);
  });

  it('skips a foe already burning from any emberwright.* ignite (Ember Bolt, Fire Wall, Cinder Rain, its own); other ids and other kinds do not block', () => {
    for (const id of ['emberwright.ignite', 'emberwright.fireWall.ignite', 'emberwright.cinderRain.ignite', 'emberwright.temperWeapon.ignite', 'emberwright.flameLash']) {
      const r = tempered();
      r.burning('f', id);
      hit(r);
      r.step(0.1);
      expect(r.s.ignited, id).toEqual([]);
    }
    for (const id of ['ashblade.phoenixRoll', 'enemy.fire', 'temper']) {
      const r = tempered();
      r.burning('f', id);
      hit(r);
      r.step(0.1);
      expect(r.s.ignited, id).toHaveLength(1);
    }
    const bleed = tempered();
    bleed.s.statuses.set('f', [{ id: 'emberwright.bleedy', kind: 'bleed', remaining: 2, sourceId: 'x' } as StatusEntry]);
    hit(bleed);
    bleed.step(0.1);
    expect(bleed.s.ignited).toHaveLength(1);
  });

  it('an ignite another source adds in the same tick (Ember Bolt applies its own just after its hit resolves) still wins: no double stack', () => {
    const r = temperRig();
    r.w.add(foe('f', 0, -3));
    r.temper.cast();
    const q = r.req({ attackerId: 'player', kind: 'spell', attackId: 'emberwright.bolt' });
    r.dealt(q); // damage.dealt fires inside the hit...
    r.burning('f', 'emberwright.ignite'); // ...Ember Bolt's ignite lands as the hit returns
    r.step(0.1);
    expect(r.s.ignited).toEqual([]);
  });

  it('the staff ignites after Flame Ball, Spark Burst and the staff tap, but not after a Fire Wall tick', () => {
    const r = temperRig();
    r.w.add(foe('f', 0, -3));
    r.temper.cast();
    r.dealt(r.req({ attackerId: 'player', kind: 'spell', attackId: 'emberwright.fireWall' }));
    r.step(0.1);
    expect(r.s.ignited).toEqual([]);
    r.dealt(r.req({ attackerId: 'player', kind: 'spell', attackId: 'emberwright.flameBall' }));
    r.step(0.1);
    expect(r.s.ignited).toHaveLength(1);
  });
});

describe('Temper Weapon: ending', () => {
  it('ends on expiry at 20 s', () => {
    const r = temperRig();
    r.comp('c', 2, 0);
    r.temper.cast();
    r.step(19.9);
    expect(r.temper.target).toBe('c');
    r.step(0.2);
    expect(r.temper.target).toBeNull();
    expect(r.w.stops).toEqual(['temper-weapon']);
  });

  it('ends early when the companion dies, despawns, leaves the party (actor gone) — by event or by the per-tick check', () => {
    for (const how of ['event', 'tick-gone', 'tick-left'] as const) {
      const r = temperRig();
      r.comp('c', 2, 0);
      r.temper.cast();
      if (how === 'event') r.temper.onGone('c');
      else {
        r.s.here.delete('c');
        r.step(0.05);
      }
      expect(r.temper.target, how).toBeNull();
      expect(r.w.stops, how).toEqual(['temper-weapon']);
    }
  });

  it('another actor\'s death changes nothing, and the player\'s own id never ends the staff by onGone', () => {
    const r = temperRig();
    r.comp('c', 2, 0);
    r.temper.cast();
    r.temper.onGone('somebody');
    expect(r.temper.target).toBe('c');
    const s = temperRig();
    s.temper.cast();
    s.temper.onGone('player');
    expect(s.temper.target).toBe('player');
  });

  it('the staff does not need a companion present, and a class change or an unlearn ends it', () => {
    const r = temperRig();
    r.temper.cast();
    r.step(5);
    expect(r.temper.target).toBe('player');
    r.w.emberwright = false;
    r.step(0.05);
    expect(r.temper.target).toBeNull();
    const u = temperRig();
    u.temper.cast();
    u.w.learned = false;
    u.step(0.05);
    expect(u.temper.target).toBeNull();
  });

  it('end() (load, death, dispose) clears the target and queued ignites', () => {
    const r = temperRig();
    r.w.add(foe('f', 0, -3));
    r.temper.cast();
    r.dealt(r.req({ attackerId: 'player', kind: 'spell', attackId: 'emberwright.bolt' }));
    r.temper.end();
    r.step(0.1);
    expect(r.temper.target).toBeNull();
    expect(r.s.ignited).toEqual([]);
    expect(r.w.stops).toEqual(['temper-weapon']);
  });

  it('uses only the emberwright.temperWeapon prefix: never a bare temper id', () => {
    expect(TEMPER_WEAPON.igniteId.startsWith('emberwright.temperWeapon')).toBe(true);
    expect(TEMPER_WEAPON.modifierId).toBe('emberwright-temper-weapon');
    expect(TEMPER_WEAPON.modifierId.startsWith('temper')).toBe(false);
    expect(TEMPER_WEAPON.order).toBe(-148);
  });
});

// ---- Updraft --------------------------------------------------------------------------------------------------------

function updraftRig(over: Parameters<typeof world>[0] = {}) {
  const { w, base } = world(over);
  const s = {
    applied: [] as DamageRequest[],
    stuns: [] as Array<{ id: string; spec: StatusSpec }>,
    bosses: new Set<string>(),
    outcome: 'hit' as DamageResult['outcome'],
    afterHit: undefined as ((id: string) => void) | undefined,
  };
  const up = new Updraft({
    ...base,
    foes: () => w.foes.values(),
    foe: (id) => w.foes.get(id) ?? null,
    apply: (req) => (s.applied.push(req), s.afterHit?.(req.targetId), result({ outcome: s.outcome, dealt: 0 })),
    stun: (id, spec) => (s.stuns.push({ id, spec }), true),
    isBoss: (id) => s.bosses.has(id),
  } as UpdraftPorts);
  return { w, s, up };
}

describe('Updraft', () => {
  it('every live hostile within 4 m (inclusive) takes 0 damage and 30 poise, and a 1.5 s stun; the effect and trigger are reported', () => {
    const r = updraftRig();
    r.w.add(foe('a', 0, -2));
    r.w.add(foe('b', 4, 0));
    r.w.add(foe('c', 0, 4));
    r.w.add(foe('diag', 2.4, -3.2)); // 4 m by a 3-4-5 triangle
    r.w.add(foe('out1', 4.01, 0));
    r.w.add(foe('out2', 0, -4.01));
    expect(r.up.cast()).toEqual({ ok: true });
    expect(r.s.applied.map((q) => q.targetId).sort()).toEqual(['a', 'b', 'c', 'diag']);
    expect(r.s.applied[0]).toEqual({ attackerId: 'player', targetId: 'a', amount: 0, poise: 30, kind: 'spell', attackId: 'emberwright.updraft' });
    expect(r.s.stuns.map((q) => q.id).sort()).toEqual(['a', 'b', 'c', 'diag']);
    expect(r.s.stuns[0].spec).toEqual({ id: 'emberwright.updraft.stun', kind: 'stun', seconds: 1.5, sourceId: 'player' });
    expect(r.w.triggers).toEqual([SKILL.updraft]);
    expect(r.w.fx).toMatchObject([{ id: 'emberwright-updraft', attach: null, params: { radius: 4, lift: 1.5, seconds: 0.8 } }]);
  });

  it('a boss takes the poise hit and no stun', () => {
    const r = updraftRig();
    r.w.add(foe('boss', 1, 0));
    r.w.add(foe('grunt', -1, 0));
    r.s.bosses.add('boss');
    r.up.cast();
    expect(r.s.applied.map((q) => q.targetId).sort()).toEqual(['boss', 'grunt']);
    expect(r.s.stuns.map((q) => q.id)).toEqual(['grunt']);
  });

  it('skips the dead and every mercy state: no hit, no stun', () => {
    const r = updraftRig();
    r.w.add(foe('dead', 1, 0, { live: false }));
    for (const m of ['yielding', 'staggered', 'calming', 'releasing', 'leaving']) r.w.add(foe(`m-${m}`, 1, 1, { mercy: m }));
    r.w.add(foe('ok', 2, 0, { mercy: 'none' }));
    r.up.cast();
    expect(r.s.applied.map((q) => q.targetId)).toEqual(['ok']);
    expect(r.s.stuns.map((q) => q.id)).toEqual(['ok']);
  });

  it('re-reads the foe after the poise hit: one the hit put into a mercy state is not stunned', () => {
    const r = updraftRig();
    r.w.add(foe('flips', 1, 0));
    r.w.add(foe('plain', -1, 0));
    r.s.afterHit = (id) => {
      if (id === 'flips') r.w.foes.set(id, foe(id, 1, 0, { mercy: 'staggered' }));
    };
    r.up.cast();
    expect(r.s.applied.map((q) => q.targetId).sort()).toEqual(['flips', 'plain']);
    expect(r.s.stuns.map((q) => q.id)).toEqual(['plain']);
  });

  it('no stun when the hit did not land (immune, blocked, parried)', () => {
    for (const outcome of ['immune', 'blocked', 'parried'] as const) {
      const r = updraftRig();
      r.w.add(foe('a', 1, 0));
      r.s.outcome = outcome;
      r.up.cast();
      expect(r.s.applied).toHaveLength(1);
      expect(r.s.stuns, outcome).toEqual([]);
    }
  });

  it('skips a foe more than 3 m above or below', () => {
    const r = updraftRig();
    r.w.add({ ...foe('up', 1, 0), y: 3.01 });
    r.w.add({ ...foe('down', 1, 1), y: -3.01 });
    r.w.add({ ...foe('edge', 1, -1), y: 3 });
    r.up.cast();
    expect(r.s.applied.map((q) => q.targetId)).toEqual(['edge']);
  });

  it('with nobody near it still casts (the Ember is spent, the effect plays)', () => {
    const r = updraftRig();
    expect(r.up.cast()).toEqual({ ok: true });
    expect(r.w.fx).toHaveLength(1);
  });

  it('refuses wrong class, not learned, dead, staggered and busy: nobody is touched', () => {
    for (const [over, reason] of [
      [{ emberwright: false }, 'class'],
      [{ learned: false }, 'not-learned'],
      [{ blocked: 'dead' }, 'dead'],
      [{ blocked: 'staggered' }, 'staggered'],
      [{ blocked: 'busy' }, 'busy'],
    ] as const) {
      const r = updraftRig(over);
      r.w.add(foe('a', 1, 0));
      expect(r.up.cast(), reason).toEqual({ ok: false, reason });
      expect(r.s.applied).toEqual([]);
      expect(r.s.stuns).toEqual([]);
      expect(r.w.fx).toEqual([]);
    }
  });

  it('no id it owns starts with "updraft." (the glide thermals\' prefix)', () => {
    const ids = [UPDRAFT.stunId, UPDRAFT.attackId, UPDRAFT.effectId, UPDRAFT.skillId, TEMPER_WEAPON.modifierId, CINDER_RAIN.igniteId, TEMPER_WEAPON.igniteId];
    for (const id of ids) expect(id.startsWith('updraft.'), id).toBe(false);
    expect(UPDRAFT.stunId).toBe('emberwright.updraft.stun');
  });
});
