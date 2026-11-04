// `story.<id>.complete` for the summit quests (K13 PR 2), written on completion and re-derived on a load. M32's is the reveal installer's: it waits for
// the scene to end and for Ysmeryth to perch (the rule that the flag is written only after the scene).
import type { Kit } from './shared';
import { SUMMIT_QUEST_IDS } from '../summit.content';

export const SELF_COMPLETING: readonly string[] = ['m32'];

export function installSummitComplete(k: Kit): void {
  const ids = SUMMIT_QUEST_IDS.filter((id) => !SELF_COMPLETING.includes(id));
  const sync = (): void => {
    for (const id of ids) if (k.qstate(id) === 'completed') k.set(`story.${id}.complete`);
  };
  k.on('quest.completed', (e) => { if (ids.includes(e.questId)) k.set(`story.${e.questId}.complete`); });
  k.on('save.loaded', sync);
  sync();
}
