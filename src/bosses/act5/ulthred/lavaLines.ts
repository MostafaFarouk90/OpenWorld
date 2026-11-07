// Phase 1's lava lines (plans/act5-N6.md section 3): each slam leaves a ribbon of N3's lava along its line for 6 s. N3's rules
// apply: the lava burns but never kills, and throws Cael to the nearest lip, here two lips beside the line's middle. Without the
// `lava` service (headless tests) the lines are only counted.
import type * as THREE from 'three';
import type { LavaService } from '../../../caldera/lava/service';
import { LAVA_LINE } from './tuning';

interface Line {
  id: string;
  left: number;
  undo: (() => void) | null;
}

export class LavaLines {
  private readonly lines: Line[] = [];
  private n = 0;

  constructor(
    private readonly lava: () => LavaService | undefined,
    private readonly warn: (m: string) => void,
    private readonly prefix = 'ulthred.lava.line',
  ) {}

  get count(): number {
    return this.lines.length;
  }

  /** A line from `a` to `b` on a floor at `floorY`. */
  add(a: THREE.Vector3Like, b: THREE.Vector3Like, floorY: number): void {
    const id = `${this.prefix}.${++this.n}`;
    const line: Line = { id, left: LAVA_LINE.seconds, undo: null };
    const svc = this.lava();
    if (svc) {
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      // Perpendicular to the line, both sides.
      const px = (-(b.z - a.z) / len) * LAVA_LINE.lipOffset;
      const pz = ((b.x - a.x) / len) * LAVA_LINE.lipOffset;
      try {
        line.undo = svc.add({
          id,
          shape: { kind: 'ribbon', points: [[a.x, a.z], [b.x, b.z]], halfWidth: LAVA_LINE.halfWidth },
          surfaceY: floorY + LAVA_LINE.surface,
          damagePctPerS: LAVA_LINE.damagePctPerS,
          depth: 1,
          safeLips: [
            { x: mx + px, y: floorY, z: mz + pz },
            { x: mx - px, y: floorY, z: mz - pz },
          ],
        });
      } catch (err) {
        this.warn(`lava line refused (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    this.lines.push(line);
  }

  tick(dt: number): void {
    if (!(dt > 0)) return;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]!;
      l.left -= dt;
      if (l.left <= 0) {
        this.drop(l);
        this.lines.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const l of this.lines.splice(0)) this.drop(l);
  }

  private drop(l: Line): void {
    try {
      l.undo?.();
    } catch (err) {
      this.warn(`lava line removal failed (${String(err)})`);
    }
    l.undo = null;
  }
}
