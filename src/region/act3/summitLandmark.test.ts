import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { heightAt as realHeightAt } from '../../terrain/heightfield';
import { SUMMIT_AREA, SUMMIT_CENTRE, SUMMIT_LANDMARK_ID, buildSummitLandmark, distanceToSummitArea, summitPlacement } from './summitLandmark';

/** A cheap fake summit: a cone of 600 m about (14000, 15800) on 100 m ground. */
const fake = (x: number, z: number) => 100 + Math.max(0, 500 - Math.hypot(x - 14000, z - 15800) * 0.2);
const FAR = 5040;
const fog = new THREE.Color(0x8a9ba8);
const cam = (x: number, y: number, z: number) => ({ x, y, z });

describe('summit landmark', () => {
  it('has its id', () => {
    expect(SUMMIT_LANDMARK_ID).toBe('landmark.dragonspine-summit');
    expect(buildSummitLandmark(fake).object.name).toBe(SUMMIT_LANDMARK_ID);
  });

  it('builds in under 50 ms with a cheap heightAt, and says what the real one costs', () => {
    const t0 = performance.now();
    const l = buildSummitLandmark(fake);
    expect(performance.now() - t0).toBeLessThan(50);
    l.dispose();
    // The real shaped heightfield: about 1,400 samples. Measured at about 10 ms; the bound is loose for slow CI.
    const t1 = performance.now();
    buildSummitLandmark(realHeightAt).dispose();
    expect(performance.now() - t1).toBeLessThan(500);
  });

  it('is hidden indoors', () => {
    const l = buildSummitLandmark(fake);
    l.update(cam(6500, 130, 6000), FAR, fog, true);
    expect(l.object.visible).toBe(false);
    l.update(cam(6500, 130, 6000), FAR, fog, false);
    expect(l.object.visible).toBe(true);
  });

  it('is hidden near: at the lodge, inside 0.9 x far of the summit', () => {
    const l = buildSummitLandmark(fake);
    l.update(cam(13600, 130, 11900), FAR, fog, false);
    expect(Math.hypot(14000 - 13600, 15800 - 11900)).toBeLessThan(0.9 * FAR);
    expect(l.object.visible).toBe(false);
    // Just outside 0.9 x far of the summit area's near edge it appears.
    l.update(cam(14000, 130, SUMMIT_AREA.minZ - 0.9 * FAR - 10), FAR, fog, false);
    expect(l.object.visible).toBe(true);
    l.update(cam(14000, 130, SUMMIT_AREA.minZ - 0.9 * FAR + 10), FAR, fog, false);
    expect(l.object.visible).toBe(false);
  });

  it('stays hidden wherever the real summit ground is inside view distance (the Spine Road, the Deepgate Track)', () => {
    const l = buildSummitLandmark(fake);
    for (const c of [cam(10500, 60, 12500), cam(15400, 80, 11250)]) {
      expect(distanceToSummitArea(c.x, c.z)).toBeLessThan(0.9 * FAR);
      l.update(c, FAR, fog, false);
      expect(l.object.visible, `(${c.x}, ${c.z})`).toBe(false);
    }
    expect(distanceToSummitArea(14000, 15800)).toBe(0);
  });

  it('is shown far: from the Fen Road and the Cinder Road, along the line of sight and inside the far plane', () => {
    const l = buildSummitLandmark(fake);
    const radius = (l.object.children[0] as THREE.Mesh).geometry.boundingSphere!.radius;
    for (const c of [cam(6500, 40, 6000), cam(12600, 40, 2900)]) {
      l.update(c, FAR, fog, false);
      expect(l.object.visible).toBe(true);
      const p = l.object.position;
      const placed = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
      expect(placed).toBeLessThanOrEqual(0.9 * FAR + 1e-6);
      // The whole silhouette stays inside the far plane.
      expect(placed + radius * l.object.scale.x).toBeLessThan(FAR);
      // The group's origin sits on the ray from the camera to the summit centre.
      const real = new THREE.Vector3(SUMMIT_CENTRE.x - c.x, -c.y, SUMMIT_CENTRE.z - c.z).normalize();
      const got = new THREE.Vector3(p.x - c.x, p.y - c.y, p.z - c.z).normalize();
      expect(got.dot(real)).toBeCloseTo(1, 9);
    }
  });

  it('matches the real angular size: scale is placed distance over real distance', () => {
    for (const c of [cam(6500, 40, 6000), cam(12600, 40, 2900), cam(20000, 40, 20000)]) {
      const p = summitPlacement(c, FAR, 2800);
      const placed = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
      // angular size of an object of width w at distance d is w / d: scaled width over placed distance = real width over real distance.
      expect(p.scale * 2800 / placed).toBeCloseTo(2800 / p.distance, 9);
      expect(p.scale).toBeLessThan(1);
    }
    expect(summitPlacement(cam(13600, 130, 11900), FAR, 2800).scale).toBe(1);
  });

  it('builds the silhouette from heightAt: the crest top is the real top, skirted to the ground', () => {
    const l = buildSummitLandmark(fake);
    const pos = (l.object.children[0] as THREE.Mesh).geometry.getAttribute('position');
    let max = -Infinity;
    let min = Infinity;
    for (let i = 0; i < pos.count; i++) {
      max = Math.max(max, pos.getY(i));
      min = Math.min(min, pos.getY(i));
    }
    expect(max).toBeGreaterThan(580);
    expect(max).toBeLessThanOrEqual(600 + 1e-3);
    expect(min).toBe(0);
  });

  it('keeps its vertices local to its own centre', () => {
    const l = buildSummitLandmark(fake);
    const pos = (l.object.children[0] as THREE.Mesh).geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual((SUMMIT_AREA.maxX - SUMMIT_AREA.minX) / 2 + 1e-3);
      expect(pos.getZ(i)).toBeGreaterThanOrEqual(SUMMIT_AREA.minZ - SUMMIT_CENTRE.z - 1e-3);
      expect(pos.getZ(i)).toBeLessThanOrEqual(SUMMIT_AREA.maxZ - SUMMIT_CENTRE.z + 1e-3);
      expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThan(3000);
    }
  });

  it('tints toward the fog by distance and recolours when the fog colour changes', () => {
    const l = buildSummitLandmark(fake);
    const col = (l.object.children[0] as THREE.Mesh).geometry.getAttribute('color');
    l.update(cam(6500, 40, 6000), FAR, new THREE.Color(0xffffff), false);
    const white = col.getX(0);
    l.update(cam(6500, 40, 6000), FAR, new THREE.Color(0x000000), false);
    expect(col.getX(0)).toBeLessThan(white);
  });

  it('frees its geometry and material on dispose and leaves the scene', () => {
    const l = buildSummitLandmark(fake);
    const parent = new THREE.Group();
    parent.add(l.object);
    const mesh = l.object.children[0] as THREE.Mesh;
    let g = 0;
    let m = 0;
    mesh.geometry.addEventListener('dispose', () => g++);
    (mesh.material as THREE.Material).addEventListener('dispose', () => m++);
    l.dispose();
    expect([g, m]).toEqual([1, 1]);
    expect(l.object.parent).toBeNull();
  });
});
