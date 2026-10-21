import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFoxService, type FoxHandle } from './foxService';
import { createHerdService, type HerdHost } from './herdService';
import type { HerdEnv, SheepView } from '../sheep/Herd';
import { SettledForms, type SettledBuilders, type SettledKind } from './settled';
import { DRAUGHT, DraughtThrow, type DraughtTarget, type LandResult, type ThrowDeps, type Vec3 } from './throw';
import plugin from './ground.plugin';
import { FoxGuide } from '../fox/guide';

// ---------------------------------------------------------------- fox service
describe('createFoxService', () => {
  const anchors: Record<string, { x: number; z: number }> = { a: { x: 10, z: 0 }, b: { x: 20, z: 0 } };
  const mk = (list: FoxHandle[]) => {
    const arrived = vi.fn();
    const svc = createFoxService({ foxes: () => list, anchor: (id) => anchors[id], arrived });
    return { svc, arrived };
  };

  it('guide() is false for an unknown spawner, unknown anchor and empty list', () => {
    const fox = new FoxGuide({ x: 0, z: 0 });
    const { svc } = mk([{ id: 'f1', spawnerId: 'sp', fox }]);
    expect(svc.guide('nope', ['a'])).toBe(false);
    expect(svc.guide('sp', ['a', 'missing'])).toBe(false);
    expect(svc.guide('sp', [])).toBe(false);
    expect(fox.state).toBe('idle');
  });

  it('guide() is false for a spawner whose fox is gone (null guide)', () => {
    const { svc } = mk([{ id: 'f1', spawnerId: 'sp', fox: null }]);
    expect(svc.guide('sp', ['a'])).toBe(false);
  });

  it('arrived callback gets (foxId, stop); release returns to idle', () => {
    const fox = new FoxGuide({ x: 0, z: 0 });
    const { svc, arrived } = mk([{ id: 'f1', spawnerId: 'sp', fox }]);
    expect(svc.guide('sp', ['a', 'b'])).toBe(true);
    expect(fox.state).toBe('leading');
    fox.step(0.1, { x: 10, z: 0 }, { x: 10, z: 0 }, 3);
    expect(arrived).toHaveBeenCalledWith('f1', 0);
    svc.release('sp');
    expect(fox.state).toBe('idle');
    svc.release('unknown');
  });
});

// --------------------------------------------------------------- herd service
function fakeEnv() {
  const views: Array<{ disposed: number }> = [];
  const env: HerdEnv = {
    player: () => ({ x: 0, z: 0 }),
    rng: () => 0.5,
    makeView: (): SheepView => {
      const v = { disposed: 0 };
      views.push(v);
      return { place() {}, setSpeed() {}, update() {}, dispose: () => v.disposed++ };
    },
  };
  return { env, views };
}

describe('createHerdService', () => {
  const pts: Record<string, { x: number; z: number }> = { a: { x: 0, z: 0 }, b: { x: 3, z: 0 }, home: { x: 0, z: 0 }, fog: { x: 100, z: 0 } };
  const mk = () => {
    const { env, views } = fakeEnv();
    const host: HerdHost = { anchor: (id) => pts[id], env: () => env, joined: vi.fn(), scattered: vi.fn() };
    return { svc: createHerdService(host), views, host };
  };

  it('start() is false with an unknown anchor, an unknown fog anchor or an empty list, and makes no views', () => {
    const { svc, views } = mk();
    expect(svc.start('h', [])).toBe(false);
    expect(svc.start('h', ['a', 'zzz'])).toBe(false);
    expect(svc.start('h', ['a'], { fogAnchors: ['zzz'] })).toBe(false);
    expect(views).toHaveLength(0);
    expect(svc.follow('h', true)).toBe(false);
  });

  it('a failed start does not remove an existing herd of the same id', () => {
    const { svc, views } = mk();
    expect(svc.start('h', ['a'])).toBe(true);
    expect(svc.start('h', ['zzz'])).toBe(false);
    expect(views[0]!.disposed).toBe(0);
    expect(svc.count('h', 'home')).toBe(1);
  });

  it('start replaces an existing herd id and disposes the old views', () => {
    const { svc, views } = mk();
    svc.start('h', ['a', 'b']);
    expect(views).toHaveLength(2);
    expect(svc.start('h', ['a'])).toBe(true);
    expect(views.slice(0, 2).map((v) => v.disposed)).toEqual([1, 1]);
    expect(views[2]!.disposed).toBe(0);
    expect(svc.count('h', 'home', 10)).toBe(1);
  });

  it('follow/count/stop on unknown ids are safe', () => {
    const { svc } = mk();
    expect(svc.follow('nope', true)).toBe(false);
    expect(svc.count('nope', 'home')).toBe(0);
    svc.start('h', ['a']);
    expect(svc.count('h', 'unknown-anchor')).toBe(0);
    expect(() => svc.stop('nope')).not.toThrow();
    expect(() => svc.step(0.1)).not.toThrow();
  });

  it('follow reports through the host; count uses the default radius 8', () => {
    const { svc, host } = mk();
    svc.start('h', ['a', 'b']);
    expect(svc.follow('h', true)).toBe(true);
    expect(host.joined).toHaveBeenCalledWith('h', 2);
    expect(svc.count('h', 'home')).toBe(2);
    expect(svc.count('h', 'home', 1)).toBe(1);
  });

  it('stop disposes that herd; clear() disposes everything', () => {
    const { svc, views } = mk();
    svc.start('h1', ['a']);
    svc.start('h2', ['a', 'b']);
    svc.stop('h1');
    expect(views[0]!.disposed).toBe(1);
    svc.clear();
    expect(views.map((v) => v.disposed)).toEqual([1, 1, 1]);
    svc.clear();
    expect(views.map((v) => v.disposed)).toEqual([1, 1, 1]);
    expect(svc.follow('h2', true)).toBe(false);
  });
});

// ------------------------------------------------------------- settled forms
describe('SettledForms', () => {
  const mk = () => {
    const scene = new THREE.Group();
    const freed: Array<{ kind: SettledKind; o: THREE.Object3D }> = [];
    const b: SettledBuilders = { build: (kind) => Object.assign(new THREE.Group(), { name: kind }), free: (kind, o) => freed.push({ kind, o }) };
    return { scene, freed, forms: new SettledForms(scene, b) };
  };
  const row = (i = 0, kind: SettledKind = 'cinder-golem') => ({ kind, x: i, y: 1, z: -i, yaw: 0.5 });

  it('add builds, positions and parents the object', () => {
    const { scene, forms } = mk();
    expect(forms.add({ kind: 'slag-crawler', x: 1, y: 2, z: 3, yaw: 0.7 })).toBe(true);
    expect(forms.count).toBe(1);
    const o = scene.children[0]!;
    expect(o.name).toBe('slag-crawler');
    expect(o.position.toArray()).toEqual([1, 2, 3]);
    expect(o.rotation.y).toBeCloseTo(0.7);
  });

  it('rejects a bad kind and non-finite numbers', () => {
    const { scene, forms } = mk();
    expect(forms.add({ ...row(), kind: 'dragon' as never })).toBe(false);
    for (const k of ['x', 'y', 'z', 'yaw'] as const) {
      expect(forms.add({ ...row(), [k]: NaN })).toBe(false);
      expect(forms.add({ ...row(), [k]: Infinity })).toBe(false);
      expect(forms.add({ ...row(), [k]: '1' as never })).toBe(false);
    }
    expect(forms.count).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it('the MAX cap evicts the oldest and frees it', () => {
    const { scene, freed, forms } = mk();
    for (let i = 0; i < SettledForms.MAX; i++) forms.add(row(i));
    expect(forms.count).toBe(SettledForms.MAX);
    const first = scene.children[0]!;
    forms.add(row(999, 'slag-crawler'));
    expect(forms.count).toBe(SettledForms.MAX);
    expect(freed).toHaveLength(1);
    expect(freed[0]!.o).toBe(first);
    expect(freed[0]!.kind).toBe('cinder-golem');
    expect(first.parent).toBeNull();
    expect(scene.children).toHaveLength(SettledForms.MAX);
    expect(forms.serialize()[0]!.x).toBe(1);
    expect(forms.serialize().at(-1)!.x).toBe(999);
  });

  it('serialize/load round-trips positions and kind', () => {
    const a = mk();
    a.forms.add(row(1, 'cinder-golem'));
    a.forms.add(row(2, 'slag-crawler'));
    const data = JSON.parse(JSON.stringify(a.forms.serialize()));
    const b = mk();
    b.forms.add(row(7));
    b.forms.load(data);
    expect(b.forms.serialize()).toEqual(a.forms.serialize());
    expect(b.freed).toHaveLength(1);
    expect(b.scene.children).toHaveLength(2);
  });

  it('serialize returns copies', () => {
    const { forms } = mk();
    forms.add(row(1));
    forms.serialize()[0]!.x = 500;
    expect(forms.serialize()[0]!.x).toBe(1);
  });

  it('load of garbage or a non-array is safe (and clears)', () => {
    const { forms, scene } = mk();
    forms.add(row(1));
    for (const bad of [null, undefined, 5, 'x', { length: 3 }]) {
      expect(() => forms.load(bad)).not.toThrow();
      expect(forms.count).toBe(0);
    }
    forms.load([null, 3, 'x', { kind: 'nope' }, { kind: 'cinder-golem', x: NaN, y: 0, z: 0, yaw: 0 }, row(4)]);
    expect(forms.count).toBe(1);
    expect(scene.children).toHaveLength(1);
  });

  it('clear frees all objects exactly once', () => {
    const { forms, freed, scene } = mk();
    for (let i = 0; i < 5; i++) forms.add(row(i));
    forms.clear();
    forms.clear();
    expect(freed).toHaveLength(5);
    expect(new Set(freed.map((f) => f.o)).size).toBe(5);
    expect(scene.children).toHaveLength(0);
    expect(forms.count).toBe(0);
  });
});

// ------------------------------------------------------------------ throwing
describe('DraughtThrow', () => {
  const origin: Vec3 = { x: 0, y: 1.4, z: 0 };
  const tgt = (id: string, x: number, z: number): DraughtTarget & { feet: Vec3 } => ({ id, feet: { x, y: 0, z } });
  function mk(over: Partial<{ unlocked: boolean; count: number; targets: DraughtTarget[]; land: LandResult }> = {}) {
    const st = { unlocked: true, count: 2, targets: [tgt('c1', 5, 0)] as DraughtTarget[], land: 'calmed' as LandResult, ...over };
    const calls = {
      consume: vi.fn(() => {
        if (st.count <= 0) return false;
        st.count--;
        return true;
      }),
      land: vi.fn((_at: Vec3, _within: readonly DraughtTarget[]) => st.land),
      fly: vi.fn(),
      done: vi.fn(),
    };
    const deps: ThrowDeps = {
      unlocked: () => st.unlocked,
      count: () => st.count,
      consume: calls.consume,
      targets: () => st.targets,
      origin: (out) => Object.assign(out, origin),
      land: calls.land,
      fly: calls.fly,
      done: calls.done,
    };
    return { st, calls, th: new DraughtThrow(deps) };
  }
  const P: Vec3 = { x: 0, y: 0, z: 0 };

  it('can() is false when Calm is locked, no draught, airborne, or no target in range', () => {
    expect(mk().th.can(P)).toBe(true);
    expect(mk({ unlocked: false }).th.can(P)).toBe(false);
    expect(mk({ count: 0 }).th.can(P)).toBe(false);
    expect(mk({ targets: [] }).th.can(P)).toBe(false);
    expect(mk({ targets: [tgt('far', DRAUGHT.range + 0.5, 0)] }).th.can(P)).toBe(false);
    expect(mk({ targets: [tgt('edge', DRAUGHT.range, 0)] }).th.can(P)).toBe(true);
    const m = mk();
    m.th.start(P);
    expect(m.th.can(P)).toBe(false);
  });

  it('start consumes exactly one draught and a second start while airborne is refused', () => {
    const { th, calls, st } = mk();
    expect(th.start(P)).toBe(true);
    expect(th.airborne).toBe(true);
    expect(st.count).toBe(1);
    expect(th.start(P)).toBe(false);
    expect(calls.consume).toHaveBeenCalledTimes(1);
    expect(st.count).toBe(1);
  });

  it('a refused start (cannot) consumes nothing; a consume that fails leaves it grounded', () => {
    const a = mk({ unlocked: false });
    expect(a.th.start(P)).toBe(false);
    expect(a.calls.consume).not.toHaveBeenCalled();
    const b = mk();
    b.calls.consume.mockReturnValueOnce(false);
    expect(b.th.start(P)).toBe(false);
    expect(b.th.airborne).toBe(false);
  });

  it('picks the nearest target in range', () => {
    const { th } = mk({ targets: [tgt('far', 8, 0), tgt('near', 3, 0), tgt('mid', 5, 0)] });
    expect(th.pick(P)!.id).toBe('near');
  });

  it('the flight takes DRAUGHT.flight seconds, with an arc above the line', () => {
    const { th, calls } = mk();
    th.start(P);
    th.update(DRAUGHT.flight / 2);
    expect(th.airborne).toBe(true);
    expect(calls.land).not.toHaveBeenCalled();
    const mid = calls.fly.mock.calls.at(-1)![0] as Vec3;
    expect(mid.x).toBeCloseTo(2.5);
    expect(mid.y).toBeGreaterThan(0.7 + DRAUGHT.arc * 0.9);
    th.update(DRAUGHT.flight / 2);
    expect(th.airborne).toBe(false);
    expect(calls.land).toHaveBeenCalledTimes(1);
    expect(calls.fly.mock.calls.at(-1)).toEqual([null]);
    th.update(1);
    expect(calls.land).toHaveBeenCalledTimes(1);
  });

  it('landing within landRadius of the throw-time target position calls land with that target in `within`', () => {
    const t = tgt('c1', 5, 0);
    const { th, calls, st } = mk({ targets: [t] });
    th.start(P);
    // Wanders a little (inside the land radius) during the flight.
    t.feet.x = 5 + DRAUGHT.landRadius - 0.1;
    th.update(DRAUGHT.flight);
    const [at, within] = calls.land.mock.calls[0]!;
    expect(at).toMatchObject({ x: 5, z: 0 });
    expect(within.map((w) => w.id)).toEqual(['c1']);
    expect(calls.done).toHaveBeenCalledWith('calmed', expect.objectContaining({ x: 5 }));
    expect(st.count).toBe(1);
  });

  it('a target that moved more than landRadius away gives empty `within` and result miss', () => {
    const t = tgt('c1', 5, 0);
    const { th, calls } = mk({ targets: [t], land: 'miss' });
    th.start(P);
    t.feet.x = 5 + DRAUGHT.landRadius + 0.5;
    th.update(DRAUGHT.flight);
    expect(calls.land.mock.calls[0]![1]).toEqual([]);
    expect(calls.done).toHaveBeenCalledWith('miss', expect.anything());
  });

  it('a wrong target (other crawler beyond 2 m) is not affected', () => {
    const near = tgt('near', 5, 0);
    const other = tgt('other', 5, 2.5);
    const { th, calls } = mk({ targets: [near, other] });
    th.start(P);
    th.update(DRAUGHT.flight);
    const within = calls.land.mock.calls[0]![1];
    expect(within.map((w) => w.id)).toEqual(['near']);
  });

  it('clear() drops the flask without refund and calls fly(null)', () => {
    const { th, calls, st } = mk();
    th.start(P);
    calls.fly.mockClear();
    th.clear();
    expect(th.airborne).toBe(false);
    expect(calls.fly).toHaveBeenCalledWith(null);
    expect(st.count).toBe(1);
    th.update(5);
    expect(calls.land).not.toHaveBeenCalled();
    expect(calls.done).not.toHaveBeenCalled();
    // clear when idle does not call fly
    calls.fly.mockClear();
    th.clear();
    expect(calls.fly).not.toHaveBeenCalled();
  });

  it('result is reported via done() for cooled results too', () => {
    const { th, calls } = mk({ land: 'cooled' });
    th.start(P);
    th.update(1);
    expect(calls.done).toHaveBeenCalledTimes(1);
    expect(calls.done.mock.calls[0]![0]).toBe('cooled');
  });
});

// -------------------------------------------------------------------- plugin
describe('ground plugin (fake ctx)', () => {
  afterEach(() => plugin.dispose?.());

  function boot() {
    const listeners = new Map<string, Array<(p: any) => void>>();
    const emitted: Array<{ type: string; payload: any }> = [];
    const provided: Record<string, unknown> = {};
    const persisted: Array<{ key: string; version: number; serialize(): unknown; load(d: unknown): void }> = [];
    const scene = new THREE.Group();
    const actors = new Map<string, { id: string; feet: THREE.Vector3; facing: number; def: { kind: string }; active: boolean }>();
    const enemies = {
      ground: { get: (id: string) => actors.get(id), all: () => [...actors.values()], calmByThrow: () => false },
      mercyUnlocked: () => true,
    };
    const ctx = {
      services: {
        get: (n: string) => (n === 'enemies' ? enemies : undefined),
        provide: (n: string, v: unknown) => void (provided[n] = v),
      },
      strings: { register: vi.fn() },
      events: {
        on: (type: string, fn: (p: any) => void) => {
          listeners.set(type, [...(listeners.get(type) ?? []), fn]);
          return () => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
        },
        emit: (type: string, payload: any) => {
          emitted.push({ type, payload });
          for (const fn of listeners.get(type) ?? []) fn(payload);
        },
      },
      anchors: { find: () => undefined },
      interaction: { register: vi.fn(() => () => {}) },
      persist: { register: (p: any) => void persisted.push(p) },
      state: { getBool: () => false, setFlag: () => {} },
      player: { feet: new THREE.Vector3(), actor: { id: 'player' } },
      scene,
      systems: { add: vi.fn(() => () => {}) },
    };
    void plugin.setup(ctx as never);
    const of = (t: string) => emitted.filter((e) => e.type === t).map((e) => e.payload);
    return { ctx, provided, persisted, actors, scene, of };
  }

  it('provides cooling, foxes and herd, registers the enemies.ground persistable and the system', () => {
    const t = boot();
    expect(Object.keys(t.provided).sort()).toEqual(['cooling', 'foxes', 'herd']);
    expect(t.persisted.map((p) => [p.key, p.version])).toEqual([['enemies.ground', 1]]);
    expect(t.ctx.systems.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'enemies.ground' }));
    expect(t.ctx.interaction.register).toHaveBeenCalledTimes(2);
  });

  it('does nothing without the enemies service', () => {
    const ctx = { services: { get: () => undefined, provide: vi.fn() } };
    expect(() => void plugin.setup(ctx as never)).not.toThrow();
    expect(ctx.services.provide).not.toHaveBeenCalled();
  });

  it('emits hunter.spared once per actorId', () => {
    const t = boot();
    const ev = { verb: 'spare', tier: 'normal', track: null, creature: 'hunter-spearman', actorId: 'h1' };
    t.ctx.events.emit('mercy', ev);
    t.ctx.events.emit('mercy', ev);
    expect(t.of('hunter.spared')).toEqual([{ actorId: 'h1', kind: 'hunter-spearman' }]);
    t.ctx.events.emit('mercy', { ...ev, creature: 'hunter-harpooner', actorId: 'h2' });
    expect(t.of('hunter.spared')).toHaveLength(2);
    // not a hunter, or no actor: nothing
    t.ctx.events.emit('mercy', { ...ev, creature: 'wolf', actorId: 'h3' });
    t.ctx.events.emit('mercy', { ...ev, actorId: undefined });
    expect(t.of('hunter.spared')).toHaveLength(2);
    // a save load forgets who was seen
    t.ctx.events.emit('save.loaded', {});
    t.ctx.events.emit('mercy', ev);
    expect(t.of('hunter.spared')).toHaveLength(3);
  });

  it('adds a settled form on a calm mercy event of a known cinder-golem, and persists it', () => {
    const t = boot();
    t.actors.set('g1', { id: 'g1', feet: new THREE.Vector3(3, 4, 5), facing: 1.25, def: { kind: 'cinder-golem' }, active: true });
    const calm = { verb: 'calm', tier: 'normal', track: null, creature: 'cinder-golem', actorId: 'g1' };
    t.ctx.events.emit('mercy', calm);
    expect(t.persisted[0]!.serialize()).toEqual([{ kind: 'cinder-golem', x: 3, y: 4, z: 5, yaw: 1.25 }]);
    expect(t.scene.children.length).toBeGreaterThan(0);
    // unknown actor, wrong verb, wrong creature: no new form
    t.ctx.events.emit('mercy', { ...calm, actorId: 'ghost' });
    t.ctx.events.emit('mercy', { ...calm, verb: 'spare' });
    t.ctx.events.emit('mercy', { ...calm, creature: 'wolf' });
    expect(t.persisted[0]!.serialize()).toHaveLength(1);
    // load round-trip then plugin dispose frees the scene
    const saved = t.persisted[0]!.serialize();
    t.persisted[0]!.load([]);
    expect(t.persisted[0]!.serialize()).toEqual([]);
    t.persisted[0]!.load(saved);
    expect(t.persisted[0]!.serialize()).toEqual(saved);
    plugin.dispose?.();
    expect(t.scene.children).toHaveLength(0);
  });
});
