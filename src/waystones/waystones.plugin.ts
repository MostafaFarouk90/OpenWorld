import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GamePlugin } from '../core/plugins';
import { heightAt } from '../terrain/heightfield';
import { groundDistance } from './ground';
import { SafeTeleport } from './SafeTeleport';
import { WAYSTONE_STRINGS_EN } from './strings.en';
import '../save/service';
import './service';
import { showToast } from './toast';
import { WAYSTONE_TUNING } from './tuning';
import type { WaystoneService } from './service';
import { WaystoneNetwork } from './WaystoneNetwork';

const waystones: GamePlugin = {
  id: 'waystones',
  dependsOn: ['core'],
  setup(ctx) {
    ctx.strings.register('en', WAYSTONE_STRINGS_EN);
    const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

    // Hostile actors that noticed the player and have not calmed or died.
    const aggro = new Set<string>();
    ctx.events.on('ai.aggro', (e) => {
      if (e.targetId === PLAYER_ID) aggro.add(e.actorId);
    });
    ctx.events.on('ai.calm', (e) => aggro.delete(e.actorId));
    ctx.events.on('actor.died', (e) => aggro.delete(e.actorId));
    ctx.events.on('actor.despawned', (e) => aggro.delete(e.actorId));

    let handle: { ready(): boolean } | null = null;
    const teleport = new SafeTeleport({
      place: (feet, yaw) => {
        handle = ctx.player.teleport(feet, yaw);
      },
      freeze: () => ctx.player.addMoveModifier('waystones.travel', { freeze: true }),
      ready: () => handle?.ready() ?? true,
      groundedBelow: (d) => groundDistance(ctx, d) !== null,
      chunksResident: (f) => ctx.terrain.isResident(f.x, f.z, 60),
      fade: (o, s) => void ctx.hud.fade(o, s),
      heightAt,
    });

    let pendingSave: 'waystone' | 'rest' | null = null;
    let pendingDelay = 0;
    const prompts = () => ctx.services.get('prompts');
    const net = new WaystoneNetwork({
      anchors: ctx.anchors,
      emit: (e, p) => (ctx.events.emit as (e: string, p: unknown) => void)(e, p),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      context: () => ({
        dead: ctx.player.actor.dead,
        cutscene: ctx.input.contexts.top() === 'cutscene',
        dialogue: ctx.input.contexts.top() === 'dialogue',
        hostileAggro: aggro.size > 0,
        heartshard: debug || ctx.state.getBool('tutorial.heartshard-awakened'),
        allowRestInCombat: ctx.state.getBool('waystone.allowRestInCombat'),
      }),
      restoreVitals: () => {
        const a = ctx.player.actor;
        ctx.damage.heal(PLAYER_ID, a.maxHealth);
        a.restoreStamina(a.maxStamina);
        showToast(ctx.hud, ctx.strings.t('waystone.rested'));
        prompts()?.success('rest');
      },
      requestSave: (reason) => {
        // A save requested mid-travel waits until the player is released and has stood on the ground.
        if (net.travelling) pendingSave = reason;
        else void ctx.services.get('save')?.saveNow(reason);
      },
      toast: (key) => showToast(ctx.hud, ctx.strings.t(key)),
      playerFeet: () => ctx.player.feet,
      playerYaw: () => ctx.player.facingYaw,
      teleport,
      log: (level, msg) => (level === 'warn' ? console.warn(msg) : console.info(msg)),
    });
    net.applyPreLit();

    ctx.events.on('waystone.rekindled', (e) => {
      if (e.cause === 'player') showToast(ctx.hud, ctx.strings.t('waystone.rekindled'));
    });

    // Interactables follow the anchors: thread 4 may define them after this plugin sets up.
    const registered = new Map<string, () => void>();
    const syncStones = () => {
      for (const id of net.ids()) {
        if (registered.has(id)) continue;
        const anchor = net.anchor(id);
        if (!anchor) continue;
        const stone = {
          id: `waystone:${id}`,
          kind: 'waystone' as const,
          position: (out: THREE.Vector3) => out.set(anchor.position.x, anchor.position.y, anchor.position.z),
          radius: WAYSTONE_TUNING.interactRadius,
          coneDegrees: 360,
          get promptKey() {
            return net.isLit(id) ? 'waystone.rest' : 'waystone.rekindle';
          },
          get holdSeconds() {
            return net.isLit(id) ? WAYSTONE_TUNING.restHoldSeconds : WAYSTONE_TUNING.rekindleHoldSeconds;
          },
          enabled: () => !teleport.active,
          onInteract: () => {
            if (net.isLit(id)) net.rest(id);
            else net.rekindle(id, 'player');
          },
        };
        registered.set(id, ctx.interaction.register(stone));
      }
    };
    syncStones();
    ctx.systems.add({
      id: 'waystones.tick',
      fixedPhase: 'rules',
      order: 100,
      fixedUpdate(dt) {
        syncStones();
        net.applyPreLit();
        teleport.update(dt);
        if (pendingSave && !net.travelling) {
          if (++pendingDelay >= 3) {
            const reason = pendingSave;
            pendingSave = null;
            pendingDelay = 0;
            void ctx.services.get('save')?.saveNow(reason);
          }
        }
      },
    });

    const blockedReason = (): string | null => {
      const c = ctx.input.contexts.top();
      if (net.travelling) return 'busy';
      if (ctx.player.actor.dead) return 'dead';
      if (c === 'cutscene') return 'cutscene';
      if (c === 'dialogue') return 'dialogue';
      if (aggro.size > 0) return 'in-combat';
      return null;
    };

    const service: WaystoneService = {
      respawnPoint: () => net.respawnPoint(),
      respawnPlayer: () => net.respawnPlayer(),
      rekindle: (id, cause = 'script') => net.rekindle(id, cause),
      travel: async (toId) => {
        const r = await net.travel(toId);
        if (r.ok) prompts()?.success('fastTravel');
        return r;
      },
      isLit: (id) => net.isLit(id),
      litIds: () => net.litIds(),
      ids: () => net.ids(),
      position: (id) => net.anchor(id)?.position,
      travelBlockedReason: blockedReason,
      get travelling() {
        return net.travelling;
      },
      get hostileAggro() {
        return aggro.size > 0;
      },
      safeTeleport: (feet, yaw) => teleport.start(feet, yaw, null, { takeover: false }),
    };
    ctx.services.provide('waystones', service);

    ctx.persist.register({
      key: 'waystones',
      version: 1,
      serialize: () => net.serialize(),
      load: (data) => net.load(data),
    });
  },
};

export default waystones;
