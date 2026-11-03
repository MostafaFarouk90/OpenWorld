import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../../config/constants';
import { EnemyManager } from '../../EnemyManager';
import { FakeHost, loadKnight } from '../../testing/fakeHost';
import type { SpawnerDef } from '../../types';
import { SKARL_DRAKE, SKARL_DRAKE_DEF, skarlDrakeSpawner } from '../drake/def';
import { WYRM_HUB } from '../overlays';
import { WyrmTethers } from '../tethers';
import type { WyrmBody } from '../WyrmBody';
import { wyrmParamsFor } from '../body';
import { EMBER_WYRM_DEF } from '../defs';
import type { FlierHandle } from './flightExtras';
import { LODGE_WYRM_SPAWNERS, LODGE_WYRMS, lodgePerches } from './lodgeWyrms';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});
afterEach(() => {
  for (const k of Object.keys(WYRM_HUB)) delete (WYRM_HUB as Record<string, unknown>)[k];
});

const TOWERS = [{ x: -60, z: -45, footprint: [7, 7] as [number, number] }, { x: 60, z: -45, footprint: [7, 7] as [number, number] }];
const LODGE: SpawnerDef = { ...LODGE_WYRM_SPAWNERS[0]!, band: { min: 20, max: 20 }, block: undefined, activation: 'manual' };
const DRAKE: SpawnerDef = { ...skarlDrakeSpawner('drake', 'drake.spawn'), band: { min: 27, max: 27 }, area: undefined };

function rig(spawners: SpawnerDef[], playerZ = -30) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: playerZ } });
  const perches = lodgePerches(TOWERS);
  for (const p of perches) fake.defineAnchor(p.id, p.x, p.z, [], p.yaw);
  fake.defineAnchor('drake.spawn', 0, 0);
  fake.defineAnchor('drake.post', 5, 0);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners, seed: 4 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  return { fake, m, tick, perches };
}

describe('lodge wyrms (K6a)', () => {
  it('the perches sit on the two south towers, one each, facing south; each drops into the yard, clear of its tower', () => {
    const ps = lodgePerches(TOWERS);
    expect(ps.map((p) => p.id)).toEqual([LODGE_WYRMS.anchor(1), LODGE_WYRMS.anchor(2)]);
    ps.forEach((p, i) => {
      const t = TOWERS[i]!;
      expect([p.x, p.z]).toEqual([t.x, t.z]);
      expect(p.altitude).toBeGreaterThanOrEqual(LODGE_WYRMS.towerTop);
      expect(p.yaw).toBe(0);
      // Inward (toward the other tower) and north of the tower's yard-side faces.
      expect(Math.abs(p.drop.x - t.x)).toBeGreaterThan(t.footprint[0] / 2 + 2);
      expect(Math.sign(p.drop.x - t.x)).toBe(Math.sign(-t.x));
      expect(p.drop.z).toBeGreaterThan(t.z + t.footprint[1] / 2 + 2);
    });
  });

  it('the group: two peaceful Ember Wyrms on the M34 flag, on the dragonspine-lower block, refilled on rest', () => {
    const g = LODGE_WYRM_SPAWNERS[0]!;
    expect(g).toMatchObject({ enemy: 'ember-wyrm', count: 2, peaceful: true, activation: { flag: 'story.m34.complete' }, block: 'dragonspine-lower', respawn: 'onRest', leash: false });
    expect(g.memberAnchors).toEqual([LODGE_WYRMS.anchor(1), LODGE_WYRMS.anchor(2)]);
  });

  it('a perched resting wyrm stays within 0.5 m of its anchor at the tower-top height for 600 ticks, and Rests', () => {
    const t = rig([LODGE], -6);
    WYRM_HUB.perchFor = (sid, slot) => (sid === LODGE_WYRMS.spawnerId && slot !== null ? { altitude: t.perches[slot]!.altitude } : null);
    const ids = t.m.service.spawnGroup(LODGE_WYRMS.spawnerId, { peaceful: true });
    expect(ids).toHaveLength(2);
    for (let i = 0; i < 600; i++) t.tick();
    ids.forEach((id, slot) => {
      const e = t.m.get(id!)!;
      const p = t.perches[slot]!;
      expect(Math.hypot(e.feet.x - p.x, e.feet.z - p.z)).toBeLessThan(0.5);
      const body = e.body as WyrmBody;
      expect(body.altitude).toBeCloseTo(p.altitude, 5);
      expect(e.actor.worldPosition(new THREE.Vector3()).y - e.feet.y).toBeCloseTo(p.altitude, 5);
      expect(body.currentClip).toBe('Rest');
    });
  });

  it('struck on the perch, it drops into the yard (out of the tower) and wakes; an unperched (non-peaceful) spawn never perches', () => {
    const t = rig([LODGE], -6);
    WYRM_HUB.perchFor = (_sid, slot) => (slot !== null ? { altitude: t.perches[slot]!.altitude, drop: t.perches[slot]!.drop } : null);
    const [id] = t.m.service.spawnGroup(LODGE_WYRMS.spawnerId, { peaceful: true });
    t.tick(0.5);
    t.fake.apply({ attackerId: 'player', targetId: id!, amount: 2, poise: 1, kind: 'melee', bone: 'torso' });
    t.tick(0.5);
    const e = t.m.get(id!)!;
    expect((e.body as WyrmBody).altitude).toBeLessThan(0.5);
    // Landed at its drop point in the yard (it may have taken a step or two toward the player since).
    const drop = t.perches[0]!.drop;
    expect(Math.hypot(e.feet.x - drop.x, e.feet.z - drop.z)).toBeLessThan(5);
    expect(['notice', 'chase', 'telegraph', 'attack']).toContain(e.state);
    const u = rig([{ ...LODGE, peaceful: false }]);
    WYRM_HUB.perchFor = () => ({ altitude: 10 });
    const [aggro] = u.m.service.spawnGroup(LODGE_WYRMS.spawnerId, { aggro: true });
    u.tick(0.2);
    expect((u.m.get(aggro!)!.body as WyrmBody).altitude).toBeLessThan(10);
  });
});

describe("Skarl's drake (K6a)", () => {
  it('is the Ember Wyrm build at 0.8 with a collar, tagged dragonkin, its own move ids, no mercy', () => {
    expect(SKARL_DRAKE_DEF.kind).toBe('skarl-drake');
    expect(SKARL_DRAKE_DEF.tags).toEqual(['dragonkin']);
    expect(EMBER_WYRM_DEF.tags ?? []).not.toContain('dragonkin'); // the Act 2 wyrm is untouched
    expect(SKARL_DRAKE_DEF.mercy).toBeUndefined();
    expect(SKARL_DRAKE_DEF.behaviour).toBe('wyrm-flight');
    expect(SKARL_DRAKE_DEF.moves.map((m) => m.id)).toEqual(['drake.spit', 'drake.bite', 'drake.tailWhip', 'drake.dive']);
    expect(wyrmParamsFor(SKARL_DRAKE_DEF)).toMatchObject({ scale: SKARL_DRAKE.scale, collar: true });
  });

  function chained(playerZ = -10) {
    const t = rig([DRAKE], playerZ);
    const tethers = new WyrmTethers({ anchor: (id) => t.fake.host.anchors?.find?.(id)?.position ?? (id === 'drake.post' ? { x: 5, y: 0, z: 0 } : undefined), flag: () => false, warn: () => {} });
    tethers.tether('drake', [{ anchor: 'drake.post' }], { length: SKARL_DRAKE.chainLength });
    const handles = new Map<string, FlierHandle>();
    const landed: string[] = [];
    WYRM_HUB.chainFor = (sid, slot) => tethers.chainFor(sid, slot);
    WYRM_HUB.trackFlier = (id, h) => {
      handles.set(id, h);
      return () => handles.delete(id);
    };
    WYRM_HUB.landed = (id) => landed.push(id);
    const [id] = t.m.service.spawnGroup('drake', { aggro: true });
    return { ...t, id: id!, handles, landed };
  }

  it('chained: flies and fights but never leaves the chain circle round its post; the collar chain is drawn', () => {
    const t = chained();
    const e = t.m.get(t.id)!;
    let maxR = 0;
    for (let i = 0; i < 60 * 20; i++) {
      t.tick();
      maxR = Math.max(maxR, Math.hypot(e.feet.x - 5, e.feet.z - 0));
    }
    expect(maxR).toBeLessThan(SKARL_DRAKE.chainLength + 1);
    expect((e.body as WyrmBody).rig.chainMesh.visible).toBe(true);
    expect((e.body as WyrmBody).rig.collarMesh).not.toBeNull();
    expect(t.handles.get(t.id)!.chainLow()).not.toBeNull();
  });

  it('reports each touchdown, and is landed only on the ground', () => {
    const t = chained();
    const h = t.handles.get(t.id)!;
    let sawAir = false;
    let sawGround = false;
    for (let i = 0; i < 60 * 30; i++) {
      t.tick();
      if (h.landed()) sawGround = true;
      else sawAir = true;
    }
    expect(sawAir).toBe(true);
    expect(sawGround).toBe(true);
    expect(t.landed.length).toBeGreaterThan(0);
    expect(new Set(t.landed)).toEqual(new Set([t.id]));
  });

  it('chained with the player far beyond the chain: it strains toward them but stays inside the circle', () => {
    const t = chained(-24);
    const e = t.m.get(t.id)!;
    let maxR = 0;
    for (let i = 0; i < 60 * 20; i++) {
      t.tick();
      maxR = Math.max(maxR, Math.hypot(e.feet.x - 5, e.feet.z - 0));
    }
    expect(maxR).toBeLessThan(SKARL_DRAKE.chainLength + 1);
    expect(maxR).toBeGreaterThan(SKARL_DRAKE.chainLength * 0.6);
  });

  it('released on the ground: it climbs well clear (the overlay leaves the altitude to the fly-off) while it fades', () => {
    const t = chained();
    const h = t.handles.get(t.id)!;
    for (let i = 0; i < 60 * 30 && !h.landed(); i++) t.tick();
    expect(h.landed()).toBe(true);
    const body = t.m.get(t.id)!.body as WyrmBody;
    expect(h.release()).toBe(true);
    let maxAlt = 0;
    for (let i = 0; i < 60 * 15 && t.m.get(t.id); i++) {
      t.tick();
      maxAlt = Math.max(maxAlt, body.altitude);
    }
    expect(maxAlt).toBeGreaterThan(10);
  });

  it('released: the chain drops, it retires and flies off, then despawns; a second release is refused', () => {
    const t = chained();
    t.tick(1);
    const h = t.handles.get(t.id)!;
    expect(h.release()).toBe(true);
    expect(h.release()).toBe(false);
    expect(h.chainLow()).toBeNull();
    const body = t.m.get(t.id)!.body as WyrmBody;
    t.tick(0.5);
    expect(body.rig.chainMesh.visible).toBe(false);
    t.tick(15);
    expect(t.m.get(t.id)).toBeUndefined();
    expect(t.m.service.alive('drake')).toEqual([]);
  });

  it('unchained (no tether): no chain and no chain point', () => {
    const t = rig([DRAKE]);
    const handles = new Map<string, FlierHandle>();
    WYRM_HUB.trackFlier = (id, h) => {
      handles.set(id, h);
      return () => handles.delete(id);
    };
    const [id] = t.m.service.spawnGroup('drake', { aggro: true });
    t.tick(0.5);
    expect(handles.get(id!)!.chainLow()).toBeNull();
    expect((t.m.get(id!)!.body as WyrmBody).rig.chainMesh.visible).toBe(false);
  });
});
