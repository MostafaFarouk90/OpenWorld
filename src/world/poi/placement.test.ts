import { describe, expect, it } from 'vitest';
import { Containment } from '../../region/containment';
import { ACT2_CORRIDORS } from '../../region/act2/act2World';
import { heightAt } from '../../terrain/heightfield';
import { ACT2_PLATEAUS, ACT2_ROADS } from '../../terrain/shape/act2';
import { roadLength, roadPoint } from '../../terrain/shape/roadPoint';
import { FOXFIRE_CHESTS, FOX_CACHE_POS, foxChestPos } from './content';
import { A3_LEDGE_IDS, ACT2_POI_PLACEMENTS, resolvePose } from './placement.act2';
import { placePiece } from './place';
import { spurCorridorFor } from './poi.plugin';
import { POI_TEMPLATES } from './types';

type Flags = Record<string, boolean>;
const ACT1: Flags = {};
const PHASE_C: Flags = { 'story.gate.a2': true };
const PHASE_D: Flags = { 'story.gate.a2': true, 'story.d03.complete': true };

function containment(flags: Flags, withSpurs = true): Containment {
  const c = new Containment({ getFlag: (k: string) => flags[k] });
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  if (withSpurs) for (const p of ACT2_POI_PLACEMENTS) {
    const spur = spurCorridorFor(p, placePiece(p.site, resolvePose(p)).radius);
    if (spur) c.addCorridor(spur);
  }
  return c;
}

const placed = ACT2_POI_PLACEMENTS.map((p) => ({ p, pose: resolvePose(p), poi: placePiece(p.site, resolvePose(p)) }));

function range(cx: number, cz: number, r: number): number {
  let mn = Infinity;
  let mx = -Infinity;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (dx * dx + dz * dz > r * r) continue;
    const h = heightAt(cx + dx, cz + dz);
    mn = Math.min(mn, h);
    mx = Math.max(mx, h);
  }
  return mx - mn;
}

function distToPolyline(pts: readonly { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, bx = pts[i].x, bz = pts[i].z;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)));
  }
  return best;
}

describe('Act 2 placement counts', () => {
  it('has 11 template POIs, every template at least once, at least 2 caves', () => {
    expect(ACT2_POI_PLACEMENTS).toHaveLength(11);
    const by = (t: string) => ACT2_POI_PLACEMENTS.filter((p) => p.site.template === t).length;
    for (const t of POI_TEMPLATES) expect(by(t), t).toBeGreaterThanOrEqual(1);
    expect(by('cave')).toBeGreaterThanOrEqual(2);
    expect(by('wyrm-nest')).toBe(2);
  });
  it('has unique ids and the two nest ids A6b/A6a rely on', () => {
    const ids = ACT2_POI_PLACEMENTS.map((p) => p.site.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('wyrm-nest-1');
    expect(ids).toContain('wyrm-nest-2');
    for (const id of ['wyrm-nest-1', 'wyrm-nest-2']) expect(placed.find((x) => x.p.site.id === id)!.poi.layout.anchors.map((a) => a.id)).toContain(`poi.a2.${id}.spawn.1`);
  });
  it('builds 5 Leap spots of its own; with A3\'s 5 story ledges the act has 10', () => {
    const mine = placed.filter((x) => x.poi.leap).length;
    expect(mine).toBe(5);
    expect(A3_LEDGE_IDS).toHaveLength(5);
    expect(mine + A3_LEDGE_IDS.length).toBe(10);
  });
  it('has 6 Fox-Fire chests', () => {
    expect(FOXFIRE_CHESTS).toHaveLength(6);
    expect(new Set(FOXFIRE_CHESTS.map((f) => f.n)).size).toBe(6);
  });
});

describe('Act 2 placement against the real world', () => {
  it('stands on ground (above water level) with flat ledge footprints and a gentle disc', () => {
    for (const { p, pose, poi } of placed) {
      expect(heightAt(pose.x, pose.z), p.site.id).toBeGreaterThan(2);
      expect(range(pose.x, pose.z, Math.min(poi.radius, 12)), p.site.id).toBeLessThan(6);
      for (const s of poi.layout.structures) {
        const r = Math.max(...s.footprint) / 2;
        const rg = range(s.x, s.z, Math.floor(r * 0.8));
        // A ledge's height is measured from the highest ground within 1 m: its footprint must be level.
        expect(rg, `${p.site.id} ${s.id}`).toBeLessThan(s.role === 'ledge' ? 0.3 : 1.6);
      }
    }
  });

  it('keeps clear of every plateau (box plus blend) and every road', () => {
    for (const { p, pose, poi } of placed) {
      for (const pl of ACT2_PLATEAUS) {
        const m = poi.radius + pl.blend;
        const clear = pose.x < pl.box.minX - m || pose.x > pl.box.maxX + m || pose.z < pl.box.minZ - m || pose.z > pl.box.maxZ + m;
        expect(clear, `${p.site.id} vs ${pl.id}`).toBe(true);
      }
      for (const r of ACT2_ROADS) {
        expect(distToPolyline(r.points, pose.x, pose.z) - poi.radius, `${p.site.id} vs ${r.id}`).toBeGreaterThan(r.halfWidth);
      }
    }
  });

  it('does not overlap another POI, a Fox-Fire chest or the fox cache', () => {
    for (const a of placed) {
      for (const b of placed) {
        if (a === b) continue;
        expect(Math.hypot(a.pose.x - b.pose.x, a.pose.z - b.pose.z), `${a.p.site.id}/${b.p.site.id}`).toBeGreaterThan(a.poi.radius + b.poi.radius);
      }
      for (const f of FOXFIRE_CHESTS) {
        const q = foxChestPos(f);
        expect(Math.hypot(a.pose.x - q.x, a.pose.z - q.z)).toBeGreaterThan(a.poi.radius + 20);
      }
      expect(Math.hypot(a.pose.x - FOX_CACHE_POS.x, a.pose.z - FOX_CACHE_POS.z)).toBeGreaterThan(a.poi.radius + 20);
    }
  });

  it('keeps the Fox-Fire chests and the cache on dry ground', () => {
    for (const f of FOXFIRE_CHESTS) {
      const q = foxChestPos(f);
      expect(heightAt(q.x, q.z), `foxfire ${f.n}`).toBeGreaterThan(2);
    }
    expect(heightAt(FOX_CACHE_POS.x, FOX_CACHE_POS.z)).toBeGreaterThan(2);
  });

  it('is closed in Act 1, open per phase: Cinderreach sites in Phase C, the pass lore stone only in Phase D', () => {
    const act1 = containment(ACT1);
    const c = containment(PHASE_C);
    const d = containment(PHASE_D);
    for (const { p, poi } of placed) {
      const pts = poi.layout.anchors.map((a) => ({ x: a.x, z: a.z }));
      const inPass = p.site.id === 'lore-stone-1';
      for (const a of pts) {
        expect(act1.isOpen(a.x, a.z), `${p.site.id} act1`).toBe(false);
        expect(d.isOpen(a.x, a.z), `${p.site.id} phase D`).toBe(true);
        expect(c.isOpen(a.x, a.z), `${p.site.id} phase C`).toBe(!inPass);
      }
    }
  });

  it('needs spur corridors only for sites outside the Cinderreach box, and those are what makes them open', () => {
    const spurred = ACT2_POI_PLACEMENTS.filter((p) => spurCorridorFor(p, placePiece(p.site, resolvePose(p)).radius));
    expect(spurred.length).toBeGreaterThan(0);
    const without = containment(PHASE_D, false);
    const withSpurs = containment(PHASE_D);
    const closed = spurred.filter((p) => {
      const pose = resolvePose(p);
      return !without.isOpen(pose.x, pose.z);
    });
    expect(closed.length).toBeGreaterThan(0);
    for (const p of spurred) {
      const pose = resolvePose(p);
      expect(withSpurs.isOpen(pose.x, pose.z), p.site.id).toBe(true);
    }
  });

  it('gives a sight along the Cinder Road at least every 3 km, and reports the cadence', () => {
    const len = roadLength('cinder-road');
    const arcs = placed.filter((x) => x.p.road === 'cinder-road').map((x) => x.p.s);
    arcs.push(5000); // A3's blighted waystone at the M11 station
    const marks = [0, ...arcs.sort((a, b) => a - b), len];
    const gaps = marks.slice(1).map((m, i) => m - marks[i]);
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];
    const sec = (v: number) => Math.round(max / v);
    console.info(`poi sight gaps along the Cinder Road: median ${median} m, max ${max} m (canter ${sec(9)} s, gallop ${sec(12)} s, sprint ${sec(7.5)} s)`);
    expect(max).toBeLessThanOrEqual(3000);
    expect(roadPoint('cinder-road', 0).x).toBeLessThan(10000);
  });
});
