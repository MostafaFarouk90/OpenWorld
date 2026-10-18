import { describe, expect, it } from 'vitest';
import { castReach, freeDistance, type CastPorts } from './probes';
import { MOUNT_TUNING as T } from './tuning';

const ports = (wallZ: number | null, opts: { slope?: number; beamY?: number } = {}): CastPorts & { dirs: { y: number }[] } => {
  const dirs: { y: number }[] = [];
  return {
    dirs,
    heightAt: (_x, z) => -(opts.slope ?? 0) * z,
    castBall(from, dir, max) {
      dirs.push({ y: dir.y });
      if (opts.beamY !== undefined && Math.abs(from.y - opts.beamY) > 1) return null;
      if (wallZ === null) return null;
      const d = (from.z - wallZ) / -dir.z;
      return d >= 0 && d <= max ? d : null;
    },
  };
};

describe('ride probes', () => {
  it('reaches far enough to brake in from the gallop', () => {
    expect(castReach(0)).toBe(1.4);
    expect(castReach(12)).toBeCloseTo(144 / 24 + 1.2, 5);
  });

  it('reports the free distance past the nose, Infinity when clear', () => {
    expect(freeDistance(ports(null), { x: 0, y: 0, z: 0 }, 0, -1, 1, 9)).toBe(Infinity);
    expect(freeDistance(ports(-5), { x: 0, y: 0, z: 0 }, 0, -1, 1, 9)).toBeCloseTo(5 - T.noseReach, 5);
    expect(freeDistance(ports(-0.5), { x: 0, y: 0, z: 0 }, 0, -1, 1, 0)).toBe(0);
  });

  it('casts parallel to a 30 degree slope, so the ground itself is not a wall', () => {
    const p = ports(null, { slope: Math.tan(Math.PI / 6) });
    freeDistance(p, { x: 0, y: 0, z: 0 }, 0, -1, 1, 6);
    expect(p.dirs[0].y).toBeCloseTo(Math.sin(Math.PI / 6), 3);
  });

  it('a beam at head height stops the horse too', () => {
    expect(freeDistance(ports(-4, { beamY: T.castHeadHeight }), { x: 0, y: 0, z: 0 }, 0, -1, 1, 9)).toBeCloseTo(4 - T.noseReach, 5);
  });

  it('the rear cast reads behind the rump', () => {
    expect(freeDistance(ports(2), { x: 0, y: 0, z: 0 }, 0, -1, -1, 0)).toBeCloseTo(2 - T.rumpReach, 5);
  });
});
