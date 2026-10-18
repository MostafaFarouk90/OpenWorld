import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../../region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../../region/corridor.layout';
import { regionAt } from '../../region/regionMask';
import { heightAt } from '../../terrain/heightfield';
import { ALL_INTERIORS } from '../interiors.plugin';
import { groundRange, layoutInterior, MAX_GROUND_RANGE } from '../layout';
import { HARROWMARK_SITE_ANCHORS, HARROWMARK_SITES } from './sites';

const layouts = ALL_INTERIORS.map((d) => layoutInterior(d, heightAt));

describe('interior sites', () => {
  it('ships the six interiors with the v0.5 ids', () => {
    expect(ALL_INTERIORS.map((d) => d.id)).toEqual(['chapel-vault', 'tilted-anvil', 'keep-hall', 'counting-house', 'archive', 'underways']);
  });

  it('floats each Harrowmark interior over its door site', () => {
    for (const d of ALL_INTERIORS) {
      const site = HARROWMARK_SITES[d.id as keyof typeof HARROWMARK_SITES];
      if (site) expect(d.site, d.id).toEqual(site);
    }
  });

  it('keeps the ground under every footprint within the save window', () => {
    for (const d of ALL_INTERIORS) {
      const g = groundRange(d, heightAt);
      expect(g.max - g.min, d.id).toBeLessThanOrEqual(MAX_GROUND_RANGE);
    }
  });

  it('refuses a footprint over steep ground', () => {
    const steep = (x: number) => x * 10;
    expect(() => layoutInterior(ALL_INTERIORS[1]!, (x) => steep(x))).toThrow(/varies by/);
  });

  it('keeps every interior inside the region of its door (music keeps the region track)', () => {
    for (const l of layouts) {
      const region = regionAt(l.def.site.x, l.def.site.z)?.id ?? null;
      const { min, max } = l.bounds;
      for (const [x, z] of [
        [min.x, min.z],
        [min.x, max.z],
        [max.x, min.z],
        [max.x, max.z],
      ]) {
        expect(regionAt(x!, z!)?.id ?? null, l.def.id).toBe(region);
      }
    }
  });

  it('keeps every pair of interiors apart (the plateau puts several floors at one height)', () => {
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const a = layouts[i]!.bounds;
        const b = layouts[j]!.bounds;
        const overlap = a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y && a.min.z < b.max.z && b.min.z < a.max.z;
        expect(overlap, `${layouts[i]!.def.id} / ${layouts[j]!.def.id}`).toBe(false);
      }
    }
  });

  it('uses no anchor or trigger id twice, here or in the region layouts', () => {
    const outdoor = new Set<string>([
      ...BRIGHTWATER_LAYOUT.anchors.map((a) => a.id),
      ...CORRIDOR_LAYOUT.anchors.map((a) => a.id),
      ...(BRIGHTWATER_LAYOUT.triggers ?? []).map((t) => t.id),
      ...(CORRIDOR_LAYOUT.triggers ?? []).map((t) => t.id),
    ]);
    const seen = new Set<string>();
    for (const l of layouts) {
      for (const id of [...l.anchors.map((a) => a.id), ...l.triggers.map((t) => t.id)]) {
        expect(seen.has(id), id).toBe(false);
        expect(outdoor.has(id), id).toBe(false);
        seen.add(id);
      }
    }
    const doors = ALL_INTERIORS.flatMap((d) => d.doors.map((x) => x.doorId));
    expect(new Set(doors).size).toBe(doors.length);
    for (const d of doors) expect(d).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  // Thread 17's layout is not on main yet; once it is, its door anchors must match the copied sites.
  const city = import.meta.glob<{ DOORS?: { anchor: string; x: number; z: number }[] }>('../../harrowmark/harrowmark.layout.ts', {
    eager: true,
  });
  const doors = Object.values(city)[0]?.DOORS;
  it.skipIf(!doors)("matches thread 17's door anchors", () => {
    for (const [id, anchorId] of Object.entries(HARROWMARK_SITE_ANCHORS)) {
      const a = doors!.find((x) => x.anchor === anchorId);
      expect(a, anchorId).toBeDefined();
      const site = HARROWMARK_SITES[id as keyof typeof HARROWMARK_SITES];
      expect(Math.hypot(a!.x - site.x, a!.z - site.z), anchorId).toBeLessThan(0.01);
    }
  });
});
