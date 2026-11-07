// Plugin `act4-ending` (L13 PR 2, plan Q8, contracts v0.8 item 14): wires the Act 4 ending director, "The Road to the Rim",
// to the quests, the HUD's card (hud.plugin.ts reads the row) and the dialogue service. The Act 3 plugin's twin: when the
// second of M46 and D08 completes, `story.gate.a5` is set once and `act.ended { act: 4 }` emitted once; after the card the
// director fades and moves the party to the Rimfoot fire (`waste.rimfoot.fire`, L1) before the camp scene
// `scene-act4-camp` (campScene.dialogue.ts). On `save.loaded` it only re-derives (an owed camp is owed again; nothing is
// emitted twice).
import type { GamePlugin } from '../core/plugins';
import { ActEndingDirector } from './actEndingDirector';
import { actEnding, directorDef } from './actEndings';
import { endingQuestState } from './act2Ending';

export const ACT4_ENDING = actEnding(4)!;
/** Not a real NPC's id: a later `talk` objective cannot be credited by the scene. */
export const ACT4_CAMP_NPC = 'camp';

const plugin: GamePlugin = {
  id: 'act4-ending',
  dependsOn: ['core', 'quests', 'dialogue'],
  setup(ctx) {
    const quests = ctx.services.require('quests');
    const dialogue = () => ctx.services.get('dialogue');
    const getFlag = (k: string) => ctx.state.getFlag(k);
    const director = new ActEndingDirector(directorDef(ACT4_ENDING), {
      questState: (id) => endingQuestState(id, quests, getFlag),
      getFlag,
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitActEnded: (e) => ctx.events.emit('act.ended', e),
      busy: () => ctx.hud.modalOpen !== null || dialogue()?.active === true || ctx.services.get('actEndingCard')?.active() === true,
      inCombat: () => ctx.player.actor.dead || ctx.services.get('waystones')?.hostileAggro === true,
      startCamp: () => dialogue()?.start(ACT4_ENDING.campDialogueId, ACT4_CAMP_NPC) === true,
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
      id: 'act4-ending',
      fixedPhase: 'rules',
      order: 853,
      fixedUpdate: () => director.tick(),
    });
    (globalThis as { __act4Ending?: unknown }).__act4Ending = director;
  },
  dispose() {
    delete (globalThis as { __act4Ending?: unknown }).__act4Ending;
  },
};

export default plugin;
