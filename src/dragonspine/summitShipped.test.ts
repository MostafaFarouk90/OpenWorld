// The summit on K1's real ground (the shipped heightAt): the walks are under the controller's slope limit, the roost pad is level,
// the decks give a level stand, and the catch volumes leave every standing place
// out. They fail loudly when K1's numbers break a place.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { inAnyVolume } from './chasmCatch';
import { defaultInputs } from './inputs';
import { buildDragonspine } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { GLIDE_LEDGE_IDS } from './summitSites';
import { TAN_40, worstSlope } from './testing/walk';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

const inp = defaultInputs(heightAt);
const b = buildDragonspine(inp);

describe('the summit on the shipped ground', () => {
  it('walks the roost climb, the Skyhold ledge path and the Aerie route under the slope limit', () => {
    for (const [name, path] of [
      ['roost climb', b.roost.climb],
      ['Skyhold ledges', b.skyhold.ledgePath],
      ['Aerie route', b.aerie.route.slice(0, 3)],
    ] as const) {
      expect(path.length, name).toBeGreaterThan(1);
      expect(worstSlope(heightAt, path), name).toBeLessThanOrEqual(TAN_40);
    }
  });

  it('keeps the roost pad level for M31\'s trial', () => {
    const r = inp.plateaus.find((p) => p.id === 'dragon-roost')!.box;
    const ys: number[] = [];
    for (let x = r.minX + 5; x <= r.maxX - 5; x += 5) for (let z = r.minZ + 5; z <= r.maxZ - 5; z += 5) ys.push(heightAt(x, z));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });

  it('builds every glide deck at or over the lip', () => {
    for (const id of GLIDE_LEDGE_IDS) {
      const l = inp.glideLedges[id]!;
      expect(b.glide.deckTop[id], id).toBeGreaterThanOrEqual(heightAt(l.ledge.x, l.ledge.z) - 0.01);
    }
  });

  it('leaves every standing anchor out of the catch volumes (feet on the ground are never caught)', () => {
    for (const a of b.layout.anchors) {
      if (a.tags?.includes('elevated') || a.onStructure) continue;
      const y = heightAt(a.x, a.z) + (a.dy ?? 0) + 0.1;
      expect(inAnyVolume(b.catchVolumes, { x: a.x, y, z: a.z }), a.id).toBe(false);
    }
  });
});
