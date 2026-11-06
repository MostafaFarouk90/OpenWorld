import { describe, expect, it } from 'vitest';
import { MovementModes } from '../movement/MovementModes';
import { MOVEMENT_MODE_RULES } from '../movement/types';
import { MoveModifiers } from '../core/MoveModifiers';
import { phaseAt } from './clock';
import { WeatherRuntime, STORM_TOAST_KEYS, type WeatherPorts } from './WeatherRuntime';

const DT = 1 / 60;
const ROPE = { id: 'rope.a', points: [{ x: 10000, z: 4600 }, { x: 10000, z: 5500 }] };
const SHELTERS = [
  { id: 'waste.shelter.1', at: { x: 10000, z: 4700 }, radius: 6 },
  { id: 'waste.shelter.2', at: { x: 10000, z: 5150 }, radius: 6 },
];
const WASTE = { x0: 7000, z0: 4500, x1: 15000, z1: 11000 };

function rig(opts: { seed?: number } = {}) {
  const s = {
    pos: { x: 10000, y: 120, z: 4800, yaw: 0 },
    indoors: false,
    dialogue: false,
    gameplay: true,
    health: 1000,
    max: 1000,
    dead: false,
    events: [] as { name: string; payload: unknown }[],
    toasts: [] as string[],
    warns: [] as string[],
    /** Extra damage multiplier, as an incoming modifier would apply. */
    amplify: 1,
  };
  const modes = new MovementModes({ emit: () => {}, warn: (m) => s.warns.push(m) });
  const mods = new MoveModifiers();
  const ports: WeatherPorts = {
    player: () => s.pos,
    indoors: () => s.indoors,
    stormRegion: (x, z) => x >= WASTE.x0 && x < WASTE.x1 && z >= WASTE.z0 && z < WASTE.z1,
    dialogue: () => s.dialogue,
    gameplay: () => s.gameplay,
    vitals: () => ({ health: s.health, max: s.max, dead: s.dead }),
    damage: (a) => {
      s.health = Math.max(0, s.health - a * s.amplify);
    },
    heal: (a) => {
      s.health = Math.min(s.max, s.health + a);
    },
    emit: ((name: string, payload: unknown) => s.events.push({ name, payload })) as WeatherPorts['emit'],
    toast: (k) => s.toasts.push(k),
    pushMode: (m, sp) => modes.push(m, sp),
    addMoveModifier: (src, m) => mods.add(src, m),
    groundAt: () => 100,
    warn: (m) => s.warns.push(m),
  };
  const w = new WeatherRuntime(ports, { ropes: [ROPE], shelters: SHELTERS }, opts.seed ?? 4042);
  const run = (seconds: number) => {
    for (let i = 0, n = Math.round(seconds / DT); i < n; i++) w.update(DT);
  };
  const toStorm = () => {
    const c = phaseAt(w.clock.seed, w.clockTime);
    const warnEnd = c.kind === 'clear' ? phaseAt(w.clock.seed, c.endsAt).endsAt : c.endsAt;
    run(warnEnd - w.clockTime + 0.1);
  };
  return { s, w, modes, mods, run, toStorm, names: () => s.events.map((e) => e.name) };
}

describe('weather runtime: clock and region scope', () => {
  it('runs clear, warning, storm in the Waste, with events and the warning toast', () => {
    const r = rig();
    r.run(1);
    expect(r.w.state().kind).toBe('clear');
    r.toStorm();
    expect(r.w.state().kind).toBe('storm');
    const kinds = r.s.events.filter((e) => e.name === 'weather.changed').map((e) => (e.payload as { kind: string }).kind);
    expect(kinds).toEqual(['warning', 'storm']);
    expect(r.s.toasts).toContain(STORM_TOAST_KEYS.warning);
  });

  it('is clear outside the Waste and indoors while the clock is in a storm phase, and the clock stops there', () => {
    const r = rig();
    r.toStorm();
    r.s.pos = { x: 8500, y: 50, z: 2000, yaw: 0 }; // Harrowmark
    r.run(0.1);
    expect(r.w.state().kind).toBe('clear');
    const t = r.w.clockTime;
    r.run(30);
    expect(r.w.clockTime).toBe(t);
    expect(r.modes.current).toBe('walk');
    r.s.pos = { x: 10000, y: 120, z: 4800, yaw: 0 };
    r.s.indoors = true;
    r.run(1);
    expect(r.w.state().kind).toBe('clear');
    r.s.indoors = false;
    r.run(0.1);
    expect(r.w.state().kind).toBe('storm');
  });

  it('gives the next change in seconds from now', () => {
    const r = rig();
    r.run(10);
    const n = r.w.clock.next();
    expect(n.kind).toBe('warning');
    expect(n.at).toBeCloseTo(phaseAt(4042, 0).endsAt - r.w.clockTime, 6);
  });
});

describe('weather runtime: precedence', () => {
  it('a forced storm skips the warning; its release returns to the clock', () => {
    const r = rig();
    const off = r.w.forceStorm('m42.crossing');
    r.run(0.1);
    expect(r.w.state()).toMatchObject({ kind: 'storm', forced: true });
    expect(r.s.events.some((e) => e.name === 'weather.changed' && (e.payload as { kind: string }).kind === 'warning')).toBe(false);
    off();
    r.run(0.1);
    expect(r.w.state().kind).toBe('clear');
  });

  it('a hold beats a forced storm and the clock; two forces release in either order', () => {
    const r = rig();
    const a = r.w.forceStorm('a');
    const b = r.w.forceStorm('b');
    const hold = r.w.holdClear('boss:eormen');
    r.run(0.1);
    expect(r.w.state()).toMatchObject({ kind: 'clear', held: true, forced: true });
    hold();
    r.run(0.1);
    expect(r.w.state().kind).toBe('storm');
    b();
    r.run(0.1);
    expect(r.w.state().kind).toBe('storm');
    a();
    a(); // idempotent
    r.run(0.1);
    expect(r.w.state().kind).toBe('clear');
  });

  it('counts duplicate reasons', () => {
    const r = rig();
    const a = r.w.forceStorm('same');
    const b = r.w.forceStorm('same');
    a();
    r.run(0.1);
    expect(r.w.state().kind).toBe('storm');
    b();
    r.run(0.1);
    expect(r.w.state().kind).toBe('clear');
  });

  it('a hold clears a running storm and the clock storm returns after it', () => {
    const r = rig();
    r.toStorm();
    const hold = r.w.holdClear('scene:test');
    r.run(0.1);
    expect(r.w.state().kind).toBe('clear');
    expect(r.modes.current).toBe('walk');
    hold();
    r.run(0.1);
    expect(r.w.state().kind).toBe('storm');
  });

  it('a dialogue never lets a storm begin, but a forced storm and a running storm carry on', () => {
    const r = rig();
    r.s.dialogue = true;
    r.run(400);
    expect(r.w.state().kind).not.toBe('storm');
    r.s.dialogue = false;
    r.toStorm();
    r.s.dialogue = true;
    r.run(5);
    expect(r.w.state().kind).toBe('storm');
    r.s.dialogue = false;
    const r2 = rig();
    r2.s.dialogue = true;
    const off = r2.w.forceStorm('m42');
    r2.run(1);
    expect(r2.w.state().kind).toBe('storm');
    off();
  });
});

describe('weather runtime: exposure', () => {
  it('ticks 2% per 3 s off the rope, toasts once a storm, and emits seconds', () => {
    const r = rig();
    r.toStorm();
    r.s.pos = { x: 10050, y: 120, z: 4800, yaw: 0 };
    r.run(9.05);
    expect(r.s.health).toBeCloseTo(940, 6);
    expect(r.s.toasts.filter((t) => t === STORM_TOAST_KEYS.exposed)).toHaveLength(1);
    const secs = r.s.events.filter((e) => e.name === 'storm.exposed').map((e) => (e.payload as { seconds: number }).seconds);
    expect(secs).toHaveLength(3);
    expect(secs[2]).toBeGreaterThan(secs[0]);
  });

  it('never takes health below 10%, even with an amplifying modifier', () => {
    const r = rig();
    r.s.amplify = 3;
    r.s.health = 115;
    r.w.forceStorm('t');
    r.s.pos = { x: 10050, y: 120, z: 4800, yaw: 0 };
    r.run(600);
    expect(r.s.health).toBeCloseTo(100, 6);
    expect(r.s.warns.some((w) => w.includes('floor'))).toBe(true);
  });

  it('does not heal a player already under the floor', () => {
    const r = rig();
    r.s.health = 50;
    r.w.forceStorm('t');
    r.s.pos = { x: 10050, y: 120, z: 4800, yaw: 0 };
    r.run(10);
    expect(r.s.health).toBe(50);
  });

  it('is safe on the rope, in a shelter, in a dialogue, dead or indoors', () => {
    const r = rig();
    r.w.forceStorm('t');
    r.run(10); // on the rope at (10000, 4800)
    expect(r.s.health).toBe(1000);
    r.s.pos = { x: 10004, y: 120, z: 5150, yaw: 0 }; // shelter 2, 4 m off the rope's line... still within radius
    r.s.pos = { x: 10005, y: 120, z: 5150, yaw: 0 };
    r.run(10);
    expect(r.s.health).toBe(1000);
    r.s.pos = { x: 10050, y: 120, z: 4800, yaw: 0 };
    r.s.gameplay = false;
    r.run(10);
    expect(r.s.health).toBe(1000);
    r.s.gameplay = true;
    r.s.dead = true;
    r.run(10);
    expect(r.s.health).toBe(1000);
    r.s.dead = false;
    r.s.indoors = true;
    r.run(10);
    expect(r.s.health).toBe(1000);
  });

  it('does not tick in the warning or outside the Waste', () => {
    const r = rig();
    r.s.pos = { x: 10050, y: 120, z: 4800, yaw: 0 };
    const c = phaseAt(4042, 0);
    r.run(c.endsAt + 10);
    expect(r.w.state().kind).toBe('warning');
    expect(r.s.health).toBe(1000);
  });

  it('toasts again in the next storm', () => {
    const r = rig();
    r.s.pos = { x: 10050, y: 120, z: 4800, yaw: 0 };
    r.toStorm();
    r.run(4);
    r.run(200); // through the storm into the next clear
    r.s.health = 1000;
    r.toStorm();
    r.run(4);
    expect(r.s.toasts.filter((t) => t === STORM_TOAST_KEYS.exposed)).toHaveLength(2);
  });
});

describe('weather runtime: storm mode and speed (the movement row)', () => {
  it('pushes storm with the rules of the row and slows walking to 3 m/s with no sprint', () => {
    const r = rig();
    r.toStorm();
    expect(r.modes.current).toBe('storm');
    expect(r.modes.rule()).toEqual(MOVEMENT_MODE_RULES.storm);
    expect(r.modes.rule()).toMatchObject({ fastTravel: 'refused', mount: 'refused', companions: 'follow', save: 'safePoint' });
    const st = r.mods.state();
    expect(4.5 * st.speedScale).toBeCloseTo(3, 9);
    expect(st.noSprint).toBe(true);
    r.run(200);
    expect(r.w.state().kind).toBe('clear');
    expect(r.modes.current).toBe('walk');
    expect(r.mods.state()).toMatchObject({ speedScale: 1 });
  });

  it('saves the live position on the rope, the last shelter passed off it, else the nearest rope point', () => {
    const r = rig();
    r.s.pos = { x: 10050, y: 120, z: 4800, yaw: 0 }; // off the rope, no shelter passed yet
    r.w.forceStorm('t');
    r.run(0.1);
    expect(r.modes.safePoint?.position).toEqual({ x: 10000, y: 100.05, z: 4800 });
    r.s.pos = { x: 10000, y: 120, z: 4700, yaw: 0 };
    r.run(0.1); // shelter 1
    r.s.pos = { x: 10000, y: 120, z: 4900, yaw: 1 };
    r.run(0.1);
    expect(r.modes.safePoint?.position).toEqual({ x: 10000, y: 120, z: 4900 }); // on the rope: the live position
    r.s.pos = { x: 10060, y: 120, z: 4950, yaw: 1 };
    expect(r.modes.safePoint?.position).toEqual({ x: 10000, y: 100.05, z: 4700 });
  });

  it('a storm under an escort saves the junction; release order does not matter', () => {
    const r = rig();
    r.w.forceStorm('t');
    r.run(0.1);
    const junction = { position: { x: 1, y: 2, z: 3 }, yaw: 0 };
    const off = r.modes.push('escort', junction);
    expect(r.modes.current).toBe('escort');
    expect(r.modes.safePoint?.position).toEqual(junction.position);
    off();
    expect(r.modes.current).toBe('storm');
  });

  it('saves and loads the clock, seed and last shelter; a load mid-storm resumes it', () => {
    const r = rig();
    r.s.pos = { x: 10000, y: 120, z: 5150, yaw: 0 };
    r.run(0.1);
    r.toStorm();
    const saved = r.w.serialize();
    expect(saved).toMatchObject({ seed: 4042, lastShelterId: 'waste.shelter.2' });
    const r2 = rig();
    r2.w.load(JSON.parse(JSON.stringify(saved)));
    r2.s.pos = { x: 10000, y: 100.05, z: 5150, yaw: 0 };
    r2.run(0.1);
    expect(r2.w.state().kind).toBe('storm');
    expect(r2.modes.current).toBe('storm');
    expect(r2.w.lastShelter).toBe('waste.shelter.2');
  });

  it('loads defaults from an absent or broken entry', () => {
    const r = rig();
    r.w.load(null);
    expect(r.w.serialize()).toEqual({ seed: 4042, t: 0, lastShelterId: null });
    r.w.load({ seed: 'x', t: Number.NaN, lastShelterId: 'gone' });
    expect(r.w.serialize()).toEqual({ seed: 4042, t: 0, lastShelterId: null });
  });

  it('fires shelter events with hysteresis and onShelter', () => {
    const r = rig();
    r.s.pos = { x: 10000, y: 120, z: 4700, yaw: 0 };
    r.run(0.1);
    expect(r.w.onShelter('waste.shelter.1')).toBe(true);
    r.s.pos = { x: 10000, y: 120, z: 4706.5, yaw: 0 };
    r.run(0.1);
    expect(r.w.onShelter('waste.shelter.1')).toBe(true);
    r.s.pos = { x: 10000, y: 120, z: 4720, yaw: 0 };
    r.run(0.1);
    expect(r.names().filter((n) => n.startsWith('shelter.'))).toEqual(['shelter.entered', 'shelter.left']);
  });

  it('dispose releases the mode and the speed', () => {
    const r = rig();
    r.toStorm();
    r.w.dispose();
    expect(r.modes.current).toBe('walk');
    expect(r.mods.size).toBe(0);
  });
});
