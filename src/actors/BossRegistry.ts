import type { GameEvents } from '../core/events';
import type { WorldState } from '../state/WorldState';
import type { ActorId, MercyState } from './Actor';
import type { ActorRegistry } from './ActorRegistry';
import type { DamageResolver, DamageResult, ModifiableRequest } from './DamageResolver';

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
  /** attackIds that drop the shield, e.g. ['heartshard-surge'] (the Surge's attackId). */
  shieldBreakers?: readonly string[];
  /**
   * Simulated seconds the release window stays open; default 4. 0 = no release window: no break opens one and
   * no `boss.releaseWindow` fires (a no-mercy boss). Negative values throw.
   */
  releaseWindowSeconds?: number;
  /**
   * v0.6: the boss's mercy verb (`BOSS_MERCY[bossId].verb`); default 'release'. `release()` maps it to the
   * outcome: 'release' to 'released', 'spare' to 'spared'.
   */
  mercyVerb?: 'release' | 'spare';
  /**
   * Asked on each stagger of the boss that is not shield-blocked. False: it is a forced stagger (a parry, a howl, Second Wind
   * on a boss that only breaks another way), not a poise break, so it is not counted: no `boss.break`, no pip, no release
   * window. The callback may restore the boss's poise itself. Default: every stagger counts.
   */
  acceptBreak?: () => boolean;
}

/** v0.6 adds `'spared'` (a `spare` mercy row, Redmane). Saves holding only the two older outcomes load unchanged. */
export type BossOutcome = 'defeated' | 'released' | 'spared';

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
  /** v0.5: the registered phase health fractions, descending (the boss bar draws its ticks from them). */
  thresholds: readonly number[];
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
  private readonly unwrapMercy = new Map<Boss, () => void>();

  constructor(deps: BossRegistryDeps) {
    this.events = deps.events;
    this.actors = deps.actors;
    this.damage = deps.damage;
    this.world = deps.state;
    this.report = deps.report ?? ((m, e) => console.warn(m, e ?? ''));

    this.offs.push(
      this.damage.addModifier(BOSS_SHIELD_MODIFIER_ID, (req) => this.shieldModifier(req), -1),
      this.events.on('damage.dealt', (r) => this.onDamage(r)),
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
    if (typeof windowSeconds !== 'number' || !Number.isFinite(windowSeconds) || windowSeconds < 0) {
      throw new Error(`BossRegistry: "${def.bossId}" releaseWindowSeconds must be a finite number >= 0`);
    }
    if (this.world.hasFlag(bossOutcomeFlag(def.bossId))) {
      throw new Error(`BossRegistry: boss "${def.bossId}" already has an outcome (${bossOutcomeFlag(def.bossId)})`);
    }

    const boss: Boss = {
      def,
      actorId,
      thresholds: Object.freeze([...def.phases]),
      phase: 1,
      breaks: 0,
      shield: def.shield ?? false,
      breakers: new Set(def.shieldBreakers ?? []),
      windowSeconds,
      windowLeft: 0,
      windowOpen: false,
      outcome: null,
    };
    // A boss registered already below a threshold (a reset after a reload keeps health) starts in that
    // phase; no `boss.phase` is emitted for it.
    boss.phase = this.phaseFor(boss, actor.health / actor.maxHealth);
    this.bosses.set(def.bossId, boss);
    this.byActor.set(actorId, def.bossId);
    // The boss's mercy state wins while registered; the actor's own (if any) shows through when it reads 'none'.
    const own = actor.mercyState;
    const wrapped = (): MercyState => {
      const b = this.bosses.get(def.bossId) === boss ? this.mercyState(def.bossId) : 'none';
      return b !== 'none' ? b : (own?.() ?? 'none');
    };
    actor.mercyState = wrapped;
    // Unwrapped when the registration ends, so a re-register (the vault reset) does not nest.
    this.unwrapMercy.set(boss, () => {
      if (actor.mercyState === wrapped) actor.mercyState = own;
    });
    this.events.emit('boss.started', { bossId: def.bossId, actorId });
    return () => {
      if (this.bosses.get(def.bossId) === boss) this.drop(boss, 'unregistered');
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

  /**
   * v0.6 ally rules: the release window reads as 'staggered' (an ally's hit holds it at 1 HP), a released boss
   * as 'releasing', a spared one as 'leaving'. Unregistered ids read 'none'.
   */
  mercyState(bossId: string): MercyState {
    const boss = this.bosses.get(bossId);
    if (!boss) return 'none';
    if (boss.outcome === 'released') return 'releasing';
    if (boss.outcome === 'spared') return 'leaving';
    return boss.windowOpen ? 'staggered' : 'none';
  }

  /** Spares the boss: true only while registered, alive, without outcome and with the window open. */
  release(bossId: string): boolean {
    const boss = this.bosses.get(bossId);
    if (!boss || boss.outcome || !boss.windowOpen) return false;
    if (this.actors.get(boss.actorId)?.dead !== false) return false;
    const spared = boss.def.mercyVerb === 'spare';
    this.setOutcome(boss, spared ? 'spared' : 'released');
    // `boss.released` stays the "ended by mercy" event every listener (HUD, music, companions) already reads;
    // a spare adds `boss.spared` after it.
    this.events.emit('boss.released', { bossId, actorId: boss.actorId });
    if (spared) this.events.emit('boss.spared', { bossId, actorId: boss.actorId });
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
      thresholds: boss.thresholds,
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

  /** Unregisters and tells the HUD, music and mercy prompt the encounter is over (a reload reset, a teardown). */
  private drop(boss: Boss, reason: 'despawned' | 'unregistered'): void {
    this.closeWindow(boss);
    this.unwrapMercy.get(boss)?.();
    this.unwrapMercy.delete(boss);
    this.bosses.delete(boss.def.bossId);
    if (this.byActor.get(boss.actorId) === boss.def.bossId) this.byActor.delete(boss.actorId);
    if (!this.disposed) this.events.emit('boss.ended', { bossId: boss.def.bossId, actorId: boss.actorId, reason });
  }

  private phaseFor(boss: Boss, fraction: number): number {
    let phase = 1;
    for (const t of boss.thresholds) if (fraction <= t) phase++;
    return phase;
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

  /**
   * While the shield is up every hit but a breaker becomes 'immune' (not undone by `unblockable`). A breaker
   * passes untouched; the shield drops in `onDamage` only once that hit has landed with outcome 'hit', so a
   * breaker the boss blocks, or a request dropped later, leaves the shield up.
   */
  private shieldModifier(req: ModifiableRequest): void {
    const boss = this.bossOf(req.targetId);
    if (!boss || !boss.shield || req.outcome === 'immune') return;
    if (req.attackId !== undefined && boss.breakers.has(req.attackId)) return;
    req.outcome = 'immune';
  }

  /**
   * Phase k+1 starts when the health fraction drops to or below thresholds[k]. Phases never regress.
   * Ordering note: `damage.dealt` is delivered before `actor.staggered` of the same hit, so a hit that
   * both crosses a threshold and breaks poise counts its break in the NEW phase (breaks were just reset).
   */
  private onDamage(r: DamageResult): void {
    const boss = this.bossOf(r.targetId);
    if (!boss || !this.isLive(boss)) return;
    // Emitted from this listener, so `boss.shield` follows the breaking hit's own events.
    if (boss.shield && r.outcome === 'hit' && r.attackId !== undefined && boss.breakers.has(r.attackId)) {
      this.changeShield(boss, false);
    }
    const actor = this.actors.get(r.targetId)!;
    if (!(actor.maxHealth > 0)) return;
    const target = this.phaseFor(boss, r.healthAfter / actor.maxHealth);
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
    // A shielded boss's poise can still empty (a parry's `damage.stagger`), but that is no break: only the
    // shield breaker opens the way (design 10 row 17, "Surge breaks his shield").
    if (boss.shield) return;
    if (boss.def.acceptBreak && !boss.def.acceptBreak()) return;
    boss.breaks++;
    const last = boss.phase === boss.thresholds.length + 1 && boss.breaks >= boss.def.breaksPerPhase;
    this.events.emit('boss.break', { bossId: boss.def.bossId, phase: boss.phase, breaks: boss.breaks, last });
    // releaseWindowSeconds 0: a no-mercy boss, the last break opens nothing.
    if (last && boss.windowSeconds > 0) {
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
    if (boss) this.drop(boss, 'despawned');
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
