import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import { asHtml, emitLoose, hudDocument } from '../hud/soft';
import { Chest } from '../interaction/Chest';
import { getItem } from '../inventory/items';
import '../shrine/service';
import { SHRINE_TUNING } from '../shrine/tuning';
import '../waystones/service';
import { showToast } from '../waystones/toast';
import { CHEST_GOLD } from './goldTable';
import { Inn, INN } from './Inn';
import { openInnModal } from './InnModal';
import './items';
import { PurseTracker } from './Purse';
import './service';
import { Shop } from './Shop';
import { isVendorId, VENDOR_IDS, type VendorId } from './stock';
import { ECONOMY_STRINGS_EN } from './strings.en';
import { VendorMenu } from './VendorMenu';

const LOCKPICKS = 'oswin-lockpicks';
const LOCKED_CHESTS = ['chest:harrowmark-1', 'chest:harrowmark-2', 'chest:harrowmark-3', 'chest:harrowmark-4'];
const CAMP_CHESTS = ['chest:deadroad-camp-1', 'chest:deadroad-camp-2'];
/** `chest:harrowmark-1` sits on anchor `chest.harrowmark.1`; `chest:deadroad-camp-1` on `chest.deadroad.camp-1`. */
const chestAnchor = (id: string): string => `chest.${id.slice('chest:'.length).replace(/-(\d)$/, (_m, d) => (id.includes('camp') ? `-${d}` : `.${d}`)).replace(/^deadroad-camp/, 'deadroad.camp')}`;

interface SoftQuests {
  state?(id: string): string;
}
interface SoftClasses {
  chosen?(): string | null;
}

const economyPlugin: GamePlugin = {
  id: 'economy',
  dependsOn: ['core', 'inventory', 'waystones', 'shrine', 'progression'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', ECONOMY_STRINGS_EN);
    const emit = emitLoose(ctx);
    const inventory = ctx.services.require('inventory');
    const progression = ctx.services.require('progression');
    const t = (k: string, p?: Record<string, string | number>) => ctx.strings.t(k, p);
    const toast = (text: string) => showToast(ctx.hud, text);
    const soft = <T>(name: string): T | undefined => (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);

    // ---- Gates, read at interaction time ---------------------------------------------------
    const questState = (id: string): string => soft<SoftQuests>('quests')?.state?.(id) ?? 'inactive';
    const isOpen = (v: VendorId): boolean => {
      switch (v) {
        case 'wystan':
        case 'merrin':
          return ctx.state.getBool('story.m08.favourTab');
        case 'ashdown':
          return !!soft<SoftClasses>('classes')?.chosen?.();
        case 'dunstan':
          return ctx.state.getString('story.m06.route') !== '';
        case 'gerta':
          // At her Guild Quarter stall before M07 starts and after M10; in the Bastion in between.
          return questState('m07') === 'inactive' || questState('m10') === 'completed';
        default:
          return ctx.state.getBool('tutorial.complete');
      }
    };

    // ---- Vendors -----------------------------------------------------------------------------
    const shop = new Shop({
      gold: () => inventory.gold,
      takeGold: (n, reason) => inventory.takeGold(n, reason),
      addGold: (n) => inventory.addGold(n),
      count: (id) => inventory.count(id),
      remove: (id, n) => inventory.remove(id, n),
      isEquipped: (id) => {
        const slot = getItem(id)?.slot;
        return slot !== undefined && inventory.equipped(slot) === id;
      },
      getItem,
      grant: (sourceId, itemId, count) => ctx.events.emit('loot.granted', { sourceId, items: [{ itemId, count }] }),
      band: (v) => {
        const track = ({ wystan: 'halvard', merrin: 'oswin' } as Partial<Record<VendorId, 'halvard' | 'oswin'>>)[v];
        return track ? ctx.state.favourBand(track) : null;
      },
      isOpen,
      flag: (key) => ctx.state.getFlag(key),
      emit: (type, payload) => emit(type, payload),
      warn,
    });
    // A save with no `vendors` entry (every Phase A save) must reset to defaults, not keep the previous session's stock.
    let shopLoaded = false;
    ctx.persist.register({
      key: Shop.key,
      version: Shop.version,
      serialize: () => shop.serialize(),
      load: (d, v) => {
        shopLoaded = true;
        shop.load(d, v);
      },
    });

    let menu: VendorMenu | null = null;
    let closeMenu: (() => void) | null = null;
    const openVendor = (id: string): void => {
      if (id === 'aldith') return openInn();
      if (!isVendorId(id) || !isOpen(id) || closeMenu) return;
      const m = new VendorMenu(hudDocument(), {
        vendorId: id,
        inventory,
        offers: () => shop.offers(id),
        buyBackList: () => shop.buyBackFor(id),
        buy: (itemId, seen) => shop.buy(id, itemId, 1, seen),
        sell: (itemId) => shop.sell(id, itemId),
        buyBack: (i) => shop.buyBack(id, i),
        t,
        toast,
        close: () => closeMenu?.(),
      });
      const closer = ctx.hud.openModal({
        id: 'vendor',
        element: asHtml(m.element),
        dispose: () => {
          menu = null;
          closeMenu = null;
        },
      });
      if (!closer) return;
      menu = m;
      closeMenu = closer;
    };
    for (const type of ['favour.changed', 'gold.spent', 'loot.granted', 'vendor.bought', 'vendor.sold'] as const) {
      ctx.events.on(type, () => menu?.render());
    }
    ctx.services.provide('vendors', { open: (id) => openVendor(id) });

    // A dialogue choice emits npc.vendor.open; the modal opens once the dialogue (itself a modal) has ended.
    let pendingVendor: string | null = null;
    (ctx.events as unknown as { on(t: string, f: (p: { vendorId?: unknown }) => void): void }).on('npc.vendor.open', (p) => {
      if (typeof p?.vendorId !== 'string') return;
      if (ctx.input.contexts.top() === 'dialogue') pendingVendor = p.vendorId;
      else openVendor(p.vendorId);
    });
    // `dialogue.ended` fires before the dialogue modal closes, so wait for the modal itself to go.
    ctx.events.on('ui.modal', (e) => {
      if (e.id !== 'dialogue' || e.open) return;
      const id = pendingVendor;
      pendingVendor = null;
      if (id) openVendor(id);
    });

    // ---- The inn -------------------------------------------------------------------------------
    const inn = new Inn({
      roomRented: () => ctx.state.getBool(INN.roomFlag),
      price: () => {
        const p = ctx.state.getString(INN.priceFlag);
        return p === 'forgiven' || p === 'collected' ? p : undefined;
      },
      gold: () => inventory.gold,
      takeGold: (n, reason) => inventory.takeGold(n, reason),
      canRestNow: () => ctx.services.require('waystones').canRestNow(),
      restAt: (placeId) => ctx.services.require('waystones').restAt(placeId),
      cooledSeconds: () => ctx.services.get('shrine')?.cooledSeconds() ?? 0,
      cooledFactor: SHRINE_TUNING.cooled.multiplier,
      addMaxHealthModifier: (id, fn) => progression.addMaxHealthModifier(id, fn),
      refreshMaxHealth: () => progression.refreshMaxHealth(),
      maxHealth: () => ctx.actors.player.maxHealth,
      healBy: (n) => {
        const a = ctx.actors.player;
        if (n > 0 && !a.dead) ctx.damage.heal(a.id, Math.min(n, a.maxHealth - a.health));
      },
      emitApplied: (seconds) => emit('buff.applied', { id: INN.buffId, nameKey: INN.nameKey, seconds }),
      emitRemoved: () => emit('buff.removed', { id: INN.buffId }),
    });
    let savedHealth: number | undefined;
    let innLoaded = false;
    ctx.persist.register({
      key: Inn.key,
      version: Inn.version,
      serialize: () => inn.serialize(ctx.actors.player.health),
      load: (d, v) => {
        innLoaded = true;
        savedHealth = inn.load(d, v);
      },
    });
    ctx.events.on('save.loaded', () => {
      if (!shopLoaded) shop.reset();
      shopLoaded = false;
      purse.reset();
      if (!innLoaded) inn.load(null, Inn.version);
      innLoaded = false;
      progression.refreshMaxHealth();
      if (savedHealth !== undefined) {
        const a = ctx.actors.player;
        if (savedHealth > a.health && !a.dead) ctx.damage.heal(a.id, Math.min(savedHealth, a.maxHealth) - a.health);
        savedHealth = undefined;
      }
      // The room flag is mine alone: re-derive it from the quest if it was lost.
      if (!ctx.state.getBool(INN.roomFlag) && questState('m07') === 'completed') ctx.state.setFlag(INN.roomFlag, true);
    });
    ctx.events.on('quest.objective', (e) => {
      if (e.questId === 'm07' && e.objectiveId === 'o4' && e.done && !ctx.state.getBool(INN.roomFlag)) ctx.state.setFlag(INN.roomFlag, true);
    });

    let cancelInn: (() => void) | null = null;
    let resting = false;
    function openInn(): void {
      if (cancelInn || resting) return;
      const price = inn.quote();
      cancelInn = openInnModal(
        { doc: hudDocument() as never, openModal: (w) => ctx.hud.openModal({ ...w, element: asHtml(w.element) }), t },
        {
          gold: price,
          canAfford: inventory.gold >= price,
          blocked: ctx.state.getBool(INN.roomFlag) ? null : 'no-room',
          confirm: () => {
            cancelInn = null;
            if (inn.canRest()) return toast(t('economy.inn.blocked'));
            resting = true; // no second night while the screen fades
            void ctx.hud
              .fade(1, 0.6)
              .then(() => {
                const r = inn.rest();
                toast(r.ok ? t('economy.inn.rested') : t('economy.inn.blocked'));
                return ctx.hud.fade(0, 0.8);
              })
              .finally(() => {
                resting = false;
              });
          },
          cancel: () => {
            cancelInn = null;
          },
        },
      );
    }
    // Esc closes whichever shop dialog is open.
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.code !== 'Escape') return;
        closeMenu?.();
        cancelInn?.();
      });
    }
    ctx.services.provide('inn', {
      rest: () => openInn(),
      applyHearty: (s) => inn.applyHearty(s),
      canRest: () => inn.canRest(),
    });

    // ---- Gold sources ---------------------------------------------------------------------------
    const found = (gold: number): void => {
      inventory.addGold(gold);
      toast(t('economy.gold.found', { gold }));
    };
    const purse = new PurseTracker((gold) => found(gold));
    ctx.events.on('actor.died', (e) => {
      purse.onDied({ actorId: e.actorId, killerId: e.killerId, kind: e.kind, spawnTag: e.spawnTag });
    });
    ctx.events.on('loot.granted', (e) => {
      const gold = CHEST_GOLD[e.sourceId];
      if (gold) found(gold);
    });

    // ---- Anchored things: shop points, chests (anchors come from threads 4, 17; absent ones wait) ----
    const placed = new Set<string>();
    const missing = new Set<string>();
    const anchorOrWarn = (id: string) => {
      const a = ctx.anchors.find(id);
      if (!a && !missing.has(id)) {
        missing.add(id);
        warn(`economy: anchor "${id}" not found yet`);
      }
      return a;
    };
    const place = (): void => {
      for (const v of VENDOR_IDS) {
        const key = `shop:${v}`;
        if (placed.has(key)) continue;
        let pos: { x: number; y: number; z: number } | undefined;
        const own = ctx.anchors.find(`shop.${v}`);
        if (own) pos = own.position;
        else if (v === 'edda' || v === 'wynn') {
          // Kettlewick: offset from the talk post so talk and shop do not tie (thread 4 owns the posts).
          const post = ctx.anchors.find(`npc-post.${v}`);
          if (post) pos = { x: post.position.x + 1.6, y: post.position.y, z: post.position.z };
        }
        if (!pos) continue;
        placed.add(key);
        const p = pos;
        ctx.interaction.register({
          id: key,
          kind: 'shop',
          position: (out) => out.set(p.x, p.y, p.z),
          name: v,
          promptKey: 'economy.shop.prompt',
          priority: -0.01,
          enabled: () => isOpen(v),
          onInteract: () => openVendor(v),
        });
      }
      if (!placed.has('shop:aldith')) {
        const a = ctx.anchors.find('inn.aldith');
        if (a) {
          placed.add('shop:aldith');
          const p = a.position;
          ctx.interaction.register({
            id: 'shop:aldith',
            kind: 'shop',
            position: (out) => out.set(p.x, p.y, p.z),
            name: 'aldith',
            promptKey: 'economy.inn.prompt',
            priority: -0.01,
            enabled: () => ctx.state.getBool(INN.roomFlag),
            onInteract: () => openInn(),
          });
        }
      }
      for (const id of [...CAMP_CHESTS, ...LOCKED_CHESTS]) {
        if (placed.has(id)) continue;
        const a = anchorOrWarn(chestAnchor(id));
        if (!a) continue;
        placed.add(id);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: LOCKED_CHESTS.includes(id) ? 0x4a3420 : 0x6b4a2a }));
        mesh.position.set(a.position.x, a.position.y + 0.3, a.position.z);
        mesh.rotation.y = a.yaw;
        ctx.scene.add(mesh);
        const locked = LOCKED_CHESTS.includes(id);
        new Chest(
          { interaction: ctx.interaction, state: ctx.state, events: ctx.events },
          {
            id,
            object: mesh,
            loot: [],
            name: id.slice('chest:'.length),
            canOpen: locked ? () => inventory.count(LOCKPICKS) >= 1 && inventory.remove(LOCKPICKS, 1) : undefined,
            onRefused: locked ? () => toast(t('economy.chest.locked')) : undefined,
          },
        );
      }
    };
    place();

    let firstTick = false;
    ctx.systems.add({
      id: 'economy.fixed',
      fixedPhase: 'rules',
      order: 450,
      fixedUpdate(dt) {
        if (!firstTick) {
          firstTick = true;
          place();
        }
        inn.update(dt);
      },
    });
    void PLAYER_ID;
  },
};

export default economyPlugin;
