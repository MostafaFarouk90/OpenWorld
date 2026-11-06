import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installComplete, installExtraAnchors, installGroupObjectives, installDoneWhenRecheck, installTriggersAndCast } from './generic';
import { installEscorts } from './escorts';
import { installM38, installM39, installM40, installM41, installScenes } from './council';
import { installCrossings, installD07, installM35, installM36, installM37, installR19, installR20, installR22 } from './quests';

let offs: Off[] = [];

/**
 * Harrowmark Act 4 quest director (plans/act4-L10.md section 2): the rules that cannot live in a quest def or the dialogue. It
 * adds the quests' anchors beside L2's, arms the spawner groups, writes `story.<id>.complete`, walks the escorts on L4's service
 * and runs each quest's set pieces and flags. Choices are dialogue effects (the Act 1 pattern).
 */
const plugin: GamePlugin = {
  id: 'harrowmark-a4-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'npcs', 'interiors', 'escorts', 'stealth', 'scenes', 'waves', 'waystones'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    offs.push(...installExtraAnchors(kit));
    installTriggersAndCast(kit, offs);
    installArms(kit);
    installComplete(kit);
    installGroupObjectives(kit);
    installDoneWhenRecheck(kit);
    installEscorts(kit);
    installCrossings(kit);
    installM35(kit);
    installM36(kit);
    installR19(kit, offs);
    installR20(kit);
    offs.push(installR22(kit));
    installD07(kit);
    offs.push(installM37(kit));
    offs.push(...installScenes(kit));
    installM38(kit);
    installM39(kit);
    installM40(kit);
    installM41(kit);

    offs.push(ctx.systems.add({ id: 'harrowmark-a4-quests.tick', fixedPhase: 'rules', order: 10, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
