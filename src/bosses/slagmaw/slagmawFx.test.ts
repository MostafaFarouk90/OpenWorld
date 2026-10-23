import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DouseDisc, EruptionBurst, TremorCracks } from './slagmawFx';
import { COOLING } from './tuning';

const at = { x: 20000, y: 3, z: -5000 };

describe('TremorCracks', () => {
  it('spreads with progress and stops', () => {
    const c = new TremorCracks();
    expect(c.active).toBe(false);
    c.show(at);
    expect(c.active).toBe(true);
    expect(c.mesh.position.x).toBe(20000);
    c.setProgress(0.25);
    const first = c.mesh.children[0].scale.z;
    c.setProgress(1);
    expect(c.mesh.children[0].scale.z).toBeGreaterThan(first);
    c.setProgress(5);
    expect(c.mesh.children[0].scale.z).toBeCloseTo(c.mesh.children[0].scale.z);
    c.stop();
    expect(c.active).toBe(false);
    expect(c.mesh.visible).toBe(false);
    c.dispose();
  });

  it('follows a progress function on update', () => {
    const c = new TremorCracks();
    let p = 0.2;
    c.show(at, () => p);
    const a = c.mesh.children[0].scale.z;
    p = 0.9;
    c.update(1 / 60);
    expect(c.mesh.children[0].scale.z).toBeGreaterThan(a);
    c.dispose();
  });
});

describe('DouseDisc', () => {
  it('fades over COOLING.seconds then deactivates', () => {
    const d = new DouseDisc();
    d.show(at, COOLING.radius);
    expect(d.active).toBe(true);
    expect(d.mesh.scale.x).toBe(COOLING.radius);
    const m = (d.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
    d.update(COOLING.seconds / 2);
    expect(m.opacity).toBeLessThan(0.5);
    expect(d.active).toBe(true);
    d.update(COOLING.seconds);
    expect(d.active).toBe(false);
    d.show(at, 3);
    d.stop();
    expect(d.active).toBe(false);
    d.dispose();
  });
});

describe('EruptionBurst', () => {
  it('expands for about half a second then ends', () => {
    const e = new EruptionBurst();
    e.show(at, 4.5);
    expect(e.active).toBe(true);
    const s0 = e.mesh.scale.x;
    e.update(0.25);
    expect(e.mesh.scale.x).toBeGreaterThan(s0);
    e.update(0.3);
    expect(e.active).toBe(false);
    expect(e.mesh.visible).toBe(false);
    e.dispose();
  });
});

describe('disposal', () => {
  it('removes every effect from its parent, idempotently', () => {
    const scene = new THREE.Scene();
    const fx = [new TremorCracks(), new DouseDisc(), new EruptionBurst()];
    for (const f of fx) scene.add(f.mesh);
    for (const f of fx) {
      f.dispose();
      f.dispose();
    }
    expect(scene.children.length).toBe(0);
  });
});
