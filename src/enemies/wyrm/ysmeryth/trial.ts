import type { TrialsService } from '../../../companions/trials';
import type { TrialEndReason } from '../../../companions/events';
import type { MoveDef } from '../../types';
import type { ActorId } from '../../ports';
import { trialOpts, YSMERYTH, YSMERYTH_IDS } from './def';
import type { YsmerythBeat } from './events';
import type { XZ } from './flightPlan';
import type { YsmerythHandle, YsmerythHub } from './overlay';

export interface YsmerythTrialPorts {
  trials(): TrialsService | undefined;
  enemies(): { spawnGroup(id: string, opts?: { aggro?: boolean }): ActorId[]; alive(id: string): ActorId[] } | undefined;
  anchor(id: string): { x: number; z: number } | undefined;
  playerId(): ActorId;
  setInvulnerable(actorId: ActorId, on: boolean): void;
  emit(beat: YsmerythBeat): void;
  /** A telegraph for decals and sounds (optional). */
  telegraphed?(actorId: ActorId, move: MoveDef): void;
  unlockCodex(id: string): void;
  warn(message: string): void;
}

/** After the player's own break stagger or a trial break, the call waits at least this long (the "mid-break" guard). */
export const CALL_GUARD_SECONDS = 2;

/**
 * M31's trial around K0's trial service (plans/act3-K6a-pr2.md 1.3, 1.4 and 9): starts it, flies her up on each break,
 * holds the 80 m rule's opponent part off while she flies (`setOpponentAirborne`), makes her untouchable in the air and
 * keeps the player's floor from scoring then (`airborneFloor`, a lethal handler ahead of the trial's), gates the call
 * (a running trial, once per round, after `callAfter`, never on a staggered player), and sends her off after the end.
 */
export class YsmerythTrial {
  readonly hub: YsmerythHub;
  private readonly handles = new Map<ActorId, YsmerythHandle>();
  private time = 0;
  private roundFrom = 0;
  private callUsed = false;
  private guardUntil = 0;
  private endAt: number | null = null;

  constructor(private readonly ports: YsmerythTrialPorts) {
    this.hub = {
      arena: () => this.arena(),
      track: (id, h) => {
        this.handles.set(id, h);
        return () => {
          if (this.handles.get(id) === h) this.handles.delete(id);
        };
      },
      airborne: (id, on) => this.onAirborne(id, on),
      callAllowed: () => this.callAllowed(),
      called: () => this.onCalled(),
      telegraphed: (id, move) => this.ports.telegraphed?.(id, move),
    };
  }

  /** The roost (K4's anchors). */
  arena(): { centre: XZ; land: XZ } | null {
    const c = this.ports.anchor(YSMERYTH_IDS.arenaCentre);
    const l = this.ports.anchor(YSMERYTH_IDS.landMark);
    return c && l ? { centre: { x: c.x, z: c.z }, land: { x: l.x, z: l.z } } : null;
  }

  /** Her handle while spawned. */
  get handle(): YsmerythHandle | null {
    for (const h of this.handles.values()) return h;
    return null;
  }

  get running(): boolean {
    return this.ports.trials()?.state()?.id === YSMERYTH_IDS.trialId;
  }

  get airborne(): boolean {
    return this.handle?.airborne ?? false;
  }

  beginTrial(): boolean {
    const trials = this.ports.trials();
    const enemies = this.ports.enemies();
    const a = this.arena();
    if (!trials || !enemies || !a) {
      this.ports.warn('ysmeryth.beginTrial: the roost anchors, the trials or the enemies service are missing');
      return false;
    }
    const st = trials.state();
    if (st?.id === YSMERYTH_IDS.trialId) return true;
    if (st) return false;
    this.endAt = null;
    let [id] = enemies.alive(YSMERYTH_IDS.spawnerId);
    if (!id) [id] = enemies.spawnGroup(YSMERYTH_IDS.spawnerId, { aggro: true });
    if (!id) {
      this.ports.warn('ysmeryth.beginTrial: she did not spawn');
      return false;
    }
    const h = this.handles.get(id) ?? this.handle;
    if (h && h.flight === 'leave') {
      this.ports.warn('ysmeryth.beginTrial: she is leaving; begin again once she is gone');
      return false;
    }
    // A restart while she is still up: bring her down first (the trial runs with the 80 m rule from the start).
    h?.landNow();
    h?.setPassive(false);
    return trials.start(trialOpts(id, a.centre));
  }

  endTrial(): void {
    this.endAt = null;
    const trials = this.ports.trials();
    if (this.running) trials?.stop(YSMERYTH_IDS.trialId);
    for (const h of [...this.handles.values()]) h.leave();
  }

  // ---- K0 trial events (the plugin routes them)

  started(trialId: string): void {
    if (trialId !== YSMERYTH_IDS.trialId) return;
    this.roundFrom = this.time;
    this.callUsed = false;
    const h = this.handle;
    if (h) {
      h.setPassive(false);
      // A restart that begins while she is still landing: untouchable and off the opponent rule until she is down.
      this.ports.setInvulnerable(h.actorId, h.airborne);
      if (h.airborne) this.ports.trials()?.setOpponentAirborne(true);
    }
    this.ports.unlockCodex(YSMERYTH_IDS.codexId);
  }

  /** `trial.break` with the counts after it: the deciding break ends the trial (next event) and flies no loop. */
  broke(trialId: string, counts?: { player: number; opponent: number }): void {
    if (trialId !== YSMERYTH_IDS.trialId) return;
    this.guardUntil = this.time + CALL_GUARD_SECONDS;
    this.callUsed = false;
    this.roundFrom = this.time;
    const st = this.ports.trials()?.state();
    const toWin = st?.id === YSMERYTH_IDS.trialId ? st.breaksToWin : YSMERYTH.breaksToWin;
    if (counts && Math.max(counts.player, counts.opponent) >= toWin) return;
    this.handle?.flyLoop();
  }

  ended(trialId: string, reason: TrialEndReason): void {
    if (trialId !== YSMERYTH_IDS.trialId) return;
    const h = this.handle;
    // Out of the fight until she leaves (or a restart): no swing on a yielded or floored side, and she is untouchable
    // (the trial's 1 HP floor is gone now). Mid-flight she comes down first.
    h?.landNow();
    h?.setPassive(true);
    if (h) this.ports.setInvulnerable(h.actorId, true);
    if (reason === 'won' || reason === 'yielded') this.endAt = this.time + YSMERYTH.endDelay;
  }

  /** `actor.staggered`: the player's own stagger holds the call off. */
  staggered(actorId: ActorId): void {
    if (actorId === this.ports.playerId()) this.guardUntil = Math.max(this.guardUntil, this.time + CALL_GUARD_SECONDS);
  }

  tick(dt: number): void {
    if (dt > 0 && Number.isFinite(dt)) this.time += dt;
    if (this.endAt !== null && this.time >= this.endAt) this.endTrial();
  }

  /**
   * Lethal handler (ahead of the trial's floor): while she is in the air no break is scored, so the player held at 1 HP
   * then (a lingering burn) is floored here without a break for her.
   */
  airborneFloor(targetId: ActorId): boolean {
    return this.running && this.airborne && targetId === this.ports.playerId();
  }

  private callAllowed(): boolean {
    return this.running && !this.callUsed && this.time - this.roundFrom >= YSMERYTH.callAfter && this.time >= this.guardUntil;
  }

  private onCalled(): void {
    // The window opened: never on a staggered player (the call stays available), never outside the trial.
    if (!this.running || this.time < this.guardUntil) return;
    if (this.ports.trials()?.stunBoth(YSMERYTH.callStun)) {
      this.callUsed = true;
      this.ports.emit('call');
    }
  }

  private onAirborne(actorId: ActorId, on: boolean): void {
    // Hittable only on the ground during a running trial (after it she stays untouchable until she leaves).
    this.ports.setInvulnerable(actorId, on || !this.running);
    if (this.running) this.ports.trials()?.setOpponentAirborne(on);
    if (!on) this.roundFrom = this.time;
    this.ports.emit(on ? 'takeoff' : 'landed');
  }
}
