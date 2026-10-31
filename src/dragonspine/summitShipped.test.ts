// The summit on K1's real ground (the shipped heightAt): the walks are under the controller's slope limit, the roost pad is level,
// the decks give a level stand, and the catch volumes leave every standing place
// out. They fail loudly when K1's numbers break a place.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { CATCH_AERIE_ANCHOR, CATCH_LIP_ANCHOR, inAnyVolume, returnPoint } from './chasmCatch';
import { backStep, DECK_STEP } from './glideLedges';
import { SUMMIT_BOX } from '../region/areas';
import { segDist } from './summitSites';
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

  it('lets a walker step onto every launch deck from behind: the back edge is within the auto-step of the ground', () => {
    for (const id of GLIDE_LEDGE_IDS) {
      const l = inp.glideLedges[id]!;
      const deck = b.layout.structures.find((x) => x.id === `dragonspine-glide-${id}-deck`)!;
      const f = { x: -Math.sin(l.heading), z: -Math.cos(l.heading) };
      expect(backStep(heightAt, deck, f, b.glide.deckTop[id]), id).toBeLessThanOrEqual(DECK_STEP);
      expect(DECK_STEP).toBeLessThan(0.4);
    }
  });

  it('catches every carved trough point inside the summit box (5 m grid, feet 0.1 m over the ground)', () => {
    const misses: string[] = [];
    let n = 0;
    for (const t of inp.troughs) {
      const xs = t.points.map((p) => p.x);
      const zs = t.points.map((p) => p.z);
      for (let x = Math.min(...xs) - t.halfWidth; x <= Math.max(...xs) + t.halfWidth; x += 5) {
        for (let z = Math.min(...zs) - t.halfWidth; z <= Math.max(...zs) + t.halfWidth && z < SUMMIT_BOX.z1; z += 5) {
          let d = Infinity;
          for (let i = 1; i < t.points.length; i++) d = Math.min(d, segDist({ x, z }, t.points[i - 1]!, t.points[i]!));
          if (d > t.halfWidth) continue;
          n++;
          if (!inAnyVolume(b.catchVolumes, { x, y: heightAt(x, z) + 0.1, z })) misses.push(`${t.id} ${x},${z}`);
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(misses).toEqual([]);
  });

  it('returns a caught walker to points outside every volume: on the lip deck\'s flat stand and on the Aerie shelf', () => {
    const lip = b.layout.anchors.find((a) => a.id === CATCH_LIP_ANCHOR)!;
    const aerie = b.layout.anchors.find((a) => a.id === CATCH_AERIE_ANCHOR)!;
    const top = b.glide.deckTop['summit-aerie'];
    for (const [a, y] of [[lip, top], [aerie, heightAt(aerie.x, aerie.z)]] as const) {
      const p = returnPoint({ x: a.x, y, z: a.z }, (a.yawDeg * Math.PI) / 180);
      expect(inAnyVolume(b.catchVolumes, p), a.id).toBe(false);
      expect(heightAt(p.x, p.z), `${a.id}: the return point is not under the ground`).toBeLessThanOrEqual(y + 0.01);
    }
  });
});
