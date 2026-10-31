import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installComplete, installExtraAnchors, installTriggersAndCast } from './generic';
import { installM23, installM24, installM25, installR12 } from './early';
import { installD05, installM26, installM27, installR13, installR14 } from './late';

let offs: Off[] = [];

/**
 * Greyfen quest director (plans/act3-K12.md section 3): the rules that cannot live in a quest def or the dialogue. It adds the few
 * anchors the quests need beside K3's, arms the spawner groups, writes `story.<id>.complete`, and runs each quest's set pieces
 * and flags. Choices are dialogue effects (the Act 1 pattern); K3 mirrors `story.r12.choice` and `story.r14.choice`.
 */
const plugin: GamePlugin = {
  id: 'greyfen-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'greyfen', 'npcs', 'interiors'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    offs.push(...installExtraAnchors(kit));
    installTriggersAndCast(kit, offs);
    installArms(kit);
    installComplete(kit);
    installM23(kit);
    installM24(kit);
    installR12(kit);
    installM25(kit);
    installR14(kit);
    installR13(kit);
    installM26(kit);
    installM27(kit);
    installD05(kit);

    offs.push(ctx.systems.add({ id: 'greyfen-quests.tick', fixedPhase: 'rules', order: 10, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
