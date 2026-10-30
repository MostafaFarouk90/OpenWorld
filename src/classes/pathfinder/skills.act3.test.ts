import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DamageResult } from '../../actors/DamageResolver';
import type { StatusSpec } from '../../actors/status';
import { ProjectileSystem } from '../../spells/Projectile';
import { FakeActor, FakeActors, FakeDamage } from '../../spells/testHost';
import { Ammo } from './Ammo';
import { Crossbow } from './Crossbow';
import { Marks } from './Marks';
import { CaltropField, SureFoot, TripleShot, type CaltropFieldPorts, type FoeView, type SideBolt } from './skills.act3';
import { emberQuarrelHandler } from './tier3';
import { PF } from './tuning';

const DT = 1 / 60;

// ---- Triple Shot on the real Crossbow --------------------------------------------------------------------------------

type Spread = ((i: number, o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }) => readonly SideBolt[] | null) | undefined;

function rig(opts: { spread?: Spread; learned?: string[]; held?: boolean; master?: number; bolts?: number } = {}) {
  const player = new FakeActor('player', 'player');
  const actors = new FakeActors(player);
  const damage = new FakeDamage(actors);
  const projectiles = new ProjectileSystem({ actors });
  let bolts = opts.bolts ?? 20;
  let master = opts.master ?? 0;
  const ammo = new Ammo({
    itemKnown: () => true,
    count: () => bolts,
    remove: (n) => (bolts >= n ? ((bolts -= n), true) : false),
    masterCount: () => master,
    masterRemove: (n) => (master >= n ? ((master -= n), true) : false),
  });
  let now = 0;
  const marks = new Marks({ actors, now: () => now, added: () => {}, removed: () => {} });
  const fx = { tracer: vi.fn(), shot: vi.fn(), hit: vi.fn() };
  const learned = new Set(opts.learned ?? []);
  const cb = new Crossbow({
    playerId: () => 'player',
    muzzle: (out) => out.set(0, 1.3, 0),
    aim: () => ({ x: 0, y: 0, z: 1 }),
    attackHeld: () => opts.held ?? false,
    learned: (id) => learned.has(id),
    actors,
    damage,
    projectiles,
    ammo,
    marks,
    fx,
    toast: vi.fn(),
    now: () => now,
    ...(opts.spread ? { spread: opts.spread } : {}),
  });
  const swing = (index: number, seconds = 1.1): void => {
    cb.swingStarted(index);
    let prev = 0;
    for (let t = 0; t < seconds; t += DT) {
      const cur = Math.min(1, t / seconds + DT / seconds);
      cb.progress(prev, cur);
      prev = cur;
      now += DT;
      projectiles.update(DT);
    }
    cb.swingEnded();
    for (let t = 0; t < 1; t += DT) projectiles.update(DT);
  };
  const hostile = (id: string, z: number, x = 0) => actors.add(new FakeActor(id, 'hostile', x, z));
  /** A foe `d` metres out on a bearing `deg` degrees to the +x side of the +z aim. */
  const polar = (id: string, d: number, deg: number) => hostile(id, d * Math.cos((deg * Math.PI) / 180), d * Math.sin((deg * Math.PI) / 180));
  return { cb, actors, damage, projectiles, swing, hostile, polar, fx, marks, learned, bolts: () => bolts, masters: () => master, player };
}

const world = (over: { learned?: boolean; pathfinder?: boolean; blocked?: string | null } = {}) => {
  const w = {
    t: 0,
    learned: over.learned ?? true,
    pathfinder: over.pathfinder ?? true,
    blocked: over.blocked ?? null,
    yaw: 0,
    effects: [] as Array<{ id: string; at: { x: number; y: number; z: number }; yaw: number; params: Record<string, number> }>,
    stops: 0,
    triggers: [] as string[],
  };
  const base = {
    playerId: () => 'player',
    isPathfinder: () => w.pathfinder,
    learned: () => w.learned,
    blockedReason: () => w.blocked,
    now: () => w.t,
    feet: () => ({ x: 0, y: 0, z: 0 }),
    facingYaw: () => w.yaw,
    effect: (id: string, at: { x: number; y: number; z: number }, yaw: number, params: Record<string, number>) => {
      w.effects.push({ id, at, yaw, params });
      return () => void w.stops++;
    },
    reportTrigger: (id: string) => void w.triggers.push(id),
  };
  return { w, base };
};

describe('Crossbow spread port: absent means the shipped behaviour', () => {
  const snapshot = (r: ReturnType<typeof rig>) => ({
    applied: r.damage.applied.map((q) => ({ ...q, point: q.point?.toArray(), direction: q.direction?.toArray() })),
    bolts: r.bolts(),
    shot: r.fx.shot.mock.calls.length,
    tracer: r.fx.tracer.mock.calls.length,
  });
  const volley = (spread: Spread, index = 0) => {
    const r = rig({ spread, learned: [PF.skillIds.piercingBolt] });
    r.hostile('e', 8);
    r.hostile('behind', 11);
    r.swing(index);
    return snapshot(r);
  };

  it('with no spread port, a port returning null, and a port returning an empty list, every shot is identical', () => {
    for (const index of [0, 1, 2, 3]) {
      const absent = volley(undefined, index);
      expect(absent.applied.length, `shot ${index}`).toBeGreaterThan(0);
      expect(volley(() => null, index)).toEqual(absent);
      expect(volley(() => [], index)).toEqual(absent);
    }
  });

  it('the single shot with no port: one launch, one bolt of ammo, base damage, attack id bolt.1', () => {
    const r = rig();
    r.hostile('e', 8);
    r.swing(0);
    expect(r.damage.applied).toHaveLength(1);
    expect(r.damage.applied[0]).toMatchObject({ amount: PF.baseDamage, poise: 10, attackId: 'pathfinder.bolt.1' });
    expect(r.bolts()).toBe(19);
    expect(r.fx.shot).toHaveBeenCalledTimes(1);
  });

  it('ignores junk from a port: non-finite angles, zero or negative scales; at most four side bolts', () => {
    const r = rig({ spread: () => [{ yawDeg: NaN, scale: 0.6 }, { yawDeg: 5, scale: 0 }, { yawDeg: 5, scale: -1 }, { yawDeg: Infinity, scale: 1 }] });
    r.hostile('e', 8);
    r.swing(0);
    expect(r.damage.applied).toHaveLength(1);
    const many = rig({ spread: () => Array.from({ length: 9 }, (_, i) => ({ yawDeg: 3 + i, scale: 0.5 })) });
    many.swing(0);
    expect(many.projectiles.liveCount).toBe(0);
    expect(many.fx.shot).toHaveBeenCalledTimes(1);
  });
});

describe('Triple Shot', () => {
  let r: ReturnType<typeof rig>;
  let w: ReturnType<typeof world>;
  const make = (extra: { learned?: string[]; held?: boolean; master?: number; wOver?: Parameters<typeof world>[0] } = {}) => {
    w = world(extra.wOver);
    const triple = new TripleShot(w.base);
    r = rig({ spread: triple.spread, learned: extra.learned ?? [], held: extra.held, master: extra.master });
  };
  beforeEach(() => make());

  it('a single shot is three bolts for ONE ammo: centre at full damage, the two sides at 0.6x, all attack id bolt.1', () => {
    r.hostile('mid', 8);
    r.polar('left', 8, -7.5);
    r.polar('right', 8, 7.5);
    r.swing(0);
    const by = (id: string) => r.damage.applied.filter((q) => q.targetId === id);
    expect(r.damage.applied).toHaveLength(3);
    expect(by('mid')[0]).toMatchObject({ amount: PF.baseDamage, poise: 10, kind: 'melee', attackId: 'pathfinder.bolt.1' });
    for (const id of ['left', 'right']) {
      expect(by(id)).toHaveLength(1);
      expect(by(id)[0]).toMatchObject({ amount: PF.baseDamage * 0.6, poise: 10, kind: 'melee', attackId: 'pathfinder.bolt.1' });
    }
    expect(r.bolts()).toBe(19);
    expect(r.fx.shot).toHaveBeenCalledTimes(1);
    expect(r.fx.tracer).toHaveBeenCalledTimes(3);
  });

  it('the cone is 7.5 degrees: a foe at 12 degrees is hit by none of the three', () => {
    r.polar('wide', 8, 12);
    r.swing(0);
    expect(r.damage.applied).toEqual([]);
    expect(r.bolts()).toBe(19);
  });

  it('Steady Shot and a master bolt scale all three bolts', () => {
    make({ learned: [PF.skillIds.steadyShot], held: true, master: 1 });
    r.hostile('mid', 8);
    r.polar('left', 8, -7.5);
    r.polar('right', 8, 7.5);
    r.swing(0);
    const full = PF.baseDamage * PF.steadyShotScale * PF.masterBoltScale;
    expect(r.damage.applied.find((q) => q.targetId === 'mid')!.amount).toBeCloseTo(full);
    expect(r.damage.applied.find((q) => q.targetId === 'left')!.amount).toBeCloseTo(full * 0.6);
    expect(r.damage.applied.find((q) => q.targetId === 'right')!.amount).toBeCloseTo(full * 0.6);
    expect(r.masters()).toBe(0);
    expect(r.bolts()).toBe(20);
  });

  it('a Falcon Eye mark is consumed by the centre bolt only: a marked foe on a side keeps its mark and its normal poise', () => {
    r.hostile('mid', 8);
    r.polar('side', 8, 7.5);
    r.marks.cast({ x: 0, y: 0, z: 0 });
    expect(r.marks.isMarked('mid') && r.marks.isMarked('side')).toBe(true);
    r.swing(0);
    expect(r.damage.applied.find((q) => q.targetId === 'mid')!.poise).toBe(10 + PF.falconEye.weakPoise);
    expect(r.damage.applied.find((q) => q.targetId === 'side')!.poise).toBe(10);
    expect(r.marks.isMarked('mid')).toBe(false);
    expect(r.marks.isMarked('side')).toBe(true);
  });

  it('a marked foe hit by a side bolt only is not marked down either', () => {
    r.polar('side', 8, -7.5);
    r.marks.cast({ x: 0, y: 0, z: 0 });
    r.swing(0);
    expect(r.damage.applied).toHaveLength(1);
    expect(r.marks.isMarked('side')).toBe(true);
  });

  it('side bolts do not pierce: Piercing Bolt hits a second foe behind the centre bolt only', () => {
    make({ learned: [PF.skillIds.piercingBolt] });
    r.hostile('mid', 8);
    r.hostile('midBehind', 11);
    r.polar('side', 8, 7.5);
    r.polar('sideBehind', 11, 7.5);
    r.swing(0);
    const ids = r.damage.applied.map((q) => q.targetId).sort();
    expect(ids).toEqual(['mid', 'midBehind', 'side']);
    expect(r.damage.applied.find((q) => q.targetId === 'midBehind')!.amount).toBeCloseTo(PF.baseDamage * PF.pierce.secondScale);
  });

  it('side bolts do not blast: with a spread on the area shot only the centre bolt bursts', () => {
    const spread = (i: number) => (i === 3 ? [{ yawDeg: 7.5, scale: 0.6 }] : null);
    const rr = rig({ spread });
    rr.hostile('mid', 8);
    rr.polar('side', 8, 7.5);
    rr.hostile('near', 8, -2);
    rr.swing(3);
    const spell = rr.damage.applied.filter((q) => q.kind === 'spell');
    // The centre burst reaches 'side' (1.05 m from it) and 'near' (2 m): one splash each, none from the side bolt's landing.
    expect(spell.map((q) => q.targetId).sort()).toEqual(['near', 'side']);
    expect(rr.damage.applied.filter((q) => q.targetId === 'side' && q.kind === 'melee')).toHaveLength(1);
  });

  it('every other shot is unchanged: aimed, rapid and area fire as before', () => {
    r.hostile('e', 8);
    r.swing(1);
    expect(r.damage.applied).toHaveLength(1);
    expect(r.bolts()).toBe(19);
    const rapid = rig({ spread: new TripleShot(w.base).spread });
    rapid.hostile('mid', 8);
    rapid.swing(2);
    expect(rapid.bolts()).toBe(17);
    expect(rapid.fx.shot).toHaveBeenCalledTimes(3);
    expect(w.w.effects).toEqual([]);
  });

  it('Ember Quarrel still ignites from a side bolt hit: its handler matches the side bolt attack id', () => {
    r.polar('side', 8, 7.5);
    r.swing(0);
    const q = r.damage.applied[0];
    expect(q.attackId).toMatch(/^pathfinder\.bolt\.[1-4]$/);
    const apply = vi.fn(() => true);
    const handle = emberQuarrelHandler({ playerId: () => 'player', active: () => true, status: () => ({ apply }), warn: () => {} });
    handle({ kind: q.kind, attackerId: q.attackerId, targetId: q.targetId, outcome: 'hit', dealt: q.amount, attackId: q.attackId } as unknown as DamageResult);
    expect(apply).toHaveBeenCalledWith('side', expect.objectContaining({ id: PF.emberQuarrel.statusId, kind: 'ignite' }));
  });

  it('answers null (no extra bolts, no effect, no trigger) when unlearned, in another class, and for a null class', () => {
    for (const over of [{ learned: false }, { pathfinder: false }]) {
      const ww = world(over);
      const t = new TripleShot(ww.base);
      expect(t.spread(0, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })).toBeNull();
      expect(ww.w.effects).toEqual([]);
      expect(ww.w.triggers).toEqual([]);
    }
  });

  it('spawns one effect per volley, at the muzzle, turned to the aim with its pitch, and reports the trigger', () => {
    const ww = world();
    const t = new TripleShot(ww.base);
    t.spread(0, { x: 1, y: 1.3, z: 2 }, { x: -1, y: 0, z: 0 });
    expect(ww.w.effects).toHaveLength(1);
    const e = ww.w.effects[0];
    expect(e).toMatchObject({ id: 'triple-shot', at: { x: 1, y: 1.3, z: 2 } });
    // Facing -X means a yaw of +90 degrees (forward is (-sin yaw, -cos yaw)).
    expect(e.yaw).toBeCloseTo(Math.PI / 2);
    expect(e.params.pitch).toBeCloseTo(0);
    expect(e.params.degrees).toBe(7.5);
    expect(ww.w.triggers).toEqual([PF.skillIds.tripleShot]);
    t.spread(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0.5, z: -Math.sqrt(0.75) });
    expect(ww.w.effects[1].params.pitch).toBeCloseTo(Math.asin(0.5));
  });

  it('an out-of-ammo single shot fires nothing: the port is not asked', () => {
    const spread = vi.fn(() => null);
    const rr = rig({ bolts: 0, spread });
    rr.hostile('e', 8);
    rr.swing(0);
    expect(spread).not.toHaveBeenCalled();
  });
});

// ---- Caltrop Field -------------------------------------------------------------------------------------------------------

const foe = (id: string, x: number, z: number, over: Partial<FoeView> = {}): FoeView => ({ id, x, y: 0, z, live: true, mercy: undefined, boss: false, ...over });

function field(over: Parameters<typeof world>[0] = {}, extra: Partial<CaltropFieldPorts> = {}) {
  const { w, base } = world(over);
  const foes = new Map<string, FoeView>();
  const slows: Array<{ id: string; spec: StatusSpec }> = [];
  const f = new CaltropField({
    ...base,
    foes: () => foes.values(),
    slow: (id, spec) => (slows.push({ id, spec }), true),
    ...extra,
  });
  const add = (v: FoeView) => (foes.set(v.id, v), v);
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      w.t += DT;
      f.update();
    }
  };
  return { w, f, foes, add, slows, advance };
}

describe('Caltrop Field', () => {
  it('casts 3 m ahead on the ground, slows each foe inside at once (0.5 for 1 s, own id), reports the trigger, spawns the field', () => {
    const t = field({}, { heightAt: () => 2.5 });
    t.add(foe('a', 0, -3));
    expect(t.f.cast()).toEqual({ ok: true });
    expect(t.f.centre).toEqual({ x: 0, y: 2.5, z: -3 });
    expect(t.slows).toEqual([{ id: 'a', spec: { id: 'pathfinder.caltropField.slow', kind: 'slow', slow: 0.5, seconds: 1, sourceId: 'player' } }]);
    expect(t.w.triggers).toEqual([PF.skillIds.caltropField]);
    expect(t.w.effects[0]).toMatchObject({ id: 'caltrop-field', at: { x: 0, y: 2.5, z: -3 }, params: { seconds: 10, radius: 4 } });
  });

  it('follows the facing: turned to +X the field is 3 m along +X', () => {
    const t = field();
    t.w.yaw = -Math.PI / 2;
    t.f.cast();
    expect(t.f.centre!.x).toBeCloseTo(3);
    expect(t.f.centre!.z).toBeCloseTo(0);
  });

  it('with no ground probe the field sits at the feet height', () => {
    const t = field();
    t.f.cast();
    expect(t.f.centre!.y).toBe(0);
  });

  it('the radius is inclusive: exactly 4 m is slowed, 4.01 m is not', () => {
    const t = field();
    t.add(foe('edge', 4, -3));
    t.add(foe('out', 4.01, -3));
    t.add(foe('edge2', 0, -7));
    t.add(foe('out2', 0, -7.01));
    t.f.cast();
    expect(t.slows.map((s) => s.id).sort()).toEqual(['edge', 'edge2']);
  });

  it('skips the dead, foes not hittable, and every mercy state; a calm foe (none) is slowed', () => {
    const t = field();
    for (const m of ['yielding', 'calming', 'releasing', 'leaving', 'staggered']) t.add(foe(`m-${m}`, 0, -3, { mercy: m }));
    t.add(foe('dead', 0, -3, { live: false }));
    t.add(foe('ok', 1, -3, { mercy: 'none' }));
    t.f.cast();
    expect(t.slows.map((s) => s.id)).toEqual(['ok']);
  });

  it('a boss is slowed by 0.25 instead of 0.5', () => {
    const t = field();
    t.add(foe('boss', 0, -3, { boss: true }));
    t.add(foe('grunt', 1, -3));
    t.f.cast();
    expect(t.slows.find((s) => s.id === 'boss')!.spec.slow).toBe(0.25);
    expect(t.slows.find((s) => s.id === 'grunt')!.spec.slow).toBe(0.5);
  });

  it('re-applies every 0.5 s for 10 s: 20 scans, then it ends, stops its effect and slows nobody more', () => {
    const t = field();
    t.add(foe('a', 0, -3));
    t.f.cast();
    t.advance(0.49);
    expect(t.slows).toHaveLength(1);
    t.advance(0.02);
    expect(t.slows).toHaveLength(2);
    t.advance(9.5);
    expect(t.slows).toHaveLength(20);
    expect(t.f.active).toBe(false);
    expect(t.w.stops).toBe(1);
    t.advance(2);
    expect(t.slows).toHaveLength(20);
  });

  it('a foe that walks out is no longer slowed, and one that walks in is slowed on the next scan', () => {
    const t = field();
    const a = t.add(foe('a', 0, -3));
    t.f.cast();
    a.x = 9;
    t.advance(0.55);
    expect(t.slows).toHaveLength(1);
    a.x = 0;
    t.advance(0.5);
    expect(t.slows).toHaveLength(2);
  });

  it('never makes a damage request: its ports have no damage at all, and the slow is the only write', () => {
    const t = field();
    t.add(foe('a', 0, -3));
    t.f.cast();
    t.advance(3);
    expect(new Set(t.slows.map((s) => s.spec.kind))).toEqual(new Set(['slow']));
  });

  it('shows a dust puff only when a foe is newly slowed, not on every scan', () => {
    const t = field();
    const a = t.add(foe('a', 0, -3));
    t.f.cast();
    const dust = () => t.w.effects.filter((e) => e.params.dust === 1);
    expect(dust()).toHaveLength(1);
    t.advance(2.1);
    expect(dust()).toHaveLength(1);
    a.x = 20;
    t.advance(0.55);
    a.x = 0;
    t.advance(0.55);
    expect(dust()).toHaveLength(2);
  });

  it('one field at a time: a recast stops the old effect and moves the field', () => {
    const t = field();
    t.f.cast();
    expect(t.f.centre).toMatchObject({ z: -3 });
    t.w.yaw = Math.PI;
    t.advance(2);
    t.f.cast();
    expect(t.w.stops).toBe(1);
    expect(t.f.centre!.z).toBeCloseTo(3);
    expect(t.w.effects.filter((e) => e.params.seconds === 10)).toHaveLength(2);
    // The new field lasts a full 10 s from its own cast, and the old position is slowed no more.
    t.add(foe('old', 0, -3));
    t.advance(0.55);
    expect(t.slows.filter((s) => s.id === 'old')).toEqual([]);
    t.advance(9);
    expect(t.f.active).toBe(true);
    t.advance(1);
    expect(t.f.active).toBe(false);
  });

  it('refuses another class, not learned, dead, staggered and busy; nothing is spawned', () => {
    const cases: Array<[Parameters<typeof world>[0], string]> = [
      [{ pathfinder: false }, 'class'],
      [{ learned: false }, 'not-learned'],
      [{ blocked: 'dead' }, 'dead'],
      [{ blocked: 'staggered' }, 'staggered'],
      [{ blocked: 'busy' }, 'busy'],
    ];
    for (const [over, reason] of cases) {
      const t = field(over);
      t.add(foe('a', 0, -3));
      expect(t.f.cast()).toEqual({ ok: false, reason });
      expect(t.f.active).toBe(false);
      expect(t.slows).toEqual([]);
      expect(t.w.effects).toEqual([]);
    }
  });

  it('ends when the class is lost, the skill is unlearned or the player dies, and on end() (load, class change, dispose)', () => {
    for (const mutate of [
      (t: ReturnType<typeof field>) => (t.w.pathfinder = false),
      (t: ReturnType<typeof field>) => (t.w.learned = false),
      (t: ReturnType<typeof field>) => (t.w.blocked = 'dead'),
    ]) {
      const t = field();
      t.f.cast();
      mutate(t);
      t.advance(0.05);
      expect(t.f.active).toBe(false);
      expect(t.w.stops).toBe(1);
    }
    const t = field();
    t.f.cast();
    t.f.end();
    t.f.end();
    expect(t.f.active).toBe(false);
    expect(t.w.stops).toBe(1);
  });

  it('a status refusal (the foe cannot be slowed) draws no dust and breaks nothing', () => {
    const t = field({}, { slow: () => false });
    t.add(foe('a', 0, -3));
    expect(t.f.cast()).toEqual({ ok: true });
    expect(t.w.effects.filter((e) => e.params.dust === 1)).toEqual([]);
  });
});

// ---- Sure Foot -----------------------------------------------------------------------------------------------------------

describe('Sure Foot', () => {
  const make = (over: Parameters<typeof world>[0] = {}, s: { moving?: boolean; mode?: string } = {}) => {
    const { w, base } = world(over);
    const state = { moving: s.moving ?? true, mode: s.mode ?? 'walk' };
    const sure = new SureFoot({ ...base, moving: () => state.moving, mode: () => state.mode });
    return { w, state, sure };
  };

  it('cancels the knockback (false) for a learned Pathfinder moving on foot, with a grip spark and a trigger', () => {
    const t = make();
    expect(t.sure.keep()).toBe(false);
    expect(t.w.effects).toHaveLength(1);
    expect(t.w.effects[0]).toMatchObject({ id: 'sure-foot' });
    expect(t.w.triggers).toEqual([PF.skillIds.sureFoot]);
  });

  it('keeps the knockback standing still, in dive, ferry, haul and glide, unlearned, in another class and with no class', () => {
    const cases: Array<[Parameters<typeof world>[0], { moving?: boolean; mode?: string }]> = [
      [{}, { moving: false }],
      [{}, { mode: 'dive' }],
      [{}, { mode: 'ferry' }],
      [{}, { mode: 'haul' }],
      [{}, { mode: 'glide' }],
      [{ learned: false }, {}],
      [{ pathfinder: false }, {}],
    ];
    for (const [over, s] of cases) {
      const t = make(over, s);
      expect(t.sure.keep(), JSON.stringify([over, s])).toBe(true);
      expect(t.w.effects).toEqual([]);
    }
  });

  it('follows the state live: still then moving then still', () => {
    const t = make({}, { moving: false });
    expect([t.sure.keep(), (t.state.moving = true) && t.sure.keep(), (t.state.moving = false) || t.sure.keep()]).toEqual([true, false, true]);
  });
});
