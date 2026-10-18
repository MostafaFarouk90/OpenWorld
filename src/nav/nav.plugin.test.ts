import { describe, expect, it } from 'vitest';
import type { GameContext } from '../core/Game';
import { Services } from '../core/Services';
import { NavGrid } from './NavGrid';
import navPlugin from './nav.plugin';

describe('nav plugin', () => {
  it('provides the nav service backed by a registry', () => {
    const services = new Services();
    const ctx = { services } as unknown as GameContext;
    expect(navPlugin.id).toBe('nav');
    expect(navPlugin.dependsOn).toEqual(['core']);
    navPlugin.setup(ctx);
    const nav = services.require('nav');
    const at = { x: 1, y: 0, z: 1 };
    expect(nav.hasGrid(at)).toBe(false);
    expect(nav.path(at, { x: 2, y: 0, z: 2 })).toBeNull();
    const undo = nav.addGrid(
      new NavGrid({ id: 'g', minX: 0, minZ: 0, maxX: 4, maxZ: 4, floorY: 0, walkable: [{ x0: 0, z0: 0, x1: 4, z1: 4 }], blockers: { d: [{ x0: 1, z0: 1, x1: 2, z1: 2 }] } }),
    );
    expect(nav.hasGrid(at)).toBe(true);
    expect(nav.floorAt(at)).toBe(0);
    expect(nav.path(at, { x: 3, y: 0, z: 3 })).toEqual([{ x: 3, y: 0, z: 3 }]);
    expect(nav.setBlocker('d', true)).toBe(true);
    expect(nav.setBlocker('zzz', true)).toBe(false);
    undo();
    expect(nav.hasGrid(at)).toBe(false);
  });
});
