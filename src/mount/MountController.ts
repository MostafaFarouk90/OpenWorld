// The Ashmare (slice 2 thread 20; plans/slice-2-ashmare.md with its review folded in). The rider and the horse
// move as the player's own capsule through `Player.setRide`; this controller owns the gate, the H verb, the
// whistle, the casts, the horse's own stamina, the hurtboxes on the horse, the visual, the camera offsets and the
// `mount` persistable.
import * as THREE from 'three';
import { HurtboxSet } from '../combat/HurtboxSet';
import { groundAt } from '../companions/ground';
import type { NavLike } from '../companions/types';
import type { GameContext } from '../core/Game';
import type { MoveModifier } from '../core/MoveModifiers';
import type { Action } from '../input/actions';
import type { Vec3 } from '../physics/PhysicsWorld';
import type { GateCause } from '../state/FlagGates';
import { heightAt as terrainHeightAt } from '../terrain/heightfield';
import '../hud/events';
import type { HorseAsset } from './glbHorse';
import { loadHorseVisual, type HorseVisual } from './horseVisual';
import { freeDistance, rapierCastPorts, type CastPorts } from './probes';
import { bodyPitch } from './rig';
import { RideModel, type RideEnv } from './RideModel';
import { dismountsBefore, mountRefusal, unseatingHit, type MountRefusal, type MountState } from './rules';
import { planWhistle, type HorseSpot, type SummonPorts } from './summon';
import { MOUNT_TUNING } from './tuning';

export type DismountReason = 'player' | 'combat' | 'interior' | 'load' | 'script';

export interface MountService {
  mounted(): boolean;
  /** Whistles the horse (H when it is not within reach); refused like H. */
  summon(): void;
  dismount(reason: DismountReason): void;
  /** The horse's stamina while mounted; null when unmounted (thread 8 draws it under the Ember bar). */
  stamina(): { value: number; max: number } | null;
  /** A region speed cap (m/s) at a point, e.g. the Ashen Waste's drifts in Act 2; returns the undo. */
  addSpeedCap(capAt: (x: number, z: number) => number): () => void;
  /** Extra maximum stamina (the Ashmare saddle, Act 2); sources add up, the bar keeps its fill proportion. Returns the undo. */
  addStaminaBonus(fn: () => number): () => void;
}

declare module '../core/Services' {
  interface GameServices {
    /** Slice 2 thread 20: the Ashmare. */
    mount: MountService;
  }
}

export const MOUNT_PERSIST_KEY = 'mount';
export const MOUNT_PERSIST_VERSION = 1;

export interface MountSave {
  placed: HorseSpot | null;
  stamina: number;
}

/** Actions a rider cannot use (interact stays: doors and talk; rest, kneel, shrine and hide dismount first). */
export const RIDER_LOCKS: readonly Action[] = [
  'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'jump', 'surge', 'surgeLeap',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'mercy', 'sneak', 'lockOn',
];

/** After being thrown, the horse cannot be mounted again for this long (seconds). */
const THROWN_LOCKOUT = 0.5;
const MOUNT_BLEND = 0.35;

function anyService<T>(ctx: GameContext, name: string): T | undefined {
  return (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;
}

const finite = (...xs: number[]): boolean => xs.every(Number.isFinite);

function readSpot(v: unknown): HorseSpot | null {
  const s = v as Partial<HorseSpot> | null;
  if (!s || typeof s !== 'object') return null;
  return finite(s.x as number, s.y as number, s.z as number, s.yaw as number) ? { x: s.x!, y: s.y!, z: s.z!, yaw: s.yaw! } : null;
}

export interface MountControllerOptions {
  /** Terrain height (tests inject a flat one); default the game heightfield. */
  heightAt?: (x: number, z: number) => number;
  visual?: () => HorseVisual;
}

export class MountController implements MountService {
  readonly model = new RideModel();
  private available = false;
  private _mounted = false;
  /** Where the horse stands while not ridden; null when unplaced. */
  private horse: HorseSpot | null = null;
  private arriving: { to: HorseSpot; speed: number; timer: number } | null = null;
  private visual: HorseVisual | null = null;
  private hurtboxes: HurtboxSet | null = null;
  private horseAsset: HorseAsset | null = null;
  private readonly hurtOwner = { mount: MOUNT_TUNING.mountId };
  private offTarget: (() => void) | null = null;
  private offOwner: (() => void) | null = null;
  private offLocks: (() => void) | null = null;
  /** The stamina a save held, re-applied on `save.loaded` once bonuses (the saddle) are known. */
  private savedStamina: number | null = null;
  private readonly speedCaps = new Set<(x: number, z: number) => number>();
  private readonly offs: (() => void)[] = [];
  private readonly lastFeet = new THREE.Vector3();
  private lastFeetValid = false;
  /** Set by `load` and cleared on `save.loaded`: a load cycle that never reached `load` gets the defaults. */
  private loadedEntry = false;
  private leaping = false;
  private lockout = 0;
  private wasTransitioning = false;
  private wasTravelling = false;
  private promptShown = false;
  /** Render: the horse's previous and current tick spot for interpolation, and the mount blend. */
  private readonly prevSpot = new THREE.Vector3();
  private readonly currSpot = new THREE.Vector3();
  private prevYaw = 0;
  private currYaw = 0;
  private blend = 1;
  private readonly blendFrom = new THREE.Vector3();
  private cameraK = 0;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly casts: CastPorts;
  private readonly ground: SummonPorts;
  private disposed = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly opts: MountControllerOptions = {},
  ) {
    this.heightAt = opts.heightAt ?? terrainHeightAt;
    this.preloadHorse();
    const exclude = () => ctx.world.player.controller.collider;
    this.casts = rapierCastPorts(ctx.physics, exclude, this.heightAt);
    const nav = () => anyService<NavLike>(ctx, 'nav') ?? null;
    const self = this;
    this.ground = {
      raycast: (o, d, max) => ctx.physics.raycast(o, d, max, exclude()),
      isResident: (x, z) => ctx.terrain.isResident(x, z),
      heightAt: this.heightAt,
      indoors: () => self.indoors(),
      get nav() {
        return nav();
      },
      ballClear: (a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-3) return true;
        const toi = self.casts.castBall(a, { x: dx / len, y: dy / len, z: dz / len }, len, MOUNT_TUNING.castRadius * 0.8);
        return toi === null;
      },
    };
  }

  // ------------------------------------------------------------------------------------------- service

  mounted(): boolean {
    return this._mounted;
  }

  stamina(): { value: number; max: number } | null {
    return this._mounted ? { value: this.model.stamina, max: this.model.max } : null;
  }

  addSpeedCap(capAt: (x: number, z: number) => number): () => void {
    this.speedCaps.add(capAt);
    return () => {
      this.speedCaps.delete(capAt);
    };
  }

  addStaminaBonus(fn: () => number): () => void {
    return this.model.addStaminaBonus(fn);
  }

  summon(): void {
    if (this._mounted) return;
    const refused = this.refusal();
    if (refused) return this.toastRefusal(refused);
    this.whistle();
  }

  dismount(reason: DismountReason, at?: Vec3): void {
    if (!this._mounted) return;
    const ctx = this.ctx;
    this._mounted = false;
    ctx.world.player.setRide(null);
    this.offLocks?.();
    this.offLocks = null;
    this.offTarget?.();
    this.offTarget = null;
    this.offOwner?.();
    this.offOwner = null;
    this.setRiderLift(0);
    // The horse steps aside from where the rider was (or stays at `at`, a door or a pre-teleport spot).
    this.place(at ? { x: at.x, y: at.y, z: at.z, yaw: this.model.heading } : this.besideRider());
    this.model.speed = 0;
    if (reason === 'combat') this.lockout = THROWN_LOCKOUT;
    ctx.events.emit('mount.dismounted', { mountId: MOUNT_TUNING.mountId, reason });
  }

  // ------------------------------------------------------------------------------------------- setup

  setup(): void {
    const ctx = this.ctx;
    const t = MOUNT_TUNING;
    this.offs.push(ctx.gates.flag(t.flag, (open, cause) => this.onGate(open, cause)));
    this.offs.push(
      ctx.events.on('damage.dealt', (r) => {
        if (this._mounted && r.targetId === ctx.player.actor.id && unseatingHit(r)) this.dismount('combat');
      }),
      ctx.events.on('actor.staggered', (e) => {
        if (this._mounted && e.actorId === ctx.player.actor.id) this.dismount('combat');
      }),
      ctx.events.on('actor.died', (e) => {
        if (this._mounted && e.actorId === ctx.player.actor.id) this.dismount('script');
      }),
      ctx.events.on('rest', () => {
        if (this._mounted) this.dismount('script');
        this.model.refill();
      }),
      ctx.events.on('player.leap', (e) => {
        this.leaping = e.phase === 'start';
      }),
      ctx.events.on('save.loaded', () => {
        // A save without a `mount` entry (or one refused as newer) never reaches `load`: load the defaults here.
        if (!this.loadedEntry) this.load(null);
        this.loadedEntry = false;
        // The mount entry may load before the inventory that supplies a stamina bonus: put the saved fill back now.
        if (this.savedStamina !== null) this.model.setStamina(this.savedStamina);
        this.savedStamina = null;
        if (!this.available) this.removeHorse();
      }),
    );
    this.offs.push(
      ctx.systems.add({ id: 'mount.ride', fixedPhase: 'intent', order: 60, fixedUpdate: (dt) => this.intent(dt) }),
      // After the player has moved and before combat traces: the horse at the simulated feet, hurtboxes current.
      ctx.systems.add({ id: 'mount.horse', fixedPhase: 'animation', order: 260, fixedUpdate: (dt) => this.animate(dt) }),
      ctx.systems.add({ id: 'mount.render', renderPhase: 'world', order: 70, render: (alpha, ft) => this.render(alpha, ft) }),
    );
    ctx.persist.register({
      key: MOUNT_PERSIST_KEY,
      version: MOUNT_PERSIST_VERSION,
      serialize: () => this.serialize(),
      load: (data) => this.load(data),
    });
  }

  // ------------------------------------------------------------------------------------------- gate

  private onGate(open: boolean, cause: GateCause): void {
    this.available = open;
    if (!open) {
      this.dismount('script');
      this.removeHorse();
      return;
    }
    if (!this.horse) this.placeAtStables();
    if (cause === 'flag') this.ctx.events.emit('hud.toast', { textKey: 'mount.awarded' });
  }

  /** The one place an unplaced horse stands: thread 17's stables anchor (else it stays unplaced until whistled). */
  private placeAtStables(): void {
    const a = this.ctx.anchors.find(MOUNT_TUNING.stablesAnchor);
    if (a) this.place({ x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.yaw ?? 0 });
  }

  // ------------------------------------------------------------------------------------------- state

  private indoors(): boolean {
    const i = anyService<{ current: string | null; transitioning?: boolean }>(this.ctx, 'interiors');
    return !!i && (i.current !== null || i.transitioning === true);
  }

  private mountState(): MountState {
    const ctx = this.ctx;
    const way = anyService<{ travelling?: boolean; hostileAggro?: boolean }>(ctx, 'waystones');
    const verbs = anyService<{ busy?: boolean }>(ctx, 'combatVerbs');
    return {
      available: this.available,
      indoors: this.indoors(),
      travelling: way?.travelling === true,
      stealth: anyService<{ active(): boolean }>(ctx, 'stealth')?.active() === true,
      chase: anyService<{ active(): boolean }>(ctx, 'chase')?.active() === true,
      aggro: way?.hostileAggro === true,
      busy:
        ctx.player.actor.dead ||
        this.leaping ||
        this.lockout > 0 ||
        verbs?.busy === true ||
        ctx.input.contexts.top() !== 'gameplay',
    };
  }

  private refusal(): MountRefusal | null {
    return mountRefusal(this.mountState());
  }

  private toastRefusal(r: MountRefusal): void {
    this.ctx.events.emit('hud.toast', { textKey: `mount.refused.${r}` });
  }

  // ------------------------------------------------------------------------------------------- H

  private intent(dt: number): void {
    const ctx = this.ctx;
    this.lockout = Math.max(0, this.lockout - dt);
    const pressed = ctx.input.actions.pressed('mount');
    if (this._mounted) {
      if (this.autoDismount()) return;
      if (pressed) return this.dismount('player');
      this.ride(dt);
      return;
    }
    this.wasTransitioning = this.indoors();
    this.wasTravelling = anyService<{ travelling?: boolean }>(ctx, 'waystones')?.travelling === true;
    this.syncPrompt(!!this.horse && !this.arriving && this.withinReach(this.horse) && this.refusal() === null);
    if (!pressed) return;
    const refused = this.refusal();
    if (refused) return this.toastRefusal(refused);
    if (this.horse && this.withinReach(this.horse)) this.mount();
    else this.whistle();
  }

  /** "H Ride" while the horse stands within reach and mounting is allowed. */
  private syncPrompt(show: boolean): void {
    if (show === this.promptShown) return;
    const prompts = anyService<{ show(m: string, a: Action, key: string): void; hide(m?: string): void }>(this.ctx, 'prompts');
    if (!prompts) return;
    this.promptShown = show;
    if (show) prompts.show('mount', 'mount', 'mount.prompt.ride');
    else prompts.hide('mount');
  }

  private withinReach(p: Vec3): boolean {
    const f = this.ctx.player.feet;
    return Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z) <= MOUNT_TUNING.mountRadius;
  }

  /** Ends the ride for every outside reason; true when it did. */
  private autoDismount(): boolean {
    const ctx = this.ctx;
    const transitioning = this.indoors();
    const travelling = anyService<{ travelling?: boolean }>(ctx, 'waystones')?.travelling === true;
    const s = this.mountState();
    let reason: DismountReason | null = null;
    if (transitioning && !this.wasTransitioning) reason = 'interior';
    else if (travelling && !this.wasTravelling) reason = 'script';
    else if (s.stealth || s.chase || !s.available) reason = 'script';
    else if (ctx.input.actions.pressed('interact')) {
      const f = ctx.interaction.focus;
      if (f && dismountsBefore(f.kind, f.id)) reason = 'script';
    }
    this.wasTransitioning = transitioning;
    this.wasTravelling = travelling;
    if (!reason) return false;
    // The door transition has started: the horse stays at the last outdoor spot.
    this.dismount(reason, reason === 'interior' && this.lastFeetValid ? this.lastFeet.clone() : undefined);
    return true;
  }

  private mount(): void {
    const ctx = this.ctx;
    this.syncPrompt(false);
    anyService<{ success(m: string): void }>(ctx, 'prompts')?.success('mount');
    const horse = this.horse!;
    this._mounted = true;
    this.arriving = null;
    this.blendFrom.set(horse.x, horse.y, horse.z);
    this.blend = 0;
    this.horse = null;
    this.model.start(horse.yaw);
    this.offLocks = ctx.player.addMoveModifier('mount', { lockActions: RIDER_LOCKS } satisfies MoveModifier);
    ctx.world.player.setRide({ x: this.model.dirX, z: this.model.dirZ, speed: 0, yaw: this.model.heading });
    const v = this.ensureVisual();
    if (v && this.hurtboxes) {
      this.offOwner = ctx.actors.bindOwner(ctx.player.actor, this.hurtOwner);
      this.offTarget = ctx.combat.addTarget(this.hurtboxes, ctx.player.actor.id);
    }
    this.lastFeet.copy(ctx.player.feet);
    this.lastFeetValid = true;
    ctx.events.emit('mount.mounted', { mountId: MOUNT_TUNING.mountId });
  }

  private whistle(): void {
    const ctx = this.ctx;
    const plan = planWhistle(this.ground, ctx.player.feet, ctx.player.facingYaw, this.horse);
    if (!plan) return this.ctx.events.emit('hud.toast', { textKey: 'mount.whistle.noRoom' });
    if (plan.kind === 'pop') {
      this.place(plan.at);
      this.arriving = null;
    } else {
      if (plan.kind === 'spawn') this.place(plan.at);
      this.arriving = { to: plan.to, speed: 0, timer: MOUNT_TUNING.arriveTimeout };
    }
    ctx.events.emit('mount.summoned', { mountId: MOUNT_TUNING.mountId });
  }

  // ------------------------------------------------------------------------------------------- ride

  private ride(dt: number): void {
    const ctx = this.ctx;
    const a = ctx.input.actions;
    const right = a.axis('moveLeft', 'moveRight');
    const forward = a.axis('moveBack', 'moveForward');
    const w =
      right !== 0 || forward !== 0
        ? (ctx.cameraRig?.toWorld(right, forward) ?? { x: right, z: -forward })
        : { x: 0, z: 0 };
    const feet = ctx.player.feet;
    const m = this.model;
    const env: RideEnv = {
      freeAhead: freeDistance(this.casts, feet, m.dirX, m.dirZ, 1, Math.max(0, m.speed)),
      freeBehind: m.speed <= 0.5 ? freeDistance(this.casts, feet, m.dirX, m.dirZ, -1, -Math.min(0, m.speed)) : Infinity,
      residentAhead: ctx.terrain.isResident(
        feet.x + m.dirX * MOUNT_TUNING.residentLookahead,
        feet.z + m.dirZ * MOUNT_TUNING.residentLookahead,
      ),
      speedCap: this.speedCap(feet.x, feet.z),
    };
    m.step({ dirX: w.x, dirZ: w.z, gallop: a.down('sprint') }, env, dt);
    const sign = m.speed < 0 ? -1 : 1;
    ctx.world.player.setRide({ x: m.dirX * sign, z: m.dirZ * sign, speed: Math.abs(m.speed), yaw: m.heading });
  }

  private speedCap(x: number, z: number): number {
    let cap = Infinity;
    for (const f of this.speedCaps) {
      const c = f(x, z);
      if (Number.isFinite(c) && c >= 0) cap = Math.min(cap, c);
    }
    return cap;
  }

  // ------------------------------------------------------------------------------------------- horse

  private animate(dt: number): void {
    const ctx = this.ctx;
    const feet = ctx.player.feet;
    if (this._mounted) {
      // Any jump of the feet (kill plane, respawn, fast travel, scripted teleports) ends the ride.
      if (this.lastFeetValid && feet.distanceTo(this.lastFeet) > MOUNT_TUNING.teleportJump) {
        const at = this.lastFeet.clone();
        this.dismount('script', at);
        this.lastFeet.copy(feet);
        return;
      }
      // The horse is as fast as the capsule really went: a lock, a stun or an obstacle the casts missed stops it too.
      if (this.lastFeetValid && dt > 0) {
        const moved = Math.hypot(feet.x - this.lastFeet.x, feet.z - this.lastFeet.z) / dt;
        const allowed = moved + MOUNT_TUNING.acceleration * dt * 2;
        if (Math.abs(this.model.speed) > allowed) this.model.speed = Math.sign(this.model.speed) * allowed;
      }
      this.lastFeet.copy(feet);
      this.lastFeetValid = true;
      const v = this.visual;
      if (!v) return;
      const yaw = ctx.player.facingYaw;
      this.setSpot(feet, yaw);
      v.root.position.copy(feet);
      v.root.rotation.set(0, yaw, 0);
      v.update(Math.abs(this.model.speed), this.slopeAt(feet, yaw, v.length), dt);
      v.root.updateMatrixWorld(true);
      this.setRiderLift(this.saddleLift(v, feet.y));
      return;
    }
    this.lastFeet.copy(feet);
    this.lastFeetValid = true;
    this.model.rest(dt);
    const h = this.horse;
    if (!h) return;
    const speed = this.arriving ? this.stepArrival(h, this.arriving, dt) : 0;
    const v = this.visual;
    if (!v) return;
    this.setSpot(h, h.yaw);
    v.root.position.set(h.x, h.y, h.z);
    v.root.rotation.set(0, h.yaw, 0);
    v.update(speed, this.slopeAt(h, h.yaw, v.length), dt);
  }

  /** Canters toward the arrival spot along the ground; pops there if it takes too long. Returns the speed. */
  private stepArrival(h: HorseSpot, a: { to: HorseSpot; speed: number; timer: number }, dt: number): number {
    const t = MOUNT_TUNING;
    a.timer -= dt;
    const dx = a.to.x - h.x;
    const dz = a.to.z - h.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3 || a.timer <= 0) {
      Object.assign(h, a.to);
      this.arriving = null;
      return 0;
    }
    // Slow down to stop on the spot.
    const want = Math.min(t.canterSpeed, Math.sqrt(2 * t.braking * d));
    a.speed = Math.min(want, a.speed + t.acceleration * 2 * dt);
    const step = Math.min(d, a.speed * dt);
    h.x += (dx / d) * step;
    h.z += (dz / d) * step;
    h.yaw = Math.atan2(-dx, -dz);
    const y = groundAt(this.ground, h.x, h.z, h.y);
    if (y !== null) h.y = y;
    return a.speed;
  }

  /**
   * The spot `saveSideOffset` to the rider's right (then left) on the ground with a clear line from the rider; the
   * rider's own feet when neither side is clear (a wall, a ledge, unbuilt ground).
   */
  private besideRider(): HorseSpot {
    const f = this.ctx.player.feet;
    const yaw = this.model.heading;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const s = MOUNT_TUNING.saveSideOffset;
    for (const side of [s, -s]) {
      const x = f.x - fz * side;
      const z = f.z + fx * side;
      const y = groundAt(this.ground, x, z, f.y);
      if (y === null || Math.abs(y - f.y) > MOUNT_TUNING.spawnLevel) continue;
      if (!this.ground.ballClear({ x: f.x, y: f.y + 1, z: f.z }, { x, y: y + 1, z })) continue;
      return { x, y, z, yaw };
    }
    return { x: f.x, y: f.y, z: f.z, yaw };
  }

  private slopeAt(p: Vec3, yaw: number, length: number): number {
    const fx = -Math.sin(yaw) * length * 0.5;
    const fz = -Math.cos(yaw) * length * 0.5;
    return bodyPitch(this.heightAt(p.x + fx, p.z + fz), this.heightAt(p.x - fx, p.z - fz), length);
  }

  private saddleLift(v: HorseVisual, feetY: number): number {
    const w = v.saddle.getWorldPosition(new THREE.Vector3());
    return Math.max(0, w.y - feetY);
  }

  /** Raises the avatar onto the saddle; re-applied every tick, so a class swap mid-ride picks it up. */
  private setRiderLift(lift: number): void {
    const avatar = this.ctx.player.avatar;
    if (!avatar) return;
    if (avatar.root.position.y === lift) return;
    avatar.root.position.y = lift;
    avatar.root.updateMatrixWorld(true);
  }

  private setSpot(p: Vec3, yaw: number): void {
    this.prevSpot.copy(this.currSpot);
    this.prevYaw = this.currYaw;
    this.currSpot.set(p.x, p.y, p.z);
    this.currYaw = yaw;
  }

  /** Loads the glb horse in the background; until it arrives (or if it never does) the procedural horse is the Ashmare. */
  private preloadHorse(): void {
    const assets = this.ctx.assets;
    if (!assets || this.opts.visual) return;
    assets.load('horse').then(
      () => {
        if (this.disposed) return;
        this.horseAsset = { instantiate: () => assets.instantiate('horse'), clips: assets.animations('horse') };
        // A horse already standing is rebuilt now; a ridden one at the next dismount.
        if (this.horse && !this.offTarget) this.place(this.horse);
      },
      (err: unknown) => console.warn('mount: the glb horse failed to load, keeping the procedural one', err),
    );
  }

  private ensureVisual(): HorseVisual | null {
    // The procedural horse stands in until the glb has loaded; it swaps at the next placement or mount while no hurtboxes are bound.
    if (this.visual && !this.visual.glb && this.horseAsset && !this.opts.visual && !this.offTarget && !this.disposed) {
      this.hurtboxes?.dispose();
      this.hurtboxes = null;
      this.visual.dispose();
      this.visual = null;
    }
    if (this.visual || this.disposed) return this.visual;
    try {
      const v = this.opts.visual ? this.opts.visual() : loadHorseVisual(this.horseAsset, (err) => {
        // Keep the procedural horse for good: no rebuild loop, one warning.
        this.horseAsset = null;
        console.warn('mount: the glb horse failed to build, using the procedural one', err);
      });
      this.ctx.scene.add(v.root);
      v.root.updateMatrixWorld(true);
      this.hurtboxes = new HurtboxSet(v.rig, v.hurtboxDefs, this.hurtOwner);
      this.visual = v;
    } catch (err) {
      console.warn('mount: the horse visual failed to build', err);
    }
    return this.visual;
  }

  private place(spot: HorseSpot): void {
    this.horse = { ...spot };
    const v = this.ensureVisual();
    if (!v) return;
    v.setVisible(true);
    v.reset();
    this.currSpot.set(spot.x, spot.y, spot.z);
    this.prevSpot.copy(this.currSpot);
    this.currYaw = this.prevYaw = spot.yaw;
    v.root.position.copy(this.currSpot);
    v.root.rotation.set(0, spot.yaw, 0);
    v.root.updateMatrixWorld(true);
  }

  private removeHorse(): void {
    this.horse = null;
    this.arriving = null;
    this.visual?.setVisible(false);
  }

  // ------------------------------------------------------------------------------------------- render

  private render(alpha: number, frameTime: number): void {
    const v = this.visual;
    const t = MOUNT_TUNING;
    const rig = this.ctx.cameraRig;
    if (rig) {
      const goal = this._mounted ? 1 : 0;
      const k = t.cameraEase > 0 ? Math.min(1, frameTime / t.cameraEase) : 1;
      this.cameraK += Math.max(-k, Math.min(k, goal - this.cameraK));
      rig.mountLift = t.cameraLift * this.cameraK;
      rig.mountDistance = t.cameraDistance * this.cameraK;
    }
    if (!v || !v.root.visible) return;
    if (this._mounted) {
      // Rides with the interpolated player; the mount blend eases the horse from where it stood.
      const mesh = this.ctx.world.player.mesh;
      this.blend = Math.min(1, this.blend + frameTime / MOUNT_BLEND);
      v.root.position.lerpVectors(this.blendFrom, this.ctx.world.player.feet, this.blend);
      v.root.quaternion.copy(mesh.quaternion);
    } else {
      v.root.position.lerpVectors(this.prevSpot, this.currSpot, alpha);
      const dy = Math.atan2(Math.sin(this.currYaw - this.prevYaw), Math.cos(this.currYaw - this.prevYaw));
      v.root.rotation.set(0, this.prevYaw + dy * alpha, 0);
    }
    v.animate(frameTime);
  }

  // ------------------------------------------------------------------------------------------- saves

  serialize(): MountSave {
    const placed: HorseSpot | null = this._mounted ? this.besideRider() : this.horse ? { ...this.horse } : null;
    return { placed, stamina: this.model.stamina };
  }

  /** A mounted player loads dismounted (contract section 7): the ride ends here, before the player is placed. */
  load(data: unknown): void {
    this.loadedEntry = true;
    if (this._mounted) this.dismount('load');
    const d = (data ?? {}) as Partial<MountSave>;
    this.savedStamina = typeof d.stamina === 'number' ? d.stamina : null;
    this.model.setStamina(this.savedStamina ?? this.model.max);
    this.arriving = null;
    this.lastFeetValid = false;
    const spot = readSpot(d.placed);
    if (!spot) {
      this.removeHorse();
      if (this.available) this.placeAtStables();
      return;
    }
    const ground = this.heightAt(spot.x, spot.z);
    if (Number.isFinite(ground) && Math.abs(spot.y - ground) > MOUNT_TUNING.maxSavedHeight) {
      this.removeHorse();
      if (this.available) this.placeAtStables();
      return;
    }
    this.place(spot);
  }

  dispose(): void {
    if (this.disposed) return;
    this.syncPrompt(false);
    if (this._mounted) {
      this._mounted = false;
      this.ctx.world.player.setRide(null);
      this.offLocks?.();
      this.offTarget?.();
      this.offOwner?.();
      this.setRiderLift(0);
    }
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    const rig = this.ctx.cameraRig;
    if (rig) {
      rig.mountLift = 0;
      rig.mountDistance = 0;
    }
    this.hurtboxes?.dispose();
    this.hurtboxes = null;
    this.visual?.dispose();
    this.visual = null;
  }
}
