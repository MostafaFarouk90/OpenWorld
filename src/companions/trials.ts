// The non-lethal trial duel (design 15 item 20 and 7.6; plans/act2-A5.md sections 1.6 and 8): M13's duel with Hrolf
// now, R10's duels and the Coal-Mother's trial (M31) later. Both sides are held at 1 HP; a stagger, or a side held at
// its floor, is a "yield break" for the other side; the first to `breaksToWin` wins. Opponent-agnostic.
import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import type { LethalHandler } from '../actors/DamageResolver';
import type { GameEvents } from '../core/events';
import './events';
import type { TrialEndReason, TrialSide } from './events';

export const TRIAL_TUNING = {
  /** Before Second Wind (-100), so a duel never spends it. */
  floorOrder: -150,
  pauseSeconds: 2,
  /** Cael further than this from the opponent ends the trial. */
  leaveDistance: 30,
  /** A one-tick move this long is a teleport (fast travel, a door, a respawn). */
  jumpDistance: 8,
} as const;

export const TRIAL_FLOOR_ID = 'companions.trial-floor';

export interface TrialStart {
  id: string;
  opponentId: ActorId;
  breaksToWin?: number;
  /** After a loss: start again with the score reset (default), or end the trial. */
  onLoss?: 'restart' | 'end';
  /** An NPC to hide while the duel runs (Hrolf's NPC while `hrolf-trial` fights). */
  standInNpcId?: string;
}

export interface TrialState {
  id: string;
  player: number;
  opponent: number;
  breaksToWin: number;
}

export interface TrialsService {
  start(opts: TrialStart): boolean;
  /** Ends a running trial as stopped. */
  stop(id: string): boolean;
  /** Cael yields first (M31's F2 choice): `trial.ended { reason: 'yielded' }`. */
  yield(id: string): boolean;
  state(): TrialState | null;
}

export interface TrialPorts {
  events: GameEvents;
  actors: { get(id: ActorId): Actor | undefined; readonly player: Actor };
  addLethalHandler(id: string, fn: LethalHandler, order: number): () => void;
  heal(id: ActorId, amount: number): number;
  playerFeet(): { x: number; y: number; z: number };
  setNpcHidden?(npcId: string, hidden: boolean): void;
}

interface Running {
  id: string;
  opponentId: ActorId;
  breaksToWin: number;
  onLoss: 'restart' | 'end';
  standIn: string | null;
  player: number;
  opponent: number;
  /** Seconds left in the pause after a break (breaks are ignored then). */
  pause: number;
  /** A side held at its floor this tick, scored on the next tick. */
  floored: TrialSide | null;
}

export class Trials implements TrialsService {
  private run: Running | null = null;
  private last: { x: number; z: number } | null = null;
  private readonly offs: (() => void)[] = [];
  /** The companions save entry loaded (and ended the old trial) ahead of this `save.loaded`. */
  private loadBegun = false;

  constructor(private readonly p: TrialPorts) {
    this.offs.push(
      p.addLethalHandler(TRIAL_FLOOR_ID, (target, result) => this.floor(target, result), TRIAL_TUNING.floorOrder),
      p.events.on('actor.staggered', ({ actorId, byId }) => {
        const r = this.run;
        if (!r) return;
        const playerId = p.actors.player.id;
        if (actorId === r.opponentId && byId === playerId) this.score('player');
        else if (actorId === playerId && byId === r.opponentId) this.score('opponent');
      }),
      p.events.on('actor.despawned', ({ actorId }) => {
        if (this.run?.opponentId === actorId) this.end('despawned');
      }),
      p.events.on('actor.died', ({ actorId }) => {
        if (this.run?.opponentId === actorId) this.end('despawned');
      }),
      p.events.on('fastTravel', () => this.end('teleport')),
      p.events.on('save.loaded', () => {
        if (!this.loadBegun) this.end('loaded');
        this.loadBegun = false;
      }),
    );
  }

  /** Called from the companions save entry's load, before `save.loaded`: ends the trial from before the load. */
  beginLoad(): void {
    this.end('loaded');
    this.loadBegun = true;
  }

  state(): TrialState | null {
    const r = this.run;
    return r ? { id: r.id, player: r.player, opponent: r.opponent, breaksToWin: r.breaksToWin } : null;
  }

  start(o: TrialStart): boolean {
    if (this.run || !o || typeof o.id !== 'string' || !o.id) return false;
    const opp = this.p.actors.get(o.opponentId);
    if (!opp || opp.dead || opp.id === this.p.actors.player.id) return false;
    const n = o.breaksToWin ?? 3;
    if (!Number.isInteger(n) || n < 1) return false;
    this.run = {
      id: o.id,
      opponentId: opp.id,
      breaksToWin: n,
      onLoss: o.onLoss === 'end' ? 'end' : 'restart',
      standIn: o.standInNpcId ?? null,
      player: 0,
      opponent: 0,
      pause: 0,
      floored: null,
    };
    const f = this.p.playerFeet();
    this.last = { x: f.x, z: f.z };
    if (o.standInNpcId) this.p.setNpcHidden?.(o.standInNpcId, true);
    this.healBoth();
    this.p.events.emit('trial.started', { trialId: o.id, opponentId: opp.id, breaksToWin: n });
    return true;
  }

  stop(id: string): boolean {
    if (!this.run || this.run.id !== id) return false;
    this.end('stopped');
    return true;
  }

  yield(id: string): boolean {
    if (!this.run || this.run.id !== id) return false;
    this.end('yielded');
    return true;
  }

  fixedUpdate(dt: number): void {
    const r = this.run;
    if (!r) return;
    const f = this.p.playerFeet();
    const last = this.last;
    this.last = { x: f.x, z: f.z };
    if (last && Math.hypot(f.x - last.x, f.z - last.z) >= TRIAL_TUNING.jumpDistance) {
      this.end('teleport');
      return;
    }
    const opp = this.p.actors.get(r.opponentId);
    if (opp) {
      const at = opp.worldPosition(PROBE);
      if (Math.hypot(at.x - f.x, at.z - f.z) > TRIAL_TUNING.leaveDistance) {
        this.end('distance');
        return;
      }
    }
    if (r.floored) {
      const side = r.floored;
      r.floored = null;
      this.score(side);
      if (!this.run) return;
    }
    if (r.pause > 0) {
      r.pause = Math.max(0, r.pause - (dt > 0 ? dt : 0));
      // Blows traded in the pause do not carry into the next round.
      if (r.pause === 0) this.healBoth();
    }
  }

  dispose(): void {
    this.end('stopped', false);
    for (const off of this.offs.splice(0)) off();
  }

  /** The 1 HP floor for both sides, falls and status ticks included. */
  private floor(target: Actor, result?: Readonly<{ attackerId?: ActorId | null }>): boolean {
    const r = this.run;
    if (!r) return false;
    const playerId = this.p.actors.player.id;
    if (target.id !== playerId && target.id !== r.opponentId) return false;
    target.health = Math.min(1, target.maxHealth);
    // Held at the floor: a break for the other side, scored next tick (outside the resolver's hit). Not in the
    // pause: the pause ends with both sides healed again.
    // Only Cael's own blow breaks the opponent: a companion's or the familiar's does not win the bout for him.
    const caelHit = target.id === playerId || result?.attackerId === playerId;
    if (!r.floored && r.pause <= 0 && caelHit) r.floored = target.id === playerId ? 'opponent' : 'player';
    return true;
  }

  private score(by: TrialSide): void {
    const r = this.run;
    if (!r || r.pause > 0) return;
    if (by === 'player') r.player++;
    else r.opponent++;
    r.floored = null;
    this.p.events.emit('trial.break', { trialId: r.id, by, player: r.player, opponent: r.opponent });
    if (r.player >= r.breaksToWin) {
      this.p.events.emit('trial.won', { trialId: r.id });
      this.end('won');
      return;
    }
    if (r.opponent >= r.breaksToWin) {
      this.p.events.emit('trial.lost', { trialId: r.id });
      if (r.onLoss === 'end') {
        this.end('lost');
        return;
      }
      // Restart: the score resets, no penalty.
      r.player = 0;
      r.opponent = 0;
    }
    r.pause = TRIAL_TUNING.pauseSeconds;
    this.healBoth();
  }

  private healBoth(): void {
    const r = this.run;
    if (!r) return;
    // Full health and poise for both: each round starts fresh.
    const pl = this.p.actors.player;
    this.p.heal(pl.id, pl.maxHealth);
    pl.restorePoise();
    const opp = this.p.actors.get(r.opponentId);
    if (opp) {
      this.p.heal(opp.id, opp.maxHealth);
      opp.restorePoise();
    }
  }

  private end(reason: TrialEndReason, emit = true): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    this.last = null;
    if (r.standIn) this.p.setNpcHidden?.(r.standIn, false);
    if (emit) this.p.events.emit('trial.ended', { trialId: r.id, reason });
  }
}

const PROBE = new THREE.Vector3();

declare module '../core/Services' {
  interface GameServices {
    /** A5's non-lethal trial duel (plans/act2-A5.md section 1.6). */
    trials: TrialsService;
  }
}
