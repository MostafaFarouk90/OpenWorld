import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerCinderKinds } from './structureKinds';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { CINDERFORD_PLATEAU, HUSHED_ANVIL_PLATEAU, SCORCHHOLD_PLATEAU, STONEFOLD_PLATEAU } from '../terrain/shape/cinderRoad';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { footprintSpread } from './siteFit';
import { CINDERREACH_TOGGLES } from './toggles';
import { ROAD_LENGTH } from './sites';
import { SITES_FIT } from './sitesFit';
import { roadPoint } from '../terrain/shape/roadPoint';
import { M11_STATION_ARC } from '../region/act2/act2World';

const anchor = (id: string) => CINDERREACH_LAYOUT.anchors.find((x) => x.id === id);

let unregister: () => void;
beforeAll(() => {
  unregister = registerCinderKinds();
});
afterAll(() => unregister());

describe('the Cinderreach layout', () => {
  it('validates with no errors', () => {
    expect(validateLayout(CINDERREACH_LAYOUT, heightAt, { spawnId: null })).toEqual([]);
  });

  it('has unique ids and keeps its prefixes off A1 and Act 1 ids', () => {
    const ids = [...CINDERREACH_LAYOUT.anchors, ...CINDERREACH_LAYOUT.triggers, ...CINDERREACH_LAYOUT.structures].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toMatch(/^(cinderroad|harrowmark|brightwater)\./);
  });

  it('defines the contract names other threads read', () => {
    for (const id of [
      'waystone.cinder-road', 'waystone.cinderford', 'waystone.stonefold',
      'cinderreach.hushed-anvil.site', 'cinderreach.dell.bed', 'cinderreach.d03.gate',
      'cinderreach.scorchhold.keep.door', 'npc-post.gaut.cinder-road', 'npc-post.gaut.cinderford',
      'npc-post.aelfreda.anvil', 'npc-post.pennard.cinderford', 'npc-post.ketta.stonefold', 'npc-post.ketta.pasture',
      'npc-post.osgar.scorchhold', 'npc-post.osgar.camp', 'npc-post.osgar.barricade',
    ]) expect(anchor(id), id).toBeTruthy();
    for (const id of ['trg.cinderreach.dell', 'trg.cinderreach.m11.ring']) {
      expect(CINDERREACH_LAYOUT.triggers.find((t) => t.id === id), id).toBeTruthy();
    }
  });

  it('puts every NPC post on an anchor', () => {
    for (const n of CINDERREACH_LAYOUT.npcs) expect(anchor(n.post), n.id).toBeTruthy();
  });

  it('keeps anchors inside A1\'s plateaus and at their heights', () => {
    const waystone = anchor('waystone.cinderford')!;
    expect(Math.abs(heightAt(waystone.x, waystone.z) - CINDERFORD_PLATEAU.height)).toBeLessThan(1.5);
    const stone = anchor('waystone.stonefold')!;
    expect(Math.abs(heightAt(stone.x, stone.z) - STONEFOLD_PLATEAU.height)).toBeLessThan(1.5);
    const site = anchor('cinderreach.hushed-anvil.site')!;
    expect(Math.abs(heightAt(site.x, site.z) - HUSHED_ANVIL_PLATEAU.height)).toBeLessThan(1.5);
    const keep = anchor('cinderreach.scorchhold.keep.door')!;
    expect(Math.abs(heightAt(keep.x, keep.z) - SCORCHHOLD_PLATEAU.height)).toBeLessThan(1.5);
  });

  it('keeps the toggled pieces flat (validateLayout checks the permanent structures)', () => {
    for (const t of CINDERREACH_TOGGLES) {
      expect(footprintSpread(heightAt, t.spec.x, t.spec.z, t.spec.footprint[0], t.spec.footprint[1]), t.id).toBeLessThanOrEqual(1.5);
    }
  });

  it('puts the M11 stone on A1\'s Cinder Road near the station', () => {
    const p = roadPoint('cinder-road', M11_STATION_ARC, 0);
    expect(Math.hypot(SITES_FIT.stone.x - p.x, SITES_FIT.stone.z - p.z)).toBeLessThan(40);
    expect(ROAD_LENGTH).toBeGreaterThan(M11_STATION_ARC);
  });
});
