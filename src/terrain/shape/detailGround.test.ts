// Environment pass G0c: the Act 1 ground tint is the identity outside B1, paints the lane, and stays inside colour range.
import { describe, expect, it } from 'vitest';
import { buildChunkData } from '../chunkGeometry';
import { LANE, laneAmount, tintGround } from './detailGround';
import { RELIEF_TILE, RELIEF_TILE_BAND } from './detailRelief';

const GRASS = [0.2, 0.36, 0.12] as const;
const tint = (x: number, z: number): number[] => {
  const c = new Float32Array(GRASS);
  tintGround(x, z, c, 0);
  return [...c];
};

describe('tintGround', () => {
  it('leaves the colour exactly as it was beyond the B1 blend band and in the far world', () => {
    for (const [x, z] of [[RELIEF_TILE.x1 + RELIEF_TILE_BAND, 50], [-300, -200], [5000, 5000], [1200, 400], [0, RELIEF_TILE.z1 + RELIEF_TILE_BAND]] as const) {
      expect(tint(x, z)).toEqual([...new Float32Array(GRASS)]);
    }
  });

  it('turns the lane centre to dirt and keeps the grass beside it grassy', () => {
    const lane = tint(0, 60);
    const verge = tint(14, 60);
    expect(lane[0]!).toBeGreaterThan(lane[1]! * 0.8); // brown: red close to green
    expect(verge[1]!).toBeGreaterThan(verge[0]!); // green wins
    expect(laneAmount(0, 60)).toBe(1);
    expect(laneAmount(LANE.halfWidth + LANE.edge + 0.1, 60)).toBe(0);
    expect(laneAmount(0, LANE.z1 + LANE.edge + 1)).toBe(0);
  });

  it('varies the open ground: neighbouring patches differ by more than rounding', () => {
    const seen = new Set<string>();
    for (let x = -90; x <= 150; x += 10) seen.add(tint(x, -20).map((v) => v.toFixed(3)).join());
    expect(seen.size).toBeGreaterThan(10);
  });

  it('always yields colours inside 0..1', () => {
    for (let x = -160; x <= 220; x += 4) {
      for (let z = -90; z <= 290; z += 4) {
        for (const v of tint(x, z)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('Brightwater chunk colours', () => {
  it('differ along the lane in a built chunk and match the base grass far away', () => {
    const near = buildChunkData({ centerX: 0, centerZ: 50, size: 100, segments: 64, skirtDepth: 2 });
    const far = buildChunkData({ centerX: 2000, centerZ: 2000, size: 100, segments: 64, skirtDepth: 2 });
    const spread = (d: { colors: Float32Array }): number => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < d.colors.length; i += 3) {
        lo = Math.min(lo, d.colors[i]!);
        hi = Math.max(hi, d.colors[i]!);
      }
      return hi - lo;
    };
    expect(spread(near)).toBeGreaterThan(0.08);
    expect(spread(near)).toBeGreaterThan(spread(far));
  });
});
