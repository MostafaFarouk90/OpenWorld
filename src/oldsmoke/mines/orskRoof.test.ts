import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../../region/testing/fakeCore';
import { M20_HALL_RECT, M20_ROOF_HEIGHT } from './lowerGalleries';
import { chunkPose, ORSK_GONE_FLAG, registerOrskRoof, roofBurst, roofDrawn, roofFor, roofStep, ROOF_DEBRIS_SECONDS } from './orskRoof';

describe('the roof state', () => {
  it('is up unless Orsk is gone, and a load never starts debris', () => {
    expect(roofFor(false)).toEqual({ present: true, debris: null });
    expect(roofFor(true)).toEqual({ present: false, debris: null });
    expect(roofDrawn(roofFor(true))).toBe(false);
  });

  it('bursts once: the slab goes and the debris clock starts at zero', () => {
    const s = roofBurst(roofFor(false));
    expect(s).toEqual({ present: false, debris: 0 });
    expect(roofDrawn(s)).toBe(true);
    // A second burst, or a burst after a load with Orsk gone, restarts nothing.
    expect(roofBurst(roofStep(s, 0.5))).toEqual({ present: false, debris: 0.5 });
    expect(roofBurst(roofFor(true))).toEqual({ present: false, debris: null });
  });

  it('runs the debris for two seconds and then draws nothing', () => {
    let s = roofBurst(roofFor(false));
    s = roofStep(s, 1.9);
    expect(s.debris).toBeCloseTo(1.9);
    expect(roofDrawn(s)).toBe(true);
    s = roofStep(s, 0.2);
    expect(s).toEqual({ present: false, debris: null });
    expect(roofDrawn(s)).toBe(false);
    expect(ROOF_DEBRIS_SECONDS).toBe(2);
  });

  it('ignores a bad dt and steps a roof with no debris as a no-op', () => {
    const s = roofBurst(roofFor(false));
    for (const dt of [0, -1, Number.NaN, Infinity]) expect(roofStep(s, dt)).toBe(s);
    const up = roofFor(false);
    expect(roofStep(up, 1)).toBe(up);
  });

  it('drops each chunk from the roof to the floor inside the hall, the same way every time', () => {
    for (let i = 0; i < 14; i++) {
      const a = chunkPose(i, 0);
      expect(a.y).toBeCloseTo(M20_ROOF_HEIGHT);
      expect(a.x).toBeGreaterThan(M20_HALL_RECT.x0);
      expect(a.x).toBeLessThan(M20_HALL_RECT.x1);
      expect(a.z).toBeGreaterThan(M20_HALL_RECT.z0);
      expect(a.z).toBeLessThan(M20_HALL_RECT.z1);
      const end = chunkPose(i, ROOF_DEBRIS_SECONDS);
      expect(end.y).toBeLessThan(2);
      expect(chunkPose(i, 1)).toEqual(chunkPose(i, 1));
    }
  });
});

function setup(gone = false, current: string | null = 'mine-lower-galleries') {
  const fc = createFakeCore();
  const interiors = { current };
  fc.services.set('interiors', interiors);
  if (gone) fc.flags.set(ORSK_GONE_FLAG, true);
  const off = registerOrskRoof(fc.ctx);
  const group = fc.scene.getObjectByName('orsk-roof') as THREE.Group;
  const slab = group.getObjectByName('orsk-roof-slab') as THREE.Mesh;
  const debris = group.getObjectByName('orsk-roof-debris') as THREE.InstancedMesh;
  return { fc, interiors, off, group, slab, debris };
}

describe('the roof in the scene', () => {
  it('hangs the slab off a group at the interior origin, 5 m up, visible only inside the Lower Galleries', () => {
    const { fc, interiors, group, slab } = setup();
    expect(slab.visible).toBe(true);
    expect(slab.position.y - 0.4).toBeCloseTo(M20_ROOF_HEIGHT);
    expect(Math.abs(slab.position.x)).toBeLessThan(100);
    expect(group.visible).toBe(true);
    interiors.current = null;
    fc.fire('interior.exited', { interiorId: 'mine-lower-galleries', doorId: 'x' });
    expect(group.visible).toBe(false);
    interiors.current = 'mine-old-galleries';
    fc.fire('interior.entered', { interiorId: 'mine-old-galleries', doorId: 'x' });
    expect(group.visible).toBe(false);
    interiors.current = 'mine-lower-galleries';
    fc.fire('interior.entered', { interiorId: 'mine-lower-galleries', doorId: 'x' });
    expect(group.visible).toBe(true);
  });

  it('is absent from the start when Orsk is gone, and comes back on a load of an older save', () => {
    const { fc, group, slab } = setup(true);
    expect(slab.visible).toBe(false);
    expect(group.visible).toBe(false);
    fc.flags.delete(ORSK_GONE_FLAG);
    fc.fire('save.loaded', { slot: 'a' });
    expect(slab.visible).toBe(true);
    expect(group.visible).toBe(true);
    fc.flags.set(ORSK_GONE_FLAG, true);
    fc.fire('save.loaded', { slot: 'b' });
    expect(slab.visible).toBe(false);
  });

  it('removes the slab with falling debris on the roofBurst beat only, then clears after 2 s', () => {
    const { fc, group, slab, debris } = setup();
    fc.ctx.events.emit('wyrm.orsk', { beat: 'roar' });
    expect(slab.visible).toBe(true);
    fc.ctx.events.emit('wyrm.orsk', { beat: 'roofBurst' });
    expect(slab.visible).toBe(false);
    expect(debris.visible).toBe(true);
    expect(group.visible).toBe(true);
    for (let i = 0; i < 60; i++) fc.tick('animation', 1 / 60);
    expect(debris.visible).toBe(true);
    for (let i = 0; i < 70; i++) fc.tick('animation', 1 / 60);
    expect(debris.visible).toBe(false);
    expect(group.visible).toBe(false);
    // Another beat later does nothing.
    fc.ctx.events.emit('wyrm.orsk', { beat: 'roofBurst' });
    expect(debris.visible).toBe(false);
  });

  it('removes the roof silently when the flag is set live without a burst', () => {
    const { fc, slab, debris } = setup();
    fc.ctx.state.setFlag(ORSK_GONE_FLAG, true);
    expect(slab.visible).toBe(false);
    expect(debris.visible).toBe(false);
  });

  it('undo takes the group out of the scene and stops listening', () => {
    const { fc, off, slab } = setup();
    off();
    expect(fc.scene.getObjectByName('orsk-roof')).toBeUndefined();
    fc.ctx.events.emit('wyrm.orsk', { beat: 'roofBurst' });
    expect(slab.visible).toBe(true);
  });
});
