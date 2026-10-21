import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GameEvents, type GameEventMap } from '../../core/events';
import { ESCORT_TUNING, EscortColumn, Route } from './EscortColumn';
import { Escort } from './escort';

const DT = 1 / 60;
/** A straight road north (-Z), 400 m. */
const ROAD = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: -200 },
  { x: 0, y: 0, z: -400 },
];

describe('Route', () => {
  it('projects onto the polyline and places points beside it', () => {
    const r = new Route(ROAD);
    expect(r.length).toBe(400);
    expect(r.project({ x: 3, z: -50 })).toEqual({ s: 50, off: 3 });
    const p = r.at(100, 2);
    expect(p.z).toBeCloseTo(-100);
    expect(Math.abs(p.x)).toBeCloseTo(2);
    // Travel toward -Z is yaw 0.
    expect(p.yaw).toBeCloseTo(0);
    expect(new Route([{ x: 1, y: 0, z: 1 }]).valid).toBe(false);
  });
});

describe('EscortColumn route rule', () => {
  it('leads a little ahead of Cael at his pace and never rides back', () => {
    const c = new EscortColumn(new Route(ROAD), { x: 0, z: 0 });
    expect(c.progress).toBe(ESCORT_TUNING.lead);
    const p = { x: 0, z: 0 };
    for (let i = 0; i < 600; i++) {
      p.z -= 4.5 * DT;
      c.tick(DT, p);
    }
    // 10 s at walking pace: 45 m; Gaut about `lead` ahead.
    expect(c.progress).toBeGreaterThan(45);
    expect(c.progress).toBeLessThanOrEqual(45 + ESCORT_TUNING.lead + 0.01);
    const before = c.progress;
    for (let i = 0; i < 120; i++) {
      p.z += 4.5 * DT;
      c.tick(DT, p);
    }
    expect(c.progress).toBe(before);
  });

  it('waits while Cael is behind him along the road', () => {
    const c = new EscortColumn(new Route(ROAD), { x: 0, z: -50 });
    const at = c.progress;
    // Cael walks back 20 m slowly: Gaut stays put.
    const p = { x: 0, z: -50 };
    for (let i = 0; i < 300; i++) {
      p.z += 4 * DT;
      c.tick(DT, p);
    }
    expect(c.progress).toBe(at);
  });

  it('a jump (fast travel) re-places the column just behind Cael; leaving the road holds it and coming back re-places', () => {
    const c = new EscortColumn(new Route(ROAD), { x: 0, z: 0 });
    c.tick(DT, { x: 0, z: -300 });
    expect(c.progress).toBe(300 - ESCORT_TUNING.lead);
    // Then he rides up past Cael to his lead.
    for (let i = 0; i < 60 * 5; i++) c.tick(DT, { x: 0, z: -300 });
    expect(c.progress).toBeCloseTo(300 + ESCORT_TUNING.lead, 5);
    // Off the road by 60 m (walked out of view): Gaut holds.
    const p = { x: 0, z: -300 };
    for (let i = 0; i < 60 * 30; i++) {
      p.x += 4 * DT;
      c.tick(DT, p);
    }
    expect(c.progress).toBeCloseTo(300 + ESCORT_TUNING.lead, 5);
    // Back on the road further on: the column is by him again.
    for (let i = 0; i < 60 * 30; i++) {
      p.x -= 4 * DT;
      p.z -= 0.5 * DT;
      c.tick(DT, p);
    }
    expect(Math.abs(c.progress - (-p.z + ESCORT_TUNING.lead))).toBeLessThan(1);
  });

  it('keeps up with a galloping Cael (12 m/s)', () => {
    const c = new EscortColumn(new Route(ROAD), { x: 0, z: 0 });
    const p = { x: 0, z: 0 };
    for (let i = 0; i < 60 * 20; i++) {
      p.z -= 12 * DT;
      c.tick(DT, p);
    }
    expect(Math.abs(c.progress - -p.z)).toBeLessThanOrEqual(ESCORT_TUNING.lead + 0.01);
  });

  it('dismounts in 1.5 s and remounts', () => {
    const c = new EscortColumn(new Route(ROAD), { x: 0, z: 0 });
    c.dismount();
    expect(c.phase).toBe('dismounting');
    let done = 0;
    for (let t = 0; t < 2; t += DT) if (c.tick(DT, { x: 0, z: 0 }) === 'dismounted') done++;
    expect(done).toBe(1);
    expect(c.phase).toBe('dismounted');
    c.remount();
    expect(c.phase).toBe('riding');
  });

  it('the riders trail Gaut at 6 and 9 m', () => {
    const c = new EscortColumn(new Route(ROAD), { x: 0, z: -100 });
    const [g, r1, r2] = c.poses();
    expect(r1.z - g.z).toBeCloseTo(6);
    expect(r2.z - g.z).toBeCloseTo(9);
  });
});

function makeEscort() {
  const events = new GameEvents(() => {});
  const scene = new THREE.Group();
  const feet = { x: 0, y: 0, z: 0 };
  const hidden: [string, boolean][] = [];
  const esc = new Escort({
    events,
    scene,
    playerFeet: () => feet,
    groundAt: () => 2,
    setNpcHidden: (id, h) => hidden.push([id, h]),
    horses: () => null,
    npcs: () => null,
  });
  const seen: { type: keyof GameEventMap; payload: any }[] = [];
  events.onAny((t, p) => seen.push({ type: t, payload: p }));
  const of = (t: keyof GameEventMap) => seen.filter((s) => s.type === t).map((s) => s.payload);
  const tick = (s: number) => {
    for (let t = 0; t < s; t += DT) esc.fixedUpdate(DT);
  };
  return { events, scene, feet, hidden, esc, of, tick };
}

describe('Escort service', () => {
  it('starts with Gaut and two riders in the scene, hides the Gaut NPC, refuses a second start', () => {
    const t = makeEscort();
    expect(t.esc.start({ id: 'm11', route: ROAD })).toBe(true);
    expect(t.esc.start({ id: 'm11b', route: ROAD })).toBe(false);
    expect(t.scene.children).toHaveLength(3);
    expect(t.hidden).toEqual([['gaut', true]]);
    expect(t.of('escort.started')).toEqual([{ escortId: 'm11' }]);
    // On the ground the terrain reports.
    expect(t.scene.children[0].position.y).toBe(2);
    t.esc.stop();
  });

  it('refuses a bad route or id', () => {
    const t = makeEscort();
    expect(t.esc.start({ id: 'x', route: [{ x: 0, y: 0, z: 0 }] })).toBe(false);
    expect(t.esc.start({ id: '', route: ROAD })).toBe(false);
    expect(t.esc.start({ id: 'x', route: [{ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] })).toBe(false);
    expect(t.esc.active()).toBeNull();
  });

  it('dismount resolves when they stand; remount seats them again', async () => {
    const t = makeEscort();
    t.esc.start({ id: 'm11', route: ROAD });
    const done = vi.fn();
    void t.esc.dismount().then(done);
    t.tick(1);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    t.tick(0.6);
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    expect(t.of('escort.dismounted')).toEqual([{ escortId: 'm11' }]);
    expect(t.esc.figures().every((f) => !f.isSeated)).toBe(true);
    expect(t.esc.remount()).toBe(true);
    expect(t.esc.figures().every((f) => f.isSeated)).toBe(true);
    expect(t.of('escort.remounted')).toEqual([{ escortId: 'm11' }]);
    expect(t.esc.remount()).toBe(false);
  });

  it('remount is refused mid-dismount, so an awaited dismount always ends with them standing', async () => {
    const t = makeEscort();
    t.esc.start({ id: 'm11', route: ROAD });
    const done = vi.fn();
    void t.esc.dismount().then(done);
    t.tick(0.5);
    expect(t.esc.remount()).toBe(false);
    t.tick(1.1);
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    expect(t.of('escort.dismounted')).toEqual([{ escortId: 'm11' }]);
    expect(t.of('escort.remounted')).toEqual([]);
  });

  it('beginLoad (the companions save entry) stops the old run; a run a load-time gate starts survives save.loaded', () => {
    const t = makeEscort();
    t.esc.start({ id: 'm11', route: ROAD });
    t.esc.beginLoad();
    expect(t.of('escort.stopped')).toEqual([{ escortId: 'm11' }]);
    // A12's gate restarts it while save.loaded is delivered, before the escort's own listener.
    expect(t.esc.start({ id: 'm11', route: ROAD })).toBe(true);
    t.events.emit('save.loaded', { slot: 's' });
    expect(t.esc.active()).toMatchObject({ id: 'm11' });
    expect(t.hidden.at(-1)).toEqual(['gaut', true]);
    expect(t.scene.children).toHaveLength(3);
    // A load without the companions entry (a save from before Act 2) stops it.
    t.events.emit('save.loaded', { slot: 's' });
    expect(t.esc.active()).toBeNull();
    expect(t.hidden.at(-1)).toEqual(['gaut', false]);
  });

  it('a load stops it: riders cleared, Gaut restored, pending dismounts resolved', async () => {
    const t = makeEscort();
    t.esc.start({ id: 'm11', route: ROAD });
    const done = vi.fn();
    void t.esc.dismount().then(done);
    t.events.emit('save.loaded', { slot: 's' });
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    expect(t.scene.children).toHaveLength(0);
    expect(t.hidden.at(-1)).toEqual(['gaut', false]);
    expect(t.of('escort.stopped')).toEqual([{ escortId: 'm11' }]);
    expect(t.esc.active()).toBeNull();
    // It can start again afterwards (the quest restarts it).
    expect(t.esc.start({ id: 'm11', route: ROAD })).toBe(true);
  });

  it('fast travel mid-escort re-places the column by Cael', () => {
    const t = makeEscort();
    t.esc.start({ id: 'm11', route: ROAD });
    t.feet.z = -250;
    t.tick(DT * 2);
    // Just behind him (out of view), then he rides up.
    expect(t.esc.poses()[0].z).toBeCloseTo(-250 + ESCORT_TUNING.lead, 0);
  });
});
