// L13 PR 2 (Phase H playthrough finding L4): no companion bark from an act's end until its camp scene is over. Acts 3
// and 4 fade and move the party to a camp anchor after the card; a bark said in that window (often an area bark for the
// new spot) stayed on screen over the first camp line. The hold is read from flags only, so it survives a load: it is on
// while a row with a camp anchor has its gate set and its camp not yet seen.
import { ACT_ENDINGS, type ActEndingDef } from '../integration/actEndings';

export function barksHeldForActEnding(getFlag: (key: string) => unknown, rows: readonly ActEndingDef[] = ACT_ENDINGS): boolean {
  return rows.some((r) => !!r.campAnchorId && !!getFlag(r.gateFlag) && !getFlag(r.campSeenFlag));
}
