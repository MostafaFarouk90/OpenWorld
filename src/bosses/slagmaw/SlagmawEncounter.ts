import * as THREE from "three";
import type { Actor } from "../../actors/Actor";
import type { BossDef } from "../../actors/BossRegistry";
import type { GameContext } from "../../core/Game";
import { hostFromContext } from "../../enemies/host";
import {
  EnemyProjectiles,
  type Shooter,
} from "../../enemies/ranged/EnemyProjectiles";
import { ValveWheel, valveInteractable } from "../../puzzles/ValveWheel";
import { clampToArena, yawToward } from "../prior/geometry";
import { SlagmawBrain, type SlagmawHooks } from "./SlagmawBrain";
import type { SlagmawModel } from "./SlagmawModel";
import { DouseDisc, EruptionBurst, TremorCracks } from "./slagmawFx";
import {
  ARENA,
  COOLING,
  CYCLE,
  ERUPTION,
  PRESENTATION,
  SLAGMAW,
  SLAGMAW_BOSS_ID,
  SLAGMAW_KIND,
  SLAGMAW_NAME_KEY,
  SPIT_MOVE,
} from "./tuning";

export const SLAGMAW_FLOOR_MODIFIER_ID = "bosses.slagmaw.floor";
export const SLAGMAW_CRUST_MODIFIER_ID = "bosses.slagmaw.crust";

/**
 * The Slagmaw has no mercy (no `BOSS_MERCY` row, so nothing offers a Release), so he has no release window: the registry
 * reads 0 as "no window", and no break, the last included, opens one or fires `boss.releaseWindow`.
 */
export const SLAGMAW_WINDOW_SECONDS = 0;

export const SLAGMAW_BOSS_DEF: BossDef = {
  bossId: SLAGMAW_BOSS_ID,
  nameKey: SLAGMAW_NAME_KEY,
  phases: SLAGMAW.phases,
  breaksPerPhase: SLAGMAW.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: Math.max(SLAGMAW.releaseWindowSeconds, SLAGMAW_WINDOW_SECONDS),
};

/** How many globs can be in the air at once (one spit every 1.4 s or slower, a 24 m range at 13 m/s). */
const SPIT_CAPACITY = 3;
/** Seconds the worm takes to rise out of the floor at an eruption. */
const RISE_SECONDS = 0.25;
/** Eruptions land on the floor: the player must be within this height of the spot. */
const HIT_HEIGHT = 2.5;

export interface SlagmawPlaces {
  centre: THREE.Vector3;
  centreYaw: number;
  /** The three valve spots, in phase order. */
  valves: THREE.Vector3[];
}

/** How an encounter ended: an outcome played out, or a reset (death, load, teardown). */
export type SlagmawEnd = "defeated" | "reset";

export interface SlagmawEncounterOptions {
  model: SlagmawModel | null;
  places: SlagmawPlaces;
  warn: (message: string) => void;
  onEnd: (end: SlagmawEnd) => void;
}

interface Valve {
  readonly wheel: ValveWheel;
  readonly at: THREE.Vector3;
  readonly mesh: THREE.Group;
  /** Removes its interactable. */
  off: () => void;
  /** The valve produced a break in its phase: it is spent. */
  spent: boolean;
}

/** One shared pair of valve-wheel geometries and materials for all valves of all encounters. */
const WHEEL_GEO = new THREE.TorusGeometry(0.45, 0.07, 6, 16);
const POST_GEO = new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6);
const WHEEL_MAT = new THREE.MeshStandardMaterial({
  color: 0x6b5a48,
  roughness: 0.6,
  metalness: 0.5,
});

/**
 * One Slagmaw fight (plans/act2-A8.md, "PR 2"): the actor and procedural model, the registry registration, the brain's hooks
 * (the tremor with its cracks and camera shake, the eruption's dodge-only area hit, the lava spit on A6b's projectile adapter),
 * the hot and cooled crust (poise damage counts only while a valve's douse has cooled him), the three cooling valves, the
 * health floor and the death. The arena owns the trigger, intro, gate and reset rules; this class owns everything that lives
 * and dies with one Slagmaw.
 */
export class SlagmawEncounter implements SlagmawHooks {
  readonly actor: Actor;
  readonly brain: SlagmawBrain;
  private readonly ctx: GameContext;
  private readonly model: SlagmawModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: SlagmawPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: SlagmawEnd) => void;
  private readonly offs: (() => void)[] = [];
  private readonly cracks = new TremorCracks();
  private readonly douse = new DouseDisc();
  private readonly burst = new EruptionBurst();
  private readonly projectiles: EnemyProjectiles;
  private readonly shooter: Shooter;
  private readonly spitFeet = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private valves: Valve[] = [];
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  /** The `last` break has happened: the floor is lifted for good. */
  private floorLifted = false;
  private poiseIdle = 0;
  /** 0 = under the floor, 1 = fully up; driven toward the brain's state. */
  private emerge = 0;
  private tremorT = 0;
  private tremorLead: number = CYCLE.tremorSeconds;
  private tremorOn = false;
  private tremorSwing = 0;
  private cooled = false;
  private coolT = 0;
  /** The valve whose douse is spraying (index), or -1. */
  private douseValve = -1;
  /** `mountValves` threw in `register()`: the director stops arming until the next trigger enter. */
  mountFailed = false;
  private douseT = 0;
  private outcomeT = 0;
  private outcomePlayingFlag = false;

  constructor(ctx: GameContext, opts: SlagmawEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = "boss-the-slagmaw";
    this.root.position.copy(opts.places.centre);
    this.root.rotation.set(0, opts.places.centreYaw, 0);
    ctx.scene.add(
      this.root,
      this.cracks.mesh,
      this.douse.mesh,
      this.burst.mesh,
    );
    this.projectiles = new EnemyProjectiles(
      hostFromContext(ctx, opts.warn),
      SPIT_CAPACITY,
    );

    this.actor = ctx.actors.spawn({
      kind: SLAGMAW_KIND,
      team: "hostile",
      level: SLAGMAW.level,
      maxHealth: SLAGMAW.maxHealth,
      maxPoise: SLAGMAW.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      // Out of the fight until register(): the intro shows the arena empty (he is under the floor).
      hittable: false,
    });
    this.actor.untargetable = true;
    this.setEmergence(0);
    const spitFeet = this.spitFeet;
    const actor = this.actor;
    this.shooter = {
      id: actor.id,
      damageScale: 1,
      get feet() {
        return spitFeet;
      },
      get yaw() {
        return 0;
      },
    };
    if (opts.model)
      this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(
        SLAGMAW_CRUST_MODIFIER_ID,
        (req) => this.crust(req),
        SLAGMAW.floorModifierOrder - 1,
      ),
      ctx.damage.addModifier(
        SLAGMAW_FLOOR_MODIFIER_ID,
        (req) => this.floor(req),
        SLAGMAW.floorModifierOrder,
      ),
    );
    this.brain = new SlagmawBrain(this);

    const mine = (p: { bossId: string }) =>
      p.bossId === SLAGMAW_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on("boss.break", (p) => {
        if (!mine(p)) return;
        // Only a valve cool makes a break: a stagger that other systems force on a hot crust (a parried spit, Second Wind, a
        // howl) must not spend a valve or lift the floor.
        if (!this.cooled) {
          this.actor.restorePoise();
          return;
        }
        // The break belongs to the valve that cooled him (it is spent), even when the same hit crossed a phase threshold. A cooled
        // `last` break lifts the floor whichever valve cooled him: a hit that jumped phases can make valve 1 or 2 the last one.
        const valve = this.valves[this.douseValve];
        if (p.last) this.floorLifted = true;
        if (valve) {
          valve.spent = true;
          valve.wheel.locked = true;
        }
        this.endCooling(false);
        this.projectiles.cancelFor(this.actor.id);
        this.brain.onBreak();
      }),
      ctx.events.on("boss.phase", (p) => {
        if (!mine(p)) return;
        this.projectiles.cancelFor(this.actor.id);
        this.brain.onPhase(p.phase);
      }),
      ctx.events.on("boss.defeated", (p) => {
        if (mine(p)) this.outcome();
      }),
      ctx.events.on("damage.dealt", (r) => {
        if (r.targetId === this.actor.id && r.outcome === "hit")
          this.poiseIdle = 0;
      }),
    );
  }

  /** True once `register` ran and until the encounter ends (the outcome presentation included). */
  get fighting(): boolean {
    return this.registered && !this.ended;
  }

  /** Fighting and no outcome yet (the gate may close only then). */
  get contested(): boolean {
    return this.fighting && !this.outcomePlaying;
  }

  get done(): boolean {
    return this.ended;
  }

  /** The death is playing. */
  get outcomePlaying(): boolean {
    return this.outcomePlayingFlag;
  }

  get view(): SlagmawModel | null {
    return this.model;
  }

  /** Globs in the air (tests). */
  get liveSpits(): number {
    return this.projectiles.liveCount;
  }

  /** His crust is cooled: poise damage counts (tests). */
  get crustCooled(): boolean {
    return this.cooled;
  }

  /** A valve's spray is falling (tests). */
  get dousing(): boolean {
    return this.douseT > 0;
  }

  /** The eruption spot (tests). */
  eruptionSpot(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.spot);
  }

  /** How far up the worm is, 0..1 (tests). */
  get emergence(): number {
    return this.emerge;
  }

  /** The wheel of valve `index` (0-based), for tests. */
  valveWheel(index: number): ValveWheel | null {
    return this.valves[index]?.wheel ?? null;
  }

  feet(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position);
  }

  /** Starts the fight after the intro: registers the boss (bar and music follow `boss.started`), mounts the valves, starts the brain. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(
        this.actor.id,
        SLAGMAW_BOSS_DEF,
      );
    } catch (err) {
      this.warn(
        `could not register the Slagmaw: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
    this.registered = true;
    try {
      this.mountValves();
    } catch (err) {
      this.warn(`could not mount the coolant valves: ${err instanceof Error ? err.message : String(err)}`);
      this.mountFailed = true;
      this.finish("reset");
      return false;
    }
    this.sync();
    this.brain.start();
    return true;
  }

  /** Fixed tick: brain, emergence, facing, the tremor, cooling, poise regen, spits, fx and the death presentation. */
  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.model?.update(dt);
    this.cracks.update(dt);
    this.douse.update(dt);
    this.burst.update(dt);
    if (this.outcomePlayingFlag) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;
    this.projectiles.update(dt);

    const player = this.ctx.player.feet;
    const pos = this.root.position;
    const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.brain.tick(dt, { dist });
    if (this.ended || this.outcomePlayingFlag) return;
    this.tickTremor(dt, player);
    this.tickCooling(dt);
    this.tickEmergence(dt);
    this.sync();
    if (this.brain.exposed && dist > 1e-3) this.face(player);
    // Poise refills after 4 s without a landed hit, outside the stagger.
    if (this.brain.state !== "broken") {
      this.poiseIdle += dt;
      if (
        this.poiseIdle >= SLAGMAW.poiseRegenDelay &&
        this.actor.poise < this.actor.maxPoise
      )
        this.actor.restorePoise();
    }
  }

  /**
   * Ends the encounter without an outcome (player death, load, teardown): valves, spray, cracks and globs gone, the worm
   * despawned. `unregisterFirst` (teardown) makes the registry report `'unregistered'`; otherwise the despawn reports `'despawned'`.
   */
  reset(opts: { unregisterFirst?: boolean } = {}): void {
    if (this.ended) return;
    if (opts.unregisterFirst) this.dropRegistration();
    this.finish("reset");
  }

  // ---- SlagmawHooks ----

  tremor(swingId: number, leadSeconds: number, chained: boolean): void {
    this.ctx.events.emit("telegraph", {
      actorId: this.actor.id,
      kind: ERUPTION.telegraph,
      attackId: ERUPTION.attackId,
      moveId: `${SLAGMAW_BOSS_ID}.eruption`,
      swingId,
      leadSeconds,
    });
    this.tremorOn = true;
    this.tremorSwing = swingId;
    this.tremorT = 0;
    this.tremorLead = Math.max(0.05, leadSeconds);
    this.lockSpot(this.ctx.player.feet);
    this.cracks.show(this.spot, () =>
      Math.min(1, this.tremorT / this.tremorLead),
    );
    this.shake();
    this.sfx(chained ? "sfx.slagmaw.tremor.chain" : "sfx.slagmaw.tremor");
  }

  aim(): void {
    this.lockSpot(this.ctx.player.feet);
    this.cracks.mesh.position.set(this.spot.x, this.spot.y + 0.04, this.spot.z);
  }

  erupt(swingId: number): void {
    this.tremorOn = false;
    this.cracks.stop();
    this.root.position.copy(this.spot);
    this.model?.setTelegraph(0);
    this.burst.show(this.spot, CYCLE.eruptionRadius);
    this.sfx("sfx.slagmaw.erupt");
    this.sync();
    const player = this.ctx.player.actor;
    if (player.dead) return;
    const feet = this.ctx.player.feet;
    if (Math.abs(feet.y - this.spot.y) > HIT_HEIGHT) return;
    if (
      Math.hypot(feet.x - this.spot.x, feet.z - this.spot.z) >
      CYCLE.eruptionRadius
    )
      return;
    const direction = new THREE.Vector3(
      feet.x - this.spot.x,
      0,
      feet.z - this.spot.z,
    );
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, -1);
    direction.normalize();
    // Red: dodge only. A script hit has no attack window, so it is never parried.
    this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: player.id,
      amount: ERUPTION.damage,
      poise: ERUPTION.poise,
      kind: "melee",
      attackId: ERUPTION.attackId,
      swingId,
      direction,
      unblockable: true,
      parryable: false,
    });
  }

  spit(): void {
    const feet = this.ctx.player.feet;
    if (this.model) this.model.headWorld(this.tmp);
    else
      this.tmp.set(
        this.root.position.x,
        this.root.position.y + SPIT_MOVE.ranged!.originHeight,
        this.root.position.z,
      );
    this.spitFeet.set(
      this.tmp.x,
      this.tmp.y - SPIT_MOVE.ranged!.originHeight,
      this.tmp.z,
    );
    this.projectiles.fire(this.shooter, SPIT_MOVE, {
      x: feet.x,
      y: feet.y,
      z: feet.z,
    });
    this.sfx("sfx.slagmaw.spit");
  }

  tremorCancelled(swingId: number): void {
    this.ctx.events.emit("telegraph.cancelled", {
      actorId: this.actor.id,
      swingId,
    });
    this.tremorOn = false;
    this.cracks.stop();
    this.model?.setTelegraph(0);
  }

  submerge(): void {
    this.projectiles.cancelFor(this.actor.id);
    this.sync();
  }

  submerged(): void {
    this.sync();
  }

  stagger(): void {
    this.sync();
  }

  restorePoise(): void {
    this.actor.restorePoise();
    this.poiseIdle = 0;
  }

  // ---- internals ----

  /** The eruption spot: the player's feet, inside the arena, at floor height. */
  private lockSpot(feet: THREE.Vector3Like): void {
    this.spot.set(feet.x, this.places.centre.y, feet.z);
    clampToArena(this.spot, this.places.centre, ARENA.arenaHalfExtent);
  }

  private tickTremor(dt: number, player: THREE.Vector3Like): void {
    if (!this.tremorOn) return;
    this.tremorT += dt;
    // The spot follows the player until the lock, then holds (the cracks move with it).
    if (
      this.brain.state === "tremor" &&
      this.tremorT < this.tremorLead - CYCLE.aimLockBefore
    ) {
      this.lockSpot(player);
      this.cracks.mesh.position.set(
        this.spot.x,
        this.spot.y + 0.04,
        this.spot.z,
      );
    }
    this.model?.setTelegraph(Math.min(1, this.tremorT / this.tremorLead));
  }

  /** Walks the model's emergence toward what the brain wants (up when exposed, down otherwise). */
  private tickEmergence(dt: number): void {
    const want = this.brain.exposed ? 1 : 0;
    if (want > this.emerge)
      this.setEmergence(Math.min(1, this.emerge + dt / RISE_SECONDS));
    else if (want < this.emerge)
      this.setEmergence(Math.max(0, this.emerge - dt / CYCLE.submergeSeconds));
  }

  private setEmergence(e: number): void {
    this.emerge = e;
    if (this.model) this.model.setEmergence(e);
    else this.root.visible = e >= 0.05;
  }

  /** Hittable and lockable only above ground; a worm under the floor cannot be touched. */
  private sync(): void {
    if (!this.registered || this.outcomePlayingFlag || this.ended) return;
    const up = this.brain.exposed;
    this.actor.hittable = up;
    this.actor.untargetable = !up;
  }

  private face(player: THREE.Vector3Like): void {
    if (this.model) this.model.faceToward(player.x, player.z);
    else this.root.rotation.y = yawToward(this.root.position, player);
  }

  // ---- cooling ----

  private mountValves(): void {
    const ctx = this.ctx;
    this.places.valves.forEach((at, i) => {
      const phase = i + 1;
      const wheel = new ValveWheel({
        id: `valve:slagmaw-${phase}`,
        positions: COOLING.positions,
        onChange: (position) => {
          if (position !== 0) this.turned(i);
        },
      });
      const mesh = new THREE.Group();
      mesh.name = `slagmaw-valve-${phase}`;
      const post = new THREE.Mesh(POST_GEO, WHEEL_MAT);
      post.position.y = 0.55;
      const ring = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
      ring.position.y = 1.15;
      mesh.add(post, ring);
      mesh.position.copy(at);
      ctx.scene.add(mesh);
      const valve: Valve = { wheel, at, mesh, off: () => {}, spent: false };
      this.valves.push(valve);
      valve.off = ctx.interaction.register(
        valveInteractable(
          wheel,
          (out: THREE.Vector3) => out.set(at.x, at.y + 1, at.z),
          {
            radius: COOLING.interactRadius,
            // Valve N works only in phase N, only while he lives and only until it has produced a break.
            enabled: () =>
              this.contested &&
              this.phaseNow() === phase &&
              !valve.spent &&
              this.douseT <= 0 &&
              !this.cooled,
          },
        ),
      );
    });
  }

  private phaseNow(): number {
    return this.ctx.bosses.state(SLAGMAW_BOSS_ID)?.phase ?? this.brain.phase;
  }

  /** A valve wheel turned: the arena is doused around it for `COOLING.seconds`. */
  private turned(index: number): void {
    const valve = this.valves[index];
    if (!valve || !this.contested) return;
    valve.wheel.locked = true;
    this.douseValve = index;
    this.douseT = COOLING.seconds;
    this.douse.show(valve.at, COOLING.radius);
    this.sfx("sfx.slagmaw.valve");
    this.tickCooling(0);
  }

  /** The spray cools an exposed worm inside its disc; a cooled crust re-heats after `COOLING.seconds`. */
  private tickCooling(dt: number): void {
    if (this.douseT > 0) {
      this.douseT -= dt;
      const valve = this.valves[this.douseValve];
      if (!this.cooled && valve && this.brain.exposed) {
        const p = this.root.position;
        if (Math.hypot(p.x - valve.at.x, p.z - valve.at.z) <= COOLING.radius)
          this.cool();
      }
      if (this.douseT <= 0) {
        this.douseT = 0;
        this.douse.stop();
        // A spray that never found him, or a cooled crust that lapsed without a break, leaves the valve to be turned again.
        if (!this.cooled) this.rearm();
      }
    }
    if (this.cooled) {
      this.coolT -= dt;
      if (this.coolT <= 0) this.endCooling(true);
    }
  }

  /** The cooling hit: through A6b's `cooling` service when it can reach a boss, else its event directly. */
  private cool(): void {
    let hit = false;
    try {
      hit =
        this.ctx.services
          .get("cooling")
          ?.hit(this.actor.id, this.ctx.player.actor.id, "valve") ?? false;
    } catch (err) {
      this.warn(`cooling service failed: ${String(err)}`);
    }
    if (!hit)
      this.ctx.events.emit("cooling.hit", {
        actorId: this.actor.id,
        kind: "valve",
      });
    this.cooled = true;
    this.coolT = COOLING.seconds;
    this.model?.setCooled(true);
  }

  /** Re-heats (a break, a phase change, a lapse) and drops the spray; `restore` refills his poise. */
  private endCooling(restore: boolean): void {
    this.douseT = 0;
    this.douse.stop();
    if (this.cooled) {
      this.cooled = false;
      this.coolT = 0;
      this.model?.setCooled(false);
    }
    if (restore) this.restorePoise();
    this.rearm();
  }

  /** Every valve that has not produced a break can be turned again (when its phase is current). */
  private rearm(): void {
    for (const v of this.valves) {
      if (v.spent) continue;
      v.wheel.locked = false;
      v.wheel.set(0);
    }
  }

  /** Zeroes poise damage while the crust is hot; only a valve cool lets it through. */
  private crust(req: { targetId: string; poise?: number }): void {
    if (
      req.targetId !== this.actor.id ||
      !this.registered ||
      this.cooled ||
      this.outcomePlayingFlag
    )
      return;
    if (typeof req.poise === "number") req.poise *= SLAGMAW.hotPoiseScale;
  }

  /** Keeps health at or above the floor until the `last` break; clamps damage only, never poise. */
  private floor(req: { targetId: string; amount: number }): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered)
      return;
    const min = Math.ceil(this.actor.maxHealth * SLAGMAW.healthFloor);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  private shake(): void {
    try {
      this.ctx.services
        .get("vfx")
        ?.shake(CYCLE.shakeMetres, CYCLE.tremorSeconds);
    } catch (err) {
      this.warn(`camera shake failed: ${String(err)}`);
    }
  }

  private sfx(key: string): void {
    const audio = this.ctx.services.get("audio");
    if (!audio) return;
    try {
      audio.playAt(key, this.root.position);
    } catch {
      // the audio thread owns the keys; a missing one is silent
    }
  }

  // ---- outcome ----

  private outcome(): void {
    this.brain.onDefeated();
    this.outcomePlayingFlag = true;
    this.outcomeT = 0;
    this.tremorOn = false;
    this.cracks.stop();
    this.endCooling(false);
    this.projectiles.cancelFor(this.actor.id);
    this.model?.setTelegraph(0);
    this.actor.untargetable = true;
    this.actor.hittable = false;
    this.removeValves();
    // He is seen dying even if he was under the floor.
    this.setEmergence(1);
  }

  /** He sinks and his lava dies: down over `deathSeconds`, then the whole worm fades over `deathFadeSeconds`. */
  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    const t = this.outcomeT;
    this.setEmergence(
      Math.max(0.06, 1 - 0.9 * Math.min(1, t / PRESENTATION.deathSeconds)),
    );
    if (t >= PRESENTATION.deathSeconds)
      this.model?.setOpacity(
        Math.max(
          0,
          1 - (t - PRESENTATION.deathSeconds) / PRESENTATION.deathFadeSeconds,
        ),
      );
    if (t >= PRESENTATION.deathSeconds + PRESENTATION.deathFadeSeconds)
      this.finish("defeated");
  }

  private removeValves(): void {
    for (const v of this.valves) {
      v.wheel.locked = true;
      v.off();
      v.mesh.removeFromParent();
    }
  }

  private dropRegistration(): void {
    const off = this.unregister;
    this.unregister = null;
    off?.();
  }

  private finish(end: SlagmawEnd): void {
    if (this.ended) return;
    this.ended = true;
    for (const off of this.offs.splice(0)) off();
    // As Redmane: the registry drops the registration on `actor.despawned` (exactly one `boss.ended`); only a teardown
    // unregisters first.
    this.unregister = null;
    if (this.tremorOn) this.tremorCancelled(this.tremorSwing);
    this.projectiles.cancelFor(this.actor.id);
    this.projectiles.dispose();
    this.removeValves();
    this.valves = [];
    this.douseT = 0;
    this.cooled = false;
    if (this.ctx.actors.get(this.actor.id))
      this.ctx.actors.despawn(this.actor.id);
    this.cracks.dispose();
    this.douse.dispose();
    this.burst.dispose();
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
