import type { GameEvents } from '../core/events';
import type { WorldState } from '../state/WorldState';
import type { ActorId } from './Actor';
import type { ActorRegistry } from './ActorRegistry';
import type { DamageResolver, ModifiableRequest } from './DamageResolver';

export interface BossDef {
  /** Kebab-case id, e.g. 'ashen-prior'. */
  bossId: string;
  /** String-table key for the HUD. */
  nameKey: string;
  /** Health fractions where a new phase starts, strictly descending, each in (0, 1). [] = one phase. */
  phases: readonly number[];
  /** Integer >= 1 (design: 3). */
  breaksPerPhase: number;
  /** Initial shield state; default false. */
  shield?: boolean;
  /** attackIds that drop the shield (e.g. 'surge'). */
  shieldBreakers?: readonly string[];
  /** Simulated seconds the release window stays open; default 4. */
  releaseWindowSeconds?: number;
}

export type BossOutcome = 'defeated' | 'released';

export interface BossState {
  bossId: string;
  actorId: ActorId;
  nameKey: string;
  health: number;
  maxHealth: number;
  /** 1-based. */
  phase: number;
  /** Total phases (phases.length + 1). */
  phases: number;
  breaks: number;
  breaksPerPhase: number;
  shield: boolean;
  releaseOpen: boolean;
  outcome: BossOutcome | null;
}

export interface BossRegistryDeps {
  events: GameEvents;
  actors: ActorRegistry;
  damage: DamageResolver;
  state: WorldState;
  report?: (msg: string, err?: unknown) => void;
}

export const BOSS_SHIELD_MODIFIER_ID = 'core.boss-shield';
export const DEFAULT_RELEASE_WINDOW_SECONDS = 4;
const BOSS_ID = /^[a-z0-9-]+$/;

interface Boss {
  def: BossDef;
  actorId: ActorId;
  thresholds: readonly number[];
  phase: number;
  breaks: number;
  shield: boolean;
  breakers: ReadonlySet<string>;
  windowSeconds: number;
  /** Seconds left in the release window; 0 = closed. */
  windowLeft: number;
  windowOpen: boolean;
  outcome: BossOutcome | null;
}

export function bossOutcomeFlag(bossId: string): string {
  return `boss.${bossId}.outcome`;
}

/**
 * Boss encounter state on top of an ordinary actor (actors-and-damage.md section 7): phases from health,
 * poise breaks, a damage shield, the release (mercy) window and the defeated/released outcome.
 * Only this class emits `boss.*` events.
 */
export class BossRegistry {
  private readonly events: GameEvents;
  private readonly actors: ActorRegistry;
  private readonly damage: DamageResolver;
  private readonly world: WorldState;
  private readonly report: (msg: string, err?: unknown) => void;
  private readonly bosses = new Map<string, Boss>();
  private readonly byActor = new Map<ActorId, string>();
  private readonly offs: (() => void)[] = [];
  private disposed = false;

  constructor(deps: BossRegistryDeps) {
    this.events = deps.events;
    this.actors = deps.actors;
    this.damage = deps.damage;
    this.world = deps.state;
    this.report = deps.report ?? ((m, e) => console.warn(m, e ?? ''));

    this.offs.push(
      this.damage.addModifier(BOSS_SHIELD_MODIFIER_ID, (req) => this.shieldModifier(req), -1),
      this.events.on('damage.dealt', (r) => this.onDamage(r.targetId, r.healthAfter)),
      this.events.on('actor.staggered', (p) => this.onStagger(p.actorId)),
      this.events.on('actor.died', (p) => this.onDied(p.actorId)),
      this.events.on('actor.despawned', (p) => this.onDespawned(p.actorId)),
    );
  }

  register(actorId: ActorId, def: BossDef): () => void {
    if (this.disposed) throw new Error('BossRegistry: disposed');
    const actor = this.actors.get(actorId);
    if (!actor) throw new Error(`BossRegistry: unknown actor "${actorId}"`);
    if (actor.dead) throw new Error(`BossRegistry: actor "${actorId}" is dead`);
    if (this.byActor.has(actorId)) {
      throw new Error(`BossRegistry: actor "${actorId}" is already boss "${this.byActor.get(actorId)}"`);
    }
    if (typeof def.bossId !== 'string' || !BOSS_ID.test(def.bossId)) {
      throw new Error(`BossRegistry: invalid bossId "${String(def.bossId)}" (kebab-case a-z0-9-)`);
    }
    if (this.bosses.has(def.bossId)) throw new Error(`BossRegistry: boss "${def.bossId}" is already registered`);
    if (!Array.isArray(def.phases)) throw new Error(`BossRegistry: "${def.bossId}" phases must be an array`);
    let prev = 1;
    for (const t of def.phases) {
      if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t >= 1) {
        throw new Error(`BossRegistry: "${def.bossId}" phase threshold ${String(t)} must be a finite number in (0, 1)`);
      }
      if (t >= prev) throw new Error(`BossRegistry: "${def.bossId}" phases must be strictly descending`);
      prev = t;
    }
    if (!Number.isInteger(def.breaksPerPhase) || def.breaksPerPhase < 1) {
      throw new Error(`BossRegistry: "${def.bossId}" breaksPerPhase must be an integer >= 1`);
    }
    const windowSeconds = def.releaseWindowSeconds ?? DEFAULT_RELEASE_WINDOW_SECONDS;
    if (typeof windowSeconds !== 'number' || !Number.isFinite(windowSeconds) || windowSeconds <= 0) {
      throw new Error(`BossRegistry: "${def.bossId}" releaseWindowSeconds must be a finite number > 0`);
    }
    if (this.world.hasFlag(bossOutcomeFlag(def.bossId))) {
      throw new Error(`BossRegistry: boss "${def.bossId}" already has an outcome (${bossOutcomeFlag(def.bossId)})`);
    }

    const boss: Boss = {
      def,
      actorId,
      thresholds: [...def.phases],
      phase: 1,
      breaks: 0,
      shield: def.shield ?? false,
      breakers: new Set(def.shieldBreakers ?? []),
      windowSeconds,
      windowLeft: 0,
      windowOpen: false,
      outcome: null,
    };
    this.bosses.set(def.bossId, boss);
    this.byActor.set(actorId, def.bossId);
    this.events.emit('boss.started', { bossId: def.bossId, actorId });
    return () => {
      if (this.bosses.get(def.bossId) === boss) this.drop(boss);
    };
  }

  /** Raises or drops the shield; emits `boss.shield` only on change. Unknown ids warn. */
  setShield(bossId: string, up: boolean): void {
    const boss = this.bosses.get(bossId);
    if (!boss) {
      this.report(`BossRegistry: setShield on unknown boss "${bossId}"`);
      return;
    }
    this.changeShield(boss, up);
  }

  /** Spares the boss: true only while registered, alive, without outcome and with the window open. */
  release(bossId: string): boolean {
    const boss = this.bosses.get(bossId);
    if (!boss || boss.outcome || !boss.windowOpen) return false;
    if (this.actors.get(boss.actorId)?.dead !== false) return false;
    this.setOutcome(boss, 'released');
    this.events.emit('boss.released', { bossId, actorId: boss.actorId });
    this.closeWindow(boss);
    return true;
  }

  state(bossId: string): BossState | null {
    const boss = this.bosses.get(bossId);
    if (!boss) return null;
    const actor = this.actors.get(boss.actorId);
    return {
      bossId,
      actorId: boss.actorId,
      nameKey: boss.def.nameKey,
      health: actor?.health ?? 0,
      maxHealth: actor?.maxHealth ?? 0,
      phase: boss.phase,
      phases: boss.thresholds.length + 1,
      breaks: boss.breaks,
      breaksPerPhase: boss.def.breaksPerPhase,
      shield: boss.shield,
      releaseOpen: boss.windowOpen,
      outcome: boss.outcome,
    };
  }

  /** Registered boss ids. */
  active(): string[] {
    return [...this.bosses.keys()];
  }

  /** Ticks the release windows by `dt` simulated seconds. */
  fixedUpdate(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const boss of [...this.bosses.values()]) {
      if (!boss.windowOpen) continue;
      boss.windowLeft -= dt;
      if (boss.windowLeft <= 1e-9) this.closeWindow(boss);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.bosses.clear();
    this.byActor.clear();
  }

  // ---- internals ----

  private drop(boss: Boss): void {
    boss.windowLeft = 0;
    boss.windowOpen = false;
    this.bosses.delete(boss.def.bossId);
    if (this.byActor.get(boss.actorId) === boss.def.bossId) this.byActor.delete(boss.actorId);
  }

  private bossOf(actorId: ActorId): Boss | undefined {
    const id = this.byActor.get(actorId);
    return id === undefined ? undefined : this.bosses.get(id);
  }

  private isLive(boss: Boss): boolean {
    return !boss.outcome && this.actors.get(boss.actorId)?.dead === false;
  }

  private changeShield(boss: Boss, up: boolean): void {
    if (boss.shield === up) return;
    boss.shield = up;
    this.events.emit('boss.shield', { bossId: boss.def.bossId, up });
  }

  private shieldModifier(req: ModifiableRequest): void {
    const boss = this.bossOf(req.targetId);
    if (!boss || !boss.shield || req.outcome === 'immune') return;
    if (req.attackId !== undefined && boss.breakers.has(req.attackId)) {
      // The bus batches events emitted while a hit resolves, so this goes out with the hit's own events.
      this.changeShield(boss, false);
      return;
    }
    req.outcome = 'immune';
  }

  /**
   * Phase k+1 starts when the health fraction drops to or below thresholds[k]. Phases never regress.
   * Ordering note: `damage.dealt` is delivered before `actor.staggered` of the same hit, so a hit that
   * both crosses a threshold and breaks poise counts its break in the NEW phase (breaks were just reset).
   */
  private onDamage(targetId: ActorId, healthAfter: number): void {
    const boss = this.bossOf(targetId);
    if (!boss || !this.isLive(boss)) return;
    const actor = this.actors.get(targetId)!;
    if (!(actor.maxHealth > 0)) return;
    const fraction = healthAfter / actor.maxHealth;
    let target = 1;
    for (const t of boss.thresholds) if (fraction <= t) target++;
    while (boss.phase < target) {
      const previous = boss.phase;
      boss.phase++;
      boss.breaks = 0;
      this.events.emit('boss.phase', { bossId: boss.def.bossId, phase: boss.phase, previous });
    }
  }

  private onStagger(actorId: ActorId): void {
    const boss = this.bossOf(actorId);
    // Only the outcome gates breaks, not `actor.dead`: a stagger and the death of the same batch arrive
    // together and the actor is already dead when the stagger is delivered; the break still counts
    // and the `actor.died` that follows turns it into a defeat.
    if (!boss || boss.outcome) return;
    boss.breaks++;
    const last = boss.phase === boss.thresholds.length + 1 && boss.breaks >= boss.def.breaksPerPhase;
    this.events.emit('boss.break', { bossId: boss.def.bossId, phase: boss.phase, breaks: boss.breaks, last });
    if (last) {
      const wasOpen = boss.windowOpen;
      boss.windowLeft = boss.windowSeconds;
      boss.windowOpen = true;
      if (!wasOpen) this.events.emit('boss.releaseWindow', { bossId: boss.def.bossId, open: true });
    }
  }

  private onDied(actorId: ActorId): void {
    const boss = this.bossOf(actorId);
    if (!boss) return;
    if (!boss.outcome) {
      this.setOutcome(boss, 'defeated');
      this.events.emit('boss.defeated', { bossId: boss.def.bossId, actorId });
    }
    this.closeWindow(boss);
  }

  private onDespawned(actorId: ActorId): void {
    const boss = this.bossOf(actorId);
    if (boss) this.drop(boss);
  }

  private setOutcome(boss: Boss, outcome: BossOutcome): void {
    boss.outcome = outcome;
    try {
      this.world.setFlag(bossOutcomeFlag(boss.def.bossId), outcome);
    } catch (err) {
      this.report(`BossRegistry: could not set the outcome flag of "${boss.def.bossId}"`, err);
    }
  }

  private closeWindow(boss: Boss): void {
    if (!boss.windowOpen) return;
    boss.windowOpen = false;
    boss.windowLeft = 0;
    this.events.emit('boss.releaseWindow', { bossId: boss.def.bossId, open: false });
  }
}
