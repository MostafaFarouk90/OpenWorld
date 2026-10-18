import { CHAIN, MOVES, PRIOR, SUMMONS, type PriorMoveDef } from './tuning';

export type PriorState =
  | 'idle'
  | 'glide'
  | 'windup'
  | 'recover'
  | 'teleportOut'
  | 'hidden'
  | 'teleportIn'
  | 'summon'
  | 'broken'
  | 'kneel'
  | 'released'
  | 'dying';

export type TeleportDest = 'pillar' | 'centre';

/** What the brain reads from the world each tick. */
export interface PriorSense {
  /** Horizontal distance, Prior feet to player feet (m). */
  dist: number;
  /** Live summoned wraiths. */
  liveSummons: number;
}

/** What the brain asks the world to do (PriorEncounter in the game, a recorder in tests). */
export interface PriorHooks {
  telegraph(move: PriorMoveDef, swingId: number, leadSeconds: number): void;
  telegraphCancelled(swingId: number): void;
  /** The chain's direction locks now (CHAIN.aimLockBefore ahead of the lash). */
  aim(move: PriorMoveDef, swingId: number): void;
  strike(move: PriorMoveDef, swingId: number): void;
  teleportOut(): void;
  teleportIn(dest: TeleportDest): void;
  /** `opening` waves raise the shield (review B1); re-summons do not. */
  summonStart(opening: boolean): void;
  summonRelease(count: number): void;
  stagger(): void;
  kneel(): void;
  restorePoise(): void;
}

type Wave = { opening: boolean; count: number };

const FIGHTING: ReadonlySet<PriorState> = new Set<PriorState>(['glide', 'windup', 'recover', 'summon']);
const TERMINAL: ReadonlySet<PriorState> = new Set<PriorState>(['released', 'dying']);

/**
 * The Ashen Prior's behaviour as a pure state machine (plans/slice-2-ashen-prior.md section 3): glide, censer swing and
 * ash-chain by range, teleports between pillars, summon waves (the two shielded phase openings plus one unshielded
 * re-summon per phase), the break stagger and the release-window kneel. It holds no world state: the encounter feeds it
 * the boss registry's events and a per-tick sense, and carries out its hooks.
 */
export class PriorBrain {
  private _state: PriorState = 'idle';
  private _phase = 1;
  /** Seconds in the current state. */
  private t = 0;
  private readonly cooldowns: Record<PriorMoveDef['id'], number> = { censer: 0, chain: 0 };
  private move: PriorMoveDef | null = null;
  private swingId = 0;
  private aimed = false;
  private readonly pending: Wave[] = [];
  private wave: Wave | null = null;
  private teleportDest: TeleportDest = 'pillar';
  private _wavesStarted = 0;
  private resummonsThisPhase = 0;
  private sinceWave = 0;
  private campTime = 0;
  private _moving = false;

  constructor(private readonly hooks: PriorHooks) {}

  get state(): PriorState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  /** True while he should glide toward the player this tick. */
  get moving(): boolean {
    return this._moving;
  }

  /** Summon waves begun so far (capped at the two openings plus one re-summon per phase). */
  get wavesStarted(): number {
    return this._wavesStarted;
  }

  /** Hittable and visible (false from the teleport-out dissolve until the arrival finishes). */
  get present(): boolean {
    return this._state !== 'teleportOut' && this._state !== 'hidden' && this._state !== 'teleportIn';
  }

  /** The fight begins (after the intro): he stands at the centre and casts the shielded phase-1 opening at once. */
  start(): void {
    if (this._state !== 'idle') return;
    this.wave = { opening: true, count: SUMMONS.openingCount[0] };
    this.enter('summon');
  }

  tick(dt: number, sense: PriorSense): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.t += dt;
    this.sinceWave += dt;
    this.cooldowns.censer = Math.max(0, this.cooldowns.censer - dt);
    this.cooldowns.chain = Math.max(0, this.cooldowns.chain - dt);
    this._moving = false;
    // The camp timer runs through his swings too: a player trading blows in censer range for 10 s gets a teleport.
    if (this._state === 'glide' || this._state === 'windup' || this._state === 'recover') {
      if (sense.dist <= MOVES.censer.range[1]) this.campTime += dt;
      else this.campTime = 0;
    }
    switch (this._state) {
      case 'glide':
        this.glide(sense);
        break;
      case 'windup': {
        const move = this.move!;
        if (move.id === 'chain' && !this.aimed && this.t >= move.windup - CHAIN.aimLockBefore) {
          this.aimed = true;
          this.hooks.aim(move, this.swingId);
        }
        if (this.t >= move.windup) {
          this.cooldowns[move.id] = move.cooldown * (this._phase >= 2 ? PRIOR.phase2Cooldown : 1);
          this.enter('recover');
          this.hooks.strike(move, this.swingId);
        }
        break;
      }
      case 'recover':
        if (this.t >= this.move!.recover) this.enter('glide');
        break;
      case 'teleportOut':
        if (this.t >= PRIOR.teleportOutSeconds) this.enter('hidden');
        break;
      case 'hidden':
        if (this.t >= PRIOR.hiddenSeconds) {
          this.enter('teleportIn');
          this.hooks.teleportIn(this.teleportDest);
        }
        break;
      case 'teleportIn':
        if (this.t >= PRIOR.teleportInSeconds) this.enter(this.wave ? 'summon' : 'glide');
        break;
      case 'summon':
        if (this.t >= PRIOR.summonCastSeconds) {
          const wave = this.wave!;
          this.wave = null;
          this.enter('glide');
          this.hooks.summonRelease(wave.count);
        }
        break;
      case 'broken':
        if (this.t >= PRIOR.breakSeconds) {
          this.hooks.restorePoise();
          this.teleportNext();
        }
        break;
      default:
        break;
    }
  }

  /** A counted poise break (`boss.break`, `last` or not): the stagger. A `last` break is followed by the window opening. */
  onBreak(): void {
    if (!FIGHTING.has(this._state)) return;
    this.cancelSwing();
    // A re-summon cut short is spent, not refunded, so breaking the cast is no farm (review B2).
    this.wave = null;
    this.enter('broken');
    this.hooks.stagger();
  }

  /**
   * `boss.phase`: queue the phase's shielded opening wave. The shield is raised only when the cast starts, after any
   * stagger, so a hit that crosses 50% and breaks poise still counts its break (the registry delivers `boss.phase` first).
   */
  onPhase(phase: number): void {
    if (phase <= this._phase || TERMINAL.has(this._state)) return;
    this._phase = phase;
    const count = SUMMONS.openingCount[phase - 1];
    if (count === undefined) return; // the Prior has two phases; a deeper one adds no waves
    this.resummonsThisPhase = 0;
    // Drop a queued re-summon of the previous phase; the opening replaces it.
    for (let i = this.pending.length - 1; i >= 0; i--) if (!this.pending[i].opening) this.pending.splice(i, 1);
    this.pending.push({ opening: true, count });
  }

  /** `boss.releaseWindow`: kneel while open; when it closes unused he stands, teleports and fights on. */
  onReleaseWindow(open: boolean): void {
    if (TERMINAL.has(this._state)) return;
    if (open) {
      if (this._state === 'kneel') return;
      this.cancelSwing();
      this.wave = null;
      this.enter('kneel');
      this.hooks.kneel();
    } else if (this._state === 'kneel') {
      this.hooks.restorePoise();
      this.teleportNext();
    }
  }

  /** `boss.released` or `boss.defeated`. */
  onOutcome(outcome: 'released' | 'defeated'): void {
    if (TERMINAL.has(this._state)) return;
    this.cancelSwing();
    this.wave = null;
    this.pending.length = 0;
    this.enter(outcome === 'released' ? 'released' : 'dying');
  }

  // ---- internals ----

  private glide(sense: PriorSense): void {
    const opening = this.pending.findIndex((w) => w.opening);
    if (opening >= 0) {
      this.wave = this.pending.splice(opening, 1)[0];
      this.teleport(this._phase >= 2 ? 'centre' : 'pillar');
      return;
    }
    if (
      this.resummonsThisPhase < SUMMONS.resummonsPerPhase &&
      sense.liveSummons < SUMMONS.resummonBelow &&
      this.sinceWave >= SUMMONS.resummonAfter
    ) {
      this.resummonsThisPhase++;
      this.wave = { opening: false, count: SUMMONS.resummonCount };
      this.teleport('pillar');
      return;
    }
    const censer = MOVES.censer;
    if (this.campTime >= PRIOR.campSeconds) {
      this.teleport('pillar');
      return;
    }
    for (const move of [censer, MOVES.chain]) {
      if (this.cooldowns[move.id] > 0 || sense.dist < move.range[0] || sense.dist > move.range[1]) continue;
      this.move = move;
      this.swingId++;
      this.aimed = false;
      this.enter('windup');
      this.hooks.telegraph(move, this.swingId, move.windup);
      return;
    }
    this._moving = sense.dist > PRIOR.glideStopDistance;
  }

  /** After a break or a closed window: a queued opening goes to its spot and casts; otherwise a pillar and glide. */
  private teleportNext(): void {
    const opening = this.pending.findIndex((w) => w.opening);
    if (opening >= 0) {
      this.wave = this.pending.splice(opening, 1)[0];
      this.teleport(this._phase >= 2 ? 'centre' : 'pillar');
    } else {
      this.teleport('pillar');
    }
  }

  private teleport(dest: TeleportDest): void {
    this.teleportDest = dest;
    this.campTime = 0;
    this.enter('teleportOut');
    this.hooks.teleportOut();
  }

  private cancelSwing(): void {
    if (this._state === 'windup') this.hooks.telegraphCancelled(this.swingId);
    this.move = this._state === 'recover' ? this.move : null;
  }

  private enter(next: PriorState): void {
    this._state = next;
    this.t = 0;
    if (next === 'summon') {
      this._wavesStarted++;
      this.sinceWave = 0;
      this.hooks.summonStart(this.wave!.opening);
    }
  }
}
