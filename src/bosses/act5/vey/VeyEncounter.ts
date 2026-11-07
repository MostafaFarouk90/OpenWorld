// One Morcant Vey fight (D09; plans/act5-N6.md section 2): the actor and model, the registry registration, the brain's hooks (the
// combo's three hits, the shockwave ring, the surge's fire ring), heavy x 2 / light x 0.5 poise, the bar floors (health held at
// each bar's floor until it breaks), the Spare window (any hit from Cael while it is open strikes him down), the F7 crowd at the
// second break, the bolt caches, poise regen and the outcome presentation. The arena (VeyDirector) owns the trigger, intro, gate
// and reset rules.
import * as THREE from 'three';
import type { Actor } from '../../../actors/Actor';
import type { BossDef } from '../../../actors/BossRegistry';
import type { ModifiableRequest } from '../../../actors/DamageResolver';
import { ensureAct5Sfx } from '../../../audio/act5/act5SfxEnsure';
import type { GameContext } from '../../../core/Game';
import { yawToward } from '../../prior/geometry';
import { barFloorHealth, clampToFloor } from '../shared/barFloors';
import { bossPoiseScale } from '../shared/heavyHits';
import { VeyBoltCaches } from './boltCaches';
import { VeyBrain, type VeyHooks } from './VeyBrain';
import type { VeyClip, VeyModel } from './VeyModel';
import { GroundRing, inBand } from './veyFx';
import {
  COMBO,
  CROWD,
  F7_FLAG,
  LOOK,
  PRESENTATION,
  SHOCKWAVE,
  SURGE,
  VEY,
  VEY_BOSS_ID,
  VEY_KIND,
  VEY_NAME_KEY,
  veyScale,
  type VeyMoveDef,
} from './tuning';

export const VEY_FLOOR_MODIFIER_ID = 'bosses.vey.floor';
export const VEY_POISE_MODIFIER_ID = 'bosses.vey.poise';

/** The registry def; each encounter adds its own `acceptBreak` (a break counts only at the bar's floor). */
export const VEY_BOSS_DEF: BossDef = {
  bossId: VEY_BOSS_ID,
  nameKey: VEY_NAME_KEY,
  phases: VEY.phases,
  breaksPerPhase: VEY.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: VEY.releaseWindowSeconds,
  mercyVerb: VEY.mercyVerb,
};

/** The ring floor in world metres (the arena rect, `ARENA.inset` in from its walls). */
export interface VeyBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface VeyPlaces {
  centre: THREE.Vector3;
  centreYaw: number;
  bounds: VeyBounds;
  caches: THREE.Vector3[];
}

export type VeyEnd = 'spared' | 'defeated' | 'reset';

export interface VeyEncounterOptions {
  model: VeyModel | null;
  places: VeyPlaces;
  level: number;
  warn: (message: string) => void;
  onEnd: (end: VeyEnd) => void;
}

export class VeyEncounter implements VeyHooks {
  readonly actor: Actor;
  readonly brain: VeyBrain;
  readonly caches: VeyBoltCaches;
  private readonly ctx: GameContext;
  private readonly model: VeyModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: VeyPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: VeyEnd) => void;
  private readonly scale: number;
  private readonly offs: (() => void)[] = [];
  private readonly ring = new GroundRing('vey-shockwave');
  private readonly fire = new GroundRing('vey-surge', LOOK.ring);
  private readonly warned = new Set<string>();
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  private windowOpen = false;
  private poiseIdle = 0;
  private telegraphT = -1;
  private telegraphLead = 1;
  private loopClip: VeyClip | null = null;
  private outcomeT = 0;
  private outcomeKind: 'spared' | 'defeated' | null = null;
  private shockAt = new THREE.Vector3();
  private shockHit = false;
  private crowdIn = false;
  /** Breaks counted for this fight (the registry's count; tests). */
  breaks = 0;
  /** Parries of the third hit (tests, the real-game log). */
  parries = 0;
  /** Poise breaks above the bar's floor, which did not count (tests, the real-game log). */
  earlyStaggers = 0;

  constructor(ctx: GameContext, opts: VeyEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.scale = veyScale(opts.level);
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-vey';
    this.root.position.copy(opts.places.centre);
    this.root.rotation.set(0, opts.places.centreYaw, 0);
    ctx.scene.add(this.root, this.ring.group, this.fire.group);

    this.actor = ctx.actors.spawn({
      kind: VEY_KIND,
      team: 'hostile',
      level: opts.level,
      maxHealth: Math.round(VEY.maxHealth * this.scale),
      maxPoise: VEY.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      hittable: false,
    });
    this.actor.untargetable = true;
    this.actor.data['audio'] = { material: 'metal' };
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(VEY_POISE_MODIFIER_ID, (req) => this.poise(req), VEY.poiseModifierOrder),
      ctx.damage.addModifier(VEY_FLOOR_MODIFIER_ID, (req) => this.floor(req), VEY.floorModifierOrder),
    );
    this.brain = new VeyBrain(this);
    this.caches = new VeyBoltCaches(ctx, opts.places.caches);

    const mine = (p: { bossId: string }) => p.bossId === VEY_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        this.breaks = p.breaks;
        this.model?.setHeart(Math.min(1, p.breaks / VEY.breaksPerPhase));
        this.caches.restock();
        this.brain.onBreak(p.last);
        if (p.breaks === CROWD.atBreak) this.callCrowd();
      }),
      ctx.events.on('boss.releaseWindow', (p) => {
        if (!mine(p)) return;
        this.windowOpen = p.open;
        this.brain.onReleaseWindow(p.open);
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
    );
    this.loop('idle');
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
    return this.outcomeKind !== null;
  }

  get view(): VeyModel | null {
    return this.model;
  }

  /** The F7 crowd has been called this fight (tests). */
  get crowdCalled(): boolean {
    return this.crowdIn;
  }

  /** The Spare window is open (tests, N9's HUD reads the registry). */
  get spareOpen(): boolean {
    return this.windowOpen;
  }

  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, { ...VEY_BOSS_DEF, acceptBreak: () => this.acceptBreak() });
    } catch (err) {
      this.warn(`could not register Vey: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    this.actor.hittable = true;
    this.actor.untargetable = false;
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
    const player = this.ctx.player.feet;
    const pos = this.root.position;
    const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.brain.tick(dt, { dist });
    if (this.ended || this.outcomeKind) return;
    this.move(dt, player, dist);
    this.glow(dt);
    const st = this.brain.state;
    if (st !== 'broken' && st !== 'window' && st !== 'roar' && st !== 'surgeTell') {
      this.poiseIdle += dt;
      if (this.poiseIdle >= VEY.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.actor.restorePoise();
    }
  }

  reset(opts: { unregisterFirst?: boolean } = {}): void {
    if (this.ended) return;
    if (opts.unregisterFirst) {
      const off = this.unregister;
      this.unregister = null;
      off?.();
    }
    this.finish('reset');
  }

  // ---- VeyHooks ----

  telegraph(move: VeyMoveDef | typeof SHOCKWAVE | typeof SURGE, swingId: number, leadSeconds: number): void {
    this.ctx.events.emit('telegraph', {
      actorId: this.actor.id,
      kind: move.telegraph,
      attackId: move.attackId,
      moveId: `${VEY_BOSS_ID}.${move.attackId.split('.').slice(1).join('.')}`,
      swingId,
      leadSeconds,
    });
    this.telegraphT = 0;
    this.telegraphLead = Math.max(0.05, leadSeconds);
    if (move.attackId === SHOCKWAVE.attackId) {
      this.oneShot('shock');
      this.ring.tell(this.root.position, SHOCKWAVE.radius, 0);
    } else if (move.attackId === SURGE.attackId) {
      this.fire.tell(this.root.position, SURGE.radius, 0);
    } else {
      const i = COMBO.hits.findIndex((h) => h.attackId === move.attackId);
      this.oneShot(i === 0 ? 'combo1' : i === 1 ? 'combo2' : 'combo3');
    }
  }

  strike(index: number, swingId: number): boolean {
    this.endTelegraph();
    const move = COMBO.hits[index];
    if (!move) return false;
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    if (Math.abs(feet.y - pos.y) > 2.5) return false;
    const dx = feet.x - pos.x;
    const dz = feet.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > COMBO.reach) return false;
    if (d > 1e-3) {
      const yaw = this.root.rotation.y;
      const dot = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d;
      if (dot < Math.cos(COMBO.halfArc)) return false;
    }
    const parryable = index === COMBO.parryIndex;
    const r = this.hitPlayer(move, swingId, parryable ? {} : { parryable: false as const });
    const parried = r?.outcome === 'parried';
    if (parried) {
      this.parries++;
      this.sfx('sfx.vey.clash');
    }
    return parried;
  }

  shockwave(swingId: number): void {
    this.endTelegraph();
    this.shockAt.copy(this.root.position);
    this.shockHit = false;
    this.ring.wave(this.shockAt, 0.1);
    void swingId;
  }

  shockTick(swingId: number, t: number): void {
    const r = Math.max(0.1, SHOCKWAVE.radius * t);
    this.ring.wave(this.shockAt, r);
    if (!this.shockHit && inBand(this.shockAt, this.ctx.player.feet, r, SHOCKWAVE.band + SHOCKWAVE.radius / (SHOCKWAVE.growSeconds * 60))) {
      this.shockHit = true;
      this.hitPlayer(SHOCKWAVE, swingId, { unblockable: true });
    }
    if (t >= 1) this.ring.hide();
  }

  surgeRoar(): void {
    this.oneShot('roar');
  }

  surgeBurst(swingId: number): void {
    this.endTelegraph();
    this.fire.wave(this.root.position, SURGE.radius);
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    if (Math.abs(feet.y - pos.y) <= 2.5 && Math.hypot(feet.x - pos.x, feet.z - pos.z) <= SURGE.radius) this.hitPlayer(SURGE, swingId, { unblockable: true });
    this.fireT = 0.4;
  }

  stagger(): void {
    this.endTelegraph();
    this.ring.hide();
    this.oneShot('stagger');
  }

  window(): void {
    this.endTelegraph();
    this.ring.hide();
    this.fire.hide();
    this.oneShot('kneel');
  }

  rise(): void {
    this.oneShot('rise');
  }

  restorePoise(): void {
    this.actor.restorePoise();
    this.poiseIdle = 0;
  }

  // ---- internals ----

  private fireT = 0;

  private hitPlayer(move: { attackId: string; damage: number; poise: number }, swingId: number, extra: { unblockable?: true; parryable?: false }) {
    const player = this.ctx.player.actor;
    if (player.dead) return null;
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    const direction = new THREE.Vector3(feet.x - pos.x, 0, feet.z - pos.z);
    if (direction.lengthSq() < 1e-6) direction.set(-Math.sin(this.root.rotation.y), 0, -Math.cos(this.root.rotation.y));
    direction.normalize();
    return this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: player.id,
      amount: move.damage * this.scale,
      poise: move.poise,
      kind: 'melee',
      attackId: move.attackId,
      swingId,
      direction,
      ...extra,
    });
  }

  /**
   * A poise break counts as a bar only once his health is held at that bar's floor (within `VEY.floorMargin`); earlier, it is a
   * plain stagger: he flinches and his poise refills (Eormen's lesson: stray early breaks made a two-minute fight).
   */
  private acceptBreak(): boolean {
    const floor = barFloorHealth(this.actor.maxHealth, VEY.floors, this.breaks);
    if (this.actor.health <= floor + this.actor.maxHealth * VEY.floorMargin) return true;
    this.earlyStaggers++;
    this.actor.restorePoise();
    this.oneShot('hit');
    return false;
  }

  /** Heavy x 2, light x 0.5 on Cael's hits; nothing lands through the roar. */
  private poise(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || !this.registered) return;
    if (this.brain.invulnerable) {
      req.outcome = 'immune';
      return;
    }
    if (req.attackerId !== this.ctx.player.actor.id) return;
    req.poise *= bossPoiseScale(req);
  }

  /** Health stops at the next unbroken bar's floor; with the Spare window open, a hit from Cael strikes him down. */
  private floor(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || !this.registered || this.outcomeKind) return;
    if (this.windowOpen) {
      if (req.attackerId === this.ctx.player.actor.id && req.outcome === 'hit' && req.kind !== 'status') req.amount = Math.max(req.amount, this.actor.health);
      else req.amount = Math.min(req.amount, Math.max(0, this.actor.health - 1));
      return;
    }
    const floor = barFloorHealth(this.actor.maxHealth, VEY.floors, this.breaks);
    clampToFloor(req, this.actor.health, floor || 1);
  }

  private callCrowd(): void {
    if (this.crowdIn || this.ctx.state.getFlag(F7_FLAG) !== 'public') return;
    this.crowdIn = true;
    const enemies = this.ctx.services.get('enemies');
    if (!enemies) return;
    for (const id of CROWD.groups) {
      try {
        enemies.reset(id);
        enemies.spawnGroup(id, { aggro: true });
      } catch (err) {
        this.warnOnce(`crowd group "${id}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private dismissCrowd(): void {
    if (!this.crowdIn) return;
    const enemies = this.ctx.services.get('enemies');
    if (!enemies) return;
    for (const id of CROWD.groups) {
      try {
        enemies.reset(id);
      } catch (err) {
        this.warnOnce(`crowd group "${id}" reset failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private move(dt: number, player: THREE.Vector3Like, dist: number): void {
    const pos = this.root.position;
    let speed = 0;
    if (this.brain.approaching && dist > 1e-3) {
      speed = VEY.walkSpeed * (this.brain.fastLeft > 0 ? 1.4 : 1);
      const step = Math.min(speed * dt, Math.max(0, dist - VEY.preferredDistance));
      pos.x += ((player.x - pos.x) / dist) * step;
      pos.z += ((player.z - pos.z) / dist) * step;
      if (step <= 0) speed = 0;
    }
    const b = this.places.bounds;
    pos.x = Math.min(b.x1, Math.max(b.x0, pos.x));
    pos.z = Math.min(b.z1, Math.max(b.z0, pos.z));
    const st = this.brain.state;
    if (speed > 0) this.loop('walk');
    else if (this.telegraphT < 0 && (st === 'idle' || st === 'recover')) this.loop('idle');
    this.model?.setSpeed(speed);
    if (this.brain.turning && dist > 1e-3) {
      const want = yawToward(pos, player);
      let diff = want - this.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxTurn = VEY.turnRate * dt;
      this.root.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
    if (this.fireT > 0) {
      this.fireT -= dt;
      if (this.fireT <= 0) this.fire.hide();
    }
  }

  private glow(dt: number): void {
    if (this.telegraphT < 0) return;
    this.telegraphT += dt;
    const k = Math.min(1, this.telegraphT / this.telegraphLead);
    const st = this.brain.state;
    if (st === 'glow') this.model?.setBladeGlow(k);
    else if (st === 'shockTell') this.ring.tell(this.root.position, SHOCKWAVE.radius, k);
    else if (st === 'surgeTell') this.fire.tell(this.root.position, SURGE.radius, k);
  }

  private endTelegraph(): void {
    this.telegraphT = -1;
    this.model?.setBladeGlow(0);
  }

  private outcome(kind: 'spared' | 'defeated'): void {
    this.brain.onOutcome(kind);
    this.outcomeKind = kind;
    this.outcomeT = 0;
    this.windowOpen = false;
    this.endTelegraph();
    this.ring.hide();
    this.fire.hide();
    this.dismissCrowd();
    // Unhittable the same tick: a strike on a spared Vey would revoke the mercy.
    this.actor.untargetable = true;
    this.actor.hittable = false;
    this.oneShot(kind === 'spared' ? 'kneel' : 'death');
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

  private loop(clip: VeyClip): void {
    if (this.loopClip === clip) return;
    this.loopClip = clip;
    this.model?.play(clip, { loop: true });
  }

  private oneShot(clip: VeyClip): void {
    this.loopClip = null;
    this.model?.play(clip);
  }

  private sfx(key: string): void {
    try {
      ensureAct5Sfx(key);
      this.ctx.services.get('audio')?.playAt(key, this.root.position);
    } catch {
      // N8 owns the keys; a missing one is silent
    }
  }

  private warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.warn(message);
  }

  private finish(end: VeyEnd): void {
    if (this.ended) return;
    this.ended = true;
    for (const off of this.offs.splice(0)) off();
    this.unregister = null;
    this.dismissCrowd();
    this.caches.dispose();
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    this.ring.dispose();
    this.fire.dispose();
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
