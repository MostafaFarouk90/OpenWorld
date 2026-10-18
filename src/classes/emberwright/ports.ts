import type * as THREE from 'three';
import type { StatusSpec } from '../../actors/status';
import type { ActorId, ActorsLike, DamageLike, EventsLike, PlayerLike, Vec3 } from '../../vfx/ports';

/** What the Emberwright needs of the game. The plugin builds it from the PluginContext; tests pass fakes. */
export interface EmberwrightHost {
  events: EventsLike;
  actors: ActorsLike;
  player: PlayerLike;
  damage: DamageLike & {
    apply(req: Parameters<DamageLike['apply']>[0] & { statusKind?: never }): ReturnType<DamageLike['apply']>;
  };
  /** The spells service pieces the class uses; null until it is provided. */
  ember(): { value: number; max: number; spend(n: number): boolean; restore(n: number): number } | null;
  status(): { apply(actorId: ActorId, spec: StatusSpec): boolean; has(actorId: ActorId, kind: StatusSpec['kind']): boolean } | undefined;
  /**
   * Moves a hostile `metres` along the horizontal unit `dir` without staggering it. Thread 5's `enemies.push` (draft PR #53);
   * the plugin adapts it in one place, and returns false when the service is not there yet.
   */
  push(actorId: ActorId, dir: Vec3, metres: number): boolean;
  learned(skillId: string): boolean;
  /** Progression's class id (null before the M07 choice). */
  classId(): string | null;
  /** The worn avatar's class (the avatar outlives a respec until the kit swap). */
  avatarClass(): string | null;
  lockOnTarget(): ActorId | null;
  /** True when a static collider lies between the two points (bolts and lines stop at walls). */
  blocked(from: Vec3, to: Vec3): boolean;
  rayCast?(origin: Vec3, dir: Vec3, maxDist: number): { point: Vec3 } | null;
  heightAt?(x: number, z: number): number;
  fx(id: string, at: Vec3, params?: Record<string, unknown>): void;
  /** Soft screen/sound cue for a fizzle. */
  fizzle(): void;
  /** The target is kneeling in a mercy window (Spare/Calm): fire must not start there. */
  yielding?(actorId: ActorId): boolean;
}

export const vec = (v: THREE.Vector3 | Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
