// Test fakes for the Emberwright (not exported from the plugin).
import type { StatusSpec } from '../../actors/status';
import type { DamageResultLike, Vec3 } from '../../vfx/ports';
import { FakeActor, makeWorld, type World } from '../../spells/testHost';
import { vec, type EmberwrightHost } from './ports';
import { EmberwrightRuntime } from './runtime';
import { SKILL } from './skills';

export const DT = 1 / 60;

export interface Rig {
  w: World;
  host: EmberwrightHost;
  rt: EmberwrightRuntime;
  learned: Set<string>;
  state: { classId: string | null; avatarClass: string | null; lockOn: string | null; walls: boolean; yielding: Set<string>; stunned: boolean; wallZ: number | null };
  ember: { value: number; max: number };
  statusCalls: Array<{ id: string; spec: StatusSpec }>;
  pushes: Array<{ id: string; dir: Vec3; metres: number }>;
  cools: Array<{ at: Vec3; radius: number }>;
  fx: Array<{ id: string; at: Vec3 }>;
  fizzles: number;
  /** What damage.apply answers; default a plain hit. */
  result: Partial<DamageResultLike>;
  hostile(id: string, x: number, z: number): FakeActor;
  step(seconds: number): void;
  /** Opens the attack window of the clip (the core's event). */
  window(clip: string, swingId?: number): void;
  applied(): typeof w.damage.applied;
}
let w: World;

export function makeRig(opts: { learned?: string[] } = {}): Rig {
  w = makeWorld();
  const learned = new Set(opts.learned ?? []);
  const state: Rig['state'] = { classId: 'emberwright', avatarClass: 'emberwright', lockOn: null, walls: false, yielding: new Set(), stunned: false, wallZ: null };
  const ember = { value: 100, max: 100 };
  const rig = { w, learned, state, ember, statusCalls: [], pushes: [], cools: [], fx: [], fizzles: 0, result: {} } as unknown as Rig;
  const damage = w.damage;
  const base = damage.apply.bind(damage);
  damage.apply = (req) => {
    base(req);
    return { outcome: 'hit', killed: false, staggered: false, dealt: req.amount, ...rig.result } as DamageResultLike;
  };
  const host: EmberwrightHost = {
    events: w.events, actors: w.actors, player: w.player, damage: damage as never,
    ember: () => ({
      get value() { return ember.value; }, get max() { return ember.max; },
      spend(n) { if (n > ember.value) return false; ember.value -= n; return true; },
      restore(n) { const before = ember.value; ember.value = Math.min(ember.max, ember.value + Math.max(0, n)); return ember.value - before; },
    }),
    status: () => ({
      apply: (id, spec) => { rig.statusCalls.push({ id, spec }); return true; },
      has: (_id, kind) => kind === 'stun' && state.stunned,
    }),
    push: (id, dir, metres) => { rig.pushes.push({ id, dir, metres }); return true; },
    cool: (at, radius) => { rig.cools.push({ at: vec(at), radius }); return 0; },
    learned: (id) => learned.has(id),
    classId: () => state.classId,
    avatarClass: () => state.avatarClass,
    lockOnTarget: () => state.lockOn,
    blocked: () => state.walls,
    rayCast: (o, d, max) => (state.wallZ !== null && d.z > 0 && o.z < state.wallZ && (state.wallZ - o.z) / d.z <= max ? { point: { x: o.x, y: o.y, z: state.wallZ } } : null),
    fx: (id, at) => { rig.fx.push({ id, at: vec(at) }); },
    fizzle: () => { rig.fizzles++; },
    yielding: (id) => state.yielding.has(id),
  };
  rig.host = host;
  rig.rt = new EmberwrightRuntime(host);
  rig.hostile = (id, x, z) => w.actors.add(new FakeActor(id, 'hostile', x, z));
  rig.step = (s) => { for (let i = 0; i < Math.round(s / DT); i++) rig.rt.update(DT); };
  rig.window = (clip, swingId = 1) => w.events.emit('attack.window', { actorId: 'player', attackId: clip, swingId, phase: 'open' });
  rig.applied = () => w.damage.applied;
  return rig;
}

export { SKILL };
