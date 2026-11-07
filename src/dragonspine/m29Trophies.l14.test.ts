// Act 4 L14 (Act 3 playthrough L3): the M29 trophy notes are far enough apart that only one is in reach in front of each.
import { describe, expect, it } from 'vitest';
import { buildDragonspine } from './layout';
import { M29_TROPHY_OFFSETS } from './shelter';

const READ_RADIUS = 2; // src/quests/notes.ts

describe('M29 trophy notes (L14)', () => {
  const { layout } = buildDragonspine();
  const notes = [1, 2, 3, 4, 5].map((i) => layout.anchors.find((a) => a.id === `dragonspine.shelter.trophy.${i}`)!);
  const wall = layout.structures.find((s) => s.id === 'dragonspine-trophy-wall')!;

  it('five notes, each more than the read radius (with a margin) from its neighbours', () => {
    expect(notes.every(Boolean)).toBe(true);
    for (let i = 1; i < notes.length; i++) {
      expect(Math.hypot(notes[i]!.x - notes[i - 1]!.x, notes[i]!.z - notes[i - 1]!.z)).toBeGreaterThan(READ_RADIUS + 0.5);
    }
  });

  it('all stay in front of the wall, inside its length', () => {
    expect(M29_TROPHY_OFFSETS).toHaveLength(5);
    for (const n of notes) expect(Math.abs(n!.x - wall.x)).toBeLessThan(wall.footprint[0] / 2);
  });
});
