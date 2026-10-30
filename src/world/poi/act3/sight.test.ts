// The road sight rule (design 4.3) and the road dressing's own checks.
import { describe, expect, it } from 'vitest';
import { OLDSMOKE_LAYOUT } from '../../../oldsmoke/oldsmoke.layout';
import { OLDSMOKE_KEEP_OUT } from '../../../oldsmoke/sites';
import { Containment } from '../../../region/containment';
import { ACT3_CORRIDORS, ACT3_HOLES } from '../../../region/act3Containment';
import { heightAt } from '../../../terrain/heightfield';
import { ACT3_ROADS } from '../../../terrain/shape/act3';
import { ACT2_ROADS } from '../../../terrain/shape/act2';
import { ACT3_DRESSING, ACT3_DRESSING_PLACED, DRESSING_KINDS, buildDressing } from './dressing';
import { distToPolyline } from './fit';
import { A3_NEIGHBOUR_LAYOUTS } from './neighbours';
import { ACT3_POI_PLACED } from './place';
import { CANTER_SPEED, MAX_GAP_SECONDS, WALK_SPEED, inView, sightReport, type Sight } from './sight';
import { k2Sights, shippedSights } from './sights';

/** FNV-1a over a string: a fingerprint of a layout, enough to notice any change. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}:${h.toString(16)}`;
}

const ROADS = ['fen-road', 'spine-road', 'deepgate-track'] as const;
const ALL = [...shippedSights(), ...k2Sights()];

describe('the road sight rule (a sight in view from the Knight\'s eye at least every 60 s of walking)', () => {
  it.each(ROADS)('%s: the longest stretch with nothing in view is under 60 s at 4.8 m/s', (road) => {
    const r = sightReport(heightAt, road, ALL);
    const secs = r.worst.metres / WALK_SPEED;
    console.info(`sight gaps along ${road}: worst ${r.worst.metres} m at ${r.worst.from} (walk ${Math.round(secs)} s, canter ${Math.round(r.worst.metres / CANTER_SPEED)} s), ${r.blind} blind samples`);
    expect(secs).toBeLessThanOrEqual(MAX_GAP_SECONDS);
  }, 60000);

  it.each(ROADS)('%s: without K2\'s sights the road fails (the rule is not met by distance alone)', (road) => {
    const r = sightReport(heightAt, road, shippedSights());
    expect(r.worst.metres / WALK_SPEED).toBeGreaterThan(MAX_GAP_SECONDS);
  }, 60000);

  it('line of sight: a ridge between the eye and a sight hides it; on flat ground it shows', () => {
    const s: Sight = { id: 's', x: 300, z: 0, height: 2, range: 450 };
    expect(inView(() => 0, 0, 0, 1.7, s)).toBe(true);
    const ridge = (x: number) => (x > 140 && x < 160 ? 20 : 0);
    expect(inView((x) => ridge(x), 0, 0, 1.7, s)).toBe(false);
    expect(inView(() => 0, 0, 0, 1.7, { ...s, x: 500 })).toBe(false);
    expect(inView((x) => ridge(x), 0, 0, 1.7, { ...s, x: 50 })).toBe(true);
  });
});

describe('road dressing', () => {
  it('every kind builds, seeded by id; ids unique', () => {
    const ids = ACT3_DRESSING.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of DRESSING_KINDS) expect(buildDressing({ id: 'x', kind: k, road: 'fen-road', s: 0, side: 16 }).parts.length, k).toBeGreaterThan(0);
  });

  it('stays inside the road corridor (|side| at most 24 m), off the road surface and every other Act 2 or 3 road', () => {
    for (const d of ACT3_DRESSING_PLACED) {
      expect(Math.abs(d.site.side), d.site.id).toBeLessThanOrEqual(24);
      for (const r of [...ACT3_ROADS, ...ACT2_ROADS]) {
        for (const p of d.parts) expect(distToPolyline(r.points, p.x, p.z), `${d.site.id} ${r.id}`).toBeGreaterThan(r.halfWidth + 1);
      }
    }
  });

  it('is open whenever its road is (all flags of Act 3 set)', () => {
    const flags: Record<string, boolean> = { 'story.gate.a2': true, 'story.d03.complete': true, 'story.gate.a3': true, 'story.phase.dragonspineOpen': true };
    const c = new Containment({ getFlag: (k: string) => flags[k] });
    for (const x of ACT3_CORRIDORS) c.addCorridor(x);
    for (const h of ACT3_HOLES) c.addHole(h);
    for (const d of ACT3_DRESSING_PLACED) expect(c.isOpen(d.pose.x, d.pose.z), d.site.id).toBe(true);
  });

  it('keeps clear of other threads\' triggers, anchors and structures, of K2\'s own sites, and of Oldsmoke\'s keep-out', () => {
    for (const d of ACT3_DRESSING_PLACED) {
      const { x, z } = d.pose;
      for (const l of A3_NEIGHBOUR_LAYOUTS) {
        for (const t of l.triggers) {
          const r = t.shape === 'sphere' ? t.radius : Math.hypot(t.half[0], t.half[2]);
          expect(Math.hypot(t.x - x, t.z - z), `${d.site.id} ${t.id}`).toBeGreaterThan(r + 6);
        }
        for (const a of l.anchors) expect(Math.hypot(a.x - x, a.z - z), `${d.site.id} ${a.id}`).toBeGreaterThan(10);
      }
      for (const p of ACT3_POI_PLACED) expect(Math.hypot(p.pose.x - x, p.pose.z - z), `${d.site.id} ${p.id}`).toBeGreaterThan(p.radius + 10);
      for (const k of OLDSMOKE_KEEP_OUT) expect(Math.hypot(k.x - x, k.z - z), `${d.site.id} ${k.id}`).toBeGreaterThan(k.r);
      for (const a of OLDSMOKE_LAYOUT.anchors) expect(Math.hypot(a.x - x, a.z - z), `${d.site.id} ${a.id}`).toBeGreaterThan(10);
      for (const t of OLDSMOKE_LAYOUT.triggers) expect(Math.hypot(t.x - x, t.z - z), `${d.site.id} ${t.id}`).toBeGreaterThan(30);
    }
  });

  it('leaves Oldsmoke\'s layout as shipped (the Deepgate Track stretch is dressed by K2\'s own data only)', () => {
    expect(fingerprint(JSON.stringify(OLDSMOKE_LAYOUT))).toBe('13309:df3b15dc');
  });
});
