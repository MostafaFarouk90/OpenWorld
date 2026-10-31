// The lower Dragonspine director's quest-independent rules: the "arms" that turn a spawner group on when its step is current,
// `story.<id>.complete`, K4's `story.r16.started` re-derived on a load, and the group objectives.
import type { Kit } from './shared';
import { recheck } from './shared';
import { ENEMY_DEFS } from '../../../../../enemies/defs';
import { DRAGONSPINE_ARMS } from '../arms';
import { DRAGONSPINE_GROUP_OBJECTIVES } from '../groups';
import { DRAGONSPINE_QUEST_IDS } from '../dragonspine.content';
import { DRAGONSPINE_SPAWNERS } from '../spawners';
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
/** Polls an armed group may stay empty and unseen before it is read as gone (it is waiting for the player to come near). */
export const GROUP_UNSEEN_POLLS = 6;

/** True when no enemy kind of these spawner groups has a def yet (K6b PR 2 is not merged): the groups spawn nothing. */
export function groupKindsMissing(groups: readonly string[], defs: Readonly<Record<string, unknown>> = ENEMY_DEFS): boolean {
  const kinds = new Set<string>();
  for (const g of groups) {
    const s = DRAGONSPINE_SPAWNERS.find((x) => x.id === g);
    if (!s) continue;
    for (const kd of s.memberKinds ?? [s.enemy]) kinds.add(kd);
  }
  return kinds.size > 0 && [...kinds].every((kd) => !(kd in defs));
}

/**
 * Group objectives (groups.ts): the `down` flag is written once every group of the row is empty after a member was seen
 * standing. A row whose kinds have no def (the spawner warns once and spawns nothing) is read as seen and gone as soon as it is
 * armed, so the quest stays finishable.
 */
export function installGroupObjectives(k: Kit, kindsMissing: (groups: readonly string[]) => boolean = groupKindsMissing): void {
  let grace = 0;
  k.on('save.loaded', () => { grace = GROUP_GRACE_POLLS; });
  k.every(30, () => {
    if (grace > 0) { grace--; return; }
    for (const g of DRAGONSPINE_GROUP_OBJECTIVES) {
      if (!k.active(g.quest) || k.flag(g.down)) continue;
      const standing = g.groups.reduce((n, id) => n + k.standing(id).length, 0);
      if (standing > 0) { if (!k.flag(g.seen)) k.set(g.seen); continue; }
      if (!k.flag(g.seen)) {
        if (!(k.flag(g.armFlag) && kindsMissing(g.groups))) continue;
        k.set(g.seen);
      }
      k.set(g.down);
      k.emit(g.down);
      k.later(() => recheck(k));
    }
  });
}
