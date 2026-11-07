import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installGroupObjectives } from '../../harrowmark/director/generic';
import { installComplete, installDoneWhenRecheck, installExtraAnchors, installTriggersCastScenes } from './generic';
import { WASTE_A4_ARMS, WASTE_A4_GROUPS } from './tables';
import { installWeather } from './storms';
import { installM42, installStormWalk } from './crossing';
import { installDance, installM44, installPyres, installR25 } from './camp';
import { installR24 } from './cart';
import { installD08, installM45, installM46, m46Clears } from './road';

let offs: Off[] = [];

/**
 * Ashen Waste Act 4 quest director (plans/act4-L11.md): the rules that cannot live in a quest def or the dialogue. It adds
 * the quests' anchors beside L1's sites, registers the Waste cast and the scenes, arms the spawner groups, writes
 * `story.<id>.complete`, holds the weather the quests need, and runs each quest's set pieces. Choices are dialogue effects.
 */
const plugin: GamePlugin = {
  id: 'waste-a4-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'npcs', 'interiors', 'escorts', 'scenes', 'waves', 'weather'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    offs.push(...installExtraAnchors(kit));
    installTriggersCastScenes(kit, offs);
    installArms(kit, WASTE_A4_ARMS);
    installComplete(kit);
    installGroupObjectives(kit, WASTE_A4_GROUPS);
    installDoneWhenRecheck(kit);
    offs.push(installWeather(kit, () => m46Clears(kit)));
    installM42(kit);
    offs.push(installStormWalk(kit));
    installPyres(kit);
    installDance(kit, offs);
    offs.push(installM44(kit));
    installR25(kit, offs);
    installR24(kit);
    installM45(kit);
    installD08(kit);
    installM46(kit);

    offs.push(ctx.systems.add({ id: 'waste-a4-quests.tick', fixedPhase: 'rules', order: 11, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
