// Act 2 companion events (thread A5, plans/act2-A5.md section 8): the party window, the downed rule, the trial duel
// and Gaut's escort. Typed here by augmentation; core's `events.ts` stays A0's.
import type { ActorId } from '../actors/Actor';

export type TrialSide = 'player' | 'opponent';
export type TrialEndReason = 'won' | 'lost' | 'yielded' | 'stopped' | 'teleport' | 'despawned' | 'distance' | 'loaded';

declare module '../core/events' {
  interface GameEventMap {
    /** A waystone rest with two or more joined companions: A15 opens the Party screen. */
    'party.offered': { waystoneId: string };
    /** The active set changed (a join, a leave, the Party screen or a quest). */
    'party.changed': { active: string[] };
    'companion.downed': { companionId: string };
    'companion.stood': { companionId: string };
    'trial.started': { trialId: string; opponentId: ActorId; breaksToWin: number };
    'trial.break': { trialId: string; by: TrialSide; player: number; opponent: number };
    'trial.won': { trialId: string };
    'trial.lost': { trialId: string };
    'trial.ended': { trialId: string; reason: TrialEndReason };
    'escort.started': { escortId: string };
    'escort.dismounted': { escortId: string };
    'escort.remounted': { escortId: string };
    'escort.stopped': { escortId: string };
    /** Dialogue `event` effect (the accepted `story.*` namespace): raise a companion's bond rank. */
    'story.companion.rank': { companionId: string; rank: number };
  }
}
