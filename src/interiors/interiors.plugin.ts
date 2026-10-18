import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { NavGrid } from '../nav/NavGrid';
import '../nav/service';
import { heightAt } from '../terrain/heightfield';
import { groundDistance } from '../waystones/ground';
import { showToast } from '../waystones/toast';
import '../waystones/service';
import { buildInterior, type BuiltInterior } from './build';
import { SceneEnvironment } from './environment';
import { InteriorController, InteriorError } from './InteriorController';
import { boundsContain, layoutInterior, type InteriorLayout } from './layout';
import type { InteriorsService } from './service';
import './service';
import { INTERIOR_STRINGS_EN } from './strings.en';
import type { InteriorDef } from './types';
import { VAULT_DEF } from './vaultDef';

/** Thread 3a's band in `rules` (requested for game-events-and-flags.md section 2) and in render `world`. */
export const INTERIORS_RULES_ORDER = 400;
export const INTERIORS_RENDER_ORDER = 400;
const DOOR_RADIUS = 2;
/** Refusals that tell the player why the door did nothing. */
const TOASTED: Record<string, string> = { aggro: 'interior.refused.aggro', locked: 'interior.refused.locked' };

export interface InteriorsPluginOptions {
  defs?: readonly InteriorDef[];
  heightAt?: (x: number, z: number) => number;
}

/** The plugin with its interiors injectable (tests use small defs; the game uses the chapel vault). */
export function createInteriorsPlugin(opts: InteriorsPluginOptions = {}): GamePlugin {
  let cleanups: (() => void)[] = [];
  const teardown = () => {
    for (const c of cleanups.reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('interiors: cleanup failed', err);
      }
    }
    cleanups = [];
  };
  return {
    id: 'interiors',
    dependsOn: ['core', 'nav'],
    setup(ctx) {
      try {
        setupInteriors(ctx, opts, cleanups);
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

function setupInteriors(ctx: GameContext, opts: InteriorsPluginOptions, cleanups: (() => void)[]): void {
  ctx.strings.register('en', INTERIOR_STRINGS_EN);
  const ground = opts.heightAt ?? heightAt;
  const nav = ctx.services.get('nav');
  const waystones = () => ctx.services.get('waystones');

  // Hostiles that noticed the player, for when the waystones service is absent.
  const aggro = new Set<string>();
  ctx.events.on('ai.aggro', (e) => {
    if (e.targetId === PLAYER_ID) aggro.add(e.actorId);
  });
  ctx.events.on('ai.calm', (e) => aggro.delete(e.actorId));
  ctx.events.on('actor.died', (e) => aggro.delete(e.actorId));
  ctx.events.on('actor.despawned', (e) => aggro.delete(e.actorId));

  const env = new SceneEnvironment(ctx.scene, () => ctx.services.get('graphics'));
  const built = new Map<string, BuiltInterior>();
  const layouts = new Map<string, InteriorLayout>();

  const controller = new InteriorController({
    feet: () => ctx.player.feet,
    yaw: () => ctx.player.facingYaw,
    dead: () => ctx.player.actor.dead,
    topContext: () => ctx.input.contexts.top(),
    hostileAggro: () => waystones()?.hostileAggro ?? aggro.size > 0,
    travelling: () => waystones()?.travelling ?? false,
    anchor: (id) => ctx.anchors.find(id),
    freeze: () => ctx.player.addMoveModifier('interiors.transition', { freeze: true }),
    fade: (o, s) => void ctx.hud.fade(o, s),
    teleport: (feet, yaw) => ctx.player.teleport(feet, yaw),
    groundBelow: (d) => groundDistance(ctx, d) !== null,
    applyEnvironment: (id) => {
      for (const [bid, b] of built) b.root.visible = bid === id;
      const layout = id === null ? undefined : layouts.get(id);
      if (layout) env.apply(layout.def.environment);
      else env.restore();
    },
    emit: (type, payload) => ctx.events.emit(type, payload),
    warn: (m) => console.warn(m),
  });
  cleanups.push(() => controller.dispose());

  for (const def of opts.defs ?? [VAULT_DEF]) {
    const layout = layoutInterior(def, ground);
    // Colliders are built now and kept, so a load or a takeover teleport always finds the floor.
    const b = buildInterior(layout, ctx.physics.ready ? ctx.physics : null);
    ctx.scene.add(b.root);
    cleanups.push(() => b.dispose());
    built.set(def.id, b);
    layouts.set(def.id, layout);
    cleanups.push(controller.add({ id: def.id, doors: def.doors, contains: (p) => boundsContain(layout.bounds, p) }));
    if (nav) cleanups.push(nav.addGrid(new NavGrid(layout.nav)));
    for (const a of layout.anchors) ctx.anchors.define(a);
    for (const t of layout.triggers) ctx.triggers.add({ id: t.id, shape: { type: 'box', center: t.center, half: t.half } });
  }
  ctx.persist.register(controller.persistable());

  const onRefused = (err: unknown) => {
    if (!(err instanceof InteriorError)) return console.warn('interiors: door failed', err);
    const key = TOASTED[err.reason];
    if (key) showToast(ctx.hud, ctx.strings.t(key));
  };

  // Door interactables. The outside anchors are the layout thread's and may be defined after this plugin sets up.
  const doors = new Map<string, () => void>();
  const syncDoors = () => {
    for (const layout of layouts.values()) {
      for (const door of layout.def.doors) {
        for (const side of ['outside', 'inside'] as const) {
          const key = `${door.doorId}:${side}`;
          if (doors.has(key)) continue;
          const anchor = ctx.anchors.find(side === 'outside' ? door.outside : door.exit);
          if (!anchor) continue;
          const id = side === 'outside' ? `door:${door.doorId}` : `door:${door.doorId}-exit`;
          const text = side === 'outside' ? `interior.enter.${door.doorId}` : `interior.exit.${door.doorId}`;
          doors.set(
            key,
            ctx.interaction.register({
              id,
              kind: 'door',
              position: (out: THREE.Vector3) => out.set(anchor.position.x, anchor.position.y, anchor.position.z),
              radius: DOOR_RADIUS,
              coneDegrees: 360,
              get promptKey() {
                return side === 'outside' && controller.isDoorLocked(door.doorId) ? 'interact.locked' : text;
              },
              enabled: () => !controller.transitioning,
              onInteract: () => {
                const p = side === 'outside' ? controller.enter(layout.def.id, door.doorId) : controller.exit(door.doorId);
                p.catch(onRefused);
              },
            }),
          );
        }
      }
    }
  };
  syncDoors();
  cleanups.push(() => {
    for (const off of doors.values()) off();
    doors.clear();
  });

  ctx.events.on('save.loaded', () => controller.onSaveLoaded());
  ctx.systems.add({
    id: 'interiors.tick',
    fixedPhase: 'rules',
    order: INTERIORS_RULES_ORDER,
    fixedUpdate(dt) {
      syncDoors();
      controller.tick(dt);
    },
  });
  ctx.systems.add({
    id: 'interiors.render',
    renderPhase: 'world',
    order: INTERIORS_RENDER_ORDER,
    render: () => env.frame(ctx.player.feet),
  });

  const service: InteriorsService = {
    enter: (id, door) => controller.enter(id, door),
    exit: (door) => controller.exit(door),
    get current() {
      return controller.current;
    },
    get transitioning() {
      return controller.transitioning;
    },
    interiorAt: (at) => controller.interiorAt(at),
    setDoorLock: (door, locked) => controller.setDoorLock(door, locked),
    setBlocker: (id, closed) => {
      let found = false;
      for (const b of built.values()) if (b.setBlocker(id, closed)) found = true;
      if (nav?.setBlocker(id, closed)) found = true;
      if (!found) console.warn(`interiors: unknown blocker "${id}"`);
      return found;
    },
  };
  ctx.services.provide('interiors', service);
}

export default createInteriorsPlugin();
