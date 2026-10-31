import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installComplete, installGroupObjectives } from './generic';
import { installM28, installM29, installM30, installR15, installR16 } from './climb';
import { installR17 } from './candles';
import { installR18 } from './eggs';

let offs: Off[] = [];

/**
 * Lower Dragonspine quest director (plans/act3-K13.md): the rules that cannot live in a quest def or the dialogue. It arms the
 * spawner groups, writes `story.<id>.complete`, and runs each quest's set pieces and flags (the crag view, the sled hauls, the
 * candle bundle, the eggs). Choices are dialogue effects (the Act 1 pattern).
 */
const plugin: GamePlugin = {
  id: 'dragonspine-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'dragonspine', 'npcs', 'interiors', 'traversal', 'wayside-shrines', 'inventory'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    installArms(kit);
    installComplete(kit);
    installGroupObjectives(kit);
    installM28(kit);
    installR15(kit);
    installM29(kit);
    installR16(kit);
    installM30(kit);
    offs.push(installR17(kit));
    offs.push(installR18(kit));

    offs.push(ctx.systems.add({ id: 'dragonspine-quests.tick', fixedPhase: 'rules', order: 10, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
