import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { BRIGHTWATER_LAYOUT as L } from '../region/brightwater.layout';
import { fakeLoader } from '../npcs/npcTestKit';
import { TOWNSFOLK_SPOTS, Townsfolk } from './Townsfolk';

const anchors = {
  find: (id: string) => {
    const a = L.anchors.find((x) => x.id === id);
    return a ? { position: { x: a.x, y: 0, z: a.z }, yaw: 0 } : undefined;
  },
};
const make = (extra: Record<string, unknown> = {}) => {
  const scene = new THREE.Scene();
  const warn = vi.fn();
  return { scene, warn, t: new Townsfolk({ scene, anchors, warn, ...extra }) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const roots = (s: THREE.Scene) => s.children.filter((c) => c.name.startsWith('townsfolk.'));

describe('Townsfolk', () => {
  it('spawns figures at valid positions', () => {
    const { scene, t, warn } = make();
    expect(t.count).toBe(TOWNSFOLK_SPOTS.length);
    expect(t.count).toBeGreaterThanOrEqual(6);
    expect(warn).not.toHaveBeenCalled();
    for (const r of roots(scene)) {
      const { x, z } = r.position;
      for (const g of L.triggers) {
        if (g.shape === 'box') {
          const [hx, , hz] = g.half;
          expect(Math.abs(x - g.x) <= hx + 1 && Math.abs(z - g.z) <= hz + 1, `${r.name} in ${g.id}`).toBe(false);
        } else {
          expect(Math.hypot(x - g.x, z - g.z) > g.radius + 1, `${r.name} in ${g.id}`).toBe(true);
        }
      }
      expect(Math.abs(x) <= 3 && z >= 30 && z <= 165, `${r.name} on lane`).toBe(false);
      for (const s of L.structures) {
        const [w, d] = s.footprint;
        expect(Math.abs(x - s.x) <= w / 2 + 1 && Math.abs(z - s.z) <= d / 2 + 1, `${r.name} in ${s.id}`).toBe(false);
      }
    }
  });

  it('setVisible toggles and is idempotent', () => {
    const { scene, t } = make();
    t.setVisible(false);
    t.setVisible(false);
    expect(roots(scene).every((r) => !r.visible)).toBe(true);
    t.setVisible(true);
    t.setVisible(true);
    expect(roots(scene).every((r) => r.visible)).toBe(true);
  });

  it('update animates without throwing', () => {
    const { scene, t } = make();
    const before = roots(scene).map((r) => r.rotation.y);
    t.update(0.5);
    expect(roots(scene).map((r) => r.rotation.y)).not.toEqual(before);
    t.setVisible(false);
    expect(() => t.update(0.1)).not.toThrow();
  });

  it('skips missing anchors with one warning', () => {
    const scene = new THREE.Scene();
    const warn = vi.fn();
    const t = new Townsfolk({ scene, anchors: { find: () => undefined }, warn });
    expect(t.count).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('upgrades to models with idle clips', async () => {
    const loader = fakeLoader();
    const { scene, t } = make({ loader });
    await flush();
    expect(loader.loads.length).toBe(t.count);
    expect(() => t.update(0.2)).not.toThrow();
    t.dispose();
    expect(roots(scene).length).toBe(0);
  });

  it('falls back to placeholders when the model load fails', async () => {
    const loader = { ...fakeLoader(), load: () => Promise.reject(new Error('boom')) };
    const { scene, t, warn } = make({ loader });
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(roots(scene).length).toBe(t.count);
    expect(() => t.update(0.2)).not.toThrow();
  });

  it('dispose removes meshes and is idempotent', async () => {
    const { scene, t } = make({ loader: fakeLoader() });
    t.dispose();
    t.dispose();
    await flush();
    expect(roots(scene).length).toBe(0);
    expect(t.count).toBe(0);
    expect(() => {
      t.update(1);
      t.setVisible(true);
    }).not.toThrow();
  });
});
