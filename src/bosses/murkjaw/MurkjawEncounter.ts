import * as THREE from 'three';
import type { Actor } from '../../actors/Actor';
import type { BossDef } from '../../actors/BossRegistry';
import type { DamageResult } from '../../actors/DamageResolver';
import type { GameContext } from '../../core/Game';
import type { Interactable } from '../../interaction/InteractionSystem';
import { ARENA as DEEPS_ARENA } from '../../greyfen/deepsInterior';
import { ACT3_BOSS_RULES } from '../act3Bosses';
import type { InteriorsPort } from '../arena/BossArena';
import { ArenaFrame, distToSegment, nearestIndex } from './arenaGeometry';
import { MurkjawBrain, type MurkjawHooks } from './MurkjawBrain';
import type { MurkjawModel } from './MurkjawModel';
import { CrumbleDust, Splash, WaterBulge, WaveRing, spearMesh } from './murkjawFx';
import { SpearRacks } from './SpearRacks';
import {
  ARENA,
  BITE,
  CYCLE,
  DROP,
  HIT_HEIGHT,
  LUNGE,
  MURKJAW,
  MURKJAW_BOSS_ID,
  MURKJAW_KIND,
  MURKJAW_NAME_KEY,
  PRESENTATION,
  SFX,
  SPEARS,
  WAVE,
  levelScale,
  type MurkjawAttack,
} from './tuning';

export const MURKJAW_FLOOR_MODIFIER_ID = 'bosses.murkjaw.floor';
export const MURKJAW_JAW_MODIFIER_ID = 'bosses.murkjaw.jaw';
export const WAVE_PUSH_OWNER = 'bosses.murkjaw.wave';
export const SPEAR_THROW_ID = 'spear:murkjaw';
export const rackId = (n: number): string => `rack:murkjaw-${n}`;

/** No mercy (v0.7 item 13): the registry's zero window, outcome `defeated` only. No `BOSS_MERCY` row. */
export const MURKJAW_BOSS_DEF: BossDef = {
  bossId: MURKJAW_BOSS_ID,
  nameKey: MURKJAW_NAME_KEY,
  phases: MURKJAW.phases,
  breaksPerPhase: MURKJAW.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  ...ACT3_BOSS_RULES.murkjaw,
};

/** The player's capsule half-width: a hit lane or reach counts this much wider. */
const PLAYER_RADIUS = 0.4;
/** The channel water's surface under the walkway (K3). */
const WATER_BELOW = 0.3;
/** Seconds to rise out of the water and to sink back. */
const RISE_SECONDS = 0.25;
/** K3's phase 2 crossing (Deeps-local). */
const DROP_RECT = DEEPS_ARENA.crossings.drop;

export interface MurkjawPlaces {
  centre: THREE.Vector3;
  /** The walkway floor height. */
  floorY: number;
  frame: ArenaFrame;
  /** Six surfacing points over the channels, each paired with the beach point of the same index. */
  surfaces: THREE.Vector3[];
  beaches: THREE.Vector3[];
  racks: THREE.Vector3[];
}

export type MurkjawEnd = 'defeated' | 'reset';
export type DropState = 'standing' | 'crumbling' | 'dropped';

export interface MurkjawEncounterOptions {
  model: MurkjawModel | null;
  places: MurkjawPlaces;
  /** His level (the Greyfen's L + 5). */
  level: number;
  warn: (message: string) => void;
  onEnd: (end: MurkjawEnd) => void;
  rng?: () => number;
}

interface CombatVerbsPort {
  holdForcedMove?(owner: string, move: { x: number; z: number; speed: number } | null): void;
}

interface Flight {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  t: number;
  rack: number;
}

/**
 * One Murkjaw fight (plans/act3-K8.md): the actor and procedural eel, the registry registration, the brain's hooks (the bulge
 * telegraph, the whip bite, the water wave and its push, the lunge and the beaching), the jaw bonus, the spear racks, phase 2's
 * walkway drop, the health floor, poise regen and the death. The arena owns the trigger, intro, gate and reset rules; this
 * class owns everything that lives and dies with one Murkjaw.
 */
export class MurkjawEncounter implements MurkjawHooks {
  readonly actor: Actor;
  readonly brain: MurkjawBrain;
  readonly racks: SpearRacks;
  private readonly ctx: GameContext;
  private readonly model: MurkjawModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: MurkjawPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: MurkjawEnd) => void;
  private readonly scale: number;
  private readonly offs: (() => void)[] = [];
  private readonly interactables: (() => void)[] = [];
  private readonly bulgeFx = new WaterBulge();
  private readonly waveFx = new WaveRing();
  private readonly splash = new Splash();
  private readonly crumble = new CrumbleDust();
  private readonly rackMeshes: THREE.Group[] = [];
  private readonly aimAt = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private carried: THREE.Object3D | null = null;
  private flights: Flight[] = [];
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  private floorLifted = false;
  private phase2BreakDone = false;
  private poiseIdle = 0;
  private emerge = 0;
  private reachT = 0;
  private telegraphSwing = -1;
  private waveT = -1;
  private waveHit = false;
  private waveSwing = 0;
  private push: { x: number; z: number; left: number } | null = null;
  private _drop: DropState = 'standing';
  private crumbleT = 0;
  private outcomeT = 0;
  private outcomePlayingFlag = false;
  /** The last spear's damage result (tests). */
  lastSpearHit: DamageResult | null = null;

  constructor(ctx: GameContext, opts: MurkjawEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.scale = levelScale(opts.level);
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-murkjaw';
    this.placeAt(0);
    ctx.scene.add(this.root, this.bulgeFx.mesh, this.waveFx.mesh, this.splash.mesh, this.crumble.mesh);
    this.racks = new SpearRacks(opts.places.racks.length);

    this.actor = ctx.actors.spawn({
      kind: MURKJAW_KIND,
      team: 'hostile',
      level: opts.level,
      maxHealth: Math.round(MURKJAW.maxHealth * this.scale),
      maxPoise: MURKJAW.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      // Under the water through the intro.
      hittable: false,
    });
    this.actor.untargetable = true;
    this.setEmergence(0);
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(MURKJAW_JAW_MODIFIER_ID, (req) => this.jaw(req), MURKJAW.jawModifierOrder),
      ctx.damage.addModifier(MURKJAW_FLOOR_MODIFIER_ID, (req) => this.floor(req), MURKJAW.floorModifierOrder),
    );
    this.brain = new MurkjawBrain(this, opts.rng);

    const mine = (p: { bossId: string }) => p.bossId === MURKJAW_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        if (p.phase >= 2) this.phase2BreakDone = true;
        if (p.last) this.floorLifted = true;
        this.stopPush();
        this.brain.onBreak();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (!mine(p)) return;
        this.brain.onPhase(p.phase);
        if (p.phase >= 2 && this._drop === 'standing') this.startCrumble();
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome();
      }),
      ctx.events.on('damage.dealt', (r) => {
        if (r.targetId === this.actor.id && r.outcome === 'hit') this.poiseIdle = 0;
      }),
      ctx.events.on('trigger.exit', (e) => {
        // A spear carried out of the arena goes back on its rack.
        if (e.triggerId === ARENA.trigger && e.actorId === ctx.player.actor.id) this.dropCarried();
      }),
    );
  }

  get fighting(): boolean {
    return this.registered && !this.ended;
  }

  get contested(): boolean {
    return this.fighting && !this.outcomePlaying;
  }

  get done(): boolean {
    return this.ended;
  }

  get outcomePlaying(): boolean {
    return this.outcomePlayingFlag;
  }

  get view(): MurkjawModel | null {
    return this.model;
  }

  /** Phase 2's crossing: standing, crumbling (waiting for the player to step off) or dropped. */
  get drop(): DropState {
    return this._drop;
  }

  /** A wave push is holding the player (tests). */
  get pushing(): boolean {
    return this.push !== null;
  }

  /** Spears in the air (tests). */
  get spearsInFlight(): number {
    return this.flights.length;
  }

  /** Where his jaw is: on the beach point while it lies on a walkway, else over the surfacing point. */
  jawWorld(out: THREE.Vector3): THREE.Vector3 {
    const i = Math.max(0, this.brain.point);
    if (this.brain.jawOnWalkway) {
      const b = this.places.beaches[i];
      return out.set(b.x, this.places.floorY + 0.8, b.z);
    }
    const s = this.places.surfaces[i];
    return out.set(s.x, this.places.floorY + 2.4 * this.emerge, s.z);
  }

  /** Starts the fight after the intro: registers the boss (bar and music follow `boss.started`), mounts the racks, starts the brain. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, {
        ...MURKJAW_BOSS_DEF,
        // A break counts only while he is up (so it can always beach him in reach of a blade); one forced on him under the
        // water (a status tick) is refused and his poise restored.
        acceptBreak: () => {
          if (this.brain.exposed) return true;
          this.actor.restorePoise();
          return false;
        },
      });
    } catch (err) {
      this.warn(`could not register Murkjaw: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    try {
      this.mountRacks();
    } catch (err) {
      this.warn(`could not mount the spear racks: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.sync();
    this.brain.start();
    return true;
  }

  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.model?.update(dt);
    this.bulgeFx.update(dt);
    this.waveFx.update(dt);
    this.splash.update(dt);
    this.crumble.update(dt);
    if (this.outcomePlayingFlag) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;
    this.brain.tick(dt);
    if (this.ended || this.outcomePlayingFlag) return;
    this.racks.tick(dt);
    this.tickPose(dt);
    this.tickWave(dt);
    this.tickPush(dt);
    this.tickFlights(dt);
    this.tickDrop(dt);
    this.sync();
    if (this.brain.exposed) {
      this.poiseIdle += dt;
      if (this.poiseIdle >= MURKJAW.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.restorePoise();
    }
  }

  /** Ends the encounter without an outcome (player death, load, teardown). */
  reset(opts: { unregisterFirst?: boolean } = {}): void {
    if (this.ended) return;
    if (opts.unregisterFirst) {
      const off = this.unregister;
      this.unregister = null;
      off?.();
    }
    this.finish('reset');
  }

  // ---- MurkjawHooks ----

  pickPoint(attack: MurkjawAttack): number {
    const p = this.ctx.player.feet;
    // A lunge goes for the walkway nearest the player; anything else surfaces nearest them. Never the same spot twice running.
    const list = attack === 'lunge' ? this.places.beaches : this.places.surfaces;
    return nearestIndex(list, p, this.brain.point);
  }

  bulge(point: number, attack: MurkjawAttack, swingId: number, leadSeconds: number): void {
    this.placeAt(point);
    this.face(attack === 'lunge' ? this.places.beaches[point] : this.ctx.player.feet);
    const kind = attack === 'bite' ? BITE.telegraph : attack === 'wave' ? WAVE.telegraph : LUNGE.telegraph;
    const attackId = attack === 'bite' ? BITE.attackId : attack === 'wave' ? WAVE.attackId : LUNGE.attackId;
    this.ctx.events.emit('telegraph', { actorId: this.actor.id, kind, attackId, moveId: attackId, swingId, leadSeconds });
    this.telegraphSwing = swingId;
    this.aimAt.copy(this.ctx.player.feet);
    this.bulgeFx.show(this.waterAt(this.places.surfaces[point]), leadSeconds);
    this.sfx(SFX.gurgle);
  }

  aim(): void {
    this.aimAt.copy(this.ctx.player.feet);
  }

  strike(attack: MurkjawAttack, swingId: number): void {
    this.telegraphSwing = -1;
    this.bulgeFx.stop();
    const s = this.places.surfaces[this.brain.point];
    this.splash.show(this.waterAt(s), 2.2);
    if (attack === 'bite') {
      this.face(this.aimAt);
      this.sfx(SFX.bite);
      const dir = this.tmp.set(this.aimAt.x - s.x, 0, this.aimAt.z - s.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      dir.normalize();
      const end = { x: s.x + dir.x * BITE.reach, z: s.z + dir.z * BITE.reach };
      if (this.inReach((f) => distToSegment(f, s, end) <= BITE.halfWidth + PLAYER_RADIUS))
        this.hitPlayer(BITE.attackId, BITE.damage, BITE.poise, swingId, false);
    } else if (attack === 'wave') {
      this.sfx(SFX.wave);
      this.waveT = 0;
      this.waveHit = false;
      this.waveSwing = swingId;
      this.waveFx.show(this.waterAt(s), WAVE.radius, CYCLE.waveSeconds);
      this.tickWave(0);
    } else {
      this.sfx(SFX.lunge);
      const b = this.places.beaches[this.brain.point];
      this.face(b);
      const len = Math.hypot(b.x - s.x, b.z - s.z) || 1;
      const end = { x: b.x + ((b.x - s.x) / len) * LUNGE.overshoot, z: b.z + ((b.z - s.z) / len) * LUNGE.overshoot };
      if (this.inReach((f) => distToSegment(f, s, end) <= LUNGE.halfWidth + PLAYER_RADIUS))
        this.hitPlayer(LUNGE.attackId, LUNGE.damage, LUNGE.poise, swingId, true);
    }
    this.sync();
  }

  beach(): void {
    this.splash.show({ x: this.places.beaches[this.brain.point].x, y: this.places.floorY, z: this.places.beaches[this.brain.point].z }, 1.6);
    this.sfx(SFX.splash);
    this.sync();
  }

  slide(): void {
    this.sync();
  }

  sink(): void {
    this.splash.show(this.waterAt(this.places.surfaces[Math.max(0, this.brain.point)]), 1.8);
    this.sync();
  }

  submerged(): void {
    this.sync();
  }

  cancelTelegraph(swingId: number): void {
    this.ctx.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId });
    this.telegraphSwing = -1;
    this.bulgeFx.stop();
  }

  broken(): void {
    // Thrown onto the walkway in front of his spot, stunned: every class can reach the jaw.
    this.face(this.places.beaches[Math.max(0, this.brain.point)]);
    this.splash.show(this.waterAt(this.places.surfaces[Math.max(0, this.brain.point)]), 2.4);
    this.sfx(SFX.splash);
    this.sync();
  }

  restorePoise(): void {
    this.actor.restorePoise();
    this.poiseIdle = 0;
  }

  // ---- position and pose ----

  private waterAt(p: THREE.Vector3Like): THREE.Vector3 {
    return new THREE.Vector3(p.x, this.places.floorY - WATER_BELOW, p.z);
  }

  private placeAt(point: number): void {
    const s = this.places.surfaces[point] ?? this.places.centre;
    this.root.position.set(s.x, this.places.floorY - WATER_BELOW, s.z);
  }

  private face(at: THREE.Vector3Like): void {
    if (this.model) this.model.faceToward(at.x, at.z);
    else {
      const dx = at.x - this.root.position.x;
      const dz = at.z - this.root.position.z;
      if (Math.hypot(dx, dz) > 1e-6) this.root.rotation.y = Math.atan2(-dx, -dz);
    }
  }

  /** Walks the emergence and the reach toward what the brain's state wants. */
  private tickPose(dt: number): void {
    const st = this.brain.state;
    const lunging = st === 'strike' && this.brain.attack === 'lunge';
    const onDeck = st === 'beached' || st === 'broken';
    const wantE = st === 'surfaced' || (st === 'strike' && this.brain.attack === 'bite') ? 1 : lunging || onDeck || st === 'sliding' ? 0.5 : 0;
    const rate = wantE > this.emerge ? RISE_SECONDS : CYCLE.sinkSeconds;
    this.setEmergence(wantE > this.emerge ? Math.min(wantE, this.emerge + dt / rate) : Math.max(wantE, this.emerge - dt / rate));
    let wantR = 0;
    let rate2: number = CYCLE.slideSeconds;
    if (lunging) (wantR = 1), (rate2 = CYCLE.lungeSeconds);
    else if (onDeck) (wantR = 1), (rate2 = 0.2);
    this.reachT = wantR > this.reachT ? Math.min(wantR, this.reachT + dt / rate2) : Math.max(wantR, this.reachT - dt / rate2);
    if (this.model) {
      const i = Math.max(0, this.brain.point);
      const s = this.places.surfaces[i];
      const b = this.places.beaches[i];
      this.model.setReach(this.reachT, Math.hypot(b.x - s.x, b.z - s.z));
    }
    if (st === 'surfaced' && this.model) this.face(this.ctx.player.feet);
  }

  private setEmergence(e: number): void {
    this.emerge = e;
    if (this.model) this.model.setEmergence(e);
    else this.root.visible = e >= 0.05 || this.reachT > 0;
  }

  /** Hittable and lockable only above the water. */
  private sync(): void {
    if (!this.registered || this.outcomePlayingFlag || this.ended) return;
    const up = this.brain.exposed;
    this.actor.hittable = up;
    this.actor.untargetable = !up;
  }

  // ---- hits on the player ----

  /** The player's feet pass `test` and stand at the walkway's height (not under it, not far above). */
  private inReach(test: (feet: THREE.Vector3Like) => boolean): boolean {
    const player = this.ctx.player.actor;
    if (player.dead) return false;
    const f = this.ctx.player.feet;
    if (Math.abs(f.y - this.places.floorY) > HIT_HEIGHT) return false;
    return test(f);
  }

  private hitPlayer(attackId: string, damage: number, poise: number, swingId: number, unblockable: boolean): DamageResult | null {
    const f = this.ctx.player.feet;
    const direction = new THREE.Vector3(f.x - this.root.position.x, 0, f.z - this.root.position.z);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, -1);
    direction.normalize();
    return this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: this.ctx.player.actor.id,
      amount: Math.round(damage * this.scale),
      poise,
      kind: 'melee',
      attackId,
      swingId,
      direction,
      unblockable,
      parryable: false,
    });
  }

  /** The wave's ring spreads to `WAVE.radius` over `CYCLE.waveSeconds`; it hits the player once as it passes them. */
  private tickWave(dt: number): void {
    if (this.waveT < 0) return;
    this.waveT += dt;
    const s = this.places.surfaces[this.brain.point];
    const r = WAVE.radius * Math.min(1, this.waveT / CYCLE.waveSeconds);
    if (!this.waveHit && s) {
      const f = this.ctx.player.feet;
      const d = Math.hypot(f.x - s.x, f.z - s.z);
      if (d <= r + PLAYER_RADIUS && this.inReach(() => true)) {
        this.waveHit = true;
        const res = this.hitPlayer(WAVE.attackId, WAVE.damage, WAVE.poise, this.waveSwing, true);
        // A dodge's i-frames (immune) skip the shove too.
        if (res && res.outcome === 'hit' && !this.ctx.player.actor.dead) {
          const len = d > 1e-3 ? d : 1;
          const dx = d > 1e-3 ? (f.x - s.x) / len : 0;
          const dz = d > 1e-3 ? (f.z - s.z) / len : 1;
          this.push = { x: dx, z: dz, left: WAVE.pushSeconds };
        }
      }
    }
    if (this.waveT >= CYCLE.waveSeconds) this.waveT = -1;
  }

  /** Holds the shove away from him, cut short the moment the next step would leave the walkway (it never pushes into a channel). */
  private tickPush(dt: number): void {
    const p = this.push;
    if (!p) return;
    const verbs = this.verbs();
    const f = this.ctx.player.feet;
    const step = WAVE.pushSpeed * dt;
    const room = this.places.frame.safePush(f, p, step, WAVE.edgeMargin, this._drop !== 'dropped', 0.05);
    p.left -= dt;
    if (p.left <= 0 || room < step * 0.5 || this.ctx.player.actor.dead) {
      this.stopPush();
      return;
    }
    verbs?.holdForcedMove?.(WAVE_PUSH_OWNER, { x: p.x, z: p.z, speed: WAVE.pushSpeed });
  }

  private stopPush(): void {
    if (!this.push) return;
    this.push = null;
    try {
      this.verbs()?.holdForcedMove?.(WAVE_PUSH_OWNER, null);
    } catch (err) {
      this.warn(`could not release the wave push: ${String(err)}`);
    }
  }

  private verbs(): CombatVerbsPort | undefined {
    return (this.ctx.services.get as (n: string) => unknown)('combatVerbs') as CombatVerbsPort | undefined;
  }

  // ---- the jaw, the floor ----

  /** x1.5 damage and poise on every hit while his jaw lies on a walkway. */
  private jaw(req: { targetId: string; amount: number; poise: number }): void {
    if (req.targetId !== this.actor.id || !this.registered || this.outcomePlayingFlag || !this.brain.jawOnWalkway) return;
    req.amount *= MURKJAW.jawScale;
    req.poise *= MURKJAW.jawScale;
  }

  /** Keeps health at or above the floor until the `last` break, and above phase 3 until a phase 2 break (the Slagmaw rule). */
  private floor(req: { targetId: string; amount: number }): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered) return;
    let min = Math.ceil(this.actor.maxHealth * MURKJAW.healthFloor);
    const phase3 = MURKJAW.phases[1];
    if (!this.phase2BreakDone && phase3 !== undefined) min = Math.max(min, Math.floor(this.actor.maxHealth * phase3) + 1);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  // ---- spear racks ----

  private mountRacks(): void {
    const ctx = this.ctx;
    this.places.racks.forEach((at, i) => {
      const mesh = new THREE.Group();
      mesh.name = `murkjaw-rack-${i + 1}`;
      for (let k = 0; k < SPEARS.perRack; k++) {
        const s = spearMesh();
        s.rotation.x = -Math.PI / 2 + 0.12;
        s.position.set((k - 1) * 0.35, 1.05, 0);
        mesh.add(s);
      }
      mesh.position.copy(at);
      ctx.scene.add(mesh);
      this.rackMeshes.push(mesh);
      const rack: Interactable = {
        id: rackId(i + 1),
        kind: 'pickup',
        position: (out) => out.set(at.x, at.y + 1, at.z),
        radius: SPEARS.rackRadius,
        promptKey: 'murkjaw.rack.take',
        promptParams: () => ({ count: this.racks.count(i) }),
        enabled: () => this.contested && this.racks.canTake(i),
        onInteract: () => this.take(i),
      };
      this.interactables.push(ctx.interaction.register(rack));
    });
    const thrower: Interactable = {
      id: SPEAR_THROW_ID,
      kind: 'use',
      position: (out) => this.jawWorld(out),
      radius: SPEARS.range,
      coneDegrees: 360,
      priority: 5,
      promptKey: 'murkjaw.spear.throw',
      enabled: () => this.contested && this.racks.carrying && this.brain.exposed,
      onInteract: () => this.throwSpear(),
    };
    this.interactables.push(ctx.interaction.register(thrower));
    this.syncRacks();
  }

  /** Takes a spear from rack `i` (0-based): shown on the player's back until thrown. */
  take(i: number): boolean {
    if (!this.contested || !this.racks.take(i)) return false;
    this.syncRacks();
    const back = this.ctx.player.actor.root;
    if (back) {
      const m = spearMesh();
      m.position.set(0.15, 1.2, 0.25);
      m.rotation.set(-Math.PI / 2 + 0.35, 0, 0.3);
      back.add(m);
      this.carried = m;
    }
    return true;
  }

  /** Throws the carried spear at the jaw: it homes in over `SPEARS.flightSeconds` and lands if he is still up. */
  throwSpear(): boolean {
    if (!this.contested || !this.racks.carrying || !this.brain.exposed) return false;
    const rack = this.racks.throw();
    this.removeCarried();
    const f = this.ctx.player.feet;
    const mesh = spearMesh();
    const from = new THREE.Vector3(f.x, f.y + 1.6, f.z);
    mesh.position.copy(from);
    this.ctx.scene.add(mesh);
    this.flights.push({ mesh, from, t: 0, rack });
    return true;
  }

  private tickFlights(dt: number): void {
    if (this.flights.length === 0) return;
    const jaw = this.jawWorld(this.tmp);
    for (const fl of [...this.flights]) {
      fl.t += dt;
      const k = Math.min(1, fl.t / SPEARS.flightSeconds);
      fl.mesh.position.lerpVectors(fl.from, jaw, k);
      fl.mesh.position.y += Math.sin(k * Math.PI) * 0.8;
      fl.mesh.lookAt(jaw);
      if (k < 1) continue;
      this.flights.splice(this.flights.indexOf(fl), 1);
      fl.mesh.removeFromParent();
      if (!this.brain.exposed || !this.contested) {
        // He went under before it landed: the spear is fished back onto its rack.
        this.racks.returnTo(fl.rack);
        this.syncRacks();
        continue;
      }
      const dir = new THREE.Vector3(jaw.x - fl.from.x, 0, jaw.z - fl.from.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      this.lastSpearHit = this.ctx.damage.apply({
        attackerId: this.ctx.player.actor.id,
        targetId: this.actor.id,
        amount: SPEARS.damage,
        poise: SPEARS.poise,
        kind: 'melee',
        attackId: SPEARS.attackId,
        direction: dir.normalize(),
      });
    }
  }

  private syncRacks(): void {
    this.rackMeshes.forEach((m, i) => m.children.forEach((c, k) => (c.visible = k < this.racks.count(i))));
  }

  private removeCarried(): void {
    this.carried?.removeFromParent();
    this.carried = null;
  }

  /** The carried spear goes back on its rack (the player left the arena, died, or the fight ended). */
  private dropCarried(): void {
    if (!this.racks.carrying) return;
    this.racks.putBack();
    this.removeCarried();
    this.syncRacks();
  }

  // ---- phase 2's drop ----

  private dropRectWorld(): { x0: number; z0: number; x1: number; z1: number } {
    const f = this.places.frame;
    const r = DROP_RECT;
    return { x0: r.x0 + f.ox, z0: r.z0 + f.oz, x1: r.x1 + f.ox, z1: r.z1 + f.oz };
  }

  private startCrumble(): void {
    this._drop = 'crumbling';
    this.crumbleT = 0;
    this.crumble.show(this.dropRectWorld(), this.places.floorY);
    this.sfx(SFX.crumble);
  }

  /** The crossing drops once it has crumbled for `DROP.crumbleSeconds` and the player is off it (and clear by a metre). */
  private tickDrop(dt: number): void {
    if (this._drop !== 'crumbling') return;
    this.crumbleT += dt;
    if (this.crumbleT < DROP.crumbleSeconds) return;
    const f = this.ctx.player.feet;
    if (this.places.frame.nearDrop(f.x, f.z, DROP.clearMargin) && Math.abs(f.y - this.places.floorY) < HIT_HEIGHT) return;
    this._drop = 'dropped';
    this.crumble.stop();
    this.setDropBlocker(false);
    this.sfx(SFX.splash);
  }

  private setDropBlocker(closed: boolean): void {
    try {
      (this.interiors()?.setBlocker as ((id: string, c: boolean) => unknown) | undefined)?.(ARENA.drop, closed);
    } catch (err) {
      this.warn(`could not ${closed ? 'raise' : 'drop'} the crossing (${String(err)})`);
    }
  }

  private interiors(): InteriorsPort | undefined {
    return (this.ctx.services.get as (n: string) => unknown)('interiors') as InteriorsPort | undefined;
  }

  private sfx(key: string): void {
    const audio = this.ctx.services.get('audio');
    if (!audio) return;
    try {
      audio.playAt(key, this.root.position);
    } catch {
      // the audio side owns the keys; a missing one is silent
    }
  }

  // ---- outcome ----

  private outcome(): void {
    this.brain.onDefeated();
    this.outcomePlayingFlag = true;
    this.outcomeT = 0;
    this.stopPush();
    this.bulgeFx.stop();
    this.actor.untargetable = true;
    this.actor.hittable = false;
    this.dropCarried();
    this.removeInteractables();
    this.setEmergence(1);
    this.sfx(SFX.death);
  }

  /** He rolls belly-up and sinks, then fades. */
  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    const t = this.outcomeT;
    const k = Math.min(1, t / PRESENTATION.deathSeconds);
    this.model?.setRoll(k);
    this.setEmergence(Math.max(0.06, 1 - 0.8 * k));
    if (t >= PRESENTATION.deathSeconds)
      this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.deathSeconds) / PRESENTATION.deathFadeSeconds));
    if (t >= PRESENTATION.deathSeconds + PRESENTATION.deathFadeSeconds) this.finish('defeated');
  }

  private removeInteractables(): void {
    for (const off of this.interactables.splice(0)) off();
  }

  private finish(end: MurkjawEnd): void {
    if (this.ended) return;
    this.ended = true;
    for (const off of this.offs.splice(0)) off();
    // The registry drops the registration on `actor.despawned` (one `boss.ended`); only a teardown unregisters first.
    this.unregister = null;
    if (this.telegraphSwing >= 0) this.cancelTelegraph(this.telegraphSwing);
    this.stopPush();
    this.dropCarried();
    this.racks.reset();
    this.removeInteractables();
    for (const m of this.rackMeshes.splice(0)) m.removeFromParent();
    for (const fl of this.flights.splice(0)) fl.mesh.removeFromParent();
    // The crossing stands again after every end, so a later visit finds the whole arena.
    if (this._drop !== 'standing') {
      this.crumble.stop();
      this.setDropBlocker(true);
      this._drop = 'standing';
    }
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    this.bulgeFx.dispose();
    this.waveFx.dispose();
    this.splash.dispose();
    this.crumble.dispose();
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
