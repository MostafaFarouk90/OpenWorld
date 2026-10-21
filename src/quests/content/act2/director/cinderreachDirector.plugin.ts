import type { GamePlugin } from '../../../../core/plugins';
import { makeKit, type Off } from './kit';
import { installM11 } from './m11';
import { installM12, installR06 } from './m12r06';
import { installR05 } from './r05';
import { installM13, installR11 } from './m13r11';
import { installM14, installM15 } from './m14m15';
import { installD03 } from './d03';
import { ACT2_TRIGGERS } from '../triggers';

export const ACT2_QUEST_IDS = ['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03'] as const;

let offs: Off[] = [];

/**
 * Act 2 Cinderreach quest director (plans/act2-A12.md): the rules that cannot live in a quest def, the dialogue or A3's data.
 * It writes the story flags the quests, A3's posts and A5's companions read (`story.<id>.complete`, the choices, the
 * outcomes), starts the services the quests lean on (escort, waves, trials, herd, fox, wyrm cage) and rebuilds what they do
 * not save from flags on a load. Everything it keeps is in the flag store.
 */
const plugin: GamePlugin = {
  id: 'cinderreach-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'cinderreach', 'inventory', 'wyrms', 'classes', 'waves'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    // The drop-offs and ledges the quests name (`trg.q12.*`): spheres at A3's anchors, which A3 publishes no trigger for.
    for (const t of ACT2_TRIGGERS) {
      const at = ctx.anchors.find(t.anchorId);
      if (!at) { warn(`[cinderreach-quests] trigger ${t.id}: no anchor ${t.anchorId}`); continue; }
      offs.push(ctx.triggers.add({ id: t.id, shape: { type: 'sphere', center: at.position, radius: t.radius } }));
    }

    for (const install of [installM11, installM12, installR06, installR05, installM13, installR11, installM14, installM15, installD03]) {
      offs.push(...install(kit));
    }

    // Every quest's `story.<id>.complete`, written when it completes and kept in step on a load.
    const syncComplete = (): void => {
      for (const id of ACT2_QUEST_IDS) if (kit.qstate(id) === 'completed') kit.set(`story.${id}.complete`);
    };
    kit.on('quest.completed', (e) => {
      if ((ACT2_QUEST_IDS as readonly string[]).includes(e.questId)) kit.set(`story.${e.questId}.complete`);
    });
    kit.on('save.loaded', syncComplete);

    // The Fox-Fire Ember lights the Dell's fire for the buff's thirty minutes.
    kit.on('item.used', (e) => {
      if (e.itemId === 'fox-fire-ember') ctx.services.get('foxFire')?.apply();
    });

    offs.push(ctx.systems.add({ id: 'cinderreach-quests.tick', fixedPhase: 'rules', order: 10, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
