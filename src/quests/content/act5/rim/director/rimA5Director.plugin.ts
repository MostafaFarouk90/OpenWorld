import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installGroupObjectives } from '../../../act4/harrowmark/director/generic';
import { installComplete, installDoneWhenRecheck, installExtraAnchors, installTriggersCastScenes } from './generic';
import { RIM_A5_ARMS, RIM_A5_GROUPS } from './tables';
import { installM47, installM48 } from './gate';
import { installM49, installM51, installR29 } from './camp';
import { installR26 } from './convoy';
import { installM50 } from './hall';

let offs: Off[] = [];

/**
 * The Rim's Act 5 quest director (plans/act5-N10.md, PR 1): the rules that cannot live in a quest def or the dialogue. It adds the
 * quests' anchors beside N1's sites and inside N2's Cooling Hall, registers the Rim cast and the scenes, arms the spawner groups,
 * writes `story.<id>.complete`, and runs each quest's set pieces. Choices are dialogue effects.
 */
const plugin: GamePlugin = {
  id: 'rim-a5-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'npcs', 'interiors', 'escorts', 'scenes', 'weather'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    offs.push(...installExtraAnchors(kit));
    installTriggersCastScenes(kit, offs);
    installArms(kit, RIM_A5_ARMS);
    installComplete(kit);
    installGroupObjectives(kit, RIM_A5_GROUPS);
    installDoneWhenRecheck(kit);
    installM47(kit);
    installM48(kit);
    installM49(kit);
    offs.push(installR26(kit));
    offs.push(installR29(kit));
    offs.push(installM50(kit));
    offs.push(installM51(kit));

    offs.push(ctx.systems.add({ id: 'rim-a5-quests.tick', fixedPhase: 'rules', order: 11, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
