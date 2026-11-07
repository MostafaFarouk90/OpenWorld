import { describe, expect, it } from 'vitest';
import { StubDocument } from '../dom';
import { ShelterArrow, arrowDegrees, nearestRefuge } from './ShelterArrow';
import { nearestRopePoint } from './act4Hud.plugin';
import { ROPE_LINE_GEOMS, SHELTER_SPOTS } from '../../region/act4/ropeLines';

const shelters = [
  { id: 'a', x: 100, z: 0 },
  { id: 'b', x: 0, z: 50 },
];

describe('nearestRefuge', () => {
  it('picks the nearest shelter, or the rope when it is nearer', () => {
    expect(nearestRefuge(0, 0, shelters)).toMatchObject({ kind: 'shelter', id: 'b', distance: 50 });
    expect(nearestRefuge(0, 0, shelters, { id: 'rope', x: 10, z: 0 })).toMatchObject({ kind: 'rope', id: 'rope', distance: 10 });
    expect(nearestRefuge(0, 0, shelters, { id: 'rope', x: 500, z: 0 })).toMatchObject({ kind: 'shelter', id: 'b' });
  });

  it('skips bad points and gives null with nothing usable', () => {
    expect(nearestRefuge(0, 0, [{ id: 'x', x: Number.NaN, z: 0 }])).toBeNull();
    expect(nearestRefuge(Number.NaN, 0, shelters)).toBeNull();
    expect(nearestRefuge(0, 0, [])).toBeNull();
  });
});

describe('arrowDegrees (yaw 0 faces -Z, positive yaw turns left)', () => {
  const o = { x: 0, z: 0 };
  it('ahead is 0, right is +90, left is -90, behind is 180', () => {
    expect(arrowDegrees(o, { x: 0, z: -10 }, 0)).toBe(0);
    expect(arrowDegrees(o, { x: 10, z: 0 }, 0)).toBe(90);
    expect(arrowDegrees(o, { x: -10, z: 0 }, 0)).toBe(-90);
    expect(Math.abs(arrowDegrees(o, { x: 0, z: 10 }, 0))).toBe(180);
  });

  it('turns with the camera: facing the target after turning right puts it ahead', () => {
    // Turning right a quarter (yaw -PI/2) faces +X.
    expect(arrowDegrees(o, { x: 10, z: 0 }, -Math.PI / 2)).toBe(0);
    expect(arrowDegrees(o, { x: 0, z: -10 }, -Math.PI / 2)).toBe(-90);
  });
});

describe('nearestRopePoint', () => {
  it('lands on a rope-line near its own points and is null far away', () => {
    const line = ROPE_LINE_GEOMS[0]!;
    const [x, z] = line.points[0]!;
    const p = nearestRopePoint(x + 1, z)!;
    expect(p).not.toBeNull();
    expect(Math.hypot(p.x - x, p.z - z)).toBeLessThan(5);
    expect(nearestRopePoint(-5000, -5000)).toBeNull();
  });

  it('every shipped shelter is a usable target', () => {
    expect(SHELTER_SPOTS.length).toBeGreaterThan(0);
    for (const s of SHELTER_SPOTS) expect(Number.isFinite(s.at.x) && Number.isFinite(s.at.z)).toBe(true);
  });
});

describe('ShelterArrow', () => {
  it('hidden when inactive, shown with the distance and turned when active, hidden again', () => {
    let active = false;
    const a = new ShelterArrow(new StubDocument(), {
      active: () => active,
      player: () => ({ x: 0, z: 0 }),
      cameraYaw: () => 0,
      shelters: () => shelters,
      nearestRope: () => null,
    });
    a.update();
    expect(a.visible).toBe(false);
    active = true;
    a.update();
    expect(a.visible).toBe(true);
    expect(a.element.children[1]!.textContent).toBe('Shelter 50 m');
    expect(a.element.children[0]!.style.transform).toBe('rotate(180deg)');
    active = false;
    a.update();
    expect(a.visible).toBe(false);
  });

  it('names a rope-line when that is nearer, and survives a throwing source', () => {
    const a = new ShelterArrow(new StubDocument(), {
      active: () => true,
      player: () => ({ x: 0, z: 0 }),
      shelters: () => shelters,
      nearestRope: () => ({ id: 'r', x: 3, z: 0 }),
    });
    a.update();
    expect(a.element.children[1]!.textContent).toBe('Rope-line 3 m');
    const b = new ShelterArrow(new StubDocument(), {
      active: () => true,
      player: () => ({ x: 0, z: 0 }),
      shelters: () => { throw new Error('x'); },
      nearestRope: () => { throw new Error('y'); },
    });
    b.update();
    expect(b.visible).toBe(false);
  });
});
