import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import { hudDocument, asHtml, emitLoose, injectCss } from '../hud/soft';
import { HUD_CSS } from '../hud/hudStyles';
import type { ActorPort, InventoryService } from '../hud/ports';
import { ConsumableUser } from './consumables';
import { Inventory } from './Inventory';
import { InventoryMenu } from './InventoryMenu';
import { NEW_GAME_KIT, getItem } from './items';
import { INVENTORY_STRINGS_EN } from './strings.en';

const DRINK_LOCKS = [
  'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'surge', 'interact',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6',
] as const;
const REFUSAL_TOAST: Record<string, string> = {
  'full-health': 'hud.flask.full',
  'no-charges': 'hud.flask.empty',
  'not-owned': 'hud.flask.empty',
  busy: 'hud.flask.busy',
  dead: 'hud.flask.busy',
};

const inventoryPlugin: GamePlugin = {
  id: 'inventory',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', INVENTORY_STRINGS_EN);
    const emit = emitLoose(ctx);
    const inv = new Inventory({ emit, logger: { warn: (m) => console.warn(m) } });
    inv.reset(NEW_GAME_KIT);
    const player = (): ActorPort => ctx.actors.player;
    const user = new ConsumableUser({
      inventory: inv,
      env: { actor: player, heal: (n) => ctx.damage.heal('player', n), emit },
    });

    let unlock: (() => void) | null = null;
    const syncLock = (): void => {
      const drinking = user.drinking !== null;
      if (drinking && !unlock) unlock = ctx.player.addMoveModifier('flask', { speedScale: 0.5, lockActions: DRINK_LOCKS });
      if (!drinking && unlock) {
        unlock();
        unlock = null;
      }
    };

    const service: InventoryService = {
      count: (id) => inv.count(id),
      has: (id) => inv.has(id),
      add: (id, n) => inv.add(id, n),
      remove: (id, n) => inv.remove(id, n),
      equip: (id) => inv.equip(id),
      unequip: (slot) => inv.unequip(slot),
      equipped: (slot) => inv.equipped(slot),
      equippedStat: (stat) => inv.equippedStat(stat),
      use(id) {
        const result = user.begin(id);
        if (!result.ok) {
          const textKey = REFUSAL_TOAST[result.reason];
          if (textKey) emit('hud.toast', { textKey });
        }
        syncLock();
        return result;
      },
      reset: (kit) => inv.reset(kit),
      items: () => inv.items(),
      get gold() {
        return inv.gold;
      },
      addGold: (n) => inv.addGold(n),
      takeGold: (n) => inv.takeGold(n),
    };
    ctx.services.provide('inventory', service);
    ctx.persist.register({
      key: Inventory.key,
      version: Inventory.version,
      serialize: () => inv.serialize(),
      load: (data, version) => inv.load(data, version),
    });

    // Items enter only through loot.granted; unknown ids and bad counts are refused by add().
    ctx.events.on('loot.granted', (e) => {
      for (const s of e.items) {
        if (!getItem(s.itemId)) console.warn(`inventory: loot.granted from ${e.sourceId} names unknown item "${s.itemId}"`);
        else inv.add(s.itemId, s.count);
      }
    });
    // A staggering hit or a death ends the drink and keeps the charge.
    ctx.events.on('actor.staggered', (e) => {
      if (e.actorId === 'player') user.cancel();
    });
    ctx.events.on('actor.died', (e) => {
      if (e.actorId === 'player') user.cancel();
    });

    ctx.systems.add({
      id: 'inventory.fixed',
      fixedPhase: 'input',
      order: 10,
      fixedUpdate(dt) {
        user.update(dt);
        syncLock();
        if (!ctx.input.actions.pressed('inventory')) return;
        toggleMenu();
      },
    });

    let close: (() => void) | null = null;
    const toggleMenu = (): void => {
      if (close) {
        close();
        return;
      }
      const doc = hudDocument();
      injectCss(HUD_CSS);
      const menu = new InventoryMenu(doc, {
        inventory: service,
        t: (k, p) => ctx.strings.t(k, p),
        close: () => close?.(),
      });
      const closer = ctx.hud.openModal({
        id: 'inventory',
        element: asHtml(menu.element),
        dispose: () => {
          close = null;
        },
      });
      if (!closer) return; // another modal is open
      close = closer;
      ctx.services.get('prompts')?.success('inventory');
    };
  },
};

export default inventoryPlugin;
