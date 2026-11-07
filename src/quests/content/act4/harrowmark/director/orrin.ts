import type { Kit, Off } from '../../../act2/director/kit';
import { M35_ESCORT } from '../m35.quest';

/**
 * Orrin, Grisel's steward (`grisel-steward`), stands in the Keep hall for M22 and leaves when it completes (density.layout.ts).
 * M35 and M36 talk to him again in Act 4, so his absence runs on this flag instead: away after M22 until the Act 4 gate, and
 * away again once the Council falls (M38). The director keeps it in step, so an old save is put right on load.
 */
export const ORRIN_AWAY = 'story.a4.orrinAway';

export function orrinAway(k: Pick<Kit, 'flag'> & Partial<Pick<Kit, 'ctx'>>): boolean {
  return (k.flag('story.m22.complete') && !k.flag('story.gate.a4')) || k.flag('story.m38.complete') || orrinWalking(k);
}

/**
 * Act 4 L14 (Phase G report L2): in M35 Orrin walks to the Keep as the Grisel party's delegate (`delegate.grisel`, "He
 * sends me, and two guards"), so the layout Orrin steps out while that escort is out, or the player sees two of him.
 */
export function orrinWalking(k: Partial<Pick<Kit, 'ctx'>>): boolean {
  return k.ctx?.services.get('escortsAct4')?.active() === M35_ESCORT('grisel');
}

export function installOrrin(k: Kit): Off {
  const sync = (): void => {
    const away = orrinAway(k);
    if (away !== k.flag(ORRIN_AWAY)) (away ? k.set(ORRIN_AWAY) : k.clear(ORRIN_AWAY));
  };
  sync();
  // also at once on a load, so an older save made after M22 does not show him for up to 30 ticks before the poll catches up
  const offs = [k.every(30, sync), k.on('save.loaded', sync)];
  return () => offs.forEach((o) => o());
}
