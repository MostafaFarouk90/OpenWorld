// K10 (plans/act3-K10.md sections 3 and 5): the shard-gem service, the boss drops and the D01 to D04 retro-grant, the
// Act 3 damage bonuses, and the R15 knife upgrade. The socket screen is K15's; this ships a minimal fallback panel.
import type { Actor } from '../../actors/Actor';
import { isClassId, type ClassId } from '../../actors/classes';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { ENEMY_DEFS } from '../../enemies/defs';
import { asHtml, hudDocument } from '../../hud/soft';
import { getItem } from '../../inventory/items';
import { showToast } from '../../waystones/toast';
import '../tier4/catalog';
import { knifeIsKeen } from '../tier4/knifeUpgrade';
import { ACT3_TRINKETS } from '../tier4/catalog';
import { registerAct3Bonuses } from './bonuses';
import { grantBossGem, retroGrant, type GrantOutcome, type GrantPorts } from './grants';
import { fitGem, recutGem, recutTargetFor, removeGem, socketView, type SocketInventory, type SocketResult, type SocketView } from './sockets';
import { openSocketPanel, type SocketPanelHost, type SocketPanelModel } from './SocketFallbackPanel';
import { K10_STRINGS_EN } from './strings.en';
import { SHARD_GEMS } from './table';
import { GEM_BOSSES, grantedFlag } from './tuning';

/** Draws the socket screen over the panel's model; returns the closer, or null when no modal could open. K15 supplies one. */
export type SocketScreenOpener = (host: SocketPanelHost, model: SocketPanelModel) => (() => void) | null;

export interface ShardGemService {
  fit(itemId: string, slot: number, gemId: string): SocketResult;
  remove(itemId: string, slot: number): SocketResult;
  recut(fromId: string, toId: string): SocketResult;
  /** Every held piece that takes a gem, with its slots. */
  pieces(): SocketView[];
  view(itemId: string): SocketView;
  /** Opens the screen (a smith's "shard-gems" choice, the socket point): K15's when set, else the fallback panel; false when another modal is open. */
  openScreen(): boolean;
  /** Swaps the drawing of the screen (K15). Null restores the fallback panel. The model stays this plugin's. */
  setScreen(open: SocketScreenOpener | null): void;
}

declare module '../../core/Services' {
  interface GameServices {
    shardGems: ShardGemService;
  }
}

declare module '../../core/events' {
  interface GameEventMap {
    /** A smith's dialogue choice (K12, K13 trees): opens the shard-gem panel. */
    'npc.sockets.open': Record<string, never>;
    /** A smith's dialogue choice: opens the smith screen (tempering, tier 4 forging). */
    'npc.smith.open': Record<string, never>;
  }
}

const EQUIP_SLOTS = ['weapon', 'offhand', 'armour', 'trinket'] as const;

interface SoftClasses {
  chosen?(): boolean;
  current?(): string;
}

let offs: (() => void)[] = [];

const shardGemsPlugin: GamePlugin = {
  id: 'shard-gems',
  dependsOn: ['core', 'inventory', 'gear'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', K10_STRINGS_EN);
    const inventory = ctx.services.require('inventory');
    const soft = <T>(name: string): T | undefined => (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;
    const t = (k: string, p?: Record<string, string | number>) => ctx.strings.t(k, p);
    const toast = (text: string) => showToast(ctx.hud, text);
    const classId = (): ClassId | null => {
      const c = soft<SoftClasses>('classes');
      if (!c?.chosen?.()) return null;
      const id = c.current?.();
      return isClassId(id) ? id : null;
    };
    const wearerClass = (): ClassId => classId() ?? 'knight';

    const inv: SocketInventory = {
      has: (id) => inventory.has(id),
      count: (id) => inventory.count(id),
      add: (id, n) => inventory.add(id, n),
      remove: (id, n) => inventory.remove(id, n),
      get gold() {
        return inventory.gold;
      },
      takeGold: (n) => inventory.takeGold(n, 'script'),
      addGold: (n) => inventory.addGold(n),
      gear: (id) => inventory.gear(id),
      socketsOf: (id) => inventory.socketsOf?.(id) ?? [],
      setSockets: (id, s) => inventory.setSockets?.(id, s) ?? false,
      capOf: (id) => inventory.capOf?.(id) ?? getItem(id)?.stackMax ?? 0,
    };

    const emitSocket = (type: 'gear.socketed' | 'gear.unsocketed', itemId: string, slot: number, shardId: string): void => ctx.events.emit(type, { itemId, slot, shardId });
    const pieces = (): SocketView[] =>
      inventory
        .items()
        .filter(({ id }) => (getItem(id)?.sockets ?? 0) > 0)
        .map(({ id }) => socketView(inv, id, wearerClass()));

    let screen: SocketScreenOpener = openSocketPanel;

    const service: ShardGemService = {
      setScreen(open) {
        screen = open ?? openSocketPanel;
      },
      fit(itemId, slot, gemId) {
        const r = fitGem(inv, itemId, slot, gemId);
        if (r.ok) emitSocket('gear.socketed', itemId, slot, gemId);
        return r;
      },
      remove(itemId, slot) {
        const r = removeGem(inv, itemId, slot);
        if (r.ok) emitSocket('gear.unsocketed', itemId, slot, r.shardId);
        return r;
      },
      recut: (fromId, toId) => recutGem(inv, fromId, toId, wearerClass()),
      pieces,
      view: (itemId) => socketView(inv, itemId, wearerClass()),
      openScreen() {
        const closer = screen(
          {
            doc: hudDocument(),
            t,
            openModal: (w) => ctx.hud.openModal({ id: w.id, element: asHtml(w.element), dispose: w.dispose }),
          },
          {
            pieces,
            gems: () =>
              SHARD_GEMS.filter((g) => inventory.count(g.id) > 0).map((g) => ({
                id: g.id,
                count: inventory.count(g.id),
                dormant: g.classId !== wearerClass(),
                recutTo: recutTargetFor(g.id, wearerClass()),
              })),
            fit: (a, b, c) => service.fit(a, b, c),
            remove: (a, b) => service.remove(a, b),
            recut: (a, b) => service.recut(a, b),
            gold: () => inventory.gold,
            equipped: (id) => EQUIP_SLOTS.some((slot) => inventory.equipped(slot) === id),
          },
        );
        return !!closer;
      },
    };
    ctx.services.provide('shardGems', service);

    // ---- Damage: gems, the knives and the R16 dragonkin bonus ------------------------------
    offs.push(
      registerAct3Bonuses(ctx.damage, {
        equipped: (slot) => inventory.equipped(slot),
        has: (id) => inventory.has(id),
        socketsOf: (id) => inventory.socketsOf?.(id) ?? [],
        classId: wearerClass,
        flag: (k) => ctx.state.getFlag(k),
        targetTags: (target: Actor) => (ENEMY_DEFS as Record<string, { tags?: readonly string[] } | undefined>)[target.kind]?.tags ?? [],
        distance: (a, b) => (a.root && b.root ? a.root.position.distanceTo(b.root.position) : null),
      }),
    );

    // ---- Boss drops and the retro-grant ----------------------------------------------------
    const grantPorts: GrantPorts = {
      getFlag: (k) => ctx.state.getFlag(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      classId,
      add: (id, n) => inventory.add(id, n),
      questDone: (id) => soft<{ state?(id: string): string }>('quests')?.state?.(id) === 'completed',
    };
    const announce = (got: GrantOutcome[]): void => {
      const names = got.filter((g): g is NonNullable<GrantOutcome> => !!g).map((g) => t(`item.${g.gemId}.name`));
      if (names.length > 0) toast(t('gear.sockets.granted', { names: names.join(', ') }));
    };
    const onBoss = (e: { bossId: string }): void => {
      const r = grantBossGem(grantPorts, e.bossId);
      // A full stack: the flag stays unset and the next load pays it (`retroGrant` covers every gem boss).
      if (!r && classId() && GEM_BOSSES.some((b) => b.bossId === e.bossId) && !ctx.state.getFlag(grantedFlag(e.bossId))) toast(t('gear.sockets.unpaid'));
      announce([r]);
    };
    // Runs after every persist load (the save system emits `save.loaded` last), and again when a class is chosen.
    const retro = (): void => announce(retroGrant(grantPorts));

    // ---- R15: Frostbrow's knife turns keen (a toast once each time it becomes true; the bonus reads it live) ----
    let keen = false;
    const knife = (): void => {
      const now = knifeIsKeen({ has: (id) => inventory.has(id), flag: (k) => ctx.state.getFlag(k) });
      if (now && !keen) toast(t('gear.knife.keen'));
      keen = now;
    };

    offs.push(
      ctx.events.on('boss.defeated', onBoss),
      ctx.events.on('boss.released', onBoss),
      ctx.events.on('boss.spared', onBoss),
      ctx.events.on('save.loaded', () => {
        retro();
        // A load sets the state silently: no toast for a knife that was already keen.
        keen = knifeIsKeen({ has: (id) => inventory.has(id), flag: (k) => ctx.state.getFlag(k) });
      }),
      ctx.events.on('class.chosen', retro),
      // A dungeon quest completing (its boss may have fallen before a class was chosen, or by a dev jump's injection).
      ctx.events.on('quest.completed', (e) => GEM_BOSSES.some((b) => b.questId === e.questId) && retro()),
      ctx.events.on('inventory.changed', (e) => e.itemId === ACT3_TRINKETS.knife && knife()),
      ctx.events.on('flag.changed', (e) => e.key === 'story.r15.choice' && knife()),
      ctx.events.on('npc.sockets.open', () => void service.openScreen()),
      ctx.events.on('npc.smith.open', () => void soft<{ openSmith?(): boolean }>('gear')?.openSmith?.()),
    );

    // ---- A socket point beside Dunstan's smith point -------------------------------------------------
    let placed = false;
    const questDone = (id: string): boolean => soft<{ state?(id: string): string }>('quests')?.state?.(id) === 'completed';
    const link = (): void => {
      if (placed) return;
      const a = ctx.anchors.find('shop.dunstan');
      if (!a) return;
      placed = true;
      const p = a.position;
      ctx.interaction.register({
        id: 'use:sockets-dunstan',
        kind: 'use',
        position: (out) => out.set(p.x - 1.6, p.y, p.z),
        name: 'dunstan',
        promptKey: 'gear.sockets.prompt',
        priority: -0.02,
        enabled: () => questDone('m14'),
        onInteract: () => void service.openScreen(),
      });
    };
    link();
    ctx.systems.add({ id: 'shard-gems.link', fixedPhase: 'rules', order: 461, fixedUpdate: link });
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default shardGemsPlugin;
