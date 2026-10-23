import type { GamePlugin } from '../../../../core/plugins';
import { R10Duels } from './r10Duels';

let duels: R10Duels | null = null;

/**
 * R10's optional duels (plans/act2-followups/r10-duels.md): runs the bout a round's duel choice asks for. The choice
 * itself is added to A13's round dialogue by `withR10Duels` in the dialogue plugin; the second's spawner is listed with
 * the Act 2 quest spawners. Without A13's R10 nothing raises the duel event, so this plugin idles.
 */
const plugin: GamePlugin = {
  id: 'r10-duels',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'companions'],
  setup(ctx) {
    const d = new R10Duels({
      events: ctx.events,
      state: ctx.state,
      quests: () => ctx.services.get('quests'),
      enemies: () => ctx.services.get('enemies'),
      trials: () => ctx.services.get('trials'),
      dialogueOpen: () => ctx.services.get('dialogue')?.active ?? false,
      defineAnchor: (a) => ctx.anchors.define(a),
      playerFeet: () => ctx.player.feet,
      playerYaw: () => ctx.player.facingYaw,
      warn: (m) => console.warn(`[r10-duels] ${m}`),
    });
    duels = d;
    ctx.systems.add({ id: 'r10-duels.tick', fixedPhase: 'rules', order: 12, fixedUpdate: () => d.fixedUpdate() });
  },
  dispose() {
    duels?.dispose();
    duels = null;
  },
};

export default plugin;
