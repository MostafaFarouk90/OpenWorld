// N3 arena kit: a floor that breaks (plans/act5-N3.md 1.6). States 'whole' (the start), 'cracked' (the cracks glow) and
// 'broken' (colliders off at once, tiles fall over ARENA_KIT.floorFallS and hide). D10's drop itself is N6's
// `bossArena.phaseTeleport`, so nobody stands on a tile when it goes. External solids (N2's Hammer Hall blocker) are told
// `setSolid(false)` on 'broken' and `setSolid(true)` on reset; the floor adds no geometry for them.
import type * as THREE from 'three';
import type { ArenaPiece } from '../../bosses/arena';
import { ARENA_KIT } from '../lava/tuning';

export type FloorState = 'whole' | 'cracked' | 'broken';

export interface FloorTile {
  mesh?: THREE.Object3D;
  colliders?: readonly { setEnabled(on: boolean): void }[];
}

export interface BreakingFloorOptions {
  tiles?: readonly FloorTile[];
  solids?: readonly { setSolid(solid: boolean): void }[];
  /** Uniforms whose value goes to 1 while cracked or broken (the lava shader's `uCrack`, or a floor material's). */
  crackUniforms?: readonly { value: number }[];
  fallS?: number;
  fallM?: number;
  warn?(message: string): void;
}

const STATES: ReadonlySet<string> = new Set(['whole', 'cracked', 'broken']);

export class BreakingFloor implements ArenaPiece {
  private s: FloorState = 'whole';
  private fallT = 0;
  private readonly startY: number[];
  private warned = new Set<string>();

  constructor(private readonly opts: BreakingFloorOptions) {
    this.startY = (opts.tiles ?? []).map((t) => t.mesh?.position.y ?? 0);
  }

  get state(): FloorState {
    return this.s;
  }

  /** Seconds into the fall (0 unless broken). */
  get falling(): number {
    return this.fallT;
  }

  apply(state: string): void {
    if (!STATES.has(state)) {
      if (!this.warned.has(state)) {
        this.warned.add(state);
        this.opts.warn?.(`BreakingFloor: unknown state "${state}"`);
      }
      return;
    }
    if (state === this.s) return;
    if (state === 'whole') return this.reset();
    if (this.s === 'broken') this.reset(); // broken -> cracked: the tiles come back first
    for (const u of this.opts.crackUniforms ?? []) u.value = 1;
    if (state === 'broken') {
      for (const t of this.opts.tiles ?? []) for (const c of t.colliders ?? []) c.setEnabled(false);
      for (const s of this.opts.solids ?? []) s.setSolid(false);
      this.fallT = 0;
    }
    this.s = state as FloorState;
  }

  reset(): void {
    this.s = 'whole';
    this.fallT = 0;
    (this.opts.tiles ?? []).forEach((t, i) => {
      for (const c of t.colliders ?? []) c.setEnabled(true);
      if (t.mesh) {
        t.mesh.position.y = this.startY[i]!;
        t.mesh.visible = true;
      }
    });
    for (const s of this.opts.solids ?? []) s.setSolid(true);
    for (const u of this.opts.crackUniforms ?? []) u.value = 0;
  }

  update(dt: number): void {
    if (this.s !== 'broken' || !(dt > 0)) return;
    const fallS = this.opts.fallS ?? ARENA_KIT.floorFallS;
    const fallM = this.opts.fallM ?? ARENA_KIT.floorFallM;
    if (this.fallT >= fallS) return;
    this.fallT = Math.min(fallS, this.fallT + dt);
    const k = this.fallT / fallS;
    (this.opts.tiles ?? []).forEach((t, i) => {
      if (!t.mesh) return;
      t.mesh.position.y = this.startY[i]! - fallM * k * k; // accelerating
      if (k >= 1) t.mesh.visible = false;
    });
  }
}
