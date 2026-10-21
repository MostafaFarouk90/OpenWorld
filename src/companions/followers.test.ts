import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { AELFREDA } from './aelfreda';
import { CosmeticFollower, brushTuning, type FollowerVisual } from './followers';

const DT = 1 / 60;

function make() {
  const scene = new THREE.Group();
  const feet = { x: 0, y: 0, z: 0 };
  const env = { indoors: false, stealth: false, mounted: false };
  let built = 0;
  let disposed = 0;
  const build = (): FollowerVisual => {
    built++;
    const root = new THREE.Group();
    return { root, setGait() {}, update() {}, dispose: () => void (disposed++, root.removeFromParent()) };
  };
  const f = new CosmeticFollower('test', build, {
    scene,
    feet: () => feet,
    yaw: () => 0,
    groundAt: () => 0,
    indoors: () => env.indoors,
    stealth: () => env.stealth,
    mounted: () => env.mounted,
  }, brushTuning());
  const tick = (s: number) => {
    for (let t = 0; t < s; t += DT) f.fixedUpdate(DT);
  };
  return { scene, feet, env, f, tick, counts: () => ({ built, disposed }) };
}

describe('CosmeticFollower', () => {
  it('builds with its reader, appears behind Cael and follows; disposes when the reader goes', () => {
    const t = make();
    t.tick(1);
    expect(t.scene.children).toHaveLength(0);
    t.f.setWanted(true);
    t.tick(DT);
    expect(t.f.visible).toBe(true);
    // Yaw 0 faces -Z: behind is +Z.
    expect(t.f.position!.z).toBeGreaterThan(0);
    t.feet.z = -6;
    t.tick(3);
    expect(Math.hypot(t.f.position!.x - t.feet.x, t.f.position!.z - t.feet.z)).toBeLessThan(2);
    t.f.setWanted(false);
    expect(t.scene.children).toHaveLength(0);
    expect(t.counts()).toEqual({ built: 1, disposed: 1 });
  });

  it('hides indoors and in stealth, and on horseback once 40 m back; reappears behind Cael', () => {
    const t = make();
    t.f.setWanted(true);
    t.tick(0.5);
    t.env.indoors = true;
    t.tick(DT);
    expect(t.f.visible).toBe(false);
    t.env.indoors = false;
    t.env.stealth = true;
    t.tick(DT);
    expect(t.f.visible).toBe(false);
    t.env.stealth = false;
    t.tick(DT);
    expect(t.f.visible).toBe(true);
    // Mounted and galloping away: shown until 40 m back, then hidden; on dismount he is placed behind Cael.
    t.env.mounted = true;
    for (let i = 0; i < 60 * 10; i++) {
      t.feet.z -= 0.25;
      t.f.fixedUpdate(DT);
    }
    expect(t.f.visible).toBe(false);
    t.env.mounted = false;
    t.tick(DT);
    expect(t.f.visible).toBe(true);
    expect(Math.abs(t.f.position!.z - t.feet.z)).toBeLessThan(2);
  });
});

describe("Aelfreda's Act 1 NPC (A5, additive)", () => {
  it('is absent once she has joined', () => {
    expect(BRIGHTWATER_LAYOUT.npcs.find((n) => n.id === 'aelfreda')?.absentWhen).toBe(AELFREDA.joinFlag);
  });
});
