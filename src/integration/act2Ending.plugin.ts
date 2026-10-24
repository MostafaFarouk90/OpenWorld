// Plugin `act2-ending`: wires the Act 2 ending director (act2Ending.ts) to the quests, the HUD's card and the dialogue
// service. A16. The camp has no still shot: it plays in the Act 2 camp where the player stands.
import type { GamePlugin } from '../core/plugins';
import { ACT2_CAMP_DIALOGUE, ACT2_CAMP_NPC, createAct2Ending, endingQuestState } from './act2Ending';

const plugin: GamePlugin = {
  id: 'act2-ending',
  dependsOn: ['core', 'quests', 'dialogue'],
  setup(ctx) {
    const quests = ctx.services.require('quests');
    const dialogue = () => ctx.services.get('dialogue');
    const getFlag = (k: string) => ctx.state.getFlag(k);
    const director = createAct2Ending({
      questState: (id) => endingQuestState(id, quests, getFlag),
      getFlag,
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitActEnded: (e) => ctx.events.emit('act.ended', e),
      busy: () => ctx.hud.modalOpen !== null || dialogue()?.active === true || ctx.services.get('actEndingCard')?.active() === true,
      inCombat: () => ctx.player.actor.dead || ctx.services.get('waystones')?.hostileAggro === true,
      startCamp: () => dialogue()?.start(ACT2_CAMP_DIALOGUE, ACT2_CAMP_NPC) === true,
    });
    ctx.events.on('quest.completed', (e) => director.onQuestCompleted(e.questId));
    ctx.events.on('hud.actEnding.closed', (e) => director.onCardClosed(e.endingId));
    ctx.events.on('save.loaded', () => director.onLoaded());
    ctx.events.on('dialogue.ended', (e) => director.onDialogueEnded(e.dialogueId));
    ctx.systems.add({
      id: 'act2-ending',
      fixedPhase: 'rules',
      order: 851,
      fixedUpdate: () => director.tick(),
    });
    (globalThis as { __act2Ending?: unknown }).__act2Ending = director;
  },
  dispose() {
    delete (globalThis as { __act2Ending?: unknown }).__act2Ending;
  },
};

export default plugin;
