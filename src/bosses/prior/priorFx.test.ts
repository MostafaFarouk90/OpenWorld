import { describe, expect, it } from 'vitest';
import { AshVeil, CenserRing, ShieldShell } from './priorFx';
import { CENSER_RADIUS } from './tuning';

describe('Prior effects', () => {
  it('the censer ring fills outward to 5 m over the lead, then hides', () => {
    const ring = new CenserRing();
    expect(ring.active).toBe(false);
    ring.start({ x: 1, y: 2, z: 3 }, 0.9);
    expect(ring.active).toBe(true);
    expect(ring.mesh.position.y).toBeCloseTo(2.03);
    const early = ring.mesh.scale.x;
    ring.update(0.45);
    expect(ring.mesh.scale.x).toBeGreaterThan(early);
    ring.update(0.45);
    expect(ring.mesh.scale.x).toBeCloseTo(CENSER_RADIUS);
    ring.update(0.2);
    expect(ring.active).toBe(false);
    ring.update(NaN);
    ring.start({ x: 0, y: 0, z: 0 }, NaN); // a bad lead falls back to 0.9
    ring.update(0.85);
    expect(ring.active).toBe(true);
    ring.stop();
    expect(ring.active).toBe(false);
    ring.dispose();
  });

  it('the shield shell follows the boss while up', () => {
    const shell = new ShieldShell();
    shell.update(0.1, { x: 5, y: 0, z: 5 });
    expect(shell.mesh.position.x).toBe(0);
    shell.set(true);
    shell.update(0.1, { x: 5, y: 0, z: 5 });
    expect(shell.mesh.visible).toBe(true);
    expect(shell.mesh.position.x).toBe(5);
    expect(shell.mesh.position.y).toBeCloseTo(1.3);
    shell.set(false);
    expect(shell.mesh.visible).toBe(false);
    shell.dispose();
  });

  it('the veil shows at the gate with its bottom on the floor and hides', () => {
    const veil = new AshVeil();
    expect(veil.shown).toBe(false);
    veil.show({ x: 0, y: -100, z: -30 }, Math.PI);
    expect(veil.shown).toBe(true);
    expect(veil.mesh.position.y).toBe(-100);
    veil.mesh.geometry.computeBoundingBox();
    expect(veil.mesh.geometry.boundingBox!.min.y).toBeCloseTo(0);
    veil.update(0.5);
    veil.hide();
    expect(veil.shown).toBe(false);
    veil.dispose();
  });
});
