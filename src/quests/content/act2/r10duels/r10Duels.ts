// R10's three optional duels (the "duels" half of the design's "three duels or talks", F5): each persuasion round of
// R10's compromise can be won in a non-lethal bout instead of a talk. The bout is A5's trial service (the M13 rule:
// both sides held at 1 HP, first to three yield breaks wins) against an existing enemy def that yields, the Act 1
// yard veteran, standing in as the speaker's second.
//
//   - win (three breaks, or the second yields and is Spared): the round's flag and event, exactly as the talk's win
//     (`story.r10.p.<n>`, `story.r10.persuaded { n }`), so A13's quest counts one round whichever way it was won;
//   - loss, Cael's own yield, walking off, a teleport or a load: nothing is written; the round's talk opens again with
//     both the talk choices and the duel, so Cael retries the bout or falls back to the talk;
//   - a round already won (either way) is never paid again, and a talk won while its bout runs ends the bout.
//
// Nothing here is saved: a load ends a running trial (A5) and so the bout; the round's flag is the only state.
import type { ActorId } from '../../../../actors/Actor';
import type { GameEvents } from '../../../../core/events';
import type { TrialsService } from '../../../../companions/trials';
import '../../../../companions/events';
import type { SpawnerDef } from '../../../../enemies/types';
import type { Anchor } from '../../../../layout/AnchorRegistry';
import type { FlagValue } from '../../../../state/WorldState';
import type { QuestState } from '../../../types';
import {
  R10_BRANCH_FLAG,
  R10_COMPROMISE,
  R10_DUEL_BUSY_FLAG,
  R10_DUEL_START_EVENT,
  R10_PERSUADED_EVENT,
  R10_QUEST,
  R10_TALKS_OBJECTIVE,
  isR10Round,
  r10DuelTrialId,
  r10RoundFlag,
  type R10Round,
} from './flags';

export const R10_DUEL_TUNING = {
  /** Yield breaks to win a bout (the trial rule's three, as M13 and M31). */
  breaksToWin: 3,
  /** The second steps out this far in front of Cael (metres). */
  spawnAhead: 5,
  /**
   * Pacing (plans/embers-act-2.md, the duel round is 90 s, `ACT2_BEAT_S.duelRound`): a bout is three rounds, so 270 s
   * against a talk's six nodes. Duels are optional and only on the compromise branch; A13's R10 row is measured on the
   * miners branch, so the floor does not move.
   */
  roundsPerBout: 3,
} as const;

/** The enemy def the seconds use: the yard veteran (Act 1's sparring bout, `mercy: spare when yielding`). */
export const R10_DUEL_ENEMY = 'yard-veteran' as const;
export const R10_DUEL_SPAWNER = 'fu.r10.duel';
/** Defined where Cael stands when a bout starts (a runtime anchor; removed when the bout ends). */
export const R10_DUEL_ANCHOR = 'oldsmoke.r10.duel.ring';

/** The second's group: manual (only this module spawns it), never saved, not leashed (the trial keeps it close). */
export const R10_DUEL_SPAWNERS: readonly SpawnerDef[] = [
  {
    id: R10_DUEL_SPAWNER, tag: 'r10.duel', enemy: R10_DUEL_ENEMY, count: 1, anchor: R10_DUEL_ANCHOR,
    activation: 'manual', ephemeral: true, untauntable: true, leash: false, band: 'oldsmoke', respawn: 'never',
  },
];

export interface R10DuelPorts {
  events: GameEvents;
  state: { getFlag(key: string): FlagValue | undefined; setFlag(key: string, value: FlagValue): void };
  quests(): { state(id: string): QuestState; objectiveDone(q: string, o: string): boolean } | undefined;
  enemies(): { spawnGroup(id: string, opts?: { aggro?: boolean }): ActorId[]; despawnGroup(id: string): void } | undefined;
  trials(): TrialsService | undefined;
  /** `allyEngagement.exclude`: keeps companions and the familiar off the second for the bout. Absent: no exclusion. */
  keepAlliesOff?(opponentId: ActorId): () => void;
  /** True while a dialogue is open: the bout starts once the talk that offered it has closed. */
  dialogueOpen(): boolean;
  defineAnchor(a: Anchor): () => void;
  playerFeet(): { x: number; y: number; z: number };
  /** Radians; yaw 0 faces -Z. */
  playerYaw(): number;
  warn(message: string): void;
}

interface Bout {
  n: R10Round;
  trialId: string;
  opponentId: ActorId;
  offAnchor: () => void;
  offAllies: () => void;
}

export interface R10DuelView {
  round: R10Round;
  trialId: string;
  opponentId: ActorId;
}

export class R10Duels {
  private bout: Bout | null = null;
  /** A round asked for from the dialogue, started on the first tick with no dialogue open. */
  private pending: R10Round | null = null;
  /** The second is put away on the next tick, outside the event flush that ended the bout. */
  private sweep = false;
  private readonly offs: (() => void)[] = [];
  private disposed = false;

  constructor(private readonly p: R10DuelPorts) {
    const ev = p.events;
    this.offs.push(
      ev.onAny((type, payload) => {
        if ((type as string) !== R10_DUEL_START_EVENT) return;
        const n = Number((payload as { n?: unknown } | undefined)?.n);
        if (!isR10Round(n)) p.warn(`R10 duels: ${R10_DUEL_START_EVENT} with no round`);
        else if (!this.request(n)) p.warn(`R10 duels: round ${n} cannot be fought now`);
      }),
      ev.on('trial.won', ({ trialId }) => {
        if (this.bout?.trialId === trialId) this.win(this.bout.n);
      }),
      ev.on('trial.started', () => this.setBusy(true)),
      ev.on('trial.ended', ({ trialId }) => {
        if (this.bout?.trialId === trialId) this.clear();
        this.refreshBusy(trialId);
      }),
      // The second yields and is Spared: the bout is won (the trial then ends as the second leaves).
      ev.on('mercy', (e) => {
        const b = this.bout;
        if (!b || e.actorId !== b.opponentId || e.verb !== 'spare') return;
        this.win(b.n);
        this.p.trials()?.stop(b.trialId);
        this.clear();
      }),
      ev.on('save.loaded', () => {
        this.pending = null;
        this.stopBout();
        this.refreshBusy();
      }),
    );
    this.refreshBusy();
  }

  /** The flag the duel choice's condition reads; it is recomputed from what is running, so a saved value never sticks. */
  private setBusy(busy: boolean): void {
    if (this.p.state.getFlag(R10_DUEL_BUSY_FLAG) !== busy) this.p.state.setFlag(R10_DUEL_BUSY_FLAG, busy);
  }

  private refreshBusy(endedTrialId?: string): void {
    const running = this.p.trials()?.state();
    this.setBusy(this.pending !== null || this.bout !== null || (!!running && running.id !== endedTrialId));
  }

  /** The running bout, or null. */
  running(): R10DuelView | null {
    const b = this.bout;
    return b ? { round: b.n, trialId: b.trialId, opponentId: b.opponentId } : null;
  }

  /** Whether round `n` may be fought now: R10 on the compromise branch, the talks open, the round not yet won. */
  canDuel(n: R10Round): boolean {
    const q = this.p.quests();
    if (!q || q.state(R10_QUEST) !== 'active' || q.objectiveDone(R10_QUEST, R10_TALKS_OBJECTIVE)) return false;
    if (this.p.state.getFlag(R10_BRANCH_FLAG) !== R10_COMPROMISE) return false;
    return this.p.state.getFlag(r10RoundFlag(n)) !== true;
  }

  /** Asks for round `n`'s bout (the dialogue choice's event); it starts on the first tick with no dialogue open. */
  request(n: R10Round): boolean {
    if (this.disposed || this.bout || this.pending !== null || this.p.trials()?.state() || !this.canDuel(n)) return false;
    this.pending = n;
    this.setBusy(true);
    return true;
  }

  fixedUpdate(): void {
    if (this.disposed) return;
    if (this.sweep && !this.bout) {
      this.sweep = false;
      this.p.enemies()?.despawnGroup(R10_DUEL_SPAWNER);
    }
    const b = this.bout;
    // Won by talk while the bout ran, or R10 left the compromise: the bout has nothing left to decide.
    if (b && !this.canDuel(b.n)) {
      this.stopBout();
      return;
    }
    const n = this.pending;
    if (n === null || this.p.dialogueOpen()) return;
    this.pending = null;
    if (!this.bout && this.canDuel(n)) this.begin(n);
    this.refreshBusy();
  }

  dispose(): void {
    if (this.disposed) return;
    this.pending = null;
    this.stopBout();
    this.setBusy(false);
    if (this.sweep) this.p.enemies()?.despawnGroup(R10_DUEL_SPAWNER);
    this.sweep = false;
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
  }

  private begin(n: R10Round): void {
    const en = this.p.enemies();
    const trials = this.p.trials();
    if (!en || !trials) return this.p.warn('R10 duels: no enemies or trials service');
    if (trials.state()) return this.p.warn('R10 duels: another trial is running');
    const f = this.p.playerFeet();
    const yaw = this.p.playerYaw();
    const ahead = R10_DUEL_TUNING.spawnAhead;
    let offAnchor: () => void;
    try {
      offAnchor = this.p.defineAnchor({
        id: R10_DUEL_ANCHOR,
        position: { x: f.x - Math.sin(yaw) * ahead, y: f.y, z: f.z - Math.cos(yaw) * ahead },
        yaw: yaw + Math.PI,
      });
    } catch (err) {
      return this.p.warn(`R10 duels: ${String(err)}`);
    }
    en.despawnGroup(R10_DUEL_SPAWNER);
    const [opponentId] = en.spawnGroup(R10_DUEL_SPAWNER, { aggro: true });
    if (!opponentId) {
      offAnchor();
      return this.p.warn('R10 duels: the second did not spawn');
    }
    const trialId = r10DuelTrialId(n);
    // Set before start: `trial.started` listeners may already ask what is running.
    this.bout = { n, trialId, opponentId, offAnchor, offAllies: this.p.keepAlliesOff?.(opponentId) ?? (() => {}) };
    if (!trials.start({ id: trialId, opponentId, breaksToWin: R10_DUEL_TUNING.breaksToWin, onLoss: 'end' })) {
      this.clear();
      this.p.warn('R10 duels: the trial did not start');
    }
  }

  /** Round `n` won in the ring: A13's round flag and event, once. */
  private win(n: R10Round): void {
    if (!this.canDuel(n)) return;
    this.p.state.setFlag(r10RoundFlag(n), true);
    this.p.events.emit(R10_PERSUADED_EVENT as never, { n: String(n) } as never);
  }

  private stopBout(): void {
    const b = this.bout;
    if (!b) return;
    // The trial's own `trial.ended` clears the bout; clear again in case the service is gone.
    this.p.trials()?.stop(b.trialId);
    this.clear();
  }

  private clear(): void {
    const b = this.bout;
    if (!b) return;
    this.bout = null;
    b.offAnchor();
    b.offAllies();
    this.sweep = true;
  }
}
