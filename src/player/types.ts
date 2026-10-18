// Structural ports of the pieces of thread 0's contracts that the pure combat-verb models use
// (contracts/actors-and-damage.md sections 1 and 4, game-events-and-flags.md). They let the models be
// built and tested before the core exists; the real classes satisfy them structurally.

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export type Team = 'player' | 'ally' | 'neutral' | 'hostile';
export type DamageOutcome = 'hit' | 'blocked' | 'parried' | 'immune';

/** The slice of `Actor` the models read and write. */
export interface ActorLike {
  readonly id: string;
  team: Team;
  health: number;
  maxHealth: number;
  poise: number;
  maxPoise: number;
  stamina: number;
  maxStamina: number;
  invulnerable: boolean;
  readonly dead: boolean;
  spendStamina(n: number): boolean;
  restoreStamina(n: number): void;
  restorePoise(n?: number): void;
}

/** The slice of `DamageRequest` the models read (direction is the horizontal unit vector attacker to target). */
export interface DamageRequestLike {
  attackerId: string | null;
  targetId: string;
  amount: number;
  poise: number;
  kind: 'melee' | 'spell' | 'fall' | 'script';
  attackId?: string;
  swingId?: number;
  direction?: Vec3Like;
  /** Added to the contract by thread 0 later; honoured when present. */
  unblockable?: boolean;
}

/** `attack.window` event payload. */
export interface AttackWindowEvent {
  actorId: string;
  attackId: string;
  swingId: number;
  phase: 'open' | 'close';
}

/** `telegraph` event payload (thread 2). */
export interface TelegraphEvent {
  actorId: string;
  kind: 'block' | 'dodge';
  attackId: string;
  leadSeconds: number;
}

/** Reference-counted invulnerability: dodge, Second Wind and respawn grace can overlap. */
export interface InvulnerabilityGate {
  add(source: string): void;
  remove(source: string): void;
  has(source: string): boolean;
  readonly active: boolean;
}
