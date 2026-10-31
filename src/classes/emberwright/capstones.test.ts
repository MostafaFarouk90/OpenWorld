import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver, type DamageRequest, type DamageResult } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import type { StatusEntry, StatusSpec } from '../../actors/status';
import { GameEvents } from '../../core/events';
import {
  BreathOfTheKeepers, ColossusOfSlag, SunfireNova, burnsFromEmberwright, colossusNoKill,
  type AllyView, type BreathPorts, type ColossusBody, type ColossusPorts, type NovaPorts,
} from './capstones';
import type { FoeView } from './skills.act3';
import { BOLT, CAPSTONE_SKILL, COLOSSUS, SUNFIRE_NOVA } from './tuning';

const DT = 1 / 60;
const foe = (id: string, x: number, z: number, over: Partial<FoeView> = {}): FoeView => ({ id, x, y: 0, z, live: true, mercy: undefined, ...over });
const result = (over: Partial<DamageResult> = {}): DamageResult => ({ outcome: 'hit', killed: false, dealt: 5, ...over }) as DamageResult;

/** The shared fake world: the player at the origin facing -Z, a mutable foe table and a status table. */
function world(over: { learned?: boolean; emberwright?: boolean; blocked?: string | null } = {}) {
  const w = {
    learned: over.learned ?? true,
    emberwright: over.emberwright ?? true,
    blocked: over.blocked ?? null,
    yaw: 0,
    feet: { x: 0, y: 0, z: 0 },
    foes: new Map<string, FoeView>(),
    burning: new Map<string, StatusEntry[]>(),
    applied: [] as DamageRequest[],
    ignited: [] as Array<{ id: string; spec: StatusSpec }>,
    stops: [] as string[],
    triggers: [] as string[],
    fx: [] as Array<{ id: string; at: { x: number; y: number; z: number }; attach: string | null; params: Record<string, number> }>,
    shakes: [] as Array<[number, number]>,
    pulses: [] as Array<[number, number, number]>,
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
    now: () => 0,
    feet: () => ({ ...w.feet }),
    facingYaw: () => w.yaw,
    effect: (id: string, at: { x: number; y: number; z: number }, _yaw: number, attach: string | null, params: Record<string, number>) => {
      w.fx.push({ id, at: { ...at }, attach, params });
      return () => void w.stops.push(id);
    },
    reportTrigger: (id: string) => void w.triggers.push(id),
  };
  const io = {
    foe: (id: string) => w.foes.get(id) ?? null,
    foes: () => w.foes.values(),
    ignite: (id: string, spec: StatusSpec) => (w.ignited.push({ id, spec }), true),
    statuses: (id: string) => w.burning.get(id) ?? [],
  };
  const fx = { shake: (a: number, s: number) => void w.shakes.push([a, s]), pulse: (a: number, s: number, c: number) => void w.pulses.push([a, s, c]) };
  return { w, base, io, fx };
}

// ---- Sunfire Nova -----------------------------------------------------------------------------------------------------

function novaRig(over: Parameters<typeof world>[0] = {}) {
  const { w, base, io, fx } = world(over);
  const s = {
    interrupted: false,
    locks: 0,
    unlocks: 0,
    refunds: [] as number[],
    clips: [] as string[],
    outcome: 'hit' as DamageResult['outcome'],
    killed: false,
    yieldOnHit: false,
    wall: null as ((to: { x: number; y: number; z: number }) => boolean) | null,
  };
  const nova = new SunfireNova({
    ...base,
    ...io,
    apply: (req) => {
      w.applied.push(req);
      const f = w.foes.get(req.targetId);
      if (f && s.yieldOnHit) f.mercy = 'yielding';
      if (f && s.killed) f.live = false;
      return result({ outcome: s.outcome, killed: s.killed });
    },
    blocked: (_from, to) => s.wall?.(to) ?? false,
    interrupted: () => s.interrupted,
    lockMove: () => (s.locks++, () => void s.unlocks++),
    playClip: (c) => void s.clips.push(c),
    refund: (n) => void s.refunds.push(n),
    fx,
  } as NovaPorts);
  const step = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) nova.update(DT);
  };
  return { w, s, nova, step };
}
const hitIds = (w: { applied: DamageRequest[] }): string[] => w.applied.map((r) => r.targetId);

describe('Sunfire Nova: the press', () => {
  it('starts a charge: locks the player, plays the clip, shows the charge glow on the player, reports the trigger', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -5));
    expect(r.nova.cast()).toEqual({ ok: true });
    expect(r.nova.charging).toBe(true);
    expect(r.s.locks).toBe(1);
    expect(r.s.clips).toEqual([]); // the clip comes with the ring, not the charge (a one-shot clip would refuse the dodge)
    expect(r.w.triggers).toEqual([CAPSTONE_SKILL.sunfireNova]);
    expect(r.w.fx).toEqual([{ id: 'sunfire-charge', at: { x: 0, y: 0, z: 0 }, attach: 'player', params: { seconds: 0.6 } }]);
    expect(r.w.applied).toEqual([]);
  });

  it('refuses the wrong class, an unlearned skill and a blocked player, and starts nothing', () => {
    for (const [over, reason] of [[{ emberwright: false }, 'class'], [{ learned: false }, 'not-learned'], [{ blocked: 'busy' }, 'busy'], [{ blocked: 'dead' }, 'dead'], [{ blocked: 'staggered' }, 'staggered']] as const) {
      const r = novaRig(over);
      r.w.add(foe('a', 0, -5));
      expect(r.nova.cast(), reason).toEqual({ ok: false, reason });
      expect(r.nova.casting).toBe(false);
      expect(r.s.locks).toBe(0);
      expect(r.w.triggers).toEqual([]);
    }
  });

  it("refuses 'no-target' with nothing started when no live non-mercy hostile is within 10 m (inclusive) and 3 m of height", () => {
    const none = novaRig();
    expect(none.nova.cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(none.s.locks).toBe(0);
    for (const [f, ok] of [[foe('a', 0, -10), true], [foe('a', 0, -10.01), false], [foe('a', 0, -5, { y: 3.01 }), false], [foe('a', 0, -5, { mercy: 'yielding' }), false], [foe('a', 0, -5, { mercy: 'staggered' }), false], [foe('a', 0, -5, { live: false }), false]] as const) {
      const r = novaRig();
      r.w.add(f);
      expect(r.nova.cast().ok, JSON.stringify(f)).toBe(ok);
    }
  });

  it('is refused while a cast is already running', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -5));
    r.nova.cast();
    expect(r.nova.cast()).toEqual({ ok: false, reason: 'casting' });
    r.step(0.7);
    expect(r.nova.cast()).toEqual({ ok: false, reason: 'casting' });
    r.step(0.5);
    expect(r.nova.cast()).toEqual({ ok: true });
  });
});

describe('Sunfire Nova: the charge and the ring', () => {
  it('hits nothing during the 0.6 s charge; the ring then starts at 0 and reaches 10 m at 0.5 s', () => {
    const r = novaRig();
    r.w.add(foe('near', 0, -1));
    r.w.add(foe('mid', 5, 0));
    r.w.add(foe('far', 0, -10));
    r.nova.cast();
    r.step(0.59);
    expect(r.w.applied).toEqual([]);
    expect(r.nova.ringRadius).toBe(0);
    expect(r.w.shakes).toEqual([]);
    r.step(DT * 2);
    // Released: the first sliver of ring, the shake and the white flash.
    expect(r.w.shakes).toEqual([[SUNFIRE_NOVA.shakeAmplitude, 0.4]]);
    expect(r.w.pulses).toEqual([[SUNFIRE_NOVA.flashStrength, 0.08, 0xffffff]]);
    expect(r.s.clips).toEqual([SUNFIRE_NOVA.clip]);
    expect(r.w.fx.map((f) => f.id)).toEqual(['sunfire-charge', 'sunfire-nova']);
    expect(hitIds(r.w)).toEqual([]);
    r.step(0.25);
    expect(hitIds(r.w)).toEqual(['near', 'mid']);
    expect(r.nova.groundActive).toBe(false);
    r.step(0.3);
    expect(hitIds(r.w)).toEqual(['near', 'mid', 'far']);
    expect(r.nova.casting).toBe(false);
    expect(r.nova.groundActive).toBe(true);
    expect(r.w.fx.map((f) => f.id)).toEqual(['sunfire-charge', 'sunfire-nova', 'sunfire-ground']);
  });

  it('hits each foe once with 3x the base as fire spell damage and 40 poise, facing away from the centre', () => {
    const r = novaRig();
    r.w.add(foe('a', 3, 0));
    r.nova.cast();
    r.step(1.3);
    expect(r.w.applied).toHaveLength(1);
    const req = r.w.applied[0];
    expect(req).toMatchObject({ attackerId: 'player', targetId: 'a', amount: BOLT.damage * 3, poise: 40, kind: 'spell', attackId: 'emberwright.sunfireNova', element: 'fire' });
    expect(req.direction!.x).toBeCloseTo(1);
    expect(req.direction!.z).toBeCloseTo(0);
  });

  it('a foe at exactly 10 m is hit and one at 10.01 m is not, however long the ground burns', () => {
    const r = novaRig();
    r.w.add(foe('edge', 0, -10));
    r.w.add(foe('out', 0, -10.01));
    r.w.add(foe('high', 0, -4, { y: 3.01 }));
    r.nova.cast();
    r.step(1.3);
    expect(hitIds(r.w)).toEqual(['edge']);
  });

  it('skips mercy foes, dead and non-hostile ones, and a foe that walks into the ring later is hit once as it passes', () => {
    const r = novaRig();
    r.w.add(foe('y', 0, -2));
    r.w.add(foe('d', 0, -3, { live: false }));
    r.w.add(foe('late', 0, -30));
    r.w.add(foe('k', 0, -4));
    r.nova.cast();
    r.w.foes.get('y')!.mercy = 'yielding';
    r.step(0.65);
    // The 'late' foe comes to 9 m while the ring is at 1 m: it is not hit now, but once as the ring gets there.
    r.w.foes.get('late')!.z = -9;
    r.step(0.4);
    expect(hitIds(r.w).sort()).toEqual(['k', 'late']);
    r.step(1);
    expect(hitIds(r.w).sort()).toEqual(['k', 'late']);
  });

  it('a mercy state entered between the cast and the ring protects the foe', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -6));
    r.nova.cast();
    r.step(0.7);
    r.w.foes.get('a')!.mercy = 'calming';
    r.step(0.6);
    expect(r.w.applied).toEqual([]);
  });

  it('centres the ring on where the Emberwright stands at release, not at the press', () => {
    const r = novaRig();
    r.w.add(foe('a', 10, 0));
    r.nova.cast();
    r.step(0.3);
    r.w.feet = { x: 8, y: 0, z: 0 };
    r.step(1);
    expect(hitIds(r.w)).toEqual(['a']);
    const ground = r.w.fx.find((f) => f.id === 'sunfire-ground')!;
    expect(ground.at.x).toBe(8);
    expect(r.w.fx.find((f) => f.id === 'sunfire-nova')!.at.x).toBe(8);
  });
});

describe('Sunfire Nova: line of sight', () => {
  it('skips a foe a wall hides (centre chest to its torso) and refuses the press when only such foes are in range', () => {
    const r = novaRig();
    r.w.add({ id: 'open', x: 5, y: 0, z: 0, live: true, mercy: 'none' });
    r.w.add({ id: 'walled', x: -5, y: 0, z: 0, live: true, mercy: 'none' });
    r.s.wall = (to) => to.x < 0;
    expect(r.nova.cast()).toEqual({ ok: true });
    r.step(1.2);
    expect(hitIds(r.w)).toEqual(['open']);
    const only = novaRig();
    only.w.add({ id: 'walled', x: -5, y: 0, z: 0, live: true, mercy: 'none' });
    only.s.wall = () => true;
    expect(only.nova.cast()).toMatchObject({ ok: false, reason: 'no-target' });
  });
});

describe('Sunfire Nova: ignite', () => {
  const run = (setup?: (r: ReturnType<typeof novaRig>) => void) => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    setup?.(r);
    r.nova.cast();
    r.step(1.3);
    return r;
  };

  it('a foe hit and not killed catches the Nova ignite: 2 a second for 3 s, sourced from the player', () => {
    const r = run();
    expect(r.w.ignited[0]).toEqual({ id: 'a', spec: { id: 'emberwright.sunfireNova.ignite', kind: 'ignite', dps: 2, seconds: 3, sourceId: 'player' } });
  });

  it('is skipped when the foe already burns from an emberwright.* ignite (Ember Bolt, Fire Wall, Cinder Rain, Temper) and given when it burns from another source', () => {
    for (const id of ['emberwright.ignite', 'emberwright.fireWall.ignite', 'emberwright.cinderRain.ignite', 'emberwright.temperWeapon.ignite']) {
      const r = run((x) => x.w.burning.set('a', [{ id, kind: 'ignite', remaining: 2, sourceId: 'player' }]));
      expect(r.w.ignited, id).toEqual([]);
    }
    const other = run((x) => x.w.burning.set('a', [{ id: 'torch.burn', kind: 'ignite', remaining: 2, sourceId: null }]));
    expect(other.w.ignited.length).toBeGreaterThan(0);
    const bleed = run((x) => x.w.burning.set('a', [{ id: 'emberwright.bleed', kind: 'bleed', remaining: 2, sourceId: 'player' }]));
    expect(bleed.w.ignited.length).toBeGreaterThan(0);
  });

  it('a killed foe and a foe the hit put into a mercy state are not ignited', () => {
    const killed = novaRig();
    killed.w.add(foe('a', 0, -3));
    killed.s.killed = true;
    killed.nova.cast();
    killed.step(1.3);
    expect(killed.w.ignited).toEqual([]);
    const yielded = novaRig();
    yielded.w.add(foe('a', 0, -3));
    yielded.s.yieldOnHit = true;
    yielded.nova.cast();
    yielded.step(1.3);
    expect(yielded.w.ignited).toEqual([]);
  });

  it('the helper reads only ignite entries with the emberwright prefix', () => {
    expect(burnsFromEmberwright([{ id: 'emberwright.x', kind: 'ignite', remaining: 1, sourceId: null }], 'emberwright.')).toBe(true);
    expect(burnsFromEmberwright([{ id: 'emberwright.x', kind: 'stun', remaining: 1, sourceId: null }], 'emberwright.')).toBe(false);
    expect(burnsFromEmberwright([], 'emberwright.')).toBe(false);
  });
});

describe('Sunfire Nova: flinches, interrupts and the end', () => {
  it('a flinch is ridden out (the plugin answers interrupted() false): the ring still comes', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    r.nova.cast();
    r.s.interrupted = false; // a flinch reads as not interrupted
    r.step(1.3);
    expect(hitIds(r.w)).toEqual(['a']);
  });

  it('a break during the charge cancels it: no hit, the movement lock undone, the clip effect stopped and the Ember given back', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    r.nova.cast();
    r.step(0.3);
    r.s.interrupted = true;
    r.step(DT);
    expect(r.nova.casting).toBe(false);
    expect(r.s.unlocks).toBe(1);
    expect(r.s.refunds).toEqual([SUNFIRE_NOVA.emberCost]);
    expect(r.w.stops).toContain('sunfire-charge');
    r.s.interrupted = false;
    r.step(1.5);
    expect(r.w.applied).toEqual([]);
    expect(r.nova.groundActive).toBe(false);
  });

  it('a break during the ring stops further hits, gives nothing back and leaves no ground (the ring never finished)', () => {
    const r = novaRig();
    r.w.add(foe('near', 0, -2));
    r.w.add(foe('far', 0, -9));
    r.nova.cast();
    r.step(0.8);
    expect(hitIds(r.w)).toEqual(['near']);
    r.s.interrupted = true;
    r.step(DT);
    expect(r.nova.casting).toBe(false);
    expect(r.s.refunds).toEqual([]);
    expect(r.s.unlocks).toBe(1);
    r.s.interrupted = false;
    r.step(1);
    expect(hitIds(r.w)).toEqual(['near']);
    expect(r.nova.groundActive).toBe(false);
    expect(r.w.fx.some((f) => f.id === 'sunfire-ground')).toBe(false);
  });

  it('a break after the ground is lit does not put it out', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    r.nova.cast();
    r.step(1.2);
    expect(r.nova.groundActive).toBe(true);
    r.s.interrupted = true;
    r.step(DT);
    expect(r.nova.groundActive).toBe(true);
  });

  it('death, a class change and a respec end everything, the ground included, and stop the ground effect', () => {
    for (const how of ['dead', 'class', 'unlearn'] as const) {
      const r = novaRig();
      r.w.add(foe('a', 0, -3));
      r.nova.cast();
      r.step(1.2);
      expect(r.nova.groundActive).toBe(true);
      if (how === 'dead') r.w.blocked = 'dead';
      else if (how === 'class') r.w.emberwright = false;
      else r.w.learned = false;
      r.step(DT);
      expect(r.nova.groundActive, how).toBe(false);
      expect(r.nova.casting, how).toBe(false);
      expect(r.w.stops, how).toContain('sunfire-ground');
      r.w.applied.length = 0;
      r.w.ignited.length = 0;
      r.w.blocked = null;
      r.w.emberwright = true;
      r.w.learned = true;
      r.step(2);
      expect(r.w.ignited, how).toEqual([]);
    }
  });

  it('end() mid-charge undoes the lock (a load or dispose) and a later update does nothing', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    r.nova.cast();
    r.step(0.2);
    r.nova.end();
    expect(r.s.unlocks).toBe(1);
    r.step(2);
    expect(r.w.applied).toEqual([]);
  });

  it('a stale or bad dt changes nothing', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    r.nova.cast();
    for (const dt of [0, -1, NaN, Infinity]) r.nova.update(dt);
    expect(r.nova.charging).toBe(true);
  });
});

describe('Sunfire Nova: the burning ground', () => {
  it('burns 6 m wide for 6 s: ignites a foe inside every half second (when not already burning), edge inclusive, then stops', () => {
    const r = novaRig();
    r.w.add(foe('trigger', 0, -2));
    r.nova.cast();
    r.step(1.15); // the ring is out (it ended at 1.1 s); the ground has burned for 0.55 s
    r.w.foes.clear();
    r.w.ignited.length = 0;
    r.w.add(foe('in', 0, -6));
    r.w.add(foe('edge', 6, 0));
    r.w.add(foe('out', 0, -6.01));
    r.w.add(foe('high', 0, -2, { y: 3.01 }));
    r.w.add(foe('mercy', 0, -2, { mercy: 'yielding' }));
    r.step(0.5);
    expect(new Set(r.w.ignited.map((i) => i.id))).toEqual(new Set(['in', 'edge']));
    const perTick = r.w.ignited.length;
    expect(perTick).toBeGreaterThanOrEqual(2);
    r.step(1);
    expect(r.w.ignited.length).toBeGreaterThan(perTick);
    expect(r.w.ignited.every((i) => i.spec.id === SUNFIRE_NOVA.igniteId && i.spec.dps === 2 && i.spec.seconds === 3)).toBe(true);
    // Six seconds from the ring's end (1.1 s): past 7.1 s of the cast the field is gone.
    r.step(5.5);
    expect(r.nova.groundActive).toBe(false);
    expect(r.w.stops).toContain('sunfire-ground');
    const n = r.w.ignited.length;
    r.step(1);
    expect(r.w.ignited.length).toBe(n);
  });

  it('does not re-ignite a foe that already burns from an emberwright.* ignite', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    r.w.burning.set('a', [{ id: 'emberwright.ignite', kind: 'ignite', remaining: 3, sourceId: 'player' }]);
    r.nova.cast();
    r.step(3);
    expect(r.w.ignited).toEqual([]);
  });

  it('the ground effect is asked for the 6 m radius and 6 s', () => {
    const r = novaRig();
    r.w.add(foe('a', 0, -3));
    r.nova.cast();
    r.step(1.2);
    expect(r.w.fx.find((f) => f.id === 'sunfire-ground')!.params).toEqual({ radius: 6, seconds: 6 });
    expect(r.w.fx.find((f) => f.id === 'sunfire-nova')!.params).toEqual({ radius: 10, seconds: 0.5 });
  });
});

// ---- Breath of the Keepers --------------------------------------------------------------------------------------------------

const ally = (id: string, x: number, z: number, y = 0): AllyView => ({ id, x, y, z });

function breathRig(over: Parameters<typeof world>[0] = {}) {
  const { w, base, io, fx } = world(over);
  const s = {
    interrupted: false,
    unlocks: 0,
    locks: 0,
    clips: [] as string[],
    allies: new Map<string, AllyView>(),
    heals: [] as Array<[string, number]>,
    wall: null as ((to: { x: number; y: number; z: number }) => boolean) | null,
    killed: false,
  };
  const breath = new BreathOfTheKeepers({
    ...base,
    ...io,
    allies: () => s.allies.values(),
    apply: (req) => (w.applied.push(req), result({ killed: s.killed })),
    heal: (id, fraction) => (s.heals.push([id, fraction]), 1),
    blocked: (_from, to) => s.wall?.(to) ?? false,
    interrupted: () => s.interrupted,
    lockMove: () => (s.locks++, () => void s.unlocks++),
    fx,
  } as BreathPorts);
  const step = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) breath.update(DT);
  };
  return { w, s, breath, step };
}

describe('Breath of the Keepers: the cast', () => {
  it('starts a 2 s channel: locks the player, plays no clip (the dodge stays open), shows the cone effect, reports the trigger', () => {
    const r = breathRig();
    expect(r.breath.cast()).toEqual({ ok: true });
    expect(r.breath.active).toBe(true);
    expect(r.s.locks).toBe(1);
    expect(r.s.clips).toEqual([]);
    expect(r.w.triggers).toEqual([CAPSTONE_SKILL.breathOfTheKeepers]);
    expect(r.w.fx).toEqual([{ id: 'keepers-breath', at: { x: 0, y: 0, z: 0 }, attach: null, params: { seconds: 2, range: 8, halfAngle: 35 } }]);
  });

  it('refuses the wrong class, an unlearned skill, a blocked player and a second press, spending nothing', () => {
    for (const [over, reason] of [[{ emberwright: false }, 'class'], [{ learned: false }, 'not-learned'], [{ blocked: 'busy' }, 'busy'], [{ blocked: 'dead' }, 'dead'], [{ blocked: 'staggered' }, 'staggered']] as const) {
      const r = breathRig(over);
      expect(r.breath.cast(), reason).toEqual({ ok: false, reason });
      expect(r.s.locks).toBe(0);
    }
    const r = breathRig();
    r.breath.cast();
    expect(r.breath.cast()).toEqual({ ok: false, reason: 'casting' });
  });

  it('can be cast with no foe about: it heals', () => {
    const r = breathRig();
    expect(r.breath.cast()).toEqual({ ok: true });
    r.step(0.3);
    expect(r.s.heals).toEqual([['player', 0.03]]);
  });
});

describe('Breath of the Keepers: the ticks', () => {
  it('ticks every 0.25 s, eight times in 2 s, then ends and frees the movement', () => {
    const r = breathRig();
    r.w.add(foe('a', 0, -4));
    r.breath.cast();
    r.step(0.24);
    expect(r.w.applied).toHaveLength(0);
    r.step(0.02);
    expect(r.w.applied).toHaveLength(1);
    r.step(1.74);
    expect(r.breath.ticksDone).toBe(7);
    r.step(0.05);
    expect(r.breath.ticksDone).toBe(8);
    expect(r.breath.active).toBe(false);
    expect(r.s.unlocks).toBe(1);
    expect(r.w.stops).toContain('keepers-breath');
    r.step(1);
    expect(r.w.applied).toHaveLength(8);
  });

  it('a foe in the cone takes 0.4x the base as fire spell damage with no poise, and catches the breath ignite once', () => {
    const r = breathRig();
    r.w.add(foe('a', 0, -4));
    r.breath.cast();
    r.step(0.26);
    expect(r.w.applied[0]).toMatchObject({ attackerId: 'player', targetId: 'a', amount: BOLT.damage * 0.4, poise: 0, kind: 'spell', attackId: 'emberwright.breath', element: 'fire' });
    expect(r.w.ignited[0]).toEqual({ id: 'a', spec: { id: 'emberwright.breath.ignite', kind: 'ignite', dps: 2, seconds: 3, sourceId: 'player' } });
  });

  it('does not ignite a foe that already burns from an emberwright.* ignite, nor a killed one', () => {
    const r = breathRig();
    r.w.add(foe('a', 0, -4));
    r.w.burning.set('a', [{ id: 'emberwright.sunfireNova.ignite', kind: 'ignite', remaining: 2, sourceId: 'player' }]);
    r.breath.cast();
    r.step(0.3);
    expect(r.w.applied).toHaveLength(1);
    expect(r.w.ignited).toEqual([]);
    const k = breathRig();
    k.w.add(foe('a', 0, -4));
    k.s.killed = true;
    k.breath.cast();
    k.step(0.3);
    expect(k.w.ignited).toEqual([]);
  });

  it('the cone: 8 m (inclusive), 35 degrees either side, within 3 m of height, and behind is outside', () => {
    const at = (deg: number, d: number) => foe(`f${deg}_${d}`, -Math.sin((deg * Math.PI) / 180) * d, -Math.cos((deg * Math.PI) / 180) * d);
    const inside = [at(0, 8), at(34.9, 5), at(-34.9, 5), at(0, 0.5)];
    const outside = [at(0, 8.01), at(35.5, 5), at(-35.5, 5), at(90, 3), at(180, 3), foe('high', 0, -4, { y: 3.01 })];
    const r = breathRig();
    for (const f of [...inside, ...outside]) r.w.add(f);
    r.breath.cast();
    r.step(0.26);
    expect(new Set(hitIds(r.w))).toEqual(new Set(inside.map((f) => f.id)));
  });

  it('follows the facing: yaw +90 degrees faces -X', () => {
    const r = breathRig();
    r.w.yaw = Math.PI / 2;
    r.w.add(foe('west', -5, 0));
    r.w.add(foe('north', 0, -5));
    r.breath.cast();
    r.step(0.26);
    expect(hitIds(r.w)).toEqual(['west']);
  });

  it('skips foes in any mercy state, dead foes, and a foe a wall hides; a foe that goes into a mercy state midway is left alone from then on', () => {
    const r = breathRig();
    r.w.add(foe('y', 0, -3, { mercy: 'yielding' }));
    r.w.add(foe('s', 0, -3.5, { mercy: 'staggered' }));
    r.w.add(foe('d', 0, -3, { live: false }));
    r.w.add(foe('hid', 0, -6));
    r.w.add(foe('ok', 0, -2));
    r.s.wall = (to) => to.z < -5;
    r.breath.cast();
    r.step(0.51);
    expect(hitIds(r.w)).toEqual(['ok', 'ok']);
    r.w.foes.get('ok')!.mercy = 'calming';
    r.step(0.5);
    expect(hitIds(r.w)).toEqual(['ok', 'ok']);
  });

  it('heals the Emberwright every tick and every ally in the cone by 3%, not those outside it, and shows a pulse on an ally once a second', () => {
    const r = breathRig();
    r.s.allies.set('in', ally('in', 0, -4));
    r.s.allies.set('side', ally('side', -4, -1));
    r.s.allies.set('behind', ally('behind', 0, 4));
    r.s.allies.set('far', ally('far', 0, -9));
    r.s.allies.set('player', ally('player', 0, 0));
    r.breath.cast();
    r.step(2.05);
    const by = (id: string) => r.s.heals.filter(([h]) => h === id).length;
    expect(by('player')).toBe(8);
    expect(by('in')).toBe(8);
    expect(by('side')).toBe(0);
    expect(by('behind')).toBe(0);
    expect(by('far')).toBe(0);
    expect(r.s.heals.every(([, f]) => f === 0.03)).toBe(true);
    expect(r.w.fx.filter((f) => f.id === 'keepers-heal')).toHaveLength(2);
    expect(r.w.fx.filter((f) => f.id === 'keepers-heal').every((f) => f.attach === 'in')).toBe(true);
  });
});

describe('Breath of the Keepers: another ability or a spell ends it', () => {
  it('another skill used ends the channel (keeping the ticks breathed) and frees the movement; its own skill does not', () => {
    const r = breathRig();
    r.w.add({ id: 'a', x: 0, y: 0, z: -3, live: true, mercy: 'none' });
    r.breath.cast();
    r.step(0.5);
    r.breath.onSkillUsed('emberwright.breathOfTheKeepers');
    expect(r.breath.active).toBe(true);
    r.breath.onSkillUsed('emberwright.sunfireNova');
    expect(r.breath.active).toBe(false);
    expect(r.breath.ticksDone).toBe(2);
    expect(r.s.unlocks).toBe(1);
    r.step(1);
    expect(r.breath.ticksDone).toBe(2);
  });

  it('a spell cast ends it; with no channel running both are no-ops', () => {
    const r = breathRig();
    r.breath.onSkillUsed('x');
    r.breath.onSpellCast();
    expect(r.s.unlocks).toBe(0);
    r.breath.cast();
    r.step(0.3);
    r.breath.onSpellCast();
    expect(r.breath.active).toBe(false);
    expect(r.s.unlocks).toBe(1);
  });
});

describe('Breath of the Keepers: flinches, interrupts and the end', () => {
  it('a flinch is ridden out', () => {
    const r = breathRig();
    r.w.add(foe('a', 0, -4));
    r.breath.cast();
    r.s.interrupted = false;
    r.step(2.1);
    expect(r.breath.ticksDone).toBe(8);
  });

  it('a break ends the channel at once, keeping the ticks already breathed, and frees the movement', () => {
    const r = breathRig();
    r.w.add(foe('a', 0, -4));
    r.breath.cast();
    r.step(0.8);
    r.s.interrupted = true;
    r.step(DT);
    expect(r.breath.active).toBe(false);
    expect(r.breath.ticksDone).toBe(3);
    expect(r.s.unlocks).toBe(1);
    r.s.interrupted = false;
    r.step(2);
    expect(r.w.applied).toHaveLength(3);
  });

  it('death, a class change and a respec end it', () => {
    for (const how of ['dead', 'class', 'unlearn'] as const) {
      const r = breathRig();
      r.breath.cast();
      r.step(0.3);
      if (how === 'dead') r.w.blocked = 'dead';
      else if (how === 'class') r.w.emberwright = false;
      else r.w.learned = false;
      r.step(DT);
      expect(r.breath.active, how).toBe(false);
      expect(r.s.unlocks, how).toBe(1);
    }
  });

  it('end() undoes the lock and a second end() does nothing more', () => {
    const r = breathRig();
    r.breath.cast();
    r.breath.end();
    r.breath.end();
    expect(r.s.unlocks).toBe(1);
  });
});

// ---- Colossus of Slag -------------------------------------------------------------------------------------------------------

function colossusRig(over: Parameters<typeof world>[0] = {}) {
  const { w, base, fx } = world(over);
  const s = {
    spawned: [] as Array<{ id: string; at: { x: number; y: number; z: number } }>,
    bodies: [] as Array<ColossusBody & { placed: Array<[number, number, number, number, number]>; clips: string[]; disposed: boolean; steps: Array<[number, number]> }>,
    refuse: false,
    engage: new Set<string>(),
    exists: new Set<string>(),
    gone: false,
    placedAt: { x: 0, z: 0, rise: 0, yaw: 0 },
    ground: null as ((x: number, z: number) => number | null) | null,
  };
  const colossus = new ColossusOfSlag({
    ...base,
    foe: (id) => w.foes.get(id) ?? null,
    foes: () => w.foes.values(),
    groundY: (x, z) => s.ground?.(x, z) ?? null,
    taken: (id) => s.exists.has(id),
    stillThere: () => !s.gone,
    mayEngage: (id) => s.engage.has(id),
    apply: (req) => (w.applied.push(req), result()),
    spawn: (id, at) => {
      if (s.refuse) return null;
      s.spawned.push({ id, at: { ...at } });
      s.exists.add(id);
      const body = {
        actor: { id, dead: false },
        placed: [] as Array<[number, number, number, number, number]>,
        clips: [] as string[],
        steps: [] as Array<[number, number]>,
        disposed: false,
        place(x: number, y: number, z: number, yaw: number, rise: number) {
          this.placed.push([x, y, z, yaw, rise]);
          s.placedAt = { x, z, rise, yaw };
        },
        play(c: string) {
          this.clips.push(c);
        },
        step(dt: number, speed: number) {
          this.steps.push([dt, speed]);
        },
        dispose() {
          this.disposed = true;
          s.exists.delete(id);
        },
      };
      s.bodies.push(body as never);
      return body as never;
    },
    fx,
  } as ColossusPorts);
  const step = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) colossus.update(DT);
  };
  const engageFoe = (f: FoeView) => {
    w.add(f);
    s.engage.add(f.id);
    return f;
  };
  return { w, s, colossus, step, engageFoe };
}
const slamTimes = (r: ReturnType<typeof colossusRig>): number => r.w.applied.length;

describe('Colossus of Slag: the cast', () => {
  it('spawns an ally actor beside the player (right of the facing, 4 m), rises it over 1.5 s with an effect and a shake, reports the trigger', () => {
    const r = colossusRig();
    expect(r.colossus.cast()).toEqual({ ok: true });
    expect(r.s.spawned).toEqual([{ id: 'colossus:1', at: { x: 4, y: 0, z: 0 } }]);
    expect(r.colossus.actorId).toBe('colossus:1');
    expect(r.w.triggers).toEqual([CAPSTONE_SKILL.colossusOfSlag]);
    expect(r.w.fx).toEqual([{ id: 'colossus-rise', at: { x: 4, y: 0, z: 0 }, attach: null, params: { seconds: 1.5, radius: 4 } }]);
    expect(r.w.shakes).toEqual([[COLOSSUS.riseShakeAmplitude, COLOSSUS.riseShakeSeconds]]);
    expect(r.s.bodies[0].placed[0][4]).toBe(0);
  });

  it('refuses the wrong class, an unlearned skill, a blocked player and a refused spawn (no-room), keeping nothing', () => {
    for (const [over, reason] of [[{ emberwright: false }, 'class'], [{ learned: false }, 'not-learned'], [{ blocked: 'busy' }, 'busy'], [{ blocked: 'dead' }, 'dead']] as const) {
      const r = colossusRig(over);
      expect(r.colossus.cast(), reason).toEqual({ ok: false, reason });
      expect(r.s.spawned).toEqual([]);
    }
    const r = colossusRig();
    r.s.refuse = true;
    expect(r.colossus.cast()).toEqual({ ok: false, reason: 'no-room' });
    expect(r.colossus.active).toBe(false);
    expect(r.w.triggers).toEqual([]);
  });

  it('one at a time: a recast disposes the first and raises a new one with a new id', () => {
    const r = colossusRig();
    r.colossus.cast();
    r.colossus.cast();
    expect(r.s.bodies[0].disposed).toBe(true);
    expect(r.s.bodies[1].disposed).toBe(false);
    expect(r.colossus.actorId).toBe('colossus:2');
  });

  it('the rise: 0 to 1 over 1.5 s with no walking and no slam, then it stands', () => {
    const r = colossusRig();
    r.engageFoe(foe('a', 0, -5));
    r.colossus.cast();
    r.step(0.75);
    expect(r.s.placedAt.rise).toBeCloseTo(0.5, 1);
    expect(r.colossus.riseDone).toBeCloseTo(0.75, 1);
    expect(r.w.applied).toEqual([]);
    r.step(0.8);
    expect(r.s.placedAt.rise).toBe(1);
  });
});

describe('Colossus of Slag: the slam', () => {
  it('slams a foe the engagement rules allow 1 s after the rise: 1.5x base, poise 40, attacker the golem, at the foe and 4 m around it', () => {
    const r = colossusRig();
    r.engageFoe(foe('a', 4, -4));
    r.engageFoe(foe('near', 6, -4));
    r.engageFoe(foe('out', 8.01, -4));
    r.colossus.cast();
    r.step(1.5 + 1 + 0.4);
    expect(r.w.applied).toEqual([]);
    r.step(2);
    expect(r.w.applied.map((q) => q.targetId).sort()).toEqual(['a', 'near']);
    for (const q of r.w.applied) {
      expect(q).toMatchObject({ attackerId: 'colossus:1', amount: BOLT.damage * 1.5, poise: 40, kind: 'melee', attackId: 'emberwright.colossus' });
    }
    expect(r.w.fx.some((f) => f.id === 'colossus-slam')).toBe(true);
    expect(r.s.bodies[0].clips).toContain('Slam');
  });

  it('the slam area edge is inclusive at 4 m and 3 m of height', () => {
    const r = colossusRig();
    r.engageFoe(foe('a', 4, -4));
    r.engageFoe(foe('edge', 8, -4));
    r.engageFoe(foe('high', 4, -4, { y: 3.01 }));
    r.engageFoe(foe('low', 4, -4, { y: -3 }));
    r.colossus.cast();
    r.step(4);
    expect(r.w.applied.map((q) => q.targetId).sort()).toEqual(['a', 'edge', 'low']);
  });

  it('only engages foes mayEngage allows; a mercy-state foe and one not fighting the player or an ally are never hit or chosen', () => {
    const r = colossusRig();
    r.w.add(foe('calm', 3, -3)); // mayEngage false (a beast the player means to Calm)
    r.engageFoe(foe('yield', 3, -3.5, { mercy: 'yielding' }));
    r.engageFoe(foe('stag', 3.5, -3.5, { mercy: 'staggered' }));
    r.engageFoe(foe('dead', 3, -3, { live: false }));
    r.colossus.cast();
    r.step(8);
    expect(r.w.applied).toEqual([]);
    // The one it may hit is hit, and the calm one next to it is not.
    r.engageFoe(foe('ok', 3.5, -3.2));
    r.step(3);
    expect(r.w.applied.map((q) => q.targetId)).toEqual(['ok']);
  });

  it('a neighbour put into a mercy state by an earlier blow of the same slam is not struck', () => {
    const r = colossusRig();
    r.engageFoe(foe('first', 3, -3));
    r.engageFoe(foe('second', 3.5, -3));
    const orig = r.w.applied.push.bind(r.w.applied);
    r.w.applied.push = (...q: DamageRequest[]) => {
      if (q[0].targetId === 'first') r.w.foes.get('second')!.mercy = 'yielding';
      return orig(...q);
    };
    r.colossus.cast();
    r.step(4);
    expect(r.w.applied.map((q) => q.targetId)).toEqual(['first']);
  });

  it('slams every 3 s while a foe stands there (the first blow 1 s after the rise, then 3 s apart)', () => {
    const r = colossusRig();
    r.engageFoe(foe('a', 4, -2));
    r.colossus.cast();
    const impacts: number[] = [];
    let n = 0;
    for (let i = 0; i < 29 * 60; i++) {
      r.colossus.update(DT);
      if (slamTimes(r) > n) {
        n = slamTimes(r);
        impacts.push(i * DT);
      }
    }
    expect(impacts.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < impacts.length; i++) expect(impacts[i] - impacts[i - 1]).toBeGreaterThan(2.9);
    for (let i = 1; i < impacts.length; i++) expect(impacts[i] - impacts[i - 1]).toBeLessThan(3.2);
  });

  it('walks to within 3.5 m of a far foe before it slams, and the blow lands where the foe stands now', () => {
    const r = colossusRig();
    const f = r.engageFoe(foe('a', 4, -13));
    r.colossus.cast();
    r.step(2.6);
    const g = r.colossus.position;
    expect(Math.hypot(g.x - f.x, g.z - f.z)).toBeLessThan(13);
    expect(r.w.applied).toEqual([]);
    let at: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 4 * 60 && !at; i++) {
      r.colossus.update(DT);
      if (r.colossus.slamming) at = r.colossus.position;
    }
    // It has arrived: the wind-up starts 3.5 m from the foe, not before.
    expect(Math.hypot(at!.x - f.x, at!.z - f.z)).toBeLessThanOrEqual(COLOSSUS.engageDistance + 1e-6);
    expect(Math.hypot(at!.x - f.x, at!.z - f.z)).toBeGreaterThan(COLOSSUS.engageDistance - 0.2);
    r.step(1);
    expect(r.w.applied.length).toBeGreaterThanOrEqual(1);
    // The foe steps aside during the wind-up: the area follows it.
    const r2 = colossusRig();
    const g2 = r2.engageFoe(foe('a', 4, -2));
    const other = r2.engageFoe(foe('b', 4, -9));
    r2.colossus.cast();
    for (let i = 0; i < 6 * 60 && r2.w.fx.every((x) => x.id !== 'colossus-slam'); i++) {
      r2.colossus.update(DT);
      if (r2.colossus.slamming) {
        g2.z = -8.5;
        g2.x = 4;
      }
    }
    const slam = r2.w.fx.find((x) => x.id === 'colossus-slam')!;
    expect(slam.at.z).toBeCloseTo(-8.5);
    expect(r2.w.applied.map((q) => q.targetId).sort()).toEqual(['a', 'b']);
    expect(other.id).toBe('b');
  });

  it('picks the nearest allowed foe to the golem, within 14 m of it and 20 m of the player', () => {
    const r = colossusRig();
    r.engageFoe(foe('far', 30, 30));
    r.engageFoe(foe('beyondLeash', 0, -21)); // 21 m from the player: out of leash
    r.colossus.cast();
    r.step(6);
    expect(r.w.applied).toEqual([]);
    r.engageFoe(foe('nearer', 6, -2));
    r.engageFoe(foe('nearest', 5, 0));
    r.step(3);
    expect(r.w.applied.map((q) => q.targetId)).toContain('nearest');
    expect(r.w.applied.map((q) => q.targetId)).not.toContain('far');
    expect(r.w.applied.map((q) => q.targetId)).not.toContain('beyondLeash');
  });

  it('with no foe it does nothing but follow, and a foe that appears is slammed within a quarter second of the retry', () => {
    const r = colossusRig();
    r.colossus.cast();
    r.step(5);
    expect(r.w.applied).toEqual([]);
    r.engageFoe(foe('a', 4, -1));
    r.step(1.8);
    expect(r.w.applied.length).toBeGreaterThanOrEqual(1);
  });

  it('applies no status: the golem only slams (no ignite, no stun, no root)', () => {
    const r = colossusRig();
    r.engageFoe(foe('a', 4, -2));
    r.colossus.cast();
    r.step(4);
    expect(r.w.ignited).toEqual([]);
  });
});

describe('Colossus of Slag: ground height', () => {
  const slope = (_x: number, z: number) => -0.5 * z; // rises 0.5 m per metre towards -z

  it('stands on the slope under itself, not at the player\'s height: spawns on it, and follows it while walking to a foe 12 m upslope', () => {
    const r = colossusRig();
    r.s.ground = slope;
    r.colossus.cast();
    // Spawned 4 m to the right of the facing (z 0): ground there is 0.
    expect(r.s.spawned[0].at.y).toBeCloseTo(0, 6);
    r.engageFoe({ id: 'f', x: 0, y: 6, z: -12, live: true, mercy: 'none' });
    r.step(8);
    const last = r.s.bodies[0].placed.at(-1)!;
    expect(last[2]).toBeLessThan(-6);
    // The player stays at y 0, the golem is on the hillside (within the smoothing's lag).
    expect(last[1]).toBeCloseTo(slope(last[0], last[2]), 0);
    expect(last[1]).toBeGreaterThan(3);
  });

  it('with no ground under it the player\'s own height is the fallback', () => {
    const r = colossusRig();
    r.s.ground = () => null;
    r.w.feet.y = 2;
    r.colossus.cast();
    expect(r.s.spawned[0].at.y).toBe(2);
    r.step(3);
    expect(r.s.bodies[0].placed.at(-1)![1]).toBeCloseTo(2, 3);
  });
});

describe('Colossus of Slag: following and the end', () => {
  it('follows the player: walks when more than 6 m away, stops at 4.5 m, and rejoins at once past 25 m', () => {
    const r = colossusRig();
    r.colossus.cast();
    r.step(1.6);
    r.w.feet = { x: 14, y: 0, z: 0 };
    r.step(3);
    const g = r.colossus.position;
    expect(Math.hypot(g.x - 14, g.z)).toBeLessThanOrEqual(COLOSSUS.followMax + 0.01);
    expect(r.s.bodies[0].clips).toContain('Walk');
    r.step(4);
    const stop = r.colossus.position;
    expect(Math.hypot(stop.x - 14, stop.z)).toBeLessThanOrEqual(COLOSSUS.followStop + 0.01);
    r.w.feet = { x: 300, y: 0, z: 0 };
    r.step(DT * 2);
    expect(Math.hypot(r.colossus.position.x - 300, r.colossus.position.z)).toBeLessThanOrEqual(COLOSSUS.spawnSide + 0.5);
  });

  it('walk speed reaches the body and the body is stepped every tick', () => {
    const r = colossusRig();
    r.colossus.cast();
    r.step(1.6);
    r.w.feet = { x: 20, y: 0, z: 0 };
    r.step(1);
    const speeds = r.s.bodies[0].steps.map(([, v]) => v);
    expect(Math.max(...speeds)).toBeCloseTo(COLOSSUS.speed, 0);
    expect(r.s.bodies[0].steps.length).toBe(Math.round(2.6 / DT));
  });

  it('ends after 30 s, disposing the body once', () => {
    const r = colossusRig();
    r.colossus.cast();
    r.step(29.9);
    expect(r.colossus.active).toBe(true);
    r.step(0.2);
    expect(r.colossus.active).toBe(false);
    expect(r.s.bodies[0].disposed).toBe(true);
    r.step(1);
    expect(r.s.spawned).toHaveLength(1);
  });

  it('death, a class change, a respec, a despawn by someone else and end() all end it', () => {
    for (const how of ['dead', 'class', 'unlearn', 'gone', 'end'] as const) {
      const r = colossusRig();
      r.engageFoe(foe('a', 4, -2));
      r.colossus.cast();
      r.step(0.5);
      if (how === 'dead') r.w.blocked = 'dead';
      else if (how === 'class') r.w.emberwright = false;
      else if (how === 'unlearn') r.w.learned = false;
      else if (how === 'gone') r.s.gone = true;
      else r.colossus.end();
      r.step(DT);
      expect(r.colossus.active, how).toBe(false);
      expect(r.s.bodies[0].disposed, how).toBe(true);
      r.step(5);
      expect(r.w.applied, how).toEqual([]);
    }
  });

  it('ending mid-slam cancels the blow', () => {
    const r = colossusRig();
    r.engageFoe(foe('a', 4, -2));
    r.colossus.cast();
    for (let i = 0; i < 5 * 60 && !r.colossus.slamming; i++) r.colossus.update(DT);
    expect(r.colossus.slamming).toBe(true);
    r.colossus.end();
    r.step(2);
    expect(r.w.applied).toEqual([]);
  });
});

// ---- the golem never kills --------------------------------------------------------------------------------------------------

describe('the no-kill floor against the real damage pipeline', () => {
  function pipeline() {
    const events = new GameEvents(() => {});
    const actors = new ActorRegistry(events);
    const dr = new DamageResolver(actors, events, () => {});
    actors.spawn(playerInit());
    const golem = actors.spawn({ id: 'colossus:1', kind: 'colossus', team: 'ally', maxHealth: 500, hittable: false });
    const foeA = actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 40, maxPoise: 20 });
    dr.addLethalHandler(COLOSSUS.noKillId, colossusNoKill((id) => !!id && id.startsWith(COLOSSUS.idPrefix)), Number.MIN_SAFE_INTEGER + 1);
    const died: Array<{ actorId: string; killerId: string | null }> = [];
    events.on('actor.died', (e) => void died.push({ actorId: e.actorId, killerId: e.killerId }));
    return { dr, golem, foeA, died, actors, events };
  }
  const slam = (p: ReturnType<typeof pipeline>, amount: number, poise = 40) =>
    p.dr.apply({ attackerId: 'colossus:1', targetId: p.foeA.id, amount, poise, kind: 'melee', attackId: COLOSSUS.attackId });

  it('a blow that would kill leaves the foe at 1 HP, saved, alive and with no death event', () => {
    const p = pipeline();
    const r = slam(p, 15);
    expect(r).toMatchObject({ killed: false });
    expect(p.foeA.health).toBe(25);
    const big = slam(p, 500);
    expect(big!.killed).toBe(false);
    expect(big!.saved).toBe(true);
    expect(p.foeA.health).toBe(1);
    expect(p.foeA.dead).toBe(false);
    expect(p.died).toEqual([]);
    // Again and again: still alive.
    slam(p, 15);
    slam(p, 15);
    expect(p.foeA.health).toBe(1);
    expect(p.died).toEqual([]);
  });

  it('the player still finishes it and is the killer (the experience goes to the player), and any other attacker kills as always', () => {
    const p = pipeline();
    slam(p, 500);
    const r = p.dr.apply({ attackerId: 'player', targetId: p.foeA.id, amount: 5, poise: 0, kind: 'melee', attackId: 'x' });
    expect(r!.killed).toBe(true);
    expect(p.died).toEqual([{ actorId: p.foeA.id, killerId: 'player' }]);
    const q = pipeline();
    const other = q.dr.apply({ attackerId: null, targetId: q.foeA.id, amount: 500, poise: 0, kind: 'script' });
    expect(other!.killed).toBe(true);
  });

  it('the slam stagger reaches the foe: its poise is broken by the blow that left it at 1 HP', () => {
    const p = pipeline();
    const staggered: string[] = [];
    p.events.on('actor.staggered', (e) => void staggered.push(e.actorId));
    slam(p, 500, 40);
    expect(p.foeA.poise).toBe(0);
    expect(staggered).toEqual([p.foeA.id]);
  });

  it('an ally hit on a yielding foe is dropped by the resolver itself (the golem also never picks one)', () => {
    const p = pipeline();
    (p.foeA as { mercyState?: () => string }).mercyState = () => 'yielding';
    expect(slam(p, 15)).toBeNull();
    expect(p.foeA.health).toBe(40);
  });
});
