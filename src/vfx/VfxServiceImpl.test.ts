import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from './VfxServiceImpl';
import { EFFECT_IDS } from './types';

const make = () => {
  const warn = vi.fn();
  const scene = new THREE.Scene();
  const vfx = new VfxServiceImpl({ scene, actorRoot: () => null }, null, warn);
  return { vfx, warn, scene };
};
const at = { position: { x: 0, y: 0, z: 0 } };

describe('VfxServiceImpl', () => {
  it('unknown ids warn once and return a dead handle', () => {
    const { vfx, warn } = make();
    const h = vfx.spawnEffect('nope', at);
    expect(h.alive).toBe(false);
    h.stop();
    vfx.spawnEffect('nope', at);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('every slice id spawns without throwing and settles after enough frames', () => {
    const { vfx } = make();
    for (const id of EFFECT_IDS) {
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } }, { zone: 'blaze' });
      expect(h).toBeDefined();
    }
    for (let i = 0; i < 400; i++) vfx.update(1 / 60, false);
    expect(vfx.sparks.liveCount).toBe(0);
  });

  it('rejects bad transforms and bad params', () => {
    const { vfx } = make();
    expect(vfx.spawnEffect('hit-spark', { position: { x: NaN, y: 0, z: 0 } }).alive).toBe(false);
    expect(vfx.spawnEffect('hit-spark', undefined as never).alive).toBe(false);
    expect(() => vfx.spawnEffect('ember-burst', at, { count: 'lots' as never })).not.toThrow();
  });

  it('timed effects stay alive until done and stop() ends them early; stop twice is safe', () => {
    const { vfx, scene } = make();
    const h = vfx.spawnEffect('shockwave-ring', at);
    expect(h.alive).toBe(true);
    expect(scene.children.length).toBeGreaterThan(0);
    const before = scene.children.length;
    h.stop();
    h.stop();
    expect(h.alive).toBe(false);
    expect(scene.children.length).toBeLessThan(before);
  });

  it('time freezes with the sim: nothing ages while frozen', () => {
    const { vfx } = make();
    const h = vfx.spawnEffect('shockwave-ring', at);
    for (let i = 0; i < 120; i++) vfx.update(1 / 60, true);
    expect(h.alive).toBe(true);
    for (let i = 0; i < 120; i++) vfx.update(1 / 60, false);
    expect(h.alive).toBe(false);
  });

  it('quality changes mid-effect without throwing; bad values are ignored', () => {
    const { vfx } = make();
    vfx.spawnEffect('surge', at);
    vfx.setQuality('low');
    expect(vfx.quality).toBe('low');
    expect(vfx.sparkBudget.scale).toBe(0.5);
    expect(vfx.pointsBudget.scale).toBe(0.5);
    vfx.update(1 / 60, false);
    vfx.setQuality('bogus' as never);
    expect(vfx.quality).toBe('low');
    vfx.setQuality('high');
    expect(vfx.sparkBudget.scale).toBe(1);
    vfx.update(1 / 60, false);
  });

  it('telegraph and dissolve tolerate actors without roots and roots without meshes', async () => {
    const { vfx } = make();
    vfx.telegraph('ghost', 'dodge', 0.5);
    await vfx.dissolve(new THREE.Object3D(), 0.5);
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1));
    const m = vfx.createWeaponMarkers(weapon);
    expect(m.hilt).not.toBe(m.tip);
  });

  it('dispose is idempotent and spawning after dispose does not throw', () => {
    const { vfx } = make();
    vfx.dispose();
    vfx.dispose();
    expect(() => vfx.spawnEffect('hit-spark', at)).not.toThrow();
  });

  it('sparks are not starved by a full points pool', () => {
    const { vfx } = make();
    for (let i = 0; i < 20; i++) vfx.points.emit('ember', { x: 0, y: 0, z: 0 }, 400, undefined, 0);
    expect(vfx.sparks.burst({ x: 0, y: 0, z: 0 }, undefined, 24, undefined, 0)).toBe(24);
  });

  it('live particles shrink after high to low and low to high does not resurrect decals', () => {
    const { vfx } = make();
    vfx.setQuality('high');
    for (let i = 0; i < 24; i++) vfx.decals.place({ x: i, y: 0, z: 0 }, undefined, 0.5, 0x222222, 0);
    expect(vfx.decals.liveCount).toBe(24);
    vfx.setQuality('low');
    expect(vfx.decals.liveCount).toBe(0);
    vfx.setQuality('high');
    expect(vfx.decals.liveCount).toBe(0);
  });

  it('setQuality goes through the delegate when one is attached; applyQuality does not', () => {
    const { vfx } = make();
    const d = vi.fn();
    vfx.qualityDelegate = d;
    vfx.setQuality('low');
    expect(d).toHaveBeenCalledWith('low');
    expect(vfx.quality).toBe('medium');
    vfx.applyQuality('low');
    expect(vfx.quality).toBe('low');
  });

  it('forgetActor restores cloned materials and cancels the telegraph, also for an already-gone actor', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const original = mesh.material;
    scene.add(mesh);
    const vfx = new VfxServiceImpl({ scene, actorRoot: (id) => (id === 'w' ? mesh : null) }, null, vi.fn());
    vfx.telegraph('w', 'block', 0.4);
    expect(mesh.material).not.toBe(original);
    vfx.forgetActor('w');
    expect(mesh.material).toBe(original);
    vfx.forgetActor('w');
    vfx.forgetActor('never-seen');
  });

  it('dispose clears an active camera shake', () => {
    const { vfx } = make();
    vfx.shake(0.1, 1);
    vfx.dispose();
    expect(vfx.camera.active).toBe(false);
  });
});
