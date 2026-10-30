// The Act 3 sites against the real world (K1's ground, the other threads' layouts, K0's containment).
import { readFileSync } from '../../../region/testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { renderAnchorsDoc } from '../../../region/anchorsDoc';
import { Containment } from '../../../region/containment';
import { ACT3_CORRIDORS, ACT3_HOLES } from '../../../region/act3Containment';
import { engineBox } from '../../../region/regions';
import { heightAt } from '../../../terrain/heightfield';
import { GREYFEN_LAYOUT } from '../../../greyfen/greyfen.layout';
import { HATHRENS_MERE, GREYFEN_WATER_TABLE } from '../../../terrain/shape/greyfen';
import { ACT3_PLACES } from '../../../region/act3/act3Places';
import { A3_RUBBING_IDS, A3_RUBBING_TEXTS, A3_SONG_STONE_TEXT, rubbingSites } from './content';
import { siteProblems } from './fit';
import { A3_NEIGHBOUR_LAYOUTS } from './neighbours';
import { ACT3_POI_DOC, ACT3_POI_LAYOUT, ACT3_POI_PLACED, ACT3_POI_PLACEMENTS } from './place';
import { a3SpurCorridorFor } from './poiAct3.plugin';
import { ISLET_TIERS } from './templates';
import { A3_POI_TEMPLATES } from './types';

type Flags = Record<string, boolean>;
const BEFORE: Flags = { 'story.gate.a2': true, 'story.d03.complete': true };
const PHASE_E: Flags = { ...BEFORE, 'story.gate.a3': true };
const OPEN: Flags = { ...PHASE_E, 'story.phase.dragonspineOpen': true };

function containment(flags: Flags, spurs = true): Containment {
  const c = new Containment({ getFlag: (k: string) => flags[k] });
  for (const d of ACT3_CORRIDORS) c.addCorridor(d);
  for (const h of ACT3_HOLES) c.addHole(h);
  if (spurs) {
    ACT3_POI_PLACEMENTS.forEach((p, i) => {
      const s = a3SpurCorridorFor(p, ACT3_POI_PLACED[i]);
      if (s) c.addCorridor(s);
    });
  }
  return c;
}

describe('Act 3 POI counts and ids', () => {
  it('ten points of interest, five in each region, every template once; eight Leap spots; six rubbings', () => {
    const pois = ACT3_POI_PLACED.filter((p) => p.template !== 'leap-cache');
    expect(pois).toHaveLength(10);
    expect(new Set(pois.map((p) => p.template))).toEqual(new Set(A3_POI_TEMPLATES));
    expect(pois.filter((p) => p.region === 'greyfen')).toHaveLength(5);
    expect(pois.filter((p) => p.region === 'dragonspine')).toHaveLength(5);
    expect(ACT3_POI_PLACED.filter((p) => p.leap)).toHaveLength(8);
    const r = rubbingSites();
    expect(r.map((x) => x.rubbing).sort()).toEqual([...A3_RUBBING_IDS]);
    for (const x of r) expect(x.site.region, x.rubbing).toBe('dragonspine');
  });

  it('ids are unique and under the plan prefixes; triggers under the region prefixes or trg.poi.a3.', () => {
    const ids = ACT3_POI_LAYOUT.anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ACT3_POI_PLACED) {
      for (const a of p.layout.anchors) expect(a.id.startsWith(`${p.region}.poi.${p.id}.`), a.id).toBe(true);
      for (const t of p.layout.triggers) {
        expect(t.id, p.id).toBe(p.region === 'greyfen' || p.region === 'dragonspine' ? `trg.${p.region}.poi.${p.id}.discover` : `trg.poi.a3.${p.id}.discover`);
      }
      for (const it of p.piece.interactables) expect(/^[a-z]+:[a-z0-9-]+$/.test(it.id), it.id).toBe(true);
    }
  });
});

describe('Act 3 sites on the real ground', () => {
  it.each(ACT3_POI_PLACED.map((p) => [p.id, p] as const))('%s passes every site check', (_id, p) => {
    expect(siteProblems(p, heightAt, { layouts: A3_NEIGHBOUR_LAYOUTS, others: ACT3_POI_PLACED })).toEqual([]);
  });

  it('the reed island stands on the Mere shelf, top above the water table, clear of deep water', () => {
    const p = ACT3_POI_PLACED.find((x) => x.template === 'reed-island')!;
    const d = Math.hypot(p.pose.x - HATHRENS_MERE.x, p.pose.z - HATHRENS_MERE.z);
    expect(d - p.radius).toBeGreaterThan(HATHRENS_MERE.radius);
    expect(d + p.radius).toBeLessThan(HATHRENS_MERE.radius + HATHRENS_MERE.shelfWidth);
    const floor = heightAt(p.pose.x, p.pose.z);
    expect(floor).toBeLessThan(GREYFEN_WATER_TABLE);
    expect(floor + ISLET_TIERS[ISLET_TIERS.length - 1].height).toBeGreaterThan(GREYFEN_WATER_TABLE);
  });

  it('the song stone is on the north shore, away from K9 shrine ring (south shore) and M23 searches, its text its own', () => {
    const p = ACT3_POI_PLACED.find((x) => x.template === 'song-stone')!;
    expect(p.pose.z).toBeGreaterThan(HATHRENS_MERE.z);
    expect(Math.hypot(p.pose.x - ACT3_PLACES['hathrens-mere'].x, p.pose.z - ACT3_PLACES['hathrens-mere'].z)).toBeGreaterThan(300);
    for (const a of GREYFEN_LAYOUT.anchors.filter((x) => x.id.startsWith('greyfen.m23.'))) expect(Math.hypot(a.x - p.pose.x, a.z - p.pose.z), a.id).toBeGreaterThan(40);
    const texts = Object.values(A3_RUBBING_TEXTS).map((t) => t.body);
    expect(texts).not.toContain(A3_SONG_STONE_TEXT.body);
  });

  it('every Dragonspine site is outside the summit hole and inside the lower slopes box', () => {
    const b = engineBox('dragonspine');
    const c = containment(OPEN);
    for (const p of ACT3_POI_PLACED.filter((x) => x.region === 'dragonspine')) {
      expect(p.pose.x > b.x0 && p.pose.x < b.x1 && p.pose.z > b.z0 && p.pose.z < b.z1, p.id).toBe(true);
      for (const a of p.layout.anchors) expect(c.isOpen(a.x, a.z), a.id).toBe(true);
    }
  });
});

describe('Act 3 sites and containment', () => {
  it('is closed before the Act 3 gate', () => {
    const c = containment(BEFORE);
    for (const a of ACT3_POI_LAYOUT.anchors) expect(c.isOpen(a.x, a.z), a.id).toBe(false);
  });

  it('opens the Greyfen and the Fen Road cache with the gate; the Dragonspine and the Spine Road cache only with the Phase E hold lifted', () => {
    const e = containment(PHASE_E);
    const o = containment(OPEN);
    for (const p of ACT3_POI_PLACED) {
      const early = p.region === 'greyfen' || p.region === 'fenroad';
      for (const a of p.layout.anchors) {
        expect(e.isOpen(a.x, a.z), `${a.id} phase E`).toBe(early);
        expect(o.isOpen(a.x, a.z), `${a.id} open`).toBe(true);
      }
    }
  });

  it('the null-land caches need their spur: without it they are closed', () => {
    const without = containment(OPEN, false);
    const spurred = ACT3_POI_PLACEMENTS.filter((p, i) => a3SpurCorridorFor(p, ACT3_POI_PLACED[i]));
    expect(spurred.map((p) => p.site.id).sort()).toEqual(['fen-boundary-stone', 'spine-crag']);
    for (const p of spurred) {
      const placed = ACT3_POI_PLACED.find((x) => x.id === p.site.id)!;
      // Part of the site's disc lies beyond the road corridor's 40 m; the spur is what opens it.
      const ring = Array.from({ length: 16 }, (_, k) => ({ x: placed.pose.x + Math.cos((k / 16) * Math.PI * 2) * placed.radius, z: placed.pose.z + Math.sin((k / 16) * Math.PI * 2) * placed.radius }));
      expect(ring.some((q) => !without.isOpen(q.x, q.z)), p.site.id).toBe(true);
    }
  });

  it('a fall from any ledge edge lands on open ground (no strand: a ring 6 m out is open)', () => {
    const c = containment(OPEN);
    for (const p of ACT3_POI_PLACED.filter((x) => x.leap)) {
      const ledge = p.layout.structures.find((s) => s.role === 'ledge')!;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        expect(c.isOpen(ledge.x + Math.cos(a) * 6, ledge.z + Math.sin(a) * 6), `${p.id} ${i}`).toBe(true);
      }
    }
  });
});

describe('Act 3 POI anchor doc', () => {
  it('ANCHORS.md matches the layout (regenerate with tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/world/poi/act3/ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(ACT3_POI_LAYOUT, ACT3_POI_DOC));
  });
});
