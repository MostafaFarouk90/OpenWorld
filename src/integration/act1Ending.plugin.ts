// Plugin `act1-ending`: wires the Act 1 ending director (act1Ending.ts) to the quests, the HUD's card, the dialogue
// service and a still shot of the raised banners while the camp scene plays. Thread 21.
import type { GamePlugin } from '../core/plugins';
import type { CameraOverride } from '../rendering/ThirdPersonCamera';
import { Act1Ending, ACT1_CAMP_DIALOGUE, ACT1_CAMP_NPC } from './act1Ending';

/** The camp's still shot: from above the foot of the Keep road, looking up the lit braziers to the Keep's banners. */
export const CAMP_SHOT = {
  from: 'harrowmark.brazier.keep-road.01',
  fromLift: 7,
  to: ['harrowmark.banner.keep.3', 'harrowmark.banner.keep.4'],
} as const;

const plugin: GamePlugin = {
  id: 'act1-ending',
  dependsOn: ['core', 'quests', 'dialogue'],
  setup(ctx) {
    const quests = ctx.services.require('quests');
    const dialogue = () => ctx.services.get('dialogue');
    const director = new Act1Ending({
      questState: (id) => quests.state(id),
      getFlag: (k) => ctx.state.getFlag(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitActEnded: (e) => ctx.events.emit('act.ended', e),
      // The card counts as busy: a load with the gate set and the card unseen re-shows it (the gate watcher runs before
      // this plugin's save.loaded and marks it seen), and the camp must wait for its close.
      busy: () => ctx.hud.modalOpen !== null || dialogue()?.active === true || ctx.services.get('actEndingCard')?.active() === true,
      inCombat: () => ctx.player.actor.dead || ctx.services.get('waystones')?.hostileAggro === true,
      startCamp: () => dialogue()?.start(ACT1_CAMP_DIALOGUE, ACT1_CAMP_NPC) === true,
    });

    let shot: CameraOverride | null = null;
    const releaseShot = () => {
      shot?.release();
      shot = null;
    };
    ctx.events.on('quest.completed', (e) => director.onQuestCompleted(e.questId));
    ctx.events.on('hud.actEnding.closed', (e) => director.onCardClosed(e.endingId));
    ctx.events.on('save.loaded', () => {
      releaseShot();
      director.onLoaded();
    });
    ctx.events.on('dialogue.started', (e) => {
      if (e.dialogueId !== ACT1_CAMP_DIALOGUE || !ctx.cameraRig || shot) return;
      const from = ctx.anchors.find(CAMP_SHOT.from);
      const to = CAMP_SHOT.to.map((id) => ctx.anchors.find(id));
      if (!from || to.some((a) => !a)) return;
      const look = { x: 0, y: 0, z: 0 };
      for (const a of to) {
        look.x += a!.position.x / to.length;
        look.y += a!.position.y / to.length;
        look.z += a!.position.z / to.length;
      }
      shot = ctx.cameraRig.override({
        position: { x: from.position.x, y: from.position.y + CAMP_SHOT.fromLift, z: from.position.z },
        lookAt: look,
        blendIn: 1.2,
        blendOut: 1,
      });
    });
    ctx.events.on('dialogue.ended', (e) => {
      if (e.dialogueId !== ACT1_CAMP_DIALOGUE) return;
      releaseShot();
      director.onDialogueEnded(e.dialogueId);
    });
    ctx.systems.add({
      id: 'act1-ending',
      fixedPhase: 'rules',
      order: 850,
      fixedUpdate: () => director.tick(),
      dispose: releaseShot,
    });
    (globalThis as { __act1Ending?: Act1Ending }).__act1Ending = director;
  },
  dispose() {
    delete (globalThis as { __act1Ending?: unknown }).__act1Ending;
  },
};

export default plugin;
