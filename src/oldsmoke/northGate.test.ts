// Act 3 thread K1: Deepgate's north gate onto the Deepgate Track (an additive edit to Oldsmoke's layout).
import { describe, expect, it } from 'vitest';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';
import { BOX, EDGE, GATE_W, NORTH_GATE } from './sites';

const structures = OLDSMOKE_LAYOUT.structures;

describe('Deepgate north gate (Act 3)', () => {
  it('sits on the north wall line, inside the walls, with an open gate piece', () => {
    expect(NORTH_GATE.z).toBe(EDGE.n);
    expect(NORTH_GATE.x).toBeGreaterThan(EDGE.w + 20);
    expect(NORTH_GATE.x).toBeLessThan(EDGE.e - 20);
    const gate = structures.find((s) => s.id === 'oldsmoke-gate-north');
    expect(gate).toMatchObject({ mode: 'open', x: NORTH_GATE.x, z: NORTH_GATE.z });
  });

  it('splits the north wall around a gap exactly the gate width, with no solid piece across it', () => {
    expect(structures.find((s) => s.id === 'oldsmoke-wall-n')).toBeUndefined();
    const pieces = structures.filter((s) => s.id === 'oldsmoke-wall-n1' || s.id === 'oldsmoke-wall-n2');
    expect(pieces).toHaveLength(2);
    const [w, e] = pieces.sort((a, b) => a.x - b.x);
    expect(e.x - e.footprint[0] / 2 - (w.x + w.footprint[0] / 2)).toBeCloseTo(GATE_W, 6);
    // Nothing solid stands in the passage, 40 m either side of the wall.
    for (const s of structures) {
      if (s.mode !== 'solid' || s.id.startsWith('oldsmoke-wall-n')) continue;
      // Deepgate's pieces are axis-aligned (yaw 0 or 180 keeps the footprint on x and z; 90 or 270 swaps it).
      const swap = Math.abs(((s.yawDeg ?? 0) % 180) - 90) < 1;
      const hx = (swap ? s.footprint[1] : s.footprint[0]) / 2;
      const hz = (swap ? s.footprint[0] : s.footprint[1]) / 2;
      const blocksX = Math.abs(s.x - NORTH_GATE.x) < GATE_W / 2 + hx;
      const blocksZ = Math.abs(s.z - NORTH_GATE.z) < 40 + hz;
      expect(blocksX && blocksZ, `${s.id} blocks the north gate`).toBe(false);
    }
  });

  it('opens onto the plateau edge (the track starts at the box edge)', () => {
    expect(BOX.maxZ - NORTH_GATE.z).toBeGreaterThan(0);
    expect(BOX.maxZ - NORTH_GATE.z).toBeLessThan(10);
  });
});
