import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { COURIER_DEF, CourierBody, loadCourierBody } from './courierBody';
import type { NpcModelId, NpcModelLoader } from '../npcs/types';

const clip = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 0])]);
function figure(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x888888 })));
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
  hat.name = 'Knife';
  g.add(hat);
  return g;
}
function loader(names = ['Idle', 'Running_A']): NpcModelLoader & { loaded: NpcModelId[] } {
  const loaded: NpcModelId[] = [];
  return { loaded, load: async (id) => { loaded.push(id); }, instantiate: () => figure(), animations: () => names.map(clip) };
}
const body = (names?: string[]) => {
  const l = loader(names);
  return new CourierBody(figure(), l.animations('rogue'));
};
/** Run `seconds` of travel along +x at `speed`, one fixed-ish 1/60 step per frame. */
function travel(b: CourierBody, speed: number, seconds: number, x0 = 0, z0 = 0, dir: [number, number] = [1, 0]) {
  let x = x0, z = z0;
  b.step(1 / 60, x, z);
  for (let i = 0; i < Math.round(seconds * 60); i++) { x += dir[0] * speed / 60; z += dir[1] * speed / 60; b.step(1 / 60, x, z); }
}

describe('courier body', () => {
  it('is the Rogue (not the hooded body Tobb wears), tinted', () => {
    expect(COURIER_DEF.model).toBe('rogue');
    expect(COURIER_DEF.tint).not.toBeNull();
  });
  it('runs while he travels and idles at rest', () => {
    const b = body();
    expect(b.animation).toBe('idle');
    travel(b, 7, 0.6);
    expect(b.animation).toBe('run');
    for (let i = 0; i < 30; i++) b.step(1 / 60, 4.2, 0);
    expect(b.animation).toBe('idle');
  });
  it('a render frame that sees no movement between two fixed steps does not flicker to idle', () => {
    const b = body();
    travel(b, 7, 0.6);
    let x = 4.2;
    for (let i = 0; i < 20; i++) { b.step(1 / 144, x, 0); if (i % 2) x += 7 / 60; }
    expect(b.animation).toBe('run');
  });
  it('faces his travel direction (yaw 0 faces -Z)', () => {
    const b = body();
    travel(b, 7, 0.3, 0, 0, [0, -1]);
    expect(b.facing).toBeCloseTo(0, 6);
    const c = body();
    travel(c, 7, 0.3, 0, 0, [-1, 0]);
    expect(c.facing).toBeCloseTo(Math.PI / 2, 6);
    expect(c.root.rotation.y).toBeCloseTo(Math.PI / 2, 6);
  });
  it('a teleported restart is not read as a sprint', () => {
    const b = body();
    b.step(1 / 60, 0, 0);
    b.resetTrack();
    b.step(1 / 60, 500, 500);
    expect(b.animation).toBe('idle');
  });
  it('without a Running clip he still moves, on the idle pose; without any clip nothing throws', () => {
    const b = body(['Idle']);
    travel(b, 7, 0.6);
    expect(b.animation).toBe('idle');
    const none = body([]);
    travel(none, 7, 0.6);
    expect(none.animation).toBe('none');
  });
  it('dispose frees the geometry and is idempotent', () => {
    const b = body();
    const mesh = b.root.children[0]!.children[0] as THREE.Mesh;
    const spy = vi.spyOn(mesh.geometry, 'dispose');
    b.dispose();
    b.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(() => b.step(1 / 60, 1, 1)).not.toThrow();
  });
});

describe('loadCourierBody', () => {
  it('loads the Rogue', async () => {
    const l = loader();
    const b = await loadCourierBody(l);
    expect(l.loaded).toEqual(['rogue']);
    expect(b).toBeInstanceOf(CourierBody);
  });
  it('is null with no loader, warns once and stays null when the load fails', async () => {
    const warn = vi.fn();
    expect(await loadCourierBody(null, warn)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    const bad: NpcModelLoader = { load: async () => { throw new Error('404'); }, instantiate: () => figure(), animations: () => [] };
    expect(await loadCourierBody(bad, warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/capsule/);
  });
});
