// The corridor scenery's B3 cut: the old verge posts and reed cards leave B3's bounds while the environment pass is on.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { envReplacesScenery } from '../env/groundCover';
import { buildCorridorScenery, REED_COUNT, reedPlacements } from './corridorScenery';

const flat = () => 0;
const instances = (g: THREE.Object3D) => {
  let reeds = 0;
  let verge = 0;
  g.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh) return;
    if (m.name === 'reeds') reeds += m.count;
    else verge += m.count;
  });
  return { reeds, verge };
};
const inB3 = (x: number, z: number) => x >= -480 && x <= -60 && z >= -310 && z <= 60;

describe('corridor scenery under the environment pass', () => {
  it('reedPlacements is seeded and pure', () => {
    expect(reedPlacements()).toEqual(reedPlacements());
    expect(reedPlacements()).toHaveLength(REED_COUNT);
  });

  it('draws everything with no hide predicate (and with ?env=off)', () => {
    const a = buildCorridorScenery(flat);
    const b = buildCorridorScenery(flat, { hide: envReplacesScenery(false) });
    expect(instances(a.object).reeds).toBe(REED_COUNT);
    expect(instances(b.object)).toEqual(instances(a.object));
    a.dispose();
    b.dispose();
  });

  it('leaves the reed cards and verge posts inside B3 out while the pass is on, and keeps the rest', () => {
    const all = buildCorridorScenery(flat);
    const cut = buildCorridorScenery(flat, { hide: envReplacesScenery(true) });
    const n = instances(cut.object);
    const inside = reedPlacements().filter((r) => inB3(r.x, r.z)).length;
    expect(inside).toBeGreaterThan(300);
    expect(n.reeds).toBeLessThanOrEqual(REED_COUNT - inside);
    expect(n.reeds).toBeGreaterThan(0);
    expect(n.verge).toBeLessThan(instances(all.object).verge);
    expect(n.verge).toBeGreaterThan(0);
    // the road, lane and water are still drawn
    for (const name of ['dead-road', 'lane-track', 'river', 'hollin-brook']) expect(cut.object.getObjectByName(name), name).toBeDefined();
    all.dispose();
    cut.dispose();
  });
});
