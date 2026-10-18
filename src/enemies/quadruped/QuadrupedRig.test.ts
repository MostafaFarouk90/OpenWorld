import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { LEG_IDS } from './gait';
import { HORSE_PROPORTIONS, HOUND, quadrupedDims, type QuadrupedParams } from './params';
import { QuadrupedRig, RIG_NAMES } from './QuadrupedRig';

const bounds = (g: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(g);

describe('QuadrupedRig.build', () => {
  it('has the named joints, with upper and lower segments for each leg', () => {
    const rig = QuadrupedRig.build(HOUND);
    for (const name of ['spine', 'neck', 'head', 'tail']) expect(rig.getObjectByName(name), name).toBeDefined();
    for (const id of LEG_IDS) {
      for (const name of [RIG_NAMES.leg(id), RIG_NAMES.knee(id), RIG_NAMES.upperMesh(id), RIG_NAMES.lowerMesh(id)]) {
        expect(rig.getObjectByName(name), name).toBeDefined();
      }
    }
    const j = QuadrupedRig.joints(rig);
    expect(j.head.parent).toBe(j.neck);
    expect(j.legs.FL.lower.parent).toBe(j.legs.FL.upper);
    expect(j.tail.parent).toBe(j.spine);
    expect(rig.name).toBe('quadruped');
    QuadrupedRig.dispose(rig);
  });

  it('puts feet at y = 0 and faces -Z', () => {
    const rig = QuadrupedRig.build(HOUND);
    const box = bounds(rig);
    expect(box.min.y).toBeCloseTo(0, 5);
    // The head is in front (-Z) of the tail.
    const j = QuadrupedRig.joints(rig);
    const head = j.head.getWorldPosition(new THREE.Vector3());
    const tail = j.tail.getWorldPosition(new THREE.Vector3());
    expect(head.z).toBeLessThan(tail.z);
    // Front legs forward of the hind legs; left legs at -X.
    const fl = j.legs.FL.upper.getWorldPosition(new THREE.Vector3());
    const bl = j.legs.BL.upper.getWorldPosition(new THREE.Vector3());
    const fr = j.legs.FR.upper.getWorldPosition(new THREE.Vector3());
    expect(fl.z).toBeLessThan(bl.z);
    expect(fl.x).toBeLessThan(fr.x);
    // The head is higher than the back at rest (neck angle).
    expect(head.y).toBeGreaterThan(j.spine.getWorldPosition(new THREE.Vector3()).y);
    QuadrupedRig.dispose(rig);
  });

  it('is deterministic: two builds have identical bounds and structure', () => {
    const a = QuadrupedRig.build(HOUND);
    const b = QuadrupedRig.build(HOUND);
    const ba = bounds(a);
    const bb = bounds(b);
    expect(ba.min.toArray()).toEqual(bb.min.toArray());
    expect(ba.max.toArray()).toEqual(bb.max.toArray());
    const names = (g: THREE.Object3D) => {
      const out: string[] = [];
      g.traverse((o) => out.push(o.name));
      return out;
    };
    expect(names(a)).toEqual(names(b));
    QuadrupedRig.dispose(a);
    QuadrupedRig.dispose(b);
  });

  it('bounds follow the params: length, height and scale', () => {
    const rig = QuadrupedRig.build(HOUND);
    const box = bounds(rig);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(HOUND.bodyLength);
    expect(size.z).toBeLessThan(HOUND.bodyLength + 2 * HOUND.neckLength + 0.5);
    expect(box.max.y).toBeGreaterThan(HOUND.legLength + HOUND.bodyHeight * 0.5);

    const big = QuadrupedRig.build({ ...HOUND, scale: 2 });
    const bigBox = bounds(big);
    expect(bigBox.min.y).toBeCloseTo(0, 5);
    expect(bigBox.max.y).toBeCloseTo(box.max.y * 2, 5);
    expect(bigBox.getSize(new THREE.Vector3()).z).toBeCloseTo(size.z * 2, 5);

    const horse: QuadrupedParams = { ...HORSE_PROPORTIONS, tint: 0x888888 };
    const h = QuadrupedRig.build(horse);
    expect(bounds(h).max.y).toBeGreaterThan(box.max.y * 2);
    expect(bounds(h).min.y).toBeCloseTo(0, 5);
    for (const g of [rig, big, h]) QuadrupedRig.dispose(g);
  });

  it('gives each instance its own materials with the tint and emissive applied', () => {
    const a = QuadrupedRig.build(HOUND);
    const b = QuadrupedRig.build(HOUND);
    const ma = QuadrupedRig.materials(a);
    expect(ma.body).not.toBe(QuadrupedRig.materials(b).body);
    expect(ma.body.color.getHex()).toBe(new THREE.Color(HOUND.tint).getHex());
    expect(ma.body.emissive.getHex()).toBe(HOUND.emissive);
    // The tail has a material of its own, and the tail mesh uses it.
    expect((a.getObjectByName('tailMesh') as THREE.Mesh).material).toBe(ma.tail);
    QuadrupedRig.dispose(a);
    QuadrupedRig.dispose(b);
  });

  it('dispose frees every geometry and material, and a second dispose is harmless', () => {
    const rig = QuadrupedRig.build(HOUND);
    const geos = new Set<THREE.BufferGeometry>();
    rig.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) geos.add((o as THREE.Mesh).geometry);
    });
    expect(geos.size).toBeGreaterThan(10);
    const geoSpies = [...geos].map((g) => {
      const fn = vi.fn();
      g.addEventListener('dispose', fn);
      return fn;
    });
    const mats = Object.values(QuadrupedRig.materials(rig));
    const matSpies = mats.map((m) => {
      const fn = vi.fn();
      m.addEventListener('dispose', fn);
      return fn;
    });
    const parent = new THREE.Group();
    parent.add(rig);
    QuadrupedRig.dispose(rig);
    for (const s of geoSpies) expect(s).toHaveBeenCalled();
    for (const s of matSpies) expect(s).toHaveBeenCalled();
    expect(rig.parent).toBeNull();
    expect(() => QuadrupedRig.dispose(rig)).not.toThrow();
  });

  it('rejects invalid params', () => {
    expect(() => QuadrupedRig.build({ ...HOUND, bodyLength: 0 })).toThrow(RangeError);
    expect(() => QuadrupedRig.build({ ...HOUND, legLength: NaN })).toThrow(RangeError);
    expect(() => QuadrupedRig.build({ ...HOUND, scale: -1 })).toThrow(RangeError);
    expect(() => QuadrupedRig.build({ ...HOUND, neckAngle: Infinity })).toThrow(RangeError);
  });

  it('joints() and materials() throw on a foreign object', () => {
    expect(() => QuadrupedRig.joints(new THREE.Group())).toThrow();
    expect(() => QuadrupedRig.materials(new THREE.Group())).toThrow();
  });

  it('the spine rests at the derived height', () => {
    const rig = QuadrupedRig.build(HOUND);
    expect(QuadrupedRig.joints(rig).spine.position.y).toBeCloseTo(quadrupedDims(HOUND).spineRestY, 12);
    QuadrupedRig.dispose(rig);
  });
});
