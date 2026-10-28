import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VfxServiceImpl } from './VfxServiceImpl';

/** `attach` makes `position` an offset from the attached object's world position (types.ts). */
const rig = (root: THREE.Object3D | null) => {
  const scene = new THREE.Scene();
  const vfx = new VfxServiceImpl({ scene, actorRoot: () => null }, null, () => {});
  if (root) scene.add(root);
  return { vfx, scene };
};
const player = (x: number, y: number, z: number) => {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.updateMatrixWorld(true);
  return o;
};
const shellPos = (scene: THREE.Scene) => {
  const m = scene.children.find((c) => c.name === 'fresnelShell')!;
  return m.position.clone();
};
const ZERO = { x: 0, y: 0, z: 0 };

describe('attached tier 3 shells', () => {
  for (const id of ['oathward-bubble', 'grit-teeth'] as const) {
    it(`${id}: a zero offset on a player at (100, 5, -200) sits at the player (y + 1 chest), not twice that`, () => {
      const root = player(100, 5, -200);
      const { vfx, scene } = rig(root);
      vfx.spawnEffect(id, { position: ZERO, attach: root }, { seconds: 5 });
      vfx.update(1 / 60, false);
      expect(shellPos(scene).toArray()).toEqual([100, 6, -200]);
    });

    it(`${id}: follows the player as it moves`, () => {
      const root = player(100, 5, -200);
      const { vfx, scene } = rig(root);
      vfx.spawnEffect(id, { position: ZERO, attach: root }, { seconds: 5 });
      root.position.set(110, 5, -190);
      root.updateMatrixWorld(true);
      vfx.update(1 / 60, false);
      expect(shellPos(scene).toArray()).toEqual([110, 6, -190]);
    });

    it(`${id}: player at the origin`, () => {
      const root = player(0, 0, 0);
      const { vfx, scene } = rig(root);
      vfx.spawnEffect(id, { position: ZERO, attach: root }, { seconds: 5 });
      expect(shellPos(scene).toArray()).toEqual([0, 1, 0]);
    });

    it(`${id}: detached uses the world position unchanged`, () => {
      const { vfx, scene } = rig(null);
      vfx.spawnEffect(id, { position: { x: 100, y: 5, z: -200 } }, { seconds: 5 });
      expect(shellPos(scene).toArray()).toEqual([100, 6, -200]);
    });
  }

  it('soot-cloak and blood-rune: attached zero offset emits at the player, detached at the given point', () => {
    for (const id of ['soot-cloak', 'blood-rune']) {
      const root = player(100, 5, -200);
      const a = rig(root);
      const calls: Array<{ x: number; y: number; z: number }> = [];
      const real = a.vfx.points.emit.bind(a.vfx.points);
      a.vfx.points.emit = ((k: string, p: { x: number; y: number; z: number }, ...rest: unknown[]) => (calls.push({ ...p }), (real as any)(k, p, ...rest))) as never;
      a.vfx.spawnEffect(id, { position: ZERO, attach: root }, { seconds: 5 });
      for (let i = 0; i < 120; i++) a.vfx.update(1 / 60, false);
      expect(calls.length, id).toBeGreaterThan(0);
      for (const c of calls) {
        expect(Math.abs(c.x - 100), id).toBeLessThan(5);
        expect(Math.abs(c.z + 200), id).toBeLessThan(5);
      }
      const d = rig(null);
      const dc: Array<{ x: number; z: number }> = [];
      const dreal = d.vfx.points.emit.bind(d.vfx.points);
      d.vfx.points.emit = ((k: string, p: { x: number; z: number }, ...rest: unknown[]) => (dc.push({ ...p }), (dreal as any)(k, p, ...rest))) as never;
      d.vfx.spawnEffect(id, { position: { x: 100, y: 5, z: -200 } }, { seconds: 5 });
      for (let i = 0; i < 120; i++) d.vfx.update(1 / 60, false);
      for (const c of dc) expect(Math.abs(c.x - 100), id).toBeLessThan(5);
    }
  });
});
