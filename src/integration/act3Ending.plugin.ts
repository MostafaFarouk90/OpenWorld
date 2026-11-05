// Plugin `act3-ending` (K16 PR 2, plan item 18 and Q8): wires the Act 3 ending director, "The Coal-Mother's Oath", to the
// quests, the HUD's card (K15, hud.plugin.ts) and the dialogue service. The Act 2 plugin's twin with one difference: the
// row carries `campAnchorId`, so after the card the director fades and moves the party to the Wyrmwatch Lodge hearth
// (the waystones' safe teleport, which fades and brings the companions behind) before the camp scene `scene-act3-camp`.
// Live: when the second of M34 and D06 completes, `story.gate.a4` is set once and `act.ended { act: 3 }` emitted once.
// On `save.loaded` it only re-derives (an owed camp is owed again; nothing is emitted twice).
import type { GamePlugin } from '../core/plugins';
import { ActEndingDirector } from './actEndingDirector';
import { actEnding, directorDef } from './actEndings';
import { endingQuestState } from './act2Ending';

export const ACT3_ENDING = actEnding(3)!;
/** Not a real NPC's id: a later `talk` objective cannot be credited by the scene. */
export const ACT3_CAMP_NPC = 'camp';

const plugin: GamePlugin = {
  id: 'act3-ending',
  dependsOn: ['core', 'quests', 'dialogue'],
  setup(ctx) {
    const quests = ctx.services.require('quests');
    const dialogue = () => ctx.services.get('dialogue');
    const getFlag = (k: string) => ctx.state.getFlag(k);
    const director = new ActEndingDirector(directorDef(ACT3_ENDING), {
      questState: (id) => endingQuestState(id, quests, getFlag),
      getFlag,
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitActEnded: (e) => ctx.events.emit('act.ended', e),
      busy: () => ctx.hud.modalOpen !== null || dialogue()?.active === true || ctx.services.get('actEndingCard')?.active() === true,
      inCombat: () => ctx.player.actor.dead || ctx.services.get('waystones')?.hostileAggro === true,
      startCamp: () => dialogue()?.start(ACT3_ENDING.campDialogueId, ACT3_CAMP_NPC) === true,
      moveTo: async (anchorId) => {
        const a = ctx.anchors.find(anchorId);
        const ws = ctx.services.get('waystones');
        if (!a || !ws) return false;
        const r = await ws.safeTeleport(a.position, a.yaw);
        return r.ok === true;
      },
    });
    ctx.events.on('quest.completed', (e) => director.onQuestCompleted(e.questId));
    ctx.events.on('hud.actEnding.closed', (e) => director.onCardClosed(e.endingId));
    ctx.events.on('save.loaded', () => director.onLoaded());
    ctx.events.on('dialogue.ended', (e) => director.onDialogueEnded(e.dialogueId));
    ctx.systems.add({
      id: 'act3-ending',
      fixedPhase: 'rules',
      order: 852,
      fixedUpdate: () => director.tick(),
    });
    (globalThis as { __act3Ending?: unknown }).__act3Ending = director;
  },
  dispose() {
    delete (globalThis as { __act3Ending?: unknown }).__act3Ending;
  },
};

export default plugin;
