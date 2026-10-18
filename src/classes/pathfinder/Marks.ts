import * as THREE from 'three';
import type { ActorsLike, Vec3 } from '../../vfx/ports';
import { PF } from './tuning';

export interface MarkPorts {
  actors: ActorsLike;
  now(): number;
  added(id: string): void;
  removed(id: string): void;
}

/**
 * Falcon Eye: the Kestrel marks hostiles near the player. A mark is a glyph and a weak point: the first bolt that hits a
 * marked enemy within the mark's seconds breaks its poise further (no flat damage bump, the Trail branch's one is
 * Trailblaze) and uses the mark up.
 */
export class Marks {
  private readonly until = new Map<string, number>();

  constructor(private readonly ports: MarkPorts) {}

  get count(): number {
    return this.until.size;
  }

  /** Marks every living hostile within `PF.falconEye.radius` of `centre`; a second cast refreshes. Returns how many. */
  cast(centre: Vec3): number {
    const t = this.ports.now() + PF.falconEye.seconds;
    let n = 0;
    for (const a of this.ports.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.hittable) continue;
      const p = a.worldPosition(SCRATCH);
      if (Math.hypot(p.x - centre.x, p.z - centre.z) > PF.falconEye.radius) continue;
      if (!this.until.has(a.id)) this.ports.added(a.id);
      this.until.set(a.id, t);
      n++;
    }
    return n;
  }

  isMarked(id: string): boolean {
    const t = this.until.get(id);
    return t !== undefined && t > this.ports.now();
  }

  /** The poise bonus a bolt gets on a marked enemy; the mark is spent. */
  consume(id: string): number {
    if (!this.isMarked(id)) return 0;
    this.drop(id);
    return PF.falconEye.weakPoise;
  }

  update(): void {
    for (const [id, t] of [...this.until]) {
      const a = this.ports.actors.get(id);
      if (t <= this.ports.now() || !a || a.dead) this.drop(id);
    }
  }

  clear(): void {
    for (const id of [...this.until.keys()]) this.drop(id);
  }

  private drop(id: string): void {
    if (this.until.delete(id)) this.ports.removed(id);
  }
}

const SCRATCH = new THREE.Vector3();
