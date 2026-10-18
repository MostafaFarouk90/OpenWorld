import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { ActorRegistry } from '../actors/ActorRegistry';
import { CombatRegistry } from '../actors/CombatRegistry';
import { DamageBridge } from '../actors/DamageBridge';
import { DamageResolver } from '../actors/DamageResolver';
import { DUMMY_INIT, playerInit } from '../actors/teams';
import type { KnightAvatar } from '../characters/KnightAvatar';
import { FIXED_TIMESTEP } from '../config/constants';
import { NO_ACTIONS, type Action, type ActionState, type InputContextStack } from '../input/actions';
import type { InputBindings } from '../input/InputBindings';
import type { InputManager, InputSnapshot } from '../input/InputManager';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { AnchorRegistry } from '../layout/AnchorRegistry';
import { TriggerVolumes } from '../layout/TriggerVolumes';
import type { PhysicsWorld, Vec3 } from '../physics/PhysicsWorld';
import { WorldState } from '../state/WorldState';
import { StringTable } from '../strings/StringTable';
import { HudLayer } from '../ui/HudLayer';
import type { World } from '../world/World';
import type { ThirdPersonCamera } from '../rendering/ThirdPersonCamera';
import type { AssetLoader } from '../assets/AssetLoader';
import './coreServices';
import { Clock } from './Clock';
import { GameEvents } from './events';
import { MoveModifiers, type MoveModifier } from './MoveModifiers';
import { PersistRegistry } from './Persist';
import { PluginLoader, type LoadOptions, type PluginModule, type PluginStatus } from './plugins';
import { Scope, scoped } from './scope';
import { Services } from './Services';
import { FlagGates } from '../state/FlagGates';
import { BossRegistry } from '../actors/BossRegistry';
import type { LeapHandle, LeapOptions } from '../characters/Player';
import type { CameraShot } from '../rendering/ThirdPersonCamera';
import { SystemRegistry, type FixedPhase } from './systems';

/** The player as other systems see it (contracts/game-events-and-flags.md section 3). */
export interface PlayerHandle {
  readonly actor: Actor;
  /** Simulated feet at the latest tick. */
  readonly feet: THREE.Vector3;
  readonly facingYaw: number;
  readonly avatar: KnightAvatar | null;
  /** True when the last tick had movement input. */
  readonly moving: boolean;
  /** `ready()` turns true once the collider patch there exists and a physics step has made it visible. */
  teleport(feet: Vec3, yaw?: number): { ready(): boolean };
  addMoveModifier(source: string, mod: MoveModifier): () => void;
  /**
   * v0.4: the scripted Surge Leap primitive (game-events-and-flags.md section 3). Thread 2 owns the
   * action, the learned gate, Burn, cooldown and Scar; core owns only the move and `player.leap`.
   */
  leap(opts: LeapOptions): LeapHandle | null;
}

export interface GameInput {
  readonly actions: ActionState;
  /** True once fullscreen keyboard lock is active (Ctrl dodge is then safe). */
  readonly keyboardLocked: boolean;
  /** Whether fullscreen keyboard lock can work here, and whether it is held now. */
  readonly keyboardLock: { readonly supported: boolean; readonly locked: boolean };
  readonly bindings: InputBindings;
  readonly contexts: InputContextStack;
}

export interface GameContext {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera | null;
  readonly physics: PhysicsWorld;
  readonly world: World;
  readonly player: PlayerHandle;
  readonly events: GameEvents;
  readonly actors: ActorRegistry;
  readonly damage: DamageResolver;
  readonly combat: CombatRegistry;
  readonly state: WorldState;
  /** Flag-derived state that is re-derived on `save.loaded` (v0.4; game-events-and-flags.md section 3). */
  readonly gates: FlagGates;
  /** v0.4 boss registry (actors-and-damage.md section 7); only it emits `boss.*`. */
  readonly bosses: BossRegistry;
  readonly input: GameInput;
  readonly interaction: InteractionSystem;
  readonly anchors: AnchorRegistry;
  readonly triggers: TriggerVolumes;
  readonly strings: StringTable;
  readonly hud: HudLayer;
  readonly services: Services;
  readonly persist: PersistRegistry;
  readonly systems: SystemRegistry;
  readonly clock: Clock;
  /** The follow camera (world scene only); thread 1 adds lock-on to it. Updated between the world and afterCamera render phases. */
  readonly cameraRig: ThirdPersonCamera | null;
  /** The scene's asset loader (memoised loads, SkeletonUtils clones); null headless. */
  readonly assets: AssetLoader | null;
  /** Physics terrain residency (fast travel waits on it). */
  readonly terrain: { isResident(x: number, z: number, radius?: number): boolean };
}

export interface GameOptions {
  scene: THREE.Scene;
  camera?: THREE.PerspectiveCamera | null;
  physics: PhysicsWorld;
  world: World;
  input: InputManager;
  /** Pass the same instance to the World's `moveModifier` option. */
  moveModifiers: MoveModifiers;
  /** Where HUD slots go; null or omitted is headless. */
  hudContainer?: HTMLElement | null;
  /** Camera-relative input to world space; identity mapping when omitted (tests). */
  toWorld?: (right: number, forward: number) => { x: number; z: number };
  /** Camera forward for interaction focus while standing still. */
  cameraForward?: () => THREE.Vector3Like | null;
  cameraRig?: ThirdPersonCamera | null;
  assets?: AssetLoader | null;
  report?: (message: string, err?: unknown) => void;
}

/** `actions` with every locked action reporting nothing, evaluated at read time. */
export function lockedActions(actions: ActionState, locked: (a: Action) => boolean): ActionState {
  return {
    down: (a) => !locked(a) && actions.down(a),
    pressed: (a) => !locked(a) && actions.pressed(a),
    released: (a) => !locked(a) && actions.released(a),
    heldTicks: (a) => (locked(a) ? 0 : actions.heldTicks(a)),
    axis: (neg, pos) => ((actions.down(pos) && !locked(pos) ? 1 : 0) - (actions.down(neg) && !locked(neg) ? 1 : 0)) as -1 | 0 | 1,
  };
}

/** The tick's snapshot after action locks added up to the end of the intent phase. */
export function applyLocks(s: InputSnapshot, a: ActionState): InputSnapshot {
  const attackAction = s.attack > 0 ? (`attack${s.attack}` as Action) : null;
  return {
    moveRight: s.moveRight === 0 ? 0 : a.axis('moveLeft', 'moveRight'),
    moveForward: s.moveForward === 0 ? 0 : a.axis('moveBack', 'moveForward'),
    sprint: s.sprint && a.down('sprint'),
    jump: s.jump && a.pressed('jump'),
    attack: attackAction && a.pressed(attackAction) ? s.attack : 0,
  };
}

/** Metres around a teleport destination whose collider patches must exist before it counts as ready. */
export const TELEPORT_READY_RADIUS = 2;

const SIMULATED_PHASES_BEFORE_WORLD: FixedPhase[] = ['input', 'intent'];
const SIMULATED_PHASES_AFTER_WORLD: FixedPhase[] = ['afterCombat', 'rules', 'late'];

/**
 * The game core around the world simulation: registries, the fixed tick with its system phases, render
 * phases and plugins (contracts/game-events-and-flags.md).
 */
export class Game {
  readonly ctx: GameContext;
  readonly events: GameEvents;
  readonly clock = new Clock();
  readonly systems: SystemRegistry;
  readonly moveModifiers: MoveModifiers;
  private readonly bridge: DamageBridge;
  private readonly gates: FlagGates;
  private readonly bosses: BossRegistry;
  private readonly offKeyboardLock: () => void;
  private loader: PluginLoader | null = null;
  private actions: ActionState = NO_ACTIONS;
  /** World steps run so far (teleport readiness). */
  private worldSteps = 0;
  private moving = false;
  private readonly feet = new THREE.Vector3();
  private readonly report: (message: string, err?: unknown) => void;
  private readonly unbind: (() => void)[] = [];
  private disposed = false;

  constructor(private readonly opts: GameOptions) {
    this.report = opts.report ?? ((m, e) => console.error(m, e ?? ''));
    const { world, input } = opts;
    this.events = new GameEvents(this.report);
    this.systems = new SystemRegistry(this.report);
    this.moveModifiers = opts.moveModifiers;
    const services = new Services();
    const persist = new PersistRegistry();
    const actors = new ActorRegistry(this.events);
    const damage = new DamageResolver(actors, this.events);
    const combat = new CombatRegistry(world.combat.combat, this.events, (id) => actors.get(id));
    const state = new WorldState(this.events);
    this.gates = new FlagGates(state, this.events, this.report);
    this.bosses = new BossRegistry({ events: this.events, actors, damage, state, report: this.report });
    this.systems.add({ id: 'core.bosses', fixedPhase: 'afterCombat', order: -100, fixedUpdate: (dt) => this.bosses.fixedUpdate(dt) });
    world.player.onLeap = (e) =>
      this.events.emit('player.leap', { phase: e.phase, from: { ...e.from }, ...(e.to ? { to: { ...e.to } } : {}) });
    this.bridge = new DamageBridge(world.combat.combat.bus, actors, damage, combat);

    const playerActor = actors.spawn({ ...playerInit(), root: world.player.mesh, owner: world.player });
    const game = this;
    const player: PlayerHandle = {
      get actor() {
        return playerActor;
      },
      get feet() {
        return world.player.controller.interpolatedFeet(1, game.feet);
      },
      get facingYaw() {
        return world.player.facingYaw;
      },
      get avatar() {
        return world.avatar;
      },
      get moving() {
        return game.moving;
      },
      teleport: (feet, yaw) => this.teleport(feet, yaw),
      addMoveModifier: (source, mod) => this.moveModifiers.add(source, mod),
      leap: (opts) => world.player.leap(opts),
    };
    const gameInput: GameInput = {
      get actions() {
        return game.actions;
      },
      get keyboardLocked() {
        return input.keyboardLocked;
      },
      get keyboardLock() {
        return { supported: input.keyboardLockSupported, locked: input.keyboardLocked };
      },
      bindings: input.bindings,
      contexts: input.contexts,
    };
    const interaction = new InteractionSystem({
      events: this.events,
      actions: () => this.actions,
      contexts: input.contexts,
      player: () => ({ actor: playerActor, feet: player.feet, facingYaw: player.facingYaw, moving: this.moving }),
      cameraForward: opts.cameraForward,
    });
    const triggers = new TriggerVolumes({ actors, events: this.events });
    this.systems.add(interaction);
    this.systems.add(triggers);
    this.offKeyboardLock = input.onKeyboardLockChange((state) => this.events.emit('input.keyboardLock', state));

    this.ctx = {
      scene: opts.scene,
      camera: opts.camera ?? null,
      physics: opts.physics,
      world,
      player,
      events: this.events,
      actors,
      damage,
      combat,
      state,
      gates: this.gates,
      bosses: this.bosses,
      input: gameInput,
      interaction,
      anchors: new AnchorRegistry(),
      triggers,
      strings: new StringTable(),
      hud: new HudLayer(opts.hudContainer ?? null, input.contexts, this.events),
      services,
      persist,
      systems: this.systems,
      clock: this.clock,
      cameraRig: opts.cameraRig ?? null,
      assets: opts.assets ?? null,
      terrain: { isResident: (x, z, radius = 0) => world.colliders.isResident(x, z, radius) },
    };
  }

  /**
   * A copy of the context for one plugin whose registering calls are recorded in `scope`
   * (contracts/game-events-and-flags.md section 1).
   */
  scopedContext(scope: Scope): GameContext {
    const c = this.ctx;
    // Registrations tied to one actor instance (its spawn, owners, attackers, targets). The core already
    // cleans these up on despawn, so one listener runs their (idempotent) undos then, which drops them from
    // the scope; an undo the plugin calls itself leaves its list too. A long session of spawning and
    // despawning enemies therefore retains nothing. Entries are matched by instance, not only by id, so a
    // despawned id that is reused before the queued event arrives keeps the new actor's registrations.
    const byActor = new Map<string, Set<{ actor: Actor; undo: () => void }>>();
    let watching = false;
    const forActor = (actorId: string | undefined, undo: () => void): (() => void) => {
      const actor = actorId === undefined ? undefined : c.actors.get(actorId);
      if (!actor) return undo;
      if (!watching) {
        watching = true;
        scope.track(
          c.events.on('actor.despawned', ({ actorId: id }) => {
            const entries = byActor.get(id);
            if (!entries) return;
            const current = c.actors.get(id);
            for (const e of [...entries]) if (e.actor !== current) e.undo();
          }),
        );
      }
      let entries = byActor.get(actor.id);
      if (!entries) byActor.set(actor.id, (entries = new Set()));
      const list = entries;
      const entry = {
        actor,
        undo: () => {
          list.delete(entry);
          if (list.size === 0 && byActor.get(actor.id) === list) byActor.delete(actor.id);
          undo();
        },
      };
      list.add(entry);
      return entry.undo;
    };
    const actors = scoped(c.actors, scope, [], {
      spawn: ((init: Parameters<ActorRegistry['spawn']>[0]) => {
        const actor = c.actors.spawn(init);
        // Only this instance: a replacement spawned under the same id is not ours to remove.
        forActor(actor.id, scope.track(() => c.actors.get(actor.id) === actor && c.actors.despawn(actor.id)));
        return actor;
      }) as never,
      bindOwner: ((actor: Actor, owner: unknown) => forActor(actor.id, scope.track(c.actors.bindOwner(actor, owner)))) as never,
    });
    const player: PlayerHandle = Object.create(c.player, {
      addMoveModifier: { value: (source: string, mod: MoveModifier) => scope.track(c.player.addMoveModifier(source, mod)) },
    });
    const contexts = scoped(c.input.contexts, scope, ['push', 'onChange']);
    const bindings = scoped(c.input.bindings, scope, ['onChange']);
    const input: GameInput = Object.create(c.input, {
      contexts: { value: contexts },
      bindings: { value: bindings },
    });
    const pauses = new Map<string, () => void>();
    const clock = scoped(c.clock, scope, [], {
      // A pause a plugin set is lifted when that plugin is torn down.
      setPaused: ((reason: string, paused: boolean) => {
        c.clock.setPaused(reason, paused);
        const held = pauses.get(reason);
        if (paused && !held) pauses.set(reason, scope.track(() => c.clock.setPaused(reason, false)));
        if (!paused && held) {
          pauses.delete(reason);
          held();
        }
      }) as never,
    });
    return {
      ...c,
      player,
      input,
      clock,
      events: scoped(c.events, scope, ['on', 'once', 'onAny']),
      actors,
      damage: scoped(c.damage, scope, ['addModifier', 'addLethalHandler']),
      combat: scoped(c.combat, scope, [], {
        addAttacker: ((actorId: string, ...rest: unknown[]) =>
          forActor(actorId, scope.track((c.combat.addAttacker as (...a: unknown[]) => () => void)(actorId, ...rest)))) as never,
        addTarget: ((set: unknown, actorId?: string) =>
          forActor(actorId, scope.track((c.combat.addTarget as (...a: unknown[]) => () => void)(set, actorId)))) as never,
        watch: ((actorId: string, ...rest: unknown[]) =>
          forActor(actorId, scope.track((c.combat.watch as (...a: unknown[]) => () => void)(actorId, ...rest)))) as never,
      }),
      gates: scoped(c.gates, scope, ['watch', 'flag']),
      bosses: scoped(c.bosses, scope, ['register']),
      cameraRig: c.cameraRig && scopedCameraRig(c.cameraRig, scope),
      interaction: scoped(c.interaction, scope, ['register']),
      anchors: scoped(c.anchors, scope, ['define']),
      triggers: scoped(c.triggers, scope, ['add']),
      strings: scoped(c.strings, scope, ['register']),
      hud: scoped(c.hud, scope, ['mount', 'openModal']),
      services: scoped(c.services, scope, ['provide']),
      persist: scoped(c.persist, scope, ['register']),
      systems: scoped(c.systems, scope, ['add']),
    };
  }

  /** Sets up plugins (core first); resolves when every setup has settled. */
  async loadPlugins(modules: Readonly<Record<string, PluginModule>>, opts: Omit<LoadOptions, 'report'> = {}): Promise<PluginStatus[]> {
    if (this.loader) throw new Error('Game: plugins are already loaded');
    this.loader = new PluginLoader(this, { ...opts, report: this.report });
    return this.loader.load(modules);
  }

  get pluginStatus(): PluginStatus[] {
    return this.loader?.status() ?? [];
  }

  /** Call after `world.setAvatar`: makes the Knight's sword and hurtboxes resolve to the player actor. */
  attachAvatar(avatar: KnightAvatar): void {
    const actor = this.ctx.actors.player;
    this.unbind.push(this.ctx.actors.bindOwner(actor, avatar));
    if (avatar.model !== (avatar as unknown)) this.unbind.push(this.ctx.actors.bindOwner(actor, avatar.model));
    const attacker = this.opts.world.combat.playerAttacker;
    if (attacker) this.unbind.push(this.ctx.combat.watch(actor.id, attacker.tracer.attacker, attacker.window));
  }

  /** Registers a training dummy (already added to WorldCombat) as an immortal neutral actor. */
  addDummy(model: THREE.Object3D): Actor {
    return this.ctx.actors.spawn({ ...DUMMY_INIT, owner: model, root: model });
  }

  /** One fixed step of 1/60 s. Skipped entirely during hit-stop and pause (input edges stay latched). */
  fixedUpdate(): void {
    if (this.disposed) return;
    this.systems.commit();
    if (!this.clock.beginTick()) return;
    const dt = FIXED_TIMESTEP;
    const { snapshot, actions } = this.opts.input.sampleTick();
    // Locked actions are checked when read, so a modifier added in `intent` applies to this very tick.
    this.actions = lockedActions(actions, (a) => this.moveModifiers.isActionLocked(a));
    this.moving = snapshot.moveRight !== 0 || snapshot.moveForward !== 0;
    for (const phase of SIMULATED_PHASES_BEFORE_WORLD) this.systems.runFixed(phase, dt, this.ctx);
    this.stepWorld(applyLocks(snapshot, this.actions), dt);
    for (const phase of SIMULATED_PHASES_AFTER_WORLD) this.systems.runFixed(phase, dt, this.ctx);
  }

  /** `updateCamera` runs between the world and afterCamera render phases. */
  render(alpha: number, frameTime: number, updateCamera?: () => void): void {
    if (this.disposed) return;
    this.systems.commit();
    this.opts.world.render(alpha, frameTime);
    this.systems.runRender('world', alpha, frameTime, this.ctx);
    updateCamera?.();
    this.systems.runRender('afterCamera', alpha, frameTime, this.ctx);
    this.systems.runRender('hud', alpha, frameTime, this.ctx);
    this.ctx.hud.update(frameTime);
  }

  /** Plugins, systems, HUD and bridges. Does not dispose the World. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loader?.dispose();
    for (const u of this.unbind.reverse()) u();
    this.systems.dispose();
    this.ctx.hud.dispose();
    this.bridge.dispose();
    this.gates.dispose();
    this.bosses.dispose();
    this.opts.world.player.onLeap = null;
    this.ctx.combat.dispose();
    this.offKeyboardLock();
  }

  private stepWorld(snapshot: InputSnapshot, dt: number): void {
    const move = this.opts.toWorld?.(snapshot.moveRight, snapshot.moveForward) ?? {
      x: snapshot.moveRight,
      z: -snapshot.moveForward,
    };
    this.opts.world.fixedUpdate(snapshot, move, {
      beforeCombat: () => {
        this.systems.runFixed('animation', dt, this.ctx);
        this.ctx.combat.pollWindows();
      },
    });
    this.worldSteps++;
  }

  private teleport(feet: Vec3, yaw?: number): { ready(): boolean } {
    const world = this.opts.world;
    world.player.cancelLeap();
    world.player.controller.teleport(feet);
    // The patch under the destination is built now; the controller sees it after the next physics step.
    world.colliders.update(feet.x, feet.z);
    if (yaw !== undefined && Number.isFinite(yaw)) world.player.setFacingYaw(yaw);
    let residentSince: number | null = world.colliders.isResident(feet.x, feet.z, TELEPORT_READY_RADIUS)
      ? this.worldSteps
      : null;
    return {
      ready: () => {
        if (!world.colliders.isResident(feet.x, feet.z, TELEPORT_READY_RADIUS)) {
          residentSince = null;
          return false;
        }
        residentSince ??= this.worldSteps;
        return this.worldSteps > residentSince;
      },
    };
  }
}

/**
 * The follow camera for one plugin: `override` returns a handle rather than an undo, so the scope records
 * `release` itself (game-events-and-flags.md section 3, `cameraRig.override`).
 */
function scopedCameraRig(rig: ThirdPersonCamera, scope: Scope): ThirdPersonCamera {
  return scoped(rig, scope, [], {
    override: ((shot: CameraShot) => {
      const handle = rig.override(shot);
      const release = scope.track(() => handle.release());
      return {
        get active() {
          return handle.active;
        },
        release: (blendOut?: number) => {
          handle.release(blendOut);
          release();
        },
      };
    }) as never,
  });
}
