// Act 3 (K5): barks on events rather than places: Ysmeryth's trial, the reveal and a ferry stop. Each maps to an event
// place (banter.ts) said through `CompanionController.sayAt`, so the director's cooldown, suppression and repeat window
// and the party's one-voice gate all still apply.
import type { GameEventMap } from '../../core/events';
import { REVEAL_FLAG } from './banter';
import '../events';
import type {} from '../../traversal/service';

/** K6a's trial id (plan Part 4 item 23). */
export const YSMERYTH_TRIAL_ID = 'ysmeryth-trial';

export interface EventBarkPorts {
  on<K extends keyof GameEventMap>(type: K, fn: (payload: GameEventMap[K]) => void): () => void;
  /** Says the place's line through every companion (each decides for itself whether it may speak). */
  say(place: string): void;
}

export function listenEventBarks(ports: EventBarkPorts): () => void {
  const offs = [
    ports.on('trial.started', ({ trialId }) => trialId === YSMERYTH_TRIAL_ID && ports.say('trial.start')),
    // Only the player's breaks are cheered.
    ports.on('trial.break', ({ trialId, by }) => trialId === YSMERYTH_TRIAL_ID && by === 'player' && ports.say('trial.break')),
    ports.on('trial.won', ({ trialId }) => trialId === YSMERYTH_TRIAL_ID && ports.say('trial.won')),
    ports.on('trial.lost', ({ trialId }) => trialId === YSMERYTH_TRIAL_ID && ports.say('trial.lost')),
    // A runtime flag change only: a load sets flags without `flag.changed`.
    ports.on('flag.changed', ({ key, value, previous }) => {
      if (key === REVEAL_FLAG && value === true && previous !== true) ports.say('reveal');
    }),
    ports.on('ferry.arrived', () => ports.say('ferry')),
  ];
  return () => offs.forEach((o) => o());
}
