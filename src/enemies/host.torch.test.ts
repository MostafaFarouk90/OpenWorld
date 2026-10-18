import { describe, expect, it } from 'vitest';
import { TORCH_FLAME_RADIUS, torchFromQuests } from './host';

// The quests service exposes R01's carried torch as `torch(): {x,y,z} | null` (src/quests/service.ts). The enemies
// read only `carriedTorch()` before, so no scarecrow could ever be lit (found by src/integration/chapter.e2e.test.ts).
describe('torchFromQuests', () => {
  it('adapts the shipped quests service: a burning torch is lit at its flame position', () => {
    let at: { x: number; y: number; z: number } | null = { x: 1, y: 2, z: 3 };
    const svc = { torch: () => at };
    const t = torchFromQuests(svc);
    expect(t?.lit).toBe(true);
    expect(t?.radius).toBe(TORCH_FLAME_RADIUS);
    expect(t?.position({ x: 0, y: 0, z: 0 })).toEqual({ x: 1, y: 2, z: 3 });
    at = null;
    expect(torchFromQuests(svc)).toBeNull();
  });

  it('still honours a carriedTorch() port, and no service or no torch API means no torch', () => {
    const state = { lit: true, radius: 1, position: (o: { x: number; y: number; z: number }) => o };
    expect(torchFromQuests({ carriedTorch: () => state, torch: () => ({ x: 9, y: 9, z: 9 }) })).toBe(state);
    expect(torchFromQuests(undefined)).toBeNull();
    expect(torchFromQuests({})).toBeNull();
  });
});
