import type { ActorId } from '../actors/Actor';

// The K6a (Act 3 dragons) events that are not on main yet, declared here by module augmentation so the K14 sound plugin
// types against them. The property types are identical to K6a's (plans/act3-K6a.md section 12), so TypeScript merges the two
// declarations cleanly. Whichever of K6a and K14 merges second deletes its copy.
declare module '../core/events' {
  interface GameEventMap {
    /** Hathren's fight beats; K14 plays a cue for some of them (`HATHREN_BEAT_SFX`). */
    'wyrm.hathren': { beat: 'wake' | 'thrash' | 'spray' | 'netDropped' | 'rise' | 'roar' | 'quiet' | 'dive' | 'scale' | 'gone' };
    /** A dragon's wings start or stop; `actorId` is an actor id, or the dragon's name for a scene object that is not an actor. */
    'dragon.flight': { actorId: string; on: boolean };
    'wyrm.drake.chainStruck': { actorId: ActorId; by: ActorId | null };
    'wyrm.drake.freed': { actorId: ActorId };
    'wyrm.drake.landed': { actorId: ActorId };
  }
}

export {};
