import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installGroupObjectives } from '../../../act4/harrowmark/director/generic';
import { installComplete, installDoneWhenRecheck, installExtraAnchors, installTriggersAndCast } from './generic';
import { FOUNDRY_A5_ARMS, FOUNDRY_A5_GROUPS } from './tables';
import { installD09, installM53, installR27, installR28, installR30 } from './quests';
import { installEnding, installM54, installM55, installM56 } from './descent';

let offs: Off[] = [];

/**
 * The Foundry quests' director (plans/act5-N11.md): the anchors beside N1's and N2's, the Foundry cast, the arms and group
 * objectives, `story.<id>.complete`, and each quest's set pieces. Choices are dialogue effects.
 */
const plugin: GamePlugin = {
  id: 'foundry-a5-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'npcs', 'interiors', 'siege', 'spells', 'caldera-lava', 'scenes'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    offs.push(...installExtraAnchors(kit));
    installTriggersAndCast(kit, offs);
    installArms(kit, FOUNDRY_A5_ARMS);
    installComplete(kit);
    installGroupObjectives(kit, FOUNDRY_A5_GROUPS);
    installDoneWhenRecheck(kit);
    installR27(kit);
    installR28(kit);
    installR30(kit, offs);
    installM53(kit);
    installD09(kit);
    installM54(kit);
    installM55(kit);
    installM56(kit);
    installEnding(kit, offs);

    offs.push(ctx.systems.add({ id: 'foundry-a5-quests.tick', fixedPhase: 'rules', order: 11, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
