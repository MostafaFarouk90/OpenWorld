// The Act 2 mini-ending, "The Houses Stand" (design Act 2 ending: after M22 and D04). Same rules as Act 1's
// (act1Ending.ts) on the shared director, built from the act-ending table row:
//   new ActEndingDirector(directorDef(actEnding(2)!), ports)
// Live: when the second of M22 and D04 completes, the director sets `story.gate.a3` once and emits
// `act.ended { act: 2, endingId: 'the-houses-stand' }` once. The HUD shows the card (`hud.plugin.ts`), the Harrowmark
// world change (worldChange.ts) and the second companion seat (companions `maxActive`) derive from `story.gate.a3`, and
// the camp scene (`scene-act2-camp`) runs after the card. On `save.loaded` it only re-derives; it never emits.
//
// Completion is read from the quest service, with the quest-level flag `story.<id>.complete` (A13 writes it for every
// Phase D quest, plans/act2-A13.md) as a second witness, so a save whose quest record and flag disagree still ends the act.
import { ActEndingDirector, type ActEndingPorts } from './actEndingDirector';
import { actEnding, directorDef } from './actEndings';

export const ACT2_ENDING_ID = 'the-houses-stand';
export const ACT2_GATE_FLAG = 'story.gate.a3';
export const ACT2_CAMP_DIALOGUE = 'scene-act2-camp';
/** Not a real NPC's id: a later `talk` objective cannot be credited by the scene. */
export const ACT2_CAMP_NPC = 'camp';
/** The quests whose completion ends the act (the table row; `story.m22.complete` and `story.d04.complete`). */
export const ACT2_ENDING_QUESTS: readonly string[] = actEnding(2)!.requires;

/** The completion flag A13 writes for a Phase D quest id. */
export const questCompleteFlag = (id: string): string => `story.${id}.complete`;

/** `completed` when the quest service says so or its completion flag is set; else the service's own state. */
export function endingQuestState(
  id: string,
  quests: { state(id: string): string } | undefined,
  getFlag: (key: string) => unknown,
): string {
  const s = quests?.state(id) ?? 'inactive';
  return s === 'completed' || getFlag(questCompleteFlag(id)) === true ? 'completed' : s;
}

export type Act2EndingPorts = ActEndingPorts;

export function createAct2Ending(ports: Act2EndingPorts): ActEndingDirector {
  return new ActEndingDirector(directorDef(actEnding(2)!), ports);
}
