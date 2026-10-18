import * as THREE from 'three';

export type ActorId = string;
export type Team = 'player' | 'ally' | 'neutral' | 'hostile';
export const TEAMS: readonly Team[] = ['player', 'ally', 'neutral', 'hostile'];

export interface ActorInit {
  kind: string;
  team: Team;
  /** Integer >= 1; default 1. */
  level?: number;
  maxHealth: number;
  maxPoise?: number;
  maxStamina?: number;
  /** Training dummies: take hits and emit events, health refills, never die. */
  immortal?: boolean;
  /** False drops every damage request silently (NPCs). Default true. */
  hittable?: boolean;
  root?: THREE.Object3D | null;
  /** The object WeaponTracer and HurtboxSet know (HitEvent.attacker / target). More via ActorRegistry.bindOwner. */
  owner?: unknown;
  /** Only 'player' is given explicitly; others get `${kind}#${n}`. */
  id?: ActorId;
  /** Set by the spawner (e.g. 'spawn.m01'), read-only afterwards; quests filter kills on it. */
  spawnTag?: string;
  /** AI target selection and lock-on never pick it (companions; v0.4 forward hook for Hrolf). Default false. */
  untargetable?: boolean;
}

function nonNegative(v: number | undefined, name: string): number {
  const n = v ?? 0;
  if (!Number.isFinite(n) || n < 0) throw new Error(`Actor: ${name} must be a finite number >= 0`);
  return n;
}

/**
 * Health, poise, stamina and identity of anything that fights or can be hit
 * (contracts/actors-and-damage.md section 1). Only DamageResolver changes health and `dead`.
 */
export class Actor {
  readonly id: ActorId;
  readonly kind: string;
  readonly spawnTag: string | undefined;
  team: Team;
  level: number;
  health: number;
  maxHealth: number;
  poise: number;
  maxPoise: number;
  stamina: number;
  maxStamina: number;
  readonly immortal: boolean;
  hittable: boolean;
  /** Skipped by `ActorRegistry.nearest(..., { targetable: true })`, AI targeting and lock-on. */
  untargetable: boolean;
  root: THREE.Object3D | null;
  /** I-frames: damage requests resolve as 'immune'. */
  invulnerable = false;
  /** Per-thread scratch keyed by namespace, e.g. data['enemies']. */
  readonly data: Record<string, unknown> = {};
  /** @internal set by DamageResolver */
  _dead = false;

  constructor(id: ActorId, init: ActorInit) {
    if (!init.kind) throw new Error('Actor: kind is required');
    const maxHealth = nonNegative(init.maxHealth, 'maxHealth');
    if (maxHealth <= 0) throw new Error('Actor: maxHealth must be > 0');
    const level = init.level ?? 1;
    if (!Number.isInteger(level) || level < 1) throw new Error('Actor: level must be an integer >= 1');
    this.id = id;
    this.kind = init.kind;
    this.spawnTag = init.spawnTag;
    this.team = init.team;
    this.level = level;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.maxPoise = nonNegative(init.maxPoise, 'maxPoise');
    this.poise = this.maxPoise;
    this.maxStamina = nonNegative(init.maxStamina, 'maxStamina');
    this.stamina = this.maxStamina;
    this.immortal = init.immortal ?? false;
    this.hittable = init.hittable ?? true;
    this.untargetable = init.untargetable ?? false;
    this.root = init.root ?? null;
  }

  get dead(): boolean {
    return this._dead;
  }

  get alive(): boolean {
    return !this._dead;
  }

  /** The root's world position, or `out` unchanged when there is no root. */
  worldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.root ? this.root.getWorldPosition(out) : out;
  }

  /** False (and nothing spent) if stamina is short; n <= 0 or not finite is a no-op returning true. */
  spendStamina(n: number): boolean {
    if (!Number.isFinite(n) || n <= 0) return true;
    if (this.stamina < n) return false;
    this.stamina -= n;
    return true;
  }

  restoreStamina(n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this.stamina = Math.min(this.maxStamina, this.stamina + n);
  }

  /** Back to max by default; clamps to max. */
  restorePoise(n?: number): void {
    if (n === undefined) {
      this.poise = this.maxPoise;
      return;
    }
    if (!Number.isFinite(n) || n <= 0) return;
    this.poise = Math.min(this.maxPoise, this.poise + n);
  }
}
