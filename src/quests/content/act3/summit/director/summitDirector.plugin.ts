import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installGroupObjectives } from '../../dragonspine/director/generic';
import { SUMMIT_ARMS } from '../arms';
import { SUMMIT_GROUP_OBJECTIVES } from '../groups';
import { SUMMIT_NPCS, SUMMIT_NPC_DEFS, SUMMIT_NPC_STRINGS_EN } from '../npcs';
import { installSummitComplete } from './complete';
import { installM31 } from './trial';
import { installM32 } from './reveal';
import { installM33 } from './net';
import { installM34 } from './oath';
import { installD06 } from './aerie';

let offs: Off[] = [];

/**
 * Summit quest director (plans/act3-K13-pr2.md): M31's trial and climb, M32's Hearth scenes and Keeper's Understanding, M33's net and witnesses,
 * M34's oath and D06's Aerie. It arms the groups, writes `story.<id>.complete`, registers the summit cast (K4's layout holds their posts) and the
 * summit's two Thorgar posts. Choices are dialogue effects.
 */
const plugin: GamePlugin = {
  id: 'dragonspine-summit-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'dragonspine', 'npcs'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    offs.push(ctx.strings.register('en', { ...SUMMIT_NPC_STRINGS_EN }));
    try {
      const npcs = ctx.services.get('npcs');
      if (!npcs) throw new Error('the npcs service is missing');
      offs.push(npcs.register(SUMMIT_NPCS, SUMMIT_NPC_DEFS));
    } catch (err) {
      console.warn('summit: could not register the summit NPCs', err);
    }

    installArms(kit, SUMMIT_ARMS);
    installGroupObjectives(kit, SUMMIT_GROUP_OBJECTIVES);
    installSummitComplete(kit);
    installM31(kit);
    offs.push(installM32(kit));
    installM33(kit);
    installM34(kit);
    offs.push(installD06(kit));

    offs.push(ctx.systems.add({ id: 'dragonspine-summit-quests.tick', fixedPhase: 'rules', order: 11, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
