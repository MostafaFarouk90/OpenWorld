import * as THREE from 'three';
import type { Actor } from '../../actors/Actor';
import type { BossDef } from '../../actors/BossRegistry';
import { playEnsured } from '../../audio/act2SfxEnsure';
import type { GameContext } from '../../core/Game';
import type { Interactable } from '../../interaction/InteractionSystem';
import { ACT3_BOSS_RULES } from '../act3Bosses';
import { SkarlBrain, type SkarlHooks, type SkarlSense } from './SkarlBrain';
import type { SkarlModel, SkarlClip } from './SkarlModel';
import { boltMesh } from './skarlFx';
import {
  ARENA,
  BOLT,
  CHAIN,
  DRAKE_SPAWNER,
  FAVOUR,
  KICK,
  LEVER,
  PRESENTATION,
  SFX,
  SKARL,
  SKARL_BOSS_ID,
  SKARL_CHAIN_ID,
  SKARL_KIND,
  SKARL_LEVER_ID,
  SKARL_NAME_KEY,
  skarlScale,
} from './tuning';

export const SKARL_FLOOR_MODIFIER_ID = 'bosses.corvin-skarl.floor';
export const SKARL_BROKEN_MODIFIER_ID = 'bosses.corvin-skarl.broken';
export const KICK_SHOVE_OWNER = 'bosses.corvin-skarl.kick';

/** The Spare at the last break (v0.7 item 13): window 6 s, outcome `spared`; Oswin +3 is the `BOSS_MERCY` row's. */
export const SKARL_BOSS_DEF: BossDef = {
  bossId: SKARL_BOSS_ID,
  nameKey: SKARL_NAME_KEY,
  phases: SKARL.phases,
  breaksPerPhase: SKARL.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: SKARL.releaseWindowSeconds,
  ...ACT3_BOSS_RULES['corvin-skarl'],
};

/** The player's capsule half-width and height. */
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.8;
/** Bolts leave his chest at this height. */
const MUZZLE = 1.4;
const BOLT_CAPACITY = 8;

export interface SkarlPlaces {
  centre: THREE.Vector3;
  /** Where he steps out and faces (K4's `.skarl`). */
  skarl: THREE.Vector3;
  skarlYaw: number;
  /** K4's `dragonspine.aerie.chain-post` stand point (the lever). */
  post: THREE.Vector3;
  /** Ground height under (x, z), relative to the centre's height. */
  groundAt(x: number, z: number): number;
}

export type SkarlEnd = 'spared' | 'defeated' | 'reset';

interface CombatVerbsPort {
  holdForcedMove?(owner: string, move: { x: number; z: number; speed: number } | null): void;
}

interface EnemiesPort {
  spawnGroup?(spawnerId: string): string[];
  despawnGroup?(spawnerId: string): void;
}

interface DrakesPort {
  chain(spawnerId: string, postAnchor: string, opts?: { length?: number; until?: { all?: readonly string[] } }): () => void;
  chainLow(actorId: string): { x: number; y: number; z: number } | null;
  strike(actorId: string, by: string | null): boolean;
  release(actorId: string): boolean;
}

export interface SkarlEncounterOptions {
  model: SkarlModel | null;
  places: SkarlPlaces;
  level: number;
  warn: (message: string) => void;
  onEnd: (end: SkarlEnd) => void;
}

interface Bolt {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  travelled: number;
  swingId: number;
}

/**
 * One Skarl fight (plans/act3-K8-pr2.md): his actor and model, the registry registration, the brain's hooks (bolt aim and
 * flight, the kick and its shove), strafing on the courtyard, the drake (spawned, chained to the post, freed at the last break),
 * the chain strike and the post's lever (forced breaks through the one `acceptBreak` hook), the kneel x1.25, phase holds and the
 * floor, poise regen, the dragons favour of the outcome, and the Spare or the death. The director owns starting and ending.
 */
export class SkarlEncounter implements SkarlHooks {
  readonly actor: Actor;
  readonly brain: SkarlBrain;
  private readonly ctx: GameContext;
  private readonly model: SkarlModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: SkarlPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: SkarlEnd) => void;
  private readonly scale: number;
  private readonly offs: (() => void)[] = [];
  private readonly interactables: (() => void)[] = [];
  private bolts: Bolt[] = [];
  private unregister: (() => void) | null = null;
  private unchain: (() => void) | null = null;
  private registered = false;
  private ended = false;
  private floorLifted = false;
  private phase1BreakDone = false;
  private phase2BreakDone = false;
  private poiseIdle = 0;
  private telegraphT = -1;
  private telegraphLead = 1;
  private telegraphSwing = -1;
  private loopClip: SkarlClip | null = null;
  private lastOneShot: SkarlClip | null = null;
  private strafeSign = 1;
  private strafeT = 0;
  private shove: { x: number; z: number; left: number } | null = null;
  private landedT = 0;
  private leverT = 0;
  private outcomeKind: 'spared' | 'defeated' | null = null;
  private outcomeT = 0;
  private favourPaid = false;
  private _drakeId: string | null = null;
  private drakeFreed = false;
  /** Forced breaks taken (tests and the real-game log). */
  forcedBreaks = 0;
  /** Metres of the last kick's shove after the ring clamp (tests). */
  lastShoveMetres = 0;

  constructor(ctx: GameContext, opts: SkarlEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.scale = skarlScale(opts.level);
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-corvin-skarl';
    this.root.position.copy(opts.places.skarl);
    this.root.rotation.set(0, opts.places.skarlYaw, 0);
    ctx.scene.add(this.root);

    this.actor = ctx.actors.spawn({
      kind: SKARL_KIND,
      team: 'hostile',
      level: opts.level,
      maxHealth: Math.round(SKARL.maxHealth * this.scale),
      maxPoise: SKARL.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      // Out of the fight until register(): the intro shows him stepping out, not fighting.
      hittable: false,
    });
    this.actor.untargetable = true;
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(SKARL_BROKEN_MODIFIER_ID, (req) => this.kneeling(req), SKARL.brokenModifierOrder),
      ctx.damage.addModifier(SKARL_FLOOR_MODIFIER_ID, (req) => this.floor(req), SKARL.floorModifierOrder),
    );
    this.brain = new SkarlBrain(this);

    const mine = (p: { bossId: string }) => p.bossId === SKARL_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        // Each phase holds until its own break (the floor), so a break always lands in its phase.
        if (p.phase === 1) this.phase1BreakDone = true;
        if (p.phase === 2) this.phase2BreakDone = true;
        if (p.last) {
          this.floorLifted = true;
          // The chain gives at the last break: the drake is freed before the Spare window, so no dive can fall in it.
          this.freeDrake();
        }
        this.stopShove();
        this.clearBolts();
        this.brain.onBreak();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (mine(p)) this.brain.onPhase(p.phase);
      }),
      ctx.events.on('boss.releaseWindow', (p) => {
        if (!mine(p)) return;
        this.brain.onReleaseWindow(p.open);
        if (p.open) {
          this.freeDrake();
          this.endTelegraph();
          this.clearBolts();
          this.stopShove();
        }
      }),
      ctx.events.on('boss.spared', (p) => {
        if (mine(p)) this.outcome('spared');
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome('defeated');
      }),
      ctx.events.on('damage.dealt', (r) => {
        if (r.targetId === this.actor.id && r.outcome === 'hit') this.poiseIdle = 0;
      }),
      ctx.events.on('wyrm.drake.landed', (e) => {
        if (e.actorId === this._drakeId && !this.drakeFreed) this.landedT = CHAIN.landedSeconds;
      }),
      // Any player hit on the drake while it is down strikes its chain too, so bows and spells reach it (review S4).
      ctx.events.on('damage.dealt', (r) => {
        if (r.targetId === this._drakeId && r.attackerId === ctx.player.actor.id && this.chainOpen) this.strikeChain();
      }),
      ctx.events.on('wyrm.drake.freed', (e) => {
        if (e.actorId === this._drakeId) this.drakeFreed = true;
      }),
    );
    this.loop('idle');
  }

  get fighting(): boolean {
    return this.registered && !this.ended;
  }

  /** Fighting and no outcome playing. */
  get contested(): boolean {
    return this.fighting && this.outcomeKind === null;
  }

  get done(): boolean {
    return this.ended;
  }

  get outcomePlaying(): boolean {
    return this.outcomeKind !== null;
  }

  get view(): SkarlModel | null {
    return this.model;
  }

  get drakeId(): string | null {
    return this._drakeId;
  }

  get drakeIsFree(): boolean {
    return this.drakeFreed;
  }

  /** The drake is down and the chain can be struck. */
  get chainOpen(): boolean {
    return this.contested && !this.drakeFreed && this._drakeId !== null && this.landedT > 0;
  }

  /** Seconds before the lever works again (0: ready). */
  get leverCooldown(): number {
    return this.leverT;
  }

  /** The kick's shove is holding the player (the director's ring timer ignores it). */
  get shoving(): boolean {
    return this.shove !== null;
  }

  get boltsInFlight(): number {
    return this.bolts.length;
  }

  feet(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position);
  }

  /** Starts the fight after the intro: registers the boss, spawns and chains the drake, mounts the lever and chain, starts the brain. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, {
        ...SKARL_BOSS_DEF,
        // Poise breaks and the chain's forced breaks both count; none while he kneels in the window or dies.
        acceptBreak: () => {
          const st = this.brain.state;
          if (st === 'window' || st === 'dying' || st === 'idle') {
            this.actor.restorePoise();
            return false;
          }
          return true;
        },
      });
    } catch (err) {
      this.warn(`could not register Skarl: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    this.actor.hittable = true;
    this.actor.untargetable = false;
    this.spawnDrake();
    this.mountInteractables();
    this.brain.start();
    return true;
  }

  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.model?.update(dt);
    if (this.outcomeKind) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;
    this.landedT = Math.max(0, this.landedT - dt);
    this.leverT = Math.max(0, this.leverT - dt);
    this.tickBolts(dt);
    this.tickShove(dt);
    // A bolt can kill the player, and the director then ends the fight inside this tick (review S1).
    if (this.ended || this.outcomeKind) return;
    const p = this.ctx.player.feet;
    const pos = this.root.position;
    const sense: SkarlSense = { dist: Math.hypot(p.x - pos.x, p.z - pos.z), onPostLane: this.onPostLane() };
    this.brain.tick(dt, sense);
    if (this.ended || this.outcomeKind) return;
    this.move(dt);
    this.glow(dt);
    const st = this.brain.state;
    if (st !== 'broken' && st !== 'window') {
      this.poiseIdle += dt;
      if (this.poiseIdle >= SKARL.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.restorePoise();
    }
  }

  /** Ends the encounter without an outcome (player death, leaving, load, teardown). */
  reset(opts: { unregisterFirst?: boolean } = {}): void {
    if (this.ended) return;
    if (opts.unregisterFirst) {
      const off = this.unregister;
      this.unregister = null;
      off?.();
    }
    this.finish('reset');
  }

  /**
   * A forced break (the chain struck while the drake is down, or the lever): staggers him through the damage resolver, so the
   * registry counts it through `acceptBreak` like any break. False when there is no fight or he cannot break now.
   */
  forceBreak(): boolean {
    if (!this.contested) return false;
    const st = this.brain.state;
    if (st === 'broken' || st === 'window' || st === 'dying' || st === 'idle') return false;
    if (this.actor.poise <= 0) this.actor.restorePoise();
    const ok = this.ctx.damage.stagger(this.actor.id, this.ctx.player.actor.id, Math.max(1, this.actor.poise));
    if (ok) this.forcedBreaks++;
    return ok;
  }

  /** F at the chain's low point while the drake is down. */
  strikeChain(): boolean {
    if (!this.chainOpen || !this._drakeId) return false;
    const drakes = this.drakes();
    let struck = false;
    try {
      struck = drakes ? drakes.strike(this._drakeId, this.ctx.player.actor.id) : false;
    } catch (err) {
      this.warn(`chain strike failed (${String(err)})`);
    }
    if (!struck) return false;
    this.landedT = 0;
    this.sfx(SFX.chain);
    return this.forceBreak();
  }

  /** F at the post: the lever jerks the chain (a forced break), then waits `LEVER.cooldown`. */
  pullLever(): boolean {
    if (!this.contested || this.leverT > 0 || this.drakeFreed || this.floorLifted) return false;
    if (!this.forceBreak()) return false;
    this.leverT = LEVER.cooldown;
    this.sfx(SFX.lever);
    return true;
  }

  // ---- SkarlHooks ----

  telegraph(attackId: string, kind: 'block' | 'dodge', swingId: number, leadSeconds: number): void {
    if (!this.contested) return;
    this.ctx.events.emit('telegraph', { actorId: this.actor.id, kind, attackId, moveId: attackId, swingId, leadSeconds });
    this.telegraphSwing = swingId;
    this.telegraphT = 0;
    this.telegraphLead = Math.max(0.05, leadSeconds);
    this.oneShot(attackId === KICK.attackId ? 'kick' : 'aim');
  }

  cancelTelegraph(swingId: number): void {
    this.ctx.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId });
    if (swingId === this.telegraphSwing) this.endTelegraph();
  }

  loose(swingId: number, index: number, count: number, fan: boolean): void {
    if (!this.contested) return;
    this.endTelegraph();
    if (index === 0 || !fan) this.oneShot('shoot');
    if (this.bolts.length >= BOLT_CAPACITY) return;
    const pos = this.root.position;
    const from = new THREE.Vector3(pos.x, pos.y + MUZZLE, pos.z);
    const f = this.ctx.player.feet;
    const dir = new THREE.Vector3(f.x - from.x, f.y + BOLT.height - from.y, f.z - from.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    if (fan && count > 1) {
      const a = THREE.MathUtils.degToRad(BOLT.fanDegrees) * (index - (count - 1) / 2);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    }
    const mesh = boltMesh();
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.ctx.scene.add(mesh);
    this.bolts.push({ mesh, pos: from, dir, travelled: 0, swingId });
    this.face(f);
    if (index === 0) this.sfx(SFX.loose);
  }

  kick(swingId: number): void {
    if (!this.contested) return;
    this.endTelegraph();
    this.sfx(SFX.kick);
    const f = this.ctx.player.feet;
    const pos = this.root.position;
    const dx = f.x - pos.x;
    const dz = f.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (this.ctx.player.actor.dead || d > KICK.reach + PLAYER_RADIUS || Math.abs(f.y - pos.y) > 1.5) return;
    const dir = d > 1e-3 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(0, 0, -1);
    const res = this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: this.ctx.player.actor.id,
      amount: Math.round(KICK.damage * this.scale),
      poise: KICK.poise,
      kind: 'melee',
      attackId: KICK.attackId,
      swingId,
      direction: dir,
      unblockable: false,
      parryable: false,
    });
    if (!res || res.outcome !== 'hit' || this.ctx.player.actor.dead) return;
    // The shove, clamped so it never carries the player out past the ring (review: a kick alone never ends the fight).
    const c = this.places.centre;
    let metres = KICK.shoveMetres;
    for (let m = KICK.shoveMetres; m > 0; m -= 0.25) {
      if (Math.hypot(f.x + dir.x * m - c.x, f.z + dir.z * m - c.z) <= ARENA.ring - 2) break;
      metres = m - 0.25;
    }
    this.lastShoveMetres = Math.max(0, metres);
    if (metres <= 0) return;
    this.shove = { x: dir.x, z: dir.z, left: KICK.shoveSeconds * (metres / KICK.shoveMetres) };
    this.verbs()?.holdForcedMove?.(KICK_SHOVE_OWNER, { x: dir.x, z: dir.z, speed: KICK.shoveMetres / KICK.shoveSeconds });
  }

  broken(): void {
    this.endTelegraph();
    this.oneShot('kneel');
    this.sfx(SFX.chain);
  }

  restorePoise(): void {
    this.actor.restorePoise();
    this.poiseIdle = 0;
  }

  // ---- internals ----

  private spawnDrake(): void {
    const enemies = this.ctx.services.get('enemies') as EnemiesPort | undefined;
    try {
      const ids = enemies?.spawnGroup?.(DRAKE_SPAWNER) ?? [];
      this._drakeId = ids[0] ?? null;
    } catch (err) {
      this.warn(`could not spawn the drake (${String(err)})`);
    }
    if (!this._drakeId) {
      this.warn('no drake: the chain and its strike are out of this fight (the lever still works)');
      return;
    }
    const drakes = this.drakes();
    try {
      // No `until`: the tether reads boolean flags and the outcome is a string; the release and the unchain on every end free it.
      this.unchain = drakes?.chain(DRAKE_SPAWNER, ARENA.post) ?? null;
    } catch (err) {
      this.warn(`could not chain the drake (${String(err)})`);
    }
  }

  /** Frees the drake once (at the last break, or on the outcome if that comes first): it flies off on K6a's path. */
  private freeDrake(): void {
    if (this.drakeFreed || !this._drakeId) return;
    this.drakeFreed = true;
    this.landedT = 0;
    try {
      this.drakes()?.release(this._drakeId);
    } catch (err) {
      this.warn(`could not free the drake (${String(err)})`);
    }
  }

  private mountInteractables(): void {
    const post = this.places.post;
    const lever: Interactable = {
      id: SKARL_LEVER_ID,
      kind: 'use',
      position: (out) => out.set(post.x, post.y + 1, post.z),
      radius: LEVER.radius,
      coneDegrees: 360,
      promptKey: 'skarl.lever',
      priority: 2,
      enabled: () => this.contested && this.leverT <= 0 && !this.drakeFreed && !this.floorLifted && this.brain.state !== 'broken' && this.brain.state !== 'window',
      onInteract: () => void this.pullLever(),
    };
    const chain: Interactable = {
      id: SKARL_CHAIN_ID,
      kind: 'use',
      position: (out) => {
        const low = this._drakeId ? this.drakes()?.chainLow(this._drakeId) : null;
        return low ? out.set(low.x, low.y, low.z) : out.set(post.x, post.y + 0.5, post.z);
      },
      radius: CHAIN.radius,
      coneDegrees: 360,
      promptKey: 'skarl.chain',
      priority: 3,
      enabled: () => this.chainOpen && this.brain.state !== 'broken',
      onInteract: () => void this.strikeChain(),
    };
    for (const i of [lever, chain]) {
      try {
        this.interactables.push(this.ctx.interaction.register(i));
      } catch (err) {
        this.warn(`could not mount ${i.id} (${String(err)})`);
      }
    }
  }

  /** He stands within `SKARL.postLaneClear` of the segment from the player to the post. */
  private onPostLane(): boolean {
    const f = this.ctx.player.feet;
    const p = this.places.post;
    const s = this.root.position;
    return distToSegment(s.x, s.z, f.x, f.z, p.x, p.z) < SKARL.postLaneClear;
  }

  /** Strafing on a circle round the player inside the band, the hop back, clearing the post's lane, facing the player. */
  private move(dt: number): void {
    const pos = this.root.position;
    const f = this.ctx.player.feet;
    const dx = pos.x - f.x;
    const dz = pos.z - f.z;
    const dist = Math.hypot(dx, dz) || 1e-3;
    const ox = dx / dist;
    const oz = dz / dist;
    const mode = this.brain.moving;
    let vx = 0;
    let vz = 0;
    if (mode === 'strafe' || mode === 'clearLane') {
      this.strafeT += dt;
      if (this.strafeT > 4) (this.strafeT = 0), (this.strafeSign = -this.strafeSign);
      // Tangent, plus a radial pull back into the band.
      let tx = -oz * this.strafeSign;
      let tz = ox * this.strafeSign;
      if (mode === 'clearLane') {
        // Step off the line to the post, on whichever side he is already.
        const p = this.places.post;
        const lx = p.x - f.x;
        const lz = p.z - f.z;
        const side = Math.sign(lx * (pos.z - f.z) - lz * (pos.x - f.x)) || 1;
        const len = Math.hypot(lx, lz) || 1;
        tx = (-lz / len) * side;
        tz = (lx / len) * side;
      }
      const radial = dist < SKARL.nearBand ? 1 : dist > SKARL.farBand ? -1 : 0;
      vx = (tx + ox * radial) * SKARL.strafeSpeed;
      vz = (tz + oz * radial) * SKARL.strafeSpeed;
      // A strafe never walks him onto the player's line to the post: he turns back instead.
      if (mode === 'strafe') {
        const p = this.places.post;
        const nx = pos.x + vx * dt;
        const nz = pos.z + vz * dt;
        if (distToSegment(nx, nz, f.x, f.z, p.x, p.z) < SKARL.postLaneClear + 0.5) {
          this.strafeSign = -this.strafeSign;
          this.strafeT = 0;
          vx = (-tx + ox * radial) * SKARL.strafeSpeed;
          vz = (-tz + oz * radial) * SKARL.strafeSpeed;
        }
      }
      this.loop(this.strafeSign > 0 ? 'strafeLeft' : 'strafeRight');
    } else if (mode === 'backstep') {
      const speed = SKARL.backstepMetres / SKARL.backstepSeconds;
      vx = ox * speed;
      vz = oz * speed;
      this.oneShot('backstep');
    } else if (this.brain.state === 'reload' || this.brain.state === 'aim') {
      this.loop(this.brain.state === 'aim' ? 'aim' : 'idle');
    }
    pos.x += vx * dt;
    pos.z += vz * dt;
    // The leash: never farther than `ARENA.leash` from the centre.
    const c = this.places.centre;
    const cx = pos.x - c.x;
    const cz = pos.z - c.z;
    const r = Math.hypot(cx, cz);
    if (r > ARENA.leash) {
      pos.x = c.x + (cx / r) * ARENA.leash;
      pos.z = c.z + (cz / r) * ARENA.leash;
    }
    const g = this.places.groundAt(pos.x, pos.z);
    if (Number.isFinite(g)) pos.y = g;
    if (this.brain.state !== 'broken' && this.brain.state !== 'window') this.turnToward(f, dt);
  }

  private turnToward(at: THREE.Vector3Like, dt: number): void {
    const pos = this.root.position;
    const dx = at.x - pos.x;
    const dz = at.z - pos.z;
    if (Math.hypot(dx, dz) < 1e-3) return;
    const want = Math.atan2(-dx, -dz);
    let diff = want - this.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const max = SKARL.turnRate * dt;
    this.root.rotation.y += Math.max(-max, Math.min(max, diff));
  }

  private face(at: THREE.Vector3Like): void {
    const pos = this.root.position;
    const dx = at.x - pos.x;
    const dz = at.z - pos.z;
    if (Math.hypot(dx, dz) > 1e-3) this.root.rotation.y = Math.atan2(-dx, -dz);
  }

  /** Bolts fly straight; each hits the player's capsule once or flies out of range. */
  private tickBolts(dt: number): void {
    if (this.bolts.length === 0) return;
    const f = this.ctx.player.feet;
    const player = this.ctx.player.actor;
    const keep: Bolt[] = [];
    for (const b of this.bolts) {
      const step = BOLT.speed * dt;
      const from = b.pos.clone();
      b.pos.addScaledVector(b.dir, step);
      b.travelled += step;
      b.mesh.position.copy(b.pos);
      let hit = false;
      if (!player.dead) {
        // Closest point of this tick's segment to the capsule's axis at mid-height.
        const cy = f.y + PLAYER_HEIGHT / 2;
        const t = THREE.MathUtils.clamp(((f.x - from.x) * b.dir.x + (cy - from.y) * b.dir.y + (f.z - from.z) * b.dir.z) / step, 0, 1);
        const qx = from.x + b.dir.x * step * t;
        const qy = from.y + b.dir.y * step * t;
        const qz = from.z + b.dir.z * step * t;
        if (Math.hypot(qx - f.x, qz - f.z) <= PLAYER_RADIUS + BOLT.radius && Math.abs(qy - cy) <= PLAYER_HEIGHT / 2 + BOLT.radius) {
          hit = true;
          this.ctx.damage.apply({
            attackerId: this.actor.id,
            targetId: player.id,
            amount: Math.round(BOLT.damage * this.scale),
            poise: BOLT.poise,
            // As the enemy projectiles: a melee request, so blocks, parries and i-frames apply unchanged.
            kind: 'melee',
            attackId: BOLT.attackId,
            swingId: b.swingId,
            direction: new THREE.Vector3(b.dir.x, 0, b.dir.z).normalize(),
            unblockable: false,
            parryable: false,
          });
        }
      }
      if (hit || b.travelled >= BOLT.range) b.mesh.removeFromParent();
      else keep.push(b);
    }
    this.bolts = keep;
  }

  private clearBolts(): void {
    for (const b of this.bolts.splice(0)) b.mesh.removeFromParent();
  }

  private tickShove(dt: number): void {
    const s = this.shove;
    if (!s) return;
    s.left -= dt;
    if (s.left <= 0 || this.ctx.player.actor.dead) this.stopShove();
  }

  private stopShove(): void {
    if (!this.shove) return;
    this.shove = null;
    this.verbs()?.holdForcedMove?.(KICK_SHOVE_OWNER, null);
  }

  private glow(dt: number): void {
    if (this.telegraphT < 0) return;
    this.telegraphT += dt;
    this.model?.setTelegraph(Math.min(1, this.telegraphT / this.telegraphLead));
  }

  private endTelegraph(): void {
    this.telegraphT = -1;
    this.telegraphSwing = -1;
    this.model?.setTelegraph(0);
  }

  /** Kneeling after a break: x1.25 on him (status ticks excluded). */
  private kneeling(req: { targetId: string; amount: number; poise: number; kind: string }): void {
    if (req.kind === 'status' || req.targetId !== this.actor.id || !this.registered || this.outcomeKind) return;
    if (this.brain.state !== 'broken') return;
    req.amount *= SKARL.brokenScale;
    req.poise *= SKARL.brokenScale;
  }

  /** Each phase holds until its break; then the 8 % floor until the last break. Damage only, never poise. */
  private floor(req: { targetId: string; amount: number }): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered) return;
    const [phase2, phase3] = SKARL.phases;
    let min = Math.ceil(this.actor.maxHealth * SKARL.healthFloor);
    if (!this.phase1BreakDone && phase2 !== undefined) min = Math.max(min, Math.floor(this.actor.maxHealth * phase2) + 1);
    else if (!this.phase2BreakDone && phase3 !== undefined) min = Math.max(min, Math.floor(this.actor.maxHealth * phase3) + 1);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  private outcome(kind: 'spared' | 'defeated'): void {
    this.brain.onOutcome();
    this.outcomeKind = kind;
    this.outcomeT = 0;
    this.endTelegraph();
    this.clearBolts();
    this.stopShove();
    this.removeInteractables();
    // Unhittable the same tick: a strike on a spared Skarl would revoke the mercy (and its Oswin +3).
    this.actor.untargetable = true;
    this.actor.hittable = false;
    this.freeDrake();
    this.payFavour(kind);
    if (kind === 'spared') {
      this.model?.dropCrossbow();
      this.oneShot('kneel');
    } else {
      this.oneShot('death');
    }
  }

  /** Dragons -2 for a Spare, +2 for a kill; once, only on this fight's own outcome (never on a flag set from outside). */
  private payFavour(kind: 'spared' | 'defeated'): void {
    if (this.favourPaid) return;
    this.favourPaid = true;
    try {
      this.ctx.state.addFavour('dragons', kind === 'spared' ? FAVOUR.sparedDragons : FAVOUR.defeatedDragons, 'script');
    } catch (err) {
      this.warn(`could not pay the dragons favour (${String(err)})`);
    }
  }

  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    const t = this.outcomeT;
    if (this.outcomeKind === 'spared') {
      if (t >= PRESENTATION.spareKneelSeconds) this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.spareKneelSeconds) / PRESENTATION.spareFadeSeconds));
      if (t >= PRESENTATION.spareKneelSeconds + PRESENTATION.spareFadeSeconds) this.finish('spared');
      return;
    }
    if (t >= PRESENTATION.deathClipSeconds) this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.deathClipSeconds) / PRESENTATION.deathFadeSeconds));
    if (t >= PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds) this.finish('defeated');
  }

  private removeInteractables(): void {
    for (const off of this.interactables.splice(0)) off();
  }

  private loop(clip: SkarlClip): void {
    if (this.loopClip === clip) return;
    this.loopClip = clip;
    this.lastOneShot = null;
    this.model?.play(clip, { loop: true });
  }

  private oneShot(clip: SkarlClip): void {
    // The hop is asked for every tick it lasts: play it once.
    if (clip === 'backstep' && this.lastOneShot === 'backstep') return;
    this.lastOneShot = clip;
    this.loopClip = null;
    this.model?.play(clip);
  }

  private sfx(key: string): void {
    const audio = this.ctx.services.get('audio');
    if (!audio) return;
    try {
      playEnsured(audio, key, this.root.position);
    } catch {
      // the audio thread owns the keys; a missing one is silent
    }
  }

  private drakes(): DrakesPort | undefined {
    return this.ctx.services.get('drakes') as DrakesPort | undefined;
  }

  private verbs(): CombatVerbsPort | undefined {
    return this.ctx.services.get('combatVerbs') as CombatVerbsPort | undefined;
  }

  private finish(end: SkarlEnd): void {
    if (this.ended) return;
    this.ended = true;
    for (const off of this.offs.splice(0)) off();
    // The registry drops the registration on `actor.despawned` (one `boss.ended`); only a teardown unregisters first.
    this.unregister = null;
    this.stopShove();
    this.clearBolts();
    this.removeInteractables();
    // A reset takes the drake away with him (a retry spawns both again); after an outcome it has already flown.
    if (end === 'reset' && this._drakeId && !this.drakeFreed) {
      try {
        (this.ctx.services.get('enemies') as EnemiesPort | undefined)?.despawnGroup?.(DRAKE_SPAWNER);
      } catch (err) {
        this.warn(`could not despawn the drake (${String(err)})`);
      }
    }
    try {
      this.unchain?.();
    } catch {
      // the wyrms plugin may be gone at teardown
    }
    this.unchain = null;
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}

/** Distance from (px, pz) to the segment (ax, az)-(bx, bz). */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 1e-9 ? THREE.MathUtils.clamp(((px - ax) * vx + (pz - az) * vz) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
