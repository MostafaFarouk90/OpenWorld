// Act 4 L14 (Phase G report L1): M37's toast is offered only on the inn's floor, not outside below it.
import { describe, expect, it } from 'vitest';
import { SAME_FLOOR_DY, onFloorWithin } from './shared';
import type { Kit } from './shared';

const kitAt = (feet: { x: number; y: number; z: number }, anchor: { x: number; y: number; z: number } | null) =>
  ({
    ctx: {
      player: { feet },
      anchors: { find: (id: string) => (anchor && id === 'feast' ? { id, position: anchor } : undefined) },
    },
  }) as unknown as Kit;

describe('onFloorWithin (L14)', () => {
  const table = { x: 100, y: 160, z: 50 }; // a floated interior, 150 m over ground at 10 m

  it('is true at the table and across the room', () => {
    expect(onFloorWithin(kitAt({ x: 100, y: 160, z: 50 }, table), 'feast', 12)).toBe(true);
    expect(onFloorWithin(kitAt({ x: 110, y: 160.4, z: 55 }, table), 'feast', 12)).toBe(true);
  });

  it('is false outside at the door, right under the table', () => {
    expect(onFloorWithin(kitAt({ x: 104, y: 10, z: 54 }, table), 'feast', 12)).toBe(false);
  });

  it('is false on the floor but beyond the radius, and false at the floor limit plus a step', () => {
    expect(onFloorWithin(kitAt({ x: 120, y: 160, z: 50 }, table), 'feast', 12)).toBe(false);
    expect(onFloorWithin(kitAt({ x: 100, y: 160 + SAME_FLOOR_DY + 0.5, z: 50 }, table), 'feast', 12)).toBe(false);
  });

  it('is false when the anchor is missing', () => {
    expect(onFloorWithin(kitAt({ x: 0, y: 0, z: 0 }, null), 'feast', 12)).toBe(false);
  });
});
