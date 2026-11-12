// Act 4 L14 (taste call, design/changes-applied.md "Act 4 L14"): the ambient hunter pack round the Hunters' camp
// (`cinderreach.hunters.camp`) is held despawned while M15's unseen scout of the camp is open, so the player or a bot
// cannot bump into a hostile pack that is not part of the stealth section. Its spawner gate reads this flag as `until`,
// so the pack leaves when the flag is set and comes back (live slots only; kills stay) once the scout is done or M15
// closes. No new posts: the pack returns to its own anchors.
import type { Kit, Off } from './kit';

export const M15_SCOUT_HOLD = 'story.m15.scoutHold';

/** True while M15 is active and its scout objective is not done. */
export function m15ScoutHeld(k: Pick<Kit, 'active' | 'objDone'>): boolean {
  return k.active('m15') && !k.objDone('m15', 'scout');
}

export function installM15ScoutHold(k: Kit): Off[] {
  const sync = (): void => {
    const held = m15ScoutHeld(k);
    if (held !== k.flag(M15_SCOUT_HOLD)) (held ? k.set(M15_SCOUT_HOLD) : k.clear(M15_SCOUT_HOLD));
  };
  sync();
  return [k.every(30, sync), k.on('save.loaded', sync), k.on('quest.objective', sync), k.on('quest.started', sync)];
}
