// Act 3 thread K1: the six glide ledge sites on the shaped heightfield, and the lift each lane needs (for K7 PR 2).
import { describe, expect, it } from 'vitest';
import { heightAt } from '../../terrain/heightfield';
import { engineBox } from '../regions';
import { ACT3_GLIDE_LEDGES, ACT3_GLIDE_UPDRAFTS, glideClearance } from './act3Glide';
import { ACT3_PLACES } from './act3Places';

const ledges = Object.values(ACT3_GLIDE_LEDGES);
const inBox = (b: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): boolean => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

describe('Act 3 glide ledges (K1)', () => {
  it('has the six ledges of plan 3.5, each lip on the shaped ground inside the Dragonspine', () => {
    expect(ledges).toHaveLength(6);
    const ds = engineBox('dragonspine');
    for (const l of ledges) {
      expect(heightAt(l.ledge.x, l.ledge.z), l.id).toBeCloseTo(l.ledge.y, 0);
      for (const p of [l.ledge, l.target]) {
        expect(p.x, l.id).toBeGreaterThan(ds.x0);
        expect(p.x, l.id).toBeLessThan(ds.x1);
        expect(p.z, l.id).toBeGreaterThan(ds.z0);
        expect(p.z, l.id).toBeLessThan(ds.z1);
      }
    }
  });

  it('aims each heading at the target (yaw 0 faces -Z) and keeps the target inside its first landing area', () => {
    for (const l of ledges) {
      if (l.id === 'hearth-updraft') continue;
      const fx = -Math.sin(l.heading);
      const fz = -Math.cos(l.heading);
      const len = Math.hypot(l.target.x - l.ledge.x, l.target.z - l.ledge.z);
      expect(fx * (l.target.x - l.ledge.x) + fz * (l.target.z - l.ledge.z), l.id).toBeCloseTo(len, 3);
      expect(inBox(l.landingAreas[0], l.target.x, l.target.z), l.id).toBe(true);
      expect(l.laneHalfAngle).toBeGreaterThan(0);
      expect(l.laneHalfAngle).toBeLessThan(Math.PI / 2);
    }
    expect(ACT3_GLIDE_LEDGES['hearth-updraft'].laneHalfAngle).toBe(Math.PI);
  });

  it('lands the summit-to-Aerie glide on the Aerie shelf with the chasm thermal, and drops into the chasm without it', () => {
    const l = ACT3_GLIDE_LEDGES['summit-aerie'];
    const without = glideClearance(l, heightAt);
    expect(without.landed).toBe(false);
    expect(heightAt(without.at.x, without.at.z)).toBeLessThan(l.catchFloorY + 150);
    const withLift = glideClearance(l, heightAt, ACT3_GLIDE_UPDRAFTS);
    expect(withLift.landed).toBe(true);
    expect(inBox(l.landingAreas[0], withLift.at.x, withLift.at.z)).toBe(true);
    // The Aerie's plateau is the landing: the shelf at 555 m.
    expect(heightAt(withLift.at.x, withLift.at.z)).toBeGreaterThan(500);
    expect(Math.hypot(withLift.at.x - ACT3_PLACES['frostfang-aerie'].x, withLift.at.z - ACT3_PLACES['frostfang-aerie'].z)).toBeLessThan(300);
  });

  it('carries the Skyhold glide over the Hawk Cliffs ridge on the cliff updraft, and not without it', () => {
    const l = ACT3_GLIDE_LEDGES['skyhold-hawk-cliffs'];
    expect(glideClearance(l, heightAt).landed).toBe(false);
    expect(glideClearance(l, heightAt, ACT3_GLIDE_UPDRAFTS).landed).toBe(true);
  });

  it('reports the lift the other lanes still need from K7 (ridge lift or the Anvil heat), within what a thermal can give', () => {
    for (const id of ['summit-skyhold', 'anvil-rime-pass', 'rime-pass-lodge'] as const) {
      const run = glideClearance(ACT3_GLIDE_LEDGES[id], heightAt, ACT3_GLIDE_UPDRAFTS);
      expect(run.landed, id).toBe(false);
      expect(run.deficit, id).toBeGreaterThan(100);
      // Under 400 m: two 160 m thermals at 6 m/s (about 190 m each) cover it.
      expect(run.deficit, id).toBeLessThan(400);
    }
  });

  it('puts each catch floor 5 m over the lowest ground under its lane, outside the landing areas', () => {
    for (const l of ledges) {
      if (l.id === 'hearth-updraft') {
        expect(l.catchFloorY).toBeLessThan(l.ledge.y);
        continue;
      }
      const len = Math.hypot(l.target.x - l.ledge.x, l.target.z - l.ledge.z);
      let lo = Infinity;
      for (let s = 0; s <= len; s += 5) {
        const x = l.ledge.x + ((l.target.x - l.ledge.x) * s) / len;
        const z = l.ledge.z + ((l.target.z - l.ledge.z) * s) / len;
        if (l.landingAreas.some((a) => inBox(a, x, z))) continue;
        lo = Math.min(lo, heightAt(x, z));
      }
      expect(l.catchFloorY, l.id).toBeGreaterThanOrEqual(lo + 4);
      expect(l.catchFloorY, l.id).toBeLessThanOrEqual(lo + 6);
      expect(inBox(l.catchBox, l.ledge.x, l.ledge.z) && inBox(l.catchBox, l.target.x, l.target.z), l.id).toBe(true);
    }
    expect(ACT3_GLIDE_LEDGES['summit-aerie'].catchFloorY).toBe(305);
  });

  it('keeps every lane and catch box inside the world and north of the Ashen Waste (z 11000)', () => {
    for (const l of ledges) {
      expect(l.catchBox.z0, l.id).toBeGreaterThan(11000);
      expect(l.catchBox.z1, l.id).toBeLessThan(16900);
    }
    for (const u of ACT3_GLIDE_UPDRAFTS) expect(u.centre.z - u.radius).toBeGreaterThan(11000);
  });
});
