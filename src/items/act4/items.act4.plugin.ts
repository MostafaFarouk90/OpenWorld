// Act 4 L7 (plans/act4-L7.md): registers the Act 4 item strings, keeps Gaut's Oathblade in the form the class carries,
// adds the carried form's poise bonus, and puts Dunstan's forge at the Ashgate refuge from M41.
import type { ClassId } from '../../actors/classes';
import { PLAYER_ID } from '../../actors/teams';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { REFUGE_ANVIL } from '../../economy/refugePosts.act4';
import './catalog';
import { OATHBLADE_POISE_MODIFIER, oathbladePoise, reconcileOathblade, type OathbladePorts } from './oathblade';
import { ITEMS_ACT4_STRINGS_EN } from './strings.en';

interface SoftClasses {
  chosen?(): boolean;
  current?(): ClassId;
}
interface SoftQuests {
  state?(id: string): string;
}
interface SoftGear {
  openSmith?(): boolean;
}

export const FORGE_ASHGATE_ID = 'use:forge-ashgate';

let offs: (() => void)[] = [];

const itemsAct4Plugin: GamePlugin = {
  id: 'items-act4',
  dependsOn: ['core', 'inventory'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', ITEMS_ACT4_STRINGS_EN);
    const inventory = ctx.services.require('inventory');
    const soft = <T>(name: string): T | undefined => (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;

    const ports: OathbladePorts = {
      classId: () => {
        const c = soft<SoftClasses>('classes');
        return c?.chosen?.() ? (c.current?.() ?? null) : null;
      },
      has: (id) => inventory.has(id),
      add: (id, n) => inventory.add(id, n),
      remove: (id, n) => inventory.remove(id, n),
      setTemper: (id, level, affix) => inventory.setTemper(id, level, affix),
      equipped: (slot) => inventory.equipped(slot),
      equip: (id) => inventory.equip(id),
      gemRoomFor: inventory.gemRoomFor ? (id) => inventory.gemRoomFor!(id) : undefined,
    };
    const reconcile = (): void => {
      // Before a class is chosen there is nothing to match (M39 is long after M07).
      if (ports.classId() === null) return;
      if (reconcileOathblade(ports) === 'waiting') ctx.events.emit('hud.toast', { textKey: 'item.gauts-oathblade.swapWaiting' });
    };
    offs.push(
      ctx.events.on('class.chosen', reconcile),
      ctx.events.on('class.changed', reconcile),
      ctx.events.on('save.loaded', reconcile),
      ctx.damage.addModifier(
        OATHBLADE_POISE_MODIFIER.id,
        (req) => {
          req.poise = oathbladePoise(req, PLAYER_ID, inventory.equipped('trinket'));
        },
        OATHBLADE_POISE_MODIFIER.order,
      ),
    );

    // Dunstan's forge at the refuge (his shop moves by VENDOR_POSTS; the forge is its own interactable). The anchor is L1's.
    const questDone = (id: string): boolean => soft<SoftQuests>('quests')?.state?.(id) === 'completed';
    ctx.interaction.register({
      id: FORGE_ASHGATE_ID,
      kind: 'use',
      name: 'dunstan',
      promptKey: 'gear.smith.prompt',
      priority: -0.01,
      position: (out) => {
        const a = ctx.anchors.find(REFUGE_ANVIL);
        return a ? out.set(a.position.x, a.position.y, a.position.z) : out.set(0, -1e6, 0);
      },
      enabled: () => ctx.state.getBool('story.m41.complete') && questDone('m14') && !!ctx.anchors.find(REFUGE_ANVIL),
      onInteract: () => void soft<SoftGear>('gear')?.openSmith?.(),
    });
  },
  dispose() {
    for (const off of offs) off();
    offs = [];
  },
};

export default itemsAct4Plugin;
