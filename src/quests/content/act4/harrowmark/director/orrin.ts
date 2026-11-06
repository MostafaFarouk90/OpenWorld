import type { Kit, Off } from '../../../act2/director/kit';

/**
 * Orrin, Grisel's steward (`grisel-steward`), stands in the Keep hall for M22 and leaves when it completes (density.layout.ts).
 * M35 and M36 talk to him again in Act 4, so his absence runs on this flag instead: away after M22 until the Act 4 gate, and
 * away again once the Council falls (M38). The director keeps it in step, so an old save is put right on load.
 */
export const ORRIN_AWAY = 'story.a4.orrinAway';

export function orrinAway(k: Pick<Kit, 'flag'>): boolean {
  return (k.flag('story.m22.complete') && !k.flag('story.gate.a4')) || k.flag('story.m38.complete');
}

export function installOrrin(k: Kit): Off {
  const sync = (): void => {
    const away = orrinAway(k);
    if (away !== k.flag(ORRIN_AWAY)) (away ? k.set(ORRIN_AWAY) : k.clear(ORRIN_AWAY));
  };
  sync();
  return k.every(30, sync);
}
