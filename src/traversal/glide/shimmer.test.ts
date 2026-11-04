import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GLIDE_LANES, GLIDE_UPDRAFTS } from './lanes';
import { GlideShimmer, SHIMMER_VIEW_DISTANCE, STREAK_HEIGHT, columnMesh, streakMesh } from './shimmer';

const lip = GLIDE_LANES[0]!.site.ledge;

describe('heat shimmer', () => {
  it('shows only once the Last Anvil burns, and only near the Dragonspine', () => {
    const scene = new THREE.Scene();
    let feet = { x: lip.x, y: lip.y, z: lip.z };
    const s = new GlideShimmer(scene, () => feet);
    s.update(0.016, false);
    expect(s.visible).toBe(false);
    expect(scene.children).toHaveLength(0);
    s.update(0.016, true);
    expect(s.visible).toBe(true);
    const wind = GLIDE_LANES.filter((l) => l.wind > 0).length;
    expect(s.group.children).toHaveLength(GLIDE_UPDRAFTS.length + wind);
    feet = { x: 0, y: 0, z: 0 };
    s.update(0.016, true);
    expect(Math.hypot(lip.x, lip.z)).toBeGreaterThan(SHIMMER_VIEW_DISTANCE);
    expect(s.visible).toBe(false);
    s.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('columns stand on their base and keep vertices local (far-coordinate precision)', () => {
    const u = GLIDE_UPDRAFTS[0]!;
    const m = columnMesh(u);
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!;
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.max.y).toBeCloseTo(u.height, 6);
    expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeLessThanOrEqual(u.radius + 1e-6);
    expect(m.position.x).toBe(u.centre.x);
  });

  it('a streak runs from the lip to where the wind stops, over the ground', () => {
    const lane = GLIDE_LANES.find((l) => l.wind > 0)!;
    const m = streakMesh(lane, () => 100);
    const p = m.geometry.getAttribute('position');
    const last = p.count - 1;
    expect(Math.hypot(p.getX(last - 1) + p.getX(last), p.getZ(last - 1) + p.getZ(last)) / 2).toBeCloseTo(lane.windStop, 0);
    expect(p.getY(0) + lane.site.ledge.y).toBeCloseTo(100 + STREAK_HEIGHT, 6);
  });
});
