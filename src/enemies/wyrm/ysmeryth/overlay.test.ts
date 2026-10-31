import type * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../../config/constants';
import { EnemyManager } from '../../EnemyManager';
import { FakeHost, loadKnight } from '../../testing/fakeHost';
import type { MoveDef, SpawnerDef } from '../../types';
import { wyrmParamsFor } from '../body';
import { YSMERYTH_HUB } from '../overlays';
import type { WyrmBody } from '../WyrmBody';
import { YSMERYTH, YSMERYTH_DEF, YSMERYTH_IDS, YSMERYTH_SPAWNERS } from './def';
import type { YsmerythHandle } from './overlay';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});
afterEach(() => {
  for (const k of Object.keys(YSMERYTH_HUB)) delete (YSMERYTH_HUB as Record<string, unknown>)[k];
});

const CENTRE = { x: 0, z: 0 };
const LAND = { x: 0, z: 21 };
const SPAWNER: SpawnerDef = { ...YSMERYTH_SPAWNERS[0]!, band: { min: 25, max: 25 }, area: undefined };

function rig(opts: { callAllowed?: boolean; player?: { x: number; z: number } } = {}) {
  const p = opts.player ?? { x: 0, z: 8 };
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: p.x, y: 0, z: p.z } });
  // The trial floors the player in the game; here the player simply never dies.
  (fake.host.actors.player as unknown as { immortal: boolean }).immortal = true;
  fake.defineAnchor(YSMERYTH_IDS.landMark, LAND.x, LAND.z, [], 0);
  fake.defineAnchor(YSMERYTH_IDS.arenaCentre, CENTRE.x, CENTRE.z, [], 0);
  const airborne: boolean[] = [];
  const telegraphs: string[] = [];
  let called = 0;
  let handle: YsmerythHandle | null = null;
  const state = { callAllowed: opts.callAllowed ?? false };
  Object.assign(YSMERYTH_HUB, {
    arena: () => ({ centre: CENTRE, land: LAND }),
    track: (_id: string, h: YsmerythHandle) => {
      handle = h;
      return () => {
        if (handle === h) handle = null;
      };
    },
    airborne: (_id: string, on: boolean) => void airborne.push(on),
    callAllowed: () => state.callAllowed,
    called: () => void called++,
    telegraphed: (_id: string, m: MoveDef) => void telegraphs.push(m.id),
  });
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [SPAWNER], seed: 7 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const [id] = m.service.spawnGroup(YSMERYTH_IDS.spawnerId, { aggro: true });
  const e = () => m.get(id!)!;
  return {
    fake, m, tick, id: id!, e, airborne, telegraphs, state,
    get called() { return called; },
    get handle() { return handle!; },
    body: () => e().body as WyrmBody,
  };
}

describe("Ysmeryth's overlay (K6a PR 2)", () => {
  it('is the 6x cooled-slag wyrm with a lit crest; never dragonkin, no mercy; the four trial moves with the design windups', () => {
    expect(wyrmParamsFor(YSMERYTH_DEF)).toMatchObject({ scale: 6, palette: 'cooled-slag', crest: true });
    expect(YSMERYTH_DEF.tags ?? []).not.toContain('dragonkin');
    expect(YSMERYTH_DEF.mercy).toBeUndefined();
    const w = Object.fromEntries(YSMERYTH_DEF.moves.map((m) => [m.id, m.windup]));
    expect(w).toEqual({ 'ysmeryth.sweep': 1.0, 'ysmeryth.slam': 0.9, 'ysmeryth.breath': 1.2, 'ysmeryth.call': 1.0 });
    const t = rig();
    expect(t.body().rig.params.scale).toBe(6);
  });

  it('on the ground she steps (never runs) and keeps within her leash of the mark', () => {
    const t = rig({ player: { x: 30, z: 40 } });
    let maxSpeed = 0;
    let maxOff = 0;
    for (let i = 0; i < 60 * 15; i++) {
      const before = { x: t.e().feet.x, z: t.e().feet.z };
      t.tick();
      if (!t.handle.airborne) maxSpeed = Math.max(maxSpeed, Math.hypot(t.e().feet.x - before.x, t.e().feet.z - before.z) / DT);
      maxOff = Math.max(maxOff, Math.hypot(t.e().feet.x - LAND.x, t.e().feet.z - LAND.z));
    }
    expect(t.handle.airborne).toBe(false);
    expect(maxSpeed).toBeLessThanOrEqual(YSMERYTH.groundSpeed + 0.2);
    expect(maxOff).toBeLessThanOrEqual(YSMERYTH.groundLeash + 1);
  });

  it('the round-break loop: up (airborne reported), about a 9 s loop at loop altitude, then down on her mark; no moves in the air', () => {
    const t = rig();
    t.tick(0.5);
    expect(t.handle.flyLoop()).toBe(true);
    expect(t.handle.flyLoop()).toBe(false);
    expect(t.airborne).toEqual([true]);
    const before = t.telegraphs.length;
    let maxAlt = 0;
    let seconds = 0;
    while (t.handle.airborne && seconds < 30) {
      t.tick();
      seconds += DT;
      maxAlt = Math.max(maxAlt, t.body().altitude);
    }
    expect(t.airborne).toEqual([true, false]);
    expect(maxAlt).toBeGreaterThan(YSMERYTH.loopAltitude - 2);
    expect(seconds).toBeGreaterThan(YSMERYTH.loopSeconds - 1);
    expect(seconds).toBeLessThan(YSMERYTH.loopSeconds + YSMERYTH.landWithin);
    expect(Math.hypot(t.e().feet.x - LAND.x, t.e().feet.z - LAND.z)).toBeLessThan(1.5);
    expect(t.body().altitude).toBe(0);
    expect(t.telegraphs.length).toBe(before);
  });

  it('the kite flight: the player beyond 60 m sends her up; she stays up while they are away and is down within 6 s of their return', () => {
    const t = rig();
    t.tick(0.5);
    t.fake.movePlayer(0, LAND.z + YSMERYTH.kiteRange + 5);
    // A swing already wound up finishes first (at most a few seconds), then she goes up.
    t.tick(5);
    expect(t.handle.airborne).toBe(true);
    expect(t.handle.flight).toBe('kite');
    t.tick(25);
    expect(t.handle.airborne).toBe(true);
    t.fake.movePlayer(0, LAND.z + 10);
    let seconds = 0;
    while (t.handle.airborne && seconds < 20) {
      t.tick();
      seconds += DT;
    }
    expect(t.handle.airborne).toBe(false);
    expect(seconds).toBeLessThanOrEqual(YSMERYTH.landWithin);
  });

  it('a break loop that ends with the player still away keeps her up (kite) until they return', () => {
    const t = rig();
    t.tick(0.5);
    t.handle.flyLoop();
    t.fake.movePlayer(0, LAND.z + YSMERYTH.kiteRange + 5);
    t.tick(YSMERYTH.loopSeconds + 6);
    expect(t.handle.airborne).toBe(true);
    expect(t.handle.flight).toBe('kite');
  });

  it('landNow brings her down from any flight; it is a no-op on the ground', () => {
    const t = rig();
    t.tick(0.5);
    t.handle.landNow();
    expect(t.airborne).toEqual([]);
    t.handle.flyLoop();
    t.tick(3);
    t.handle.landNow();
    expect(t.handle.flight).toBe('land');
    t.tick(YSMERYTH.landWithin);
    expect(t.handle.airborne).toBe(false);
  });

  it('the call is picked only when the controller allows it; its stun goes out when the window opens', () => {
    const t = rig({ callAllowed: false });
    t.tick(30);
    expect(t.telegraphs).not.toContain('ysmeryth.call');
    const u = rig({ callAllowed: true });
    let seconds = 0;
    while (!u.telegraphs.includes('ysmeryth.call') && seconds < 60) {
      u.tick();
      seconds += DT;
    }
    expect(u.telegraphs).toContain('ysmeryth.call');
    expect(u.called).toBe(0);
    u.tick(1.1);
    expect(u.called).toBe(1);
  });

  it('put to sleep in the air (the player far beyond the arena), she is first set down on her mark', () => {
    const t = rig();
    t.tick(0.5);
    t.handle.flyLoop();
    t.tick(2);
    t.fake.movePlayer(0, 400);
    t.tick(0.5);
    expect(t.handle.airborne).toBe(false);
    expect(t.airborne).toEqual([true, false]);
    expect(Math.hypot(t.e().feet.x - LAND.x, t.e().feet.z - LAND.z)).toBeLessThan(1.5);
    expect(t.body().altitude).toBe(0);
  });

  it('leave (after the trial): she flies up and away and despawns', () => {
    const t = rig();
    t.tick(0.5);
    expect(t.handle.leave()).toBe(true);
    let seconds = 0;
    let maxAlt = 0;
    while (t.m.get(t.id) && seconds < 20) {
      t.tick();
      seconds += DT;
      const e = t.m.get(t.id);
      if (e) maxAlt = Math.max(maxAlt, (e.body as WyrmBody).altitude);
    }
    expect(t.m.get(t.id)).toBeUndefined();
    expect(maxAlt).toBeGreaterThan(20);
  });

  it('kite hysteresis: up beyond 60 m, still up at 57 m, down only inside 55 m; no instant re-take-off after landing', () => {
    const t = rig();
    t.tick(0.5);
    t.fake.movePlayer(0, LAND.z + YSMERYTH.kiteRange + 5);
    t.tick(5);
    expect(t.handle.flight).toBe('kite');
    t.fake.movePlayer(0, LAND.z + YSMERYTH.kiteRange - 3);
    t.tick(YSMERYTH.loopSeconds + 2);
    expect(t.handle.airborne).toBe(true);
    t.fake.movePlayer(0, LAND.z + YSMERYTH.kiteRange - 8);
    let seconds = 0;
    while (t.handle.airborne && seconds < 10) {
      t.tick();
      seconds += DT;
    }
    expect(seconds).toBeLessThanOrEqual(YSMERYTH.landWithin);
    const ups = t.airborne.filter(Boolean).length;
    t.fake.movePlayer(0, LAND.z + YSMERYTH.kiteRange + 5);
    t.tick(1);
    expect(t.airborne.filter(Boolean).length).toBe(ups);
  });

  it('passive (after the trial): she picks no move and stops noticing; back in on a restart', () => {
    const t = rig({ player: { x: 0, z: 14 } });
    t.tick(0.5);
    t.handle.setPassive(true);
    const before = t.telegraphs.length;
    t.tick(15);
    expect(t.telegraphs.length).toBe(before);
    t.handle.setPassive(false);
    t.tick(15);
    expect(t.telegraphs.length).toBeGreaterThan(before);
  });
});
