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
import { modelLibraryFor } from '../assets/swap/ModelLibrary';
import { buildInterior, type BuiltInterior } from './build';
import { dressInterior } from './interiorArt';
import { SceneEnvironment } from './environment';
import { InteriorController, InteriorError } from './InteriorController';
import { boundsContain, layoutInterior, standsIn, type InteriorLayout } from './layout';
import type { InteriorsService } from './service';
import './service';
import { HARROWMARK_INTERIORS } from './harrowmark';
import { HARROWMARK_DOOR_LOCKS, HARROWMARK_FLAG_BLOCKERS, M09_INVOICES } from './harrowmark/locks';
import { OccupantHider } from './occupants';
import { INTERIOR_STRINGS_EN } from './strings.en';
import type { InteriorDef } from './types';
import { UNDERWAYS_DEF } from './underways/generate';
import { VAULT_DEF } from './vaultDef';

/** Every interior the game ships (contracts/interiors-and-nav.md section 9). */
export const ALL_INTERIORS: readonly InteriorDef[] = [VAULT_DEF, ...HARROWMARK_INTERIORS, UNDERWAYS_DEF];

/** Thread 3a's band in `rules` (requested for game-events-and-flags.md section 2) and in render `world`. */
export const INTERIORS_RULES_ORDER = 400;
export const INTERIORS_RENDER_ORDER = 400;
const DOOR_RADIUS = 2;
/** The exit lands inside the outside door's radius, so its enter prompt waits this long after an exit. */
const REENTER_COOLDOWN_SECONDS = 1;
/** Refusals that tell the player why the door did nothing. */
const TOASTED: Record<string, string> = { aggro: 'interior.refused.aggro', locked: 'interior.refused.locked' };

export interface InteriorsPluginOptions {
  defs?: readonly InteriorDef[];
  heightAt?: (x: number, z: number) => number;
  /** doorId -> the flag that unlocks it (default: the Harrowmark doors). */
  doorLocks?: Readonly<Record<string, string>>;
  /** blockerId -> the flag that opens it (default: the Anvil's back-room gate). */
  flagBlockers?: Readonly<Record<string, string>>;
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
  const grids = new Map<string, NavGrid>();
  const onFloor = (id: string, at: { x: number; y: number; z: number }): boolean => {
    const layout = layouts.get(id);
    return !!layout && standsIn(layout, at);
  };

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
    onFloor,
    aboveTerrain: (at) => at.y - ground(at.x, at.z),
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
  cleanups.push(() => env.dispose());
  let cooldown = 0;
  ctx.events.on('interior.exited', () => (cooldown = REENTER_COOLDOWN_SECONDS));
  if (!ctx.physics.ready) throw new Error('interiors: physics is not initialised (the floating interiors need their colliders)');

  for (const def of opts.defs ?? ALL_INTERIORS) {
    const layout = layoutInterior(def, ground);
    // Colliders are built now and kept, so a load or a takeover teleport always finds the floor.
    const b = buildInterior(layout, ctx.physics);
    ctx.scene.add(b.root);
    cleanups.push(() => b.dispose());
    // The Dungeon Remastered dressing streams in after setup; until then (or without a loader) the greybox shows.
    void dressInterior(modelLibraryFor(ctx.assets), b).catch((err) => console.warn(`interiors: could not dress "${def.id}", keeping the greybox`, err));
    built.set(def.id, b);
    layouts.set(def.id, layout);
    cleanups.push(controller.add({ id: def.id, doors: def.doors, contains: (p) => boundsContain(layout.bounds, p) }));
    // One grid object serves both: nav answers paths, onFloor checks a loaded spot (blockers flip it through nav.setBlocker).
    const grid = new NavGrid(layout.nav);
    grids.set(def.id, grid);
    if (nav) cleanups.push(nav.addGrid(grid));
    for (const a of layout.anchors) ctx.anchors.define(a);
    for (const t of layout.triggers) ctx.triggers.add({ id: t.id, shape: { type: 'box', center: t.center, half: t.half } });
  }
  ctx.persist.register(controller.persistable());

  // Door locks and flag-driven blockers. Gates call back at once ('init') and again after a load, so the state re-derives.
  const known = new Set([...layouts.values()].flatMap((l) => l.def.doors.map((d) => d.doorId)));
  for (const [doorId, flag] of Object.entries(opts.doorLocks ?? HARROWMARK_DOOR_LOCKS)) {
    if (!known.has(doorId)) continue;
    let open = false;
    cleanups.push(ctx.gates.flag(flag, (o) => (open = o)));
    cleanups.push(controller.setDoorLock(doorId, () => !open));
  }
  const setBlocker = (id: string, closed: boolean): boolean => {
    let found = false;
    for (const b of built.values()) if (b.setBlocker(id, closed)) found = true;
    for (const g of grids.values()) if (g.setBlocker(id, closed)) found = true;
    if (!found) console.warn(`interiors: unknown blocker "${id}"`);
    return found;
  };
  for (const [blockerId, flag] of Object.entries(opts.flagBlockers ?? HARROWMARK_FLAG_BLOCKERS)) {
    if (![...built.values()].some((b) => b.hasBlocker(blockerId))) continue;
    cleanups.push(ctx.gates.flag(flag, (o) => setBlocker(blockerId, !o)));
  }

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
              enabled: () => !controller.transitioning && (side === 'inside' || cooldown <= 0),
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

  // M09's invoices: one-use interactables at the office desk (thread 6 counts the interact and writes the taken flag).
  const invoices = new Map<string, () => void>();
  const syncInvoices = () => {
    for (const inv of M09_INVOICES) {
      if (invoices.has(inv.id)) continue;
      const anchor = ctx.anchors.find(inv.anchor);
      if (!anchor) continue;
      invoices.set(
        inv.id,
        ctx.interaction.register({
          id: inv.id,
          kind: 'use',
          position: (out: THREE.Vector3) => out.set(anchor.position.x, anchor.position.y + 1, anchor.position.z),
          radius: 1.5,
          promptKey: 'interior.m09.invoice',
          enabled: () => !ctx.state.getFlag(inv.takenFlag),
          onInteract: () => {},
        }),
      );
    }
  };
  syncInvoices();
  cleanups.push(() => {
    for (const off of invoices.values()) off();
    invoices.clear();
  });

  const hider = new OccupantHider();
  cleanups.push(() => hider.dispose());

  // A plugin whose own save.loaded teleport must win over a stale-load rescue (3b, 18, 20) depends on 'interiors', so it subscribes
  // after this one; without that dependency the order is the loader's tie-break.
  ctx.events.on('save.loaded', () => controller.onSaveLoaded());
  // Debug: `?debug&interior=<id>` drops the player at that interior's first entry (the bounds rule does the rest).
  let debugInterior = debugInteriorParam();
  ctx.systems.add({
    id: 'interiors.tick',
    fixedPhase: 'rules',
    order: INTERIORS_RULES_ORDER,
    fixedUpdate(dt) {
      cooldown = Math.max(0, cooldown - dt);
      if (debugInterior) {
        const entry = ctx.anchors.find(layouts.get(debugInterior)?.def.doors[0].inside ?? '');
        if (entry) ctx.player.teleport({ ...entry.position, y: entry.position.y + 0.05 }, entry.yaw);
        else console.warn(`interiors: ?interior=${debugInterior} is not an interior`);
        debugInterior = null;
      }
      syncDoors();
      controller.tick(dt);
    },
  });
  ctx.systems.add({
    id: 'interiors.render',
    renderPhase: 'world',
    order: INTERIORS_RENDER_ORDER,
    render: () => {
      env.frame(ctx.player.feet);
      hider.update(ctx.actors.all(), controller.current, (at) => controller.interiorAt(at), (a) => a === ctx.player.actor);
    },
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
    setBlocker,
  };
  ctx.services.provide('interiors', service);
}

function debugInteriorParam(): string | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  return q.has('debug') ? q.get('interior') : null;
}

export default createInteriorsPlugin();
