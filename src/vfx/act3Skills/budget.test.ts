// K11: the tier 4 presets together stay well inside the 11.1 cap of 4,000 live points.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EFFECTS } from '../effects/index';
import { ACT3_SKILL_EFFECT_IDS } from './index';
import { ASHBLADE_T4_PARTICLES } from './ashblade';
import { KNIGHT_T4_PARTICLES } from './knight';
import { WARDEN_T4_PARTICLES } from './warden';
import { EFFECT_IDS } from '../types';

describe('act3 skill VFX budget', () => {
  it('every preset has a peak entry and all nine skills together use under a tenth of the cap', () => {
    const table: Record<string, number> = { ...KNIGHT_T4_PARTICLES, ...WARDEN_T4_PARTICLES, ...ASHBLADE_T4_PARTICLES };
    for (const id of ACT3_SKILL_EFFECT_IDS) expect(table[id], id).toBeGreaterThanOrEqual(0);
    expect(Object.values(table).reduce((a, b) => a + b, 0)).toBeLessThan(400);
  });

  it('the ids are registered and unique', () => {
    for (const id of ACT3_SKILL_EFFECT_IDS) expect(EFFECT_IDS).toContain(id);
    expect(new Set(EFFECT_IDS).size).toBe(EFFECT_IDS.length);
  });
});

/**
 * Runs a preset against a recording FxContext on a manual clock and returns the peak of live points: every `points.emit(kind,
 * pos, n, { life })` counts n points from its emit time until `life` later. Counts what the preset really emits, not its table.
 */
function measurePeak(id: string, transform: object, params: object, seconds: number): number {
  let t = 0;
  const emits: Array<{ at: number; n: number; life: number }> = [];
  const ctx = {
    scene: new THREE.Scene(),
    now: () => t,
    points: { emit: vi.fn((_k: string, _p: unknown, n: number, o: { life?: number } | undefined, at?: number) => (emits.push({ at: at ?? t, n, life: o?.life ?? 1 }), n)) },
    sparks: { burst: vi.fn() },
    decals: { place: vi.fn(() => true) },
    lights: { flash: vi.fn() },
    dissolver: {},
  };
  const fx = (EFFECTS as any)[id](ctx, transform, params);
  let alive = true;
  for (t = 0; t <= seconds && alive; t += 1 / 60) alive = fx.update(t);
  fx.stop();
  let peak = 0;
  for (const e of emits) peak = Math.max(peak, emits.reduce((sum, o) => (o.at <= e.at + 1e-9 && e.at < o.at + o.life ? sum + o.n : sum), 0));
  return peak;
}

describe('act3 skill VFX budget: measured points', () => {
  const at = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
  const variants: Record<string, Array<[object, number]>> = {
    'bastion-wall': [[{ seconds: 8 }, 9], [{ flicker: 1 }, 1]],
    'executioners-arc': [[{}, 1]],
    'hearthfire-motes': [[{}, 3], [{ heart: 1 }, 3]],
    skullsplitter: [[{}, 2], [{ staggered: true }, 2]],
    earthroot: [[{ seconds: 5 }, 6]],
    'earthroot-shock': [[{ radius: 3 }, 2]],
    'frenzied-hearth': [[{}, 10]],
  };

  it('no preset emits more live points than its declared table entry (counted through a recording FxContext)', () => {
    const table: Record<string, number> = { ...KNIGHT_T4_PARTICLES, ...WARDEN_T4_PARTICLES };
    for (const [id, list] of Object.entries(variants)) {
      const measured = Math.max(...list.map(([p, s]) => measurePeak(id, at, p, s)));
      expect(measured, id).toBeLessThanOrEqual(table[id]);
      expect(measured, id).toBeGreaterThan(0);
    }
    expect(Object.keys(variants).sort()).toEqual(Object.keys(table).sort());
  });

  it('the measured sum of the real emitters stays inside the declared sum and under a tenth of the cap', () => {
    const table: Record<string, number> = { ...KNIGHT_T4_PARTICLES, ...WARDEN_T4_PARTICLES };
    const sum = Object.entries(variants).reduce((a, [id, list]) => a + Math.max(...list.map(([p, s]) => measurePeak(id, at, p, s))), 0);
    expect(sum).toBeLessThanOrEqual(Object.values(table).reduce((a, b) => a + b, 0));
    expect(sum).toBeLessThan(400);
  });
});
