// v0.7 interior fields (K3, plans/act3-K3.md section 5): sunken floor cells, sealed tunnel roofs, blocker base and startClosed.
import { describe, expect, it } from 'vitest';
import { NavGrid } from '../nav/NavGrid';
import { buildInterior } from './build';
import { FLOAT_HEIGHT, layoutInterior, standsIn, sunkenDepthAt, type InteriorLayout } from './layout';
import type { InteriorDef } from './types';

const flat = () => 0;
const base = (extra: Partial<InteriorDef> = {}): InteriorDef => ({
  id: 'test-sunken',
  site: { x: 0, z: 0 },
  rooms: [
    { id: 'a', x0: -5, z0: -10, x1: 5, z1: 0, height: 4 },
    { id: 'tunnel', x0: -1, z0: -20, x1: 1, z1: -10, height: 3 },
    { id: 'b', x0: -5, z0: -30, x1: 5, z1: -20, height: 4 },
  ],
  pillars: [],
  blockers: [],
  torches: [],
  anchors: [{ id: 'pit.floor', x: 0, z: -6 }],
  triggers: [],
  doors: [],
  environment: { fogColor: 0, fogNear: 1, fogFar: 2, skyColor: 0, groundColor: 0, ambientIntensity: 1, lightColor: 0, lightIntensity: 1, lightDistance: 1 },
  ...extra,
});
const withPits = base({
  sunken: [
    { id: 'pool.a', rect: { x0: -2, z0: -10, x1: 2, z1: -4 }, depth: 4 },
    { id: 'tunnel', rect: { x0: -1, z0: -20, x1: 1, z1: -10 }, depth: 4, roof: -0.5 },
    { id: 'pool.b', rect: { x0: -2, z0: -26, x1: 2, z1: -20 }, depth: 4 },
  ],
});

/** Is the local point (y above the floor) inside any solid that is not a blocker? */
const solidAt = (l: InteriorLayout, x: number, y: number, z: number) =>
  l.boxes.some((b) => b.kind !== 'blocker' && x > b.min.x && x < b.max.x && l.floorY + y > b.min.y && l.floorY + y < b.max.y && z > b.min.z && z < b.max.z);

describe('sunken floor cells (v0.7)', () => {
  const l = layoutInterior(withPits, flat);

  it('lowers the floor inside a sunken rect and leaves the rest at the room floor', () => {
    expect(l.floorY).toBe(FLOAT_HEIGHT);
    expect(solidAt(l, 0, -3.9, -6)).toBe(false);
    expect(solidAt(l, 0, -4.2, -6)).toBe(true);
    expect(solidAt(l, 4, -0.2, -6)).toBe(true);
    expect(solidAt(l, 4, 0.2, -6)).toBe(false);
    expect(sunkenDepthAt(withPits, 0, -6)).toBe(4);
    expect(sunkenDepthAt(withPits, 4, -6)).toBe(0);
  });

  it('gives a pit solid sides under the neighbouring floor', () => {
    // Just outside the pool, below the ledge: rock, not void.
    expect(solidAt(l, 2.2, -2, -6)).toBe(true);
    expect(solidAt(l, -2.2, -3.5, -6)).toBe(true);
  });

  it('seals a tunnel above its roof and leaves it open below', () => {
    expect(solidAt(l, 0, -2, -15)).toBe(false);
    expect(solidAt(l, 0, -0.3, -15)).toBe(true);
    expect(solidAt(l, 0, 1.5, -15)).toBe(true);
    // The tunnel mouths open into both pools.
    expect(solidAt(l, 0, -2, -10.2)).toBe(false);
    expect(solidAt(l, 0, -2, -19.8)).toBe(false);
  });

  it('stands a player on a pit floor and puts an anchor there', () => {
    expect(standsIn(l, { x: 0, y: l.floorY - 4, z: -6 })).toBe(true);
    expect(standsIn(l, { x: 0, y: l.floorY - 5, z: -6 })).toBe(false);
    expect(standsIn(l, { x: 4, y: l.floorY - 1, z: -6 })).toBe(false);
    expect(l.anchors.find((a) => a.id === 'pit.floor')?.position.y).toBe(l.floorY - 4);
  });

  it('takes pits deeper than one step off the nav grid and lowers the bounds', () => {
    const grid = new NavGrid(l.nav);
    expect(grid.isWalkable(grid.cellIndex(4, -6))).toBe(true);
    expect(grid.isWalkable(grid.cellIndex(0, -6))).toBe(false);
    expect(l.bounds.min.y).toBeLessThanOrEqual(l.floorY - 4);
  });

  it('refuses a non-positive depth and a roof below the floor', () => {
    expect(() => layoutInterior(base({ sunken: [{ id: 'x', rect: { x0: 0, z0: -2, x1: 1, z1: -1 }, depth: 0 }] }), flat)).toThrow(/positive depth/);
    expect(() => layoutInterior(base({ sunken: [{ id: 'x', rect: { x0: 0, z0: -2, x1: 1, z1: -1 }, depth: 2, roof: -3 }] }), flat)).toThrow(/roof/);
  });

  it('leaves an interior without sunken cells exactly as before (one step pin; every shipped one is in shippedPin.test.ts)', () => {
    const plain = layoutInterior(base(), flat);
    expect(plain.boxes.filter((b) => b.kind === 'floor').every((b) => b.min.y === plain.floorY - 0.5 && b.max.y === plain.floorY)).toBe(true);
  });
});

describe('blocker base and startClosed (v0.7)', () => {
  const def = withPits;
  const bridged = base({
    sunken: def.sunken,
    blockers: [
      { id: 'bridge', rect: { x0: -2, z0: -8, x1: 2, z1: -7 }, height: 4, base: -4, startClosed: true },
      { id: 'gate', rect: { x0: -5, z0: -2, x1: 5, z1: -1.5 }, height: 3 },
    ],
  });
  const l = layoutInterior(bridged, flat);

  it('builds a blocker from its base', () => {
    const b = l.boxes.find((x) => x.blockerId === 'bridge')!;
    expect(b.min.y).toBe(l.floorY - 4);
    expect(b.max.y).toBe(l.floorY);
    const g = l.boxes.find((x) => x.blockerId === 'gate')!;
    expect(g.min.y).toBe(l.floorY);
  });

  it('builds a startClosed blocker closed and a plain one open, and both still toggle', () => {
    const states = new Map<number, boolean>();
    let n = 0;
    const physics = {
      rapier: { ColliderDesc: { cuboid: () => ({ setTranslation: () => ({}) }) } },
      addStaticCollider: () => {
        const id = n++;
        return { setEnabled: (on: boolean) => states.set(id, on) };
      },
      removeCollider: () => undefined,
    };
    const built = buildInterior(l, physics as unknown as Parameters<typeof buildInterior>[1]);
    const order = l.boxes.map((b) => b.blockerId);
    const bridgeIdx = order.indexOf('bridge');
    const gateIdx = order.indexOf('gate');
    expect(states.get(bridgeIdx)).toBe(true);
    expect(states.get(gateIdx)).toBe(false);
    expect(built.setBlocker('bridge', false)).toBe(true);
    expect(states.get(bridgeIdx)).toBe(false);
    expect(built.setBlocker('gate', true)).toBe(true);
    expect(states.get(gateIdx)).toBe(true);
    built.dispose();
  });
});
