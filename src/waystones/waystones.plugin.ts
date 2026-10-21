import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GamePlugin } from '../core/plugins';
import { heightAt } from '../terrain/heightfield';
import { groundDistance } from './ground';
import { SafeTeleport } from './SafeTeleport';
import { WAYSTONE_STRINGS_EN } from './strings.en';
import '../save/service';
import './service';
import '../region/containment';
import { showToast } from './toast';
import { WAYSTONE_LOCKS, WAYSTONE_TUNING } from './tuning';
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

    // A foe that aggroed and never emitted `ai.calm` (it lost the player, or is stuck out of reach) must not block rest and
    // fast travel for ever (QA round 3): drop the ones that are gone or far away.
    const hostileNow = (): boolean => {
      if (aggro.size === 0) return false;
      const f = ctx.player.feet;
      const limit2 = WAYSTONE_TUNING.staleAggroDistance ** 2;
      // Filter without deleting: a far foe that is still hunting must count again once it closes in.
      for (const id of aggro) {
        const a = ctx.actors.get(id);
        if (!a) return true; // not in the registry (yet): cannot judge, so it counts
        if (a.dead) continue;
        const p = a.root?.position;
        if (!p || (p.x - f.x) ** 2 + (p.z - f.z) ** 2 <= limit2) return true;
      }
      return false;
    };

    let handle: { ready(): boolean } | null = null;
    const teleport = new SafeTeleport({
      place: (feet, yaw) => {
        handle = ctx.player.teleport(feet, yaw);
        // Fast travel and save loads arrive facing the heading: the follow camera turns with the player.
        if (ctx.cameraRig) ctx.cameraRig.yaw = yaw;
      },
      freeze: () => ctx.player.addMoveModifier('waystones.travel', { freeze: true }),
      ready: () => handle?.ready() ?? true,
      groundedBelow: (d) => groundDistance(ctx, d) !== null,
      chunksResident: (f) => ctx.terrain.isResident(f.x, f.z, 60),
      fade: (o, s) => void ctx.hud.fade(o, s),
      heightAt,
      // Looked up per call: the region plugin provides it, and may set up after this one.
      contain: (x, z) => ctx.services.get('containment')?.nearestOpen(x, z) ?? { x, z },
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
        hostileAggro: hostileNow(),
        heartshard: debug || ctx.state.getBool('tutorial.heartshard-awakened'),
        allowRestInCombat: ctx.state.getBool('waystone.allowRestInCombat'),
      }),
      restoreVitals: (opts) => {
        const a = ctx.player.actor;
        ctx.damage.heal(PLAYER_ID, a.maxHealth);
        a.restoreStamina(a.maxStamina);
        if (opts?.quiet) return;
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

    // Locked stones: the gate is derived from a flag (and re-derived on a load), so the refusal is right after both.
    const locked = new Set(Object.keys(WAYSTONE_LOCKS));
    for (const [id, flag] of Object.entries(WAYSTONE_LOCKS)) {
      ctx.gates.flag(flag, (open) => (open ? locked.delete(id) : locked.add(id)));
    }

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
            if (locked.has(id)) {
              showToast(ctx.hud, ctx.strings.t('waystone.locked'));
              return;
            }
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
      if (hostileNow()) return 'in-combat';
      return null;
    };

    const service: WaystoneService = {
      respawnPoint: () => net.respawnPoint(),
      respawnPlayer: () => net.respawnPlayer(),
      rekindle: (id, cause = 'script') => net.rekindle(id, cause),
      canRestNow: () => net.canRestNow(),
      restAt: (placeId) => net.restAt(placeId),
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
        return hostileNow();
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
