import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from './VfxServiceImpl';

const make = () => {
  const warn = vi.fn();
  const vfx = new VfxServiceImpl({ scene: new THREE.Scene(), actorRoot: () => null }, null, warn);
  return { vfx, warn };
};
const at = { position: { x: 1, y: 0, z: 1 }, scale: 3.5 };
const frames = (vfx: VfxServiceImpl, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) vfx.update(1 / 60, false);
};

describe('ash-cloud effect (design effect 16)', () => {
  it('is a known id, puffs smoke while it lasts and ends after its seconds', () => {
    const { vfx, warn } = make();
    const h = vfx.spawnEffect('ash-cloud', at, { seconds: 2 });
    expect(warn).not.toHaveBeenCalled();
    expect(h.alive).toBe(true);
    frames(vfx, 1);
    expect(vfx.points.liveCount).toBeGreaterThan(40);
    expect(h.alive).toBe(true);
    frames(vfx, 1.5);
    expect(h.alive).toBe(false);
    frames(vfx, 4);
    expect(vfx.points.liveCount).toBe(0);
  });

  it('stop ends it early and defaults and bad params do not throw', () => {
    const { vfx } = make();
    const h = vfx.spawnEffect('ash-cloud', { position: { x: 0, y: 0, z: 0 } });
    expect(() => vfx.spawnEffect('ash-cloud', at, { seconds: 'long' as never })).not.toThrow();
    frames(vfx, 0.5);
    h.stop();
    frames(vfx, 0.1);
    expect(h.alive).toBe(false);
  });
});
