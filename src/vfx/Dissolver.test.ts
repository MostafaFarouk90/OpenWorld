import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ActorMaterials, getFx } from './ActorMaterials';
import { Dissolver } from './Dissolver';

function setup() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  root.add(mesh);
  const am = new ActorMaterials();
  const d = new Dissolver(am);
  const val = () => getFx(mesh.material as THREE.MeshStandardMaterial)!.uDissolve.value;
  return { root, mesh, am, d, val };
}
const flag = (p: Promise<void>) => {
  const f = { done: false };
  void p.then(() => (f.done = true));
  return f;
};

describe('Dissolver', () => {
  it('runs 0 to 1 and resolves, leaving visible untouched', async () => {
    const s = setup();
    const h = s.d.start(s.root, 2, 5, { tint: 0x00ff00 });
    const f = flag(h.done);
    s.d.update(6);
    await Promise.resolve();
    expect(s.val()).toBeCloseTo(0.5);
    expect(f.done).toBe(false);
    s.d.update(7);
    await h.done;
    expect(s.val()).toBe(1);
    expect(s.root.visible).toBe(true);
    expect(getFx(s.mesh.material as THREE.MeshStandardMaterial)!.uDissolveTint.value.getHex()).toBe(0x00ff00);
  });

  it('reverse runs 1 to 0', async () => {
    const s = setup();
    const h = s.d.start(s.root, 1, 0, { reverse: true });
    expect(s.val()).toBe(1);
    s.d.update(0.25);
    expect(s.val()).toBeCloseTo(0.75);
    s.d.update(1);
    await h.done;
    expect(s.val()).toBe(0);
  });

  it('resolves immediately for no meshes, bad durations, disposed', async () => {
    const s = setup();
    await s.d.start(new THREE.Group(), 1, 0).done;
    await s.d.start(s.root, NaN, 0).done;
    await s.d.start(s.root, 0, 0).done;
    await s.d.start(s.root, -2, 0).done;
    expect(s.am.has(s.root)).toBe(false);
    s.d.dispose();
    await s.d.start(s.root, 1, 0).done;
  });

  it('restart resolves the first promise and does not double wrap', async () => {
    const s = setup();
    const a = s.d.start(s.root, 1, 0);
    s.d.update(0.5);
    const b = s.d.start(s.root, 1, 0.5);
    await a.done;
    const f = flag(b.done);
    await Promise.resolve();
    expect(f.done).toBe(false);
    expect(s.val()).toBe(0);
    expect(s.am.get(s.root)).toHaveLength(1);
    a.cancel();
    s.d.update(1);
    expect(s.val()).toBeCloseTo(0.5);
  });

  it('cancel resets to 0 and resolves', async () => {
    const s = setup();
    const h = s.d.start(s.root, 1, 0);
    s.d.update(0.6);
    h.cancel();
    await h.done;
    expect(s.val()).toBe(0);
    s.d.update(0.9);
    expect(s.val()).toBe(0);
  });

  it('dispose resolves pending', async () => {
    const s = setup();
    const h = s.d.start(s.root, 5, 0);
    s.d.dispose();
    await h.done;
  });

  it('clamps duration to a minimum of 0.05', async () => {
    const s = setup();
    const h = s.d.start(s.root, 0.001, 0);
    s.d.update(0.05);
    await h.done;
    expect(s.val()).toBe(1);
  });
});
