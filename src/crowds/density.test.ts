import { describe, expect, it } from 'vitest';
import { CROWD_CLUSTERS } from './clusters';
import { clusterOn, densityFor, laneRange, laneTarget, type DensityInput } from './density';

const base: DensityInput = { gate: 'open', stealthActive: false, chaseActive: false, quality: 'high' };

describe('crowd density rules', () => {
  it('is full once the gate is open, and before M06 starts', () => {
    for (const gate of ['open', 'closed'] as const) {
      const d = densityFor({ ...base, gate });
      expect(d).toMatchObject({ scale: 1, guarded: false });
      expect(laneRange('gate-queue', 85, d)).toEqual([0, 85]);
    }
  });

  it('empties only gate-queue, the first 70 m of main street south and the gate-square groups while the gate is guarded', () => {
    const d = densityFor({ ...base, gate: 'guarded' });
    expect(d).toMatchObject({ scale: 1, guarded: true });
    expect(laneRange('gate-queue', 85, d)).toBeNull();
    expect(laneRange('main-street-south', 420, d)).toEqual([70, 420]);
    expect(laneRange('main-street-north', 750, d)).toEqual([0, 750]);
    expect(laneTarget(24, 420, laneRange('main-street-south', 420, d), d)).toBe(Math.round((24 * 350) / 420));
    const gateGroups = CROWD_CLUSTERS.map((c, i) => [c, i] as const).filter(([c]) => c.group === 'gate-square');
    expect(gateGroups.length).toBe(2);
    for (const [c, i] of gateGroups) expect(clusterOn(c, i, d)).toBe(false);
    expect(clusterOn(CROWD_CLUSTERS[0], 0, d)).toBe(true);
  });

  it('treats any live stealth section like the guarded gate', () => {
    expect(densityFor({ ...base, stealthActive: true }).guarded).toBe(true);
  });

  it('empties every lane and group during the chase, whatever else holds', () => {
    const d = densityFor({ ...base, gate: 'guarded', stealthActive: true, chaseActive: true });
    expect(d.scale).toBe(0);
    expect(laneRange('main-street-north', 750, d)).toBeNull();
    expect(laneTarget(40, 750, [0, 750], d)).toBe(0);
    CROWD_CLUSTERS.forEach((c, i) => expect(clusterOn(c, i, d)).toBe(false));
  });

  it('scales counts and the near-figure range with the quality step', () => {
    expect(densityFor({ ...base, quality: 'low' })).toMatchObject({ scale: 0.5, lod0Range: 25 });
    expect(densityFor({ ...base, quality: 'medium' })).toMatchObject({ scale: 0.75, lod0Range: 35 });
    const low = densityFor({ ...base, quality: 'low' });
    const on = CROWD_CLUSTERS.filter((c, i) => clusterOn(c, i, low)).length;
    expect(on).toBe(6);
    expect(laneTarget(40, 750, [0, 750], low)).toBe(20);
  });

  it('takes a night multiplier for a later clock, clamped to 0..1', () => {
    expect(densityFor({ ...base, night: 0.5 }).scale).toBe(0.5);
    expect(densityFor({ ...base, night: 7 }).scale).toBe(1);
    expect(densityFor({ ...base, night: Number.NaN }).scale).toBe(1);
  });
});
