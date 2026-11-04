// The lower Dragonspine director's quest-independent rules: the "arms" that turn a spawner group on when its step is current,
// `story.<id>.complete`, K4's `story.r16.started` re-derived on a load, and the group objectives.
import type { Kit } from './shared';
import { recheck } from './shared';
import { DRAGONSPINE_ARMS } from '../arms';
import { DRAGONSPINE_GROUP_OBJECTIVES } from '../groups';
import { DRAGONSPINE_QUEST_IDS } from '../dragonspine.content';
import { R16_STARTED_FLAG } from '../r16.quest';

/** A pack or prop group appears only when its step is current or done (never on accept): the spawner reads the flag. */
export function installArms(k: Kit): void {
  const arm = (): void => {
    for (const a of DRAGONSPINE_ARMS) {
      if (k.flag(a.flag) || !k.active(a.quest)) continue;
      if (k.objCurrent(a.quest, a.objective) || k.objDone(a.quest, a.objective)) k.set(a.flag);
    }
  };
  k.on('quest.objective', () => k.later(arm));
  k.on('quest.started', () => k.later(arm));
  k.on('save.loaded', () => k.later(arm));
  k.later(arm);
}

/** `story.<id>.complete` on completion and re-derived on a load; `story.r16.started` (K4's door reads it) is re-derived too. */
export function installComplete(k: Kit): void {
  const sync = (): void => {
    for (const id of DRAGONSPINE_QUEST_IDS) if (k.qstate(id) === 'completed') k.set(`story.${id}.complete`);
    const r16 = k.qstate('r16');
    if ((r16 === 'active' || r16 === 'completed') && !k.flag(R16_STARTED_FLAG)) k.set(R16_STARTED_FLAG);
  };
  k.on('quest.completed', (e) => {
    if (DRAGONSPINE_QUEST_IDS.includes(e.questId)) k.set(`story.${e.questId}.complete`);
  });
  k.on('quest.started', (e) => {
    if (e.questId === 'r16') k.set(R16_STARTED_FLAG);
  });
  k.on('save.loaded', sync);
  sync();
}

/** Poll periods, after a load, before an empty group counts as cleared (the spawners put the survivors back first). */
export const GROUP_GRACE_POLLS = 8;

/**
 * Group objectives (groups.ts): the `down` flag is written once every group of the row is empty after a member was seen
 * standing, whoever or whatever removed them (a kill by Cael, a companion or the world, a calm, a despawn).
 */
export function installGroupObjectives(k: Kit): void {
  let grace = 0;
  k.on('save.loaded', () => { grace = GROUP_GRACE_POLLS; });
  k.every(30, () => {
    if (grace > 0) { grace--; return; }
    for (const g of DRAGONSPINE_GROUP_OBJECTIVES) {
      if (!k.active(g.quest) || k.flag(g.down)) continue;
      const standing = g.groups.reduce((n, id) => n + k.standing(id).length, 0);
      if (standing > 0) { if (!k.flag(g.seen)) k.set(g.seen); continue; }
      if (!k.flag(g.seen)) continue;
      k.set(g.down);
      k.emit(g.down);
      k.later(() => recheck(k));
    }
  });
}
