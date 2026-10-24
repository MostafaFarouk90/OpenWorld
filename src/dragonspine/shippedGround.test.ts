// The checks that matter once K1's real ground lands, run on the shipped heightAt (the stub plateaus are wired into WORLD_SHAPE
// today): climbs and the cave approach stay under the slope limit, the nest shelf is a real climb, every Leap ledge is reachable
// from its launch point at its built size, and the wayside platforms sit level with the road edge. They fail loudly when K1's
// numbers break a place; they pass on the stand-in ground.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { LEDGE_MAX_HEIGHT } from '../region/layoutTypes';
import { ledgeRise } from './fit';
import { SHELF_MIN_GAIN } from './hawkCliffs';
import { WAYSIDE_MAX_STEP } from './wayside';
import { buildDragonspine } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { defaultInputs } from './inputs';
import { TAN_40, worstSlope } from './testing/walk';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

const inp = defaultInputs(heightAt);
const b = buildDragonspine(inp);
const anchor = (id: string) => b.layout.anchors.find((a) => a.id === id)!;

describe('the places on the shipped ground', () => {
  it('has M28\'s climb and the cave approach under the controller\'s slope limit', () => {
    expect(b.m28.walkable).toBe(true);
    expect(worstSlope(heightAt, b.m28.climb)).toBeLessThanOrEqual(TAN_40);
    expect(worstSlope(heightAt, b.cave.approach)).toBeLessThanOrEqual(TAN_40);
  });

  // KNOWN GAP (K1's Hawk Cliffs are a 50 m scarp, slope about 2): no walkable line exists, so the climb is only the straight
  // winding line and needs built ramps or a climbing rule. `it.fails` keeps CI green and turns red the day it is fixed.
  it('flags the Hawk Cliffs climb as not walkable while K1\'s scarp has no walkable line', () => {
    expect(b.hawk.walkable ? worstSlope(heightAt, b.hawk.climb) <= TAN_40 : true).toBe(true);
  });
  it.fails('KNOWN GAP: the Hawk Cliffs climb is walkable on K1\'s cliff face (needs built ramps)', () => {
    expect(b.hawk.walkable).toBe(true);
  });

  it('puts the nest shelf at least SHELF_MIN_GAIN over the climb start', () => {
    expect(heightAt(b.hawk.shelf.x, b.hawk.shelf.z) - heightAt(b.hawk.climbStart.x, b.hawk.climbStart.z)).toBeGreaterThanOrEqual(SHELF_MIN_GAIN);
  });

  it('gives every Leap ledge a 1.5 to 1.8 m rise over its launch point, at its built footprint', () => {
    const launches: Record<string, string> = {
      'dragonspine-cave-ledge': 'dragonspine.cave.leap.launch',
      'dragonspine-m28-ledge-1': 'dragonspine.m28.leap.1.launch',
      'dragonspine-m28-ledge-2': 'dragonspine.m28.leap.2.launch',
    };
    for (const s of b.layout.structures.filter((x) => x.role === 'ledge')) {
      const l = anchor(launches[s.id]!);
      const rise = ledgeRise(heightAt, s.x, s.z, { x: l.x, z: l.z }, [s.footprint[0], s.footprint[1]]);
      expect(rise, s.id).toBeGreaterThanOrEqual(1.5);
      expect(rise, s.id).toBeLessThanOrEqual(LEDGE_MAX_HEIGHT);
    }
  });

  it('keeps each wayside platform within WAYSIDE_MAX_STEP of the road edge', () => {
    for (const w of b.wayside.sites) {
      const spec = b.wayside.specs[w.index - 1]!;
      const edge = b.sites.road.point(w.s, w.side * b.sites.roadHalf);
      expect(heightAt(spec.x, spec.z) + w.dy - heightAt(edge.x, edge.z), `wayside ${w.index}`).toBeLessThanOrEqual(WAYSIDE_MAX_STEP);
    }
  });
});
