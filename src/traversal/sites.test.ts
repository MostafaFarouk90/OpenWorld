// The drift guard on the provisional copies of K1's numbers, the fen surfaces' reading, and the dry-ground lint: every
// ferry landing and every dive stand lies outside deep and dive water (a landing on the river's bank would bounce an
// arriving player straight back).
import { describe, expect, it, vi } from 'vitest';
import { fenVolumes, ferryNetwork, k1FenSurfaces, type FenSurface } from './fenWater';
import { heightAt } from '../terrain/heightfield';
import { M24_DIVE_ROUTES } from './routes';
import { ACT3_FERRY, M24_POOL, m24Volume } from './sites';
import { WaterVolumes } from './water/WaterVolumes';

const k1Places = import.meta.glob<Record<string, unknown>>('../region/act3/act3Places.ts', { eager: true });

describe("K1's numbers", () => {
  const k1 = Object.values(k1Places)[0];
  it.runIf(k1 !== undefined)('the copies match act3Places.ts (swap them for the import)', () => {
    expect(k1!.M24_POOL).toEqual(M24_POOL);
    const ferry = k1!.ACT3_FERRY as { surfaceY: number; stops: unknown[]; paths: { from: string; to: string; points: unknown }[] };
    expect(ferry.surfaceY).toBe(ACT3_FERRY.surfaceY);
    expect(ferry.stops).toEqual(ACT3_FERRY.stops);
    // K1's channels, once drawn, are the ride's paths.
    if (ferry.paths.length > 0) expect(ferry.paths.map((p) => [p.from, p.to])).toEqual(ACT3_FERRY.paths.map((p) => [p.from, p.to]));
  });
});

describe('fen surfaces', () => {
  it('reads either outline form and either height name; an unreadable entry warns and is skipped', () => {
    const warn = vi.fn();
    const surfaces: FenSurface[] = [
      { id: 'water.channel', kind: 'deep', surfaceY: 6, outline: { kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]] } },
      { id: 'mere', kind: 'deep', surfaceY: 6, outline: { kind: 'circle', x: 100, z: 100, radius: 20 } },
      { id: 'water.mere-shelf', kind: 'wade', surfaceY: 6, outline: { kind: 'circle', x: 100, z: 100, radius: 30, innerRadius: 20 } },
      { id: 'bad', kind: 'lake' as never, surfaceY: 6, outline: { kind: 'polygon', points: [[0, 0], [5, 0], [0, 5]] } },
      { id: 'flat', kind: 'wade', surfaceY: 6, outline: { kind: 'polygon', points: [[0, 0], [5, 0]] } },
    ];
    const vs = fenVolumes(surfaces, warn);
    expect(vs.map((v) => [v.id, v.kind, v.surfaceY])).toEqual([
      ['water.channel', 'deep', 6],
      ['water.greyfen.mere', 'deep', 6],
      ['water.mere-shelf', 'wade', 6],
    ]);
    expect(vs[0].area).toEqual({ polygon: [[0, 0], [10, 0], [0, 10]] });
    expect(warn).toHaveBeenCalledTimes(2);
    // The ring reads as a ring: deep inside the inner radius, wading on the shelf.
    const w = new WaterVolumes({ groundAt: () => 0, flags: { getFlag: () => undefined } });
    for (const v of vs) w.register(v);
    expect(w.volumeAt({ x: 100, y: 3, z: 100 })?.kind).toBe('deep');
    expect(w.volumeAt({ x: 125, y: 5.5, z: 100 })?.kind).toBe('wade');
    expect(w.volumeAt({ x: 135, y: 5.5, z: 100 })).toBeNull();
  });

  it("the ferry rides K1's channels once K1 has drawn them, else the provisional lines", () => {
    expect(ferryNetwork({ ...ACT3_FERRY, paths: [] } as never)).toBe(ACT3_FERRY);
    const k1 = { surfaceY: 6, stops: ACT3_FERRY.stops, paths: [{ from: 'reedgate', to: 'mere', points: [[1, 2], [3, 4]] as const }] };
    expect(ferryNetwork(k1).paths).toEqual([{ from: 'reedgate', to: 'mere', points: [{ x: 1, z: 2 }, { x: 3, z: 4 }] }]);
  });
});

describe('dry ground', () => {
  it('no ferry landing (on the terrain) and no dive stand is inside deep or dive water (with K1 surfaces when present)', () => {
    const w = new WaterVolumes({ groundAt: () => 0, flags: { getFlag: () => undefined } });
    w.register(m24Volume());
    for (const v of fenVolumes(k1FenSurfaces(), () => {})) w.register(v);
    const wet = (x: number, y: number, z: number) => {
      const v = w.volumeAt({ x, y, z });
      return v !== null && v.kind !== 'wade';
    };
    const net = ferryNetwork();
    // A landing stands on its quay: the terrain there (K1's shaping when in the build) must be above deep water.
    for (const s of net.stops) expect(wet(s.x, heightAt(s.x, s.z) + 0.05, s.z), s.id).toBe(false);
    for (const r of M24_DIVE_ROUTES) {
      expect(wet(r.entryStand.x, r.entryStand.y + 0.1, r.entryStand.z), `${r.id} entry`).toBe(false);
      for (const p of r.airPockets) expect(wet(p.stand.x, p.stand.y + 0.1, p.stand.z), `${r.id} ${p.id}`).toBe(false);
    }
  });
});
