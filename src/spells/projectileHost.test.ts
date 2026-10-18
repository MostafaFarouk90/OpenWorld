import { describe, expect, it, vi } from 'vitest';
import { createProjectileHost } from './projectileHost';

describe('createProjectileHost', () => {
  it('rays against the physics colliders and reports only the point', () => {
    const raycast = vi.fn(() => ({ point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 }, distance: 4, collider: {} }));
    const actors = {} as never;
    const host = createProjectileHost({ actors, physics: { raycast } as never });
    expect(host.actors).toBe(actors);
    expect(host.rayCast!({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 10)).toEqual({ point: { x: 1, y: 2, z: 3 } });
    expect(raycast).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 10);
  });
  it('reports no hit when the ray hits nothing, and has a terrain height', () => {
    const host = createProjectileHost({ actors: {} as never, physics: { raycast: () => null } as never });
    expect(host.rayCast!({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 5)).toBeNull();
    expect(Number.isFinite(host.heightAt!(0, 0))).toBe(true);
  });
});
