// One Archwraith Eormen fight (D08; plans/act4-L6.md "PR 2", A to C): the actor and model, the registry registration, the
// brain's hooks (the spirit blades, the toll, the close swipe), the ward (no weapon drains his poise), the health floor, the Last
// Gong on L0's structure-break hook, the husks each phase, the dark nave from phase 2, and both outcomes (the Release through the
// shipped boss mercy hold, or his death). The arena (EormenDirector) owns the trigger, the intro, the gate and the reset rules.
import * as THREE from 'three';
import type { Actor } from '../../../actors/Actor';
import type { BossDef } from '../../../actors/BossRegistry';
import type { ModifiableRequest } from '../../../actors/DamageResolver';
import type { GameContext } from '../../../core/Game';
import type { StructureBreaksService } from '../../structureBreak';
import { EormenBrain, type EormenAttack, type EormenHooks } from './EormenBrain';
import type { EormenModel } from './EormenModel';
import { NaveDark, SpiritBlades, TollRing } from './eormenFx';
import { LastGong, type GongAnswer, type GongSource } from './lastGong';
import {
  BLADES,
  EORMEN,
  EORMEN_BOSS_ID,
  EORMEN_KIND,
  EORMEN_NAME_KEY,
  eormenScale,
  GONG_PART_ID,
  HUSKS,
  PRESENTATION,
  SWIPE,
  TOLL,
} from './tuning';

declare module '../../../core/events' {
  interface GameEventMap {
    /** The Last Gong struck outside its window, or with this phase's bar already broken: a dull clank (L8 may voice it). */
    'eormen.gong.dud': Record<string, never>;
    /** The Last Gong's window opened (`seconds` long) or closed (0): the HUD hint and the real-game log read it. */
    'eormen.gong.window': { open: boolean; seconds: number };
  }
}

export const EORMEN_FLOOR_MODIFIER_ID = 'bosses.eormen.floor';
export const EORMEN_WARD_MODIFIER_ID = 'bosses.eormen.ward';

export const EORMEN_BOSS_DEF: BossDef = {
  bossId: EORMEN_BOSS_ID,
  nameKey: EORMEN_NAME_KEY,
  phases: EORMEN.phases,
  breaksPerPhase: EORMEN.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: EORMEN.releaseWindowSeconds,
  mercyVerb: EORMEN.mercyVerb,
  releaseBurnCost: EORMEN.releaseBurnCost,
};

export interface EormenPlaces {
  centre: THREE.Vector3;
  centreYaw: number;
  gong: THREE.Vector3;
  gongYaw: number;
  /** The nave floor in world metres (he never drifts off it). */
  rect: { x0: number; x1: number; z0: number; z1: number };
}

export type EormenEnd = 'released' | 'defeated' | 'reset';

export interface EormenEncounterOptions {
  model: EormenModel | null;
  places: EormenPlaces;
  level: number;
  warn: (message: string) => void;
  onEnd: (end: EormenEnd) => void;
}

/** Signed angle from yaw `a` to yaw `b`, in (-PI, PI]. */
function angleTo(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Yaw from `from` toward `to` (yaw 0 faces -Z). */
function yawToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** The blades leave from his shoulders, this high above his feet. */
const BLADE_HEIGHT = 1.6;
/** A blade touches Cael when it passes this close to his centre line, between his feet and head. */
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.8;
/** Seconds the release dissolve and the death take before he despawns. */
const RELEASE_SECONDS = 2.5;
const DEATH_CLIP_SECONDS = 1.2;

export class EormenEncounter implements EormenHooks {
  readonly actor: Actor;
  readonly brain: EormenBrain;
  private readonly ctx: GameContext;
  private readonly model: EormenModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: EormenPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: EormenEnd) => void;
  private readonly scale: number;
  private readonly offs: (() => void)[] = [];
  private readonly parts: (() => void)[] = [];
  private readonly flying = new SpiritBlades();
  private readonly ring = new TollRing();
  private readonly dark: NaveDark;
  private readonly warned = new Set<string>();
  private gong: LastGong | null = null;
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  private yaw: number;
  /** Phases whose bar is broken (1-based). */
  private readonly broken = new Set<number>();
  /** Phases whose floor already called the early toll. */
  private readonly floored = new Set<number>();
  /** Phases whose husks have risen. */
  private readonly summoned = new Set<number>();
  private floorLifted = false;
  private releaseOpen = false;
  private telegraphKind: EormenAttack | null = null;
  private telegraphT = 0;
  private telegraphLead = 1;
  private swing = 0;
  private outcomeKind: 'released' | 'defeated' | null = null;
  private outcomeT = -1;
  private dissolved = false;
  private pendingBreak: { phase: number; ticks: number } | null = null;
  /** Gong strikes that broke a bar, and duds (tests and the real-game log). */
  gongBreaks = 0;
  gongDuds = 0;
  /** `register()` could not mount the gong: the director stops arming until the next trigger enter (no retry loop). */
  mountFailed = false;

  constructor(ctx: GameContext, opts: EormenEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.scale = eormenScale(opts.level);
    this.yaw = opts.places.centreYaw;
    this.dark = new NaveDark(ctx.scene);
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-eormen';
    this.root.position.copy(opts.places.centre);
    this.root.position.y += EORMEN.hover;
    this.root.rotation.set(0, this.yaw, 0);
    ctx.scene.add(this.root, this.flying.group, this.ring.mesh);

    this.actor = ctx.actors.spawn({
      kind: EORMEN_KIND,
      team: 'hostile',
      level: opts.level,
      maxHealth: Math.round(EORMEN.maxHealth * this.scale),
      maxPoise: EORMEN.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      hittable: false,
    });
    this.actor.untargetable = true;
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(EORMEN_WARD_MODIFIER_ID, (req) => this.ward(req), EORMEN.wardModifierOrder),
      ctx.damage.addModifier(EORMEN_FLOOR_MODIFIER_ID, (req) => this.floor(req), EORMEN.floorModifierOrder),
    );
    this.brain = new EormenBrain(this);
    this.model?.play('idle', { loop: true });

    const mine = (p: { bossId: string }) => p.bossId === EORMEN_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        this.broken.add(p.phase);
        if (p.last) this.floorLifted = true;
        this.pendingBreak = null;
        this.flying.clear();
        this.ring.stop();
        this.brain.onBreak();
        this.model?.play('hit');
        // The forced stagger emptied his poise; refill it once the registry has counted the bar (the PR 1 pattern).
        this.actor.restorePoise();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (!mine(p)) return;
        this.brain.onPhase(p.phase);
        this.summon(p.phase);
        if (p.phase >= 2) this.dark.dim();
      }),
      ctx.events.on('boss.releaseWindow', (p) => {
        if (!mine(p)) return;
        this.releaseOpen = p.open;
        if (p.open) {
          this.brain.stopAttack();
          this.clearTelegraph();
        }
      }),
      ctx.events.on('boss.released', (p) => {
        if (mine(p)) this.outcome('released');
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome('defeated');
      }),
    );
  }

  get fighting(): boolean {
    return this.registered && !this.ended;
  }

  get contested(): boolean {
    return this.fighting && this.outcomeT < 0;
  }

  get done(): boolean {
    return this.ended;
  }

  get outcomePlaying(): boolean {
    return this.outcomeT >= 0 && !this.ended;
  }

  get view(): EormenModel | null {
    return this.model;
  }

  /** The Last Gong (tests, the real-game driver); null before `register` and after the end. */
  get lastGong(): LastGong | null {
    return this.gong;
  }

  /** The nave's darkness 0..1 (tests). */
  get darkness(): number {
    return this.dark.level;
  }

  get liveBlades(): number {
    return this.flying.liveCount;
  }

  /** Registers after the intro: the bar and music follow `boss.started`; mounts the gong and its structure part; the first husks rise. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    const breaks = this.breaks();
    if (!breaks) {
      this.warn('no structureBreaks service; Eormen does not start');
      return false;
    }
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, {
        ...EORMEN_BOSS_DEF,
        // Only the Last Gong breaks a bar (the structure-break hook): a parry or a stagger skill is no pip.
        acceptBreak: () => {
          if (breaks.acceptBreak(EORMEN_BOSS_ID)) return true;
          this.actor.restorePoise();
          return false;
        },
      });
    } catch (err) {
      this.warn(`could not register Eormen: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    try {
      this.parts.push(breaks.register({ id: GONG_PART_ID, bossId: EORMEN_BOSS_ID }));
      this.gong = new LastGong(this.ctx, { at: this.places.gong, yaw: this.places.gongYaw, onStrike: (s) => this.strikeGong(s), warn: this.warn });
    } catch (err) {
      this.warn(`could not mount the Last Gong: ${err instanceof Error ? err.message : String(err)}`);
      this.mountFailed = true;
      this.finish('reset');
      return false;
    }
    this.actor.hittable = true;
    this.actor.untargetable = false;
    this.brain.start();
    this.summon(1);
    return true;
  }

  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.model?.update(dt);
    this.ring.update(dt);
    this.dark.update(dt);
    this.gong?.tick(dt);
    if (this.outcomeT >= 0) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;
    this.checkPendingBreak();
    this.flying.update(dt, (at) => this.bladeTouches(at), (id) => this.bladeLands(id));
    if (this.ended || this.outcomeT >= 0) return;
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    const dist = Math.hypot(feet.x - c.x, feet.z - c.z);
    if (!this.releaseOpen) {
      this.turn(dt, feet);
      this.drift(dt, feet, dist);
      this.brain.tick(dt, { dist });
      if (this.ended || this.outcomeT >= 0) return;
      this.checkFloor();
    }
    if (this.telegraphKind) {
      this.telegraphT += dt;
      this.model?.setGlow(Math.min(1, this.telegraphT / this.telegraphLead));
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

  /**
   * The Last Gong struck by F or a hit (also the headless driver's path). Inside the window after a toll, with this phase's bar
   * whole, it strikes the structure part and forces the stagger the registry counts; anything else is a dud or a refusal.
   */
  strikeGong(_source: GongSource = 'interact'): GongAnswer {
    if (!this.contested || this.releaseOpen) return 'refused';
    if (this.broken.has(this.brain.phase) || !this.brain.windowOpen) {
      this.dud();
      return 'dud';
    }
    const breaks = this.breaks();
    if (!breaks || breaks.strike(GONG_PART_ID) !== 'armed') {
      this.warnOnce('the Last Gong did not arm a break');
      return 'refused';
    }
    // The window is spent now, whatever the registry says: one window, one bar at most.
    this.brain.strikeGong();
    if (this.actor.poise <= 0) this.actor.restorePoise();
    const staggered = this.ctx.damage.stagger(this.actor.id, this.ctx.player.actor.id, Math.max(1, this.actor.poise));
    if (!staggered) {
      breaks.acceptBreak(EORMEN_BOSS_ID);
      this.actor.restorePoise();
      this.warn('the Last Gong: the registry refused the break');
      return 'refused';
    }
    this.gongBreaks++;
    this.pendingBreak = { phase: this.brain.phase, ticks: 0 };
    return 'break';
  }

  // ---- EormenHooks ----

  telegraph(attack: EormenAttack, swingId: number, lead: number): void {
    const def = attack === 'blades' ? BLADES : attack === 'toll' ? TOLL : SWIPE;
    this.ctx.events.emit('telegraph', { actorId: this.actor.id, kind: def.telegraph, attackId: def.attackId, moveId: def.attackId, swingId, leadSeconds: lead });
    this.telegraphKind = attack;
    this.telegraphT = 0;
    this.telegraphLead = lead > 0 ? lead : 1;
    this.swing = swingId;
    if (attack === 'toll') {
      this.ring.charge(this.root.position, lead);
      this.model?.play('toll');
    } else if (attack === 'blades') {
      this.model?.play('blades');
    } else this.model?.play('swipe');
  }

  cancelTelegraph(swingId: number): void {
    this.ctx.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId });
    this.ring.stop();
    this.clearTelegraph();
  }

  blades(swingId: number): void {
    this.clearTelegraph();
    this.swing = swingId;
    const c = this.root.position;
    const feet = this.ctx.player.feet;
    this.flying.fire({ x: c.x, y: c.y + BLADE_HEIGHT, z: c.z }, feet);
  }

  toll(swingId: number): void {
    this.clearTelegraph();
    this.ring.pulse(this.root.position);
    this.model?.play('idle', { loop: true });
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    if (Math.hypot(feet.x - c.x, feet.z - c.z) <= TOLL.radius && Math.abs(feet.y - (c.y - EORMEN.hover)) <= 2.5) {
      this.hit(TOLL.attackId, swingId, TOLL.damage, TOLL.poise, true);
    }
  }

  swipe(swingId: number): void {
    this.clearTelegraph();
    this.model?.play('idle', { loop: true, fade: 0.3 });
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    const d = Math.hypot(feet.x - c.x, feet.z - c.z);
    if (d > SWIPE.reach || Math.abs(angleTo(this.yaw, yawToward(c, feet))) > SWIPE.halfArc) return;
    this.hit(SWIPE.attackId, swingId, SWIPE.damage, SWIPE.poise, false);
  }

  windowOpen(extended: boolean): void {
    this.gong?.setOpen(true, TOLL.windowSeconds);
    this.ctx.events.emit('eormen.gong.window', { open: true, seconds: TOLL.windowSeconds });
    if (extended) this.warnOnce('a toll extended an open window (expected only at a floor)');
  }

  windowClose(): void {
    this.gong?.setOpen(false);
    this.ctx.events.emit('eormen.gong.window', { open: false, seconds: 0 });
  }

  staggerStart(): void {
    this.clearTelegraph();
  }

  staggerEnd(): void {
    this.model?.play('idle', { loop: true });
  }

  // ---- internals ----

  private dud(): void {
    this.gongDuds++;
    this.ctx.events.emit('eormen.gong.dud', {});
  }

  /** At this phase's floor (health held there because the bar is whole), the toll comes early, once per phase. */
  private checkFloor(): void {
    const phase = this.brain.phase;
    if (this.broken.has(phase) || this.floored.has(phase)) return;
    const next = EORMEN.phases[phase - 1];
    const floor = next !== undefined ? Math.floor(this.actor.maxHealth * next) + 1 : Math.ceil(this.actor.maxHealth * EORMEN.healthFloor);
    if (this.actor.health > floor) return;
    this.floored.add(phase);
    this.brain.onFloor();
  }

  /** Backstop: a strike whose stagger the registry did not count (no `boss.break` by the next tick) drains the armed break. */
  private checkPendingBreak(): void {
    const p = this.pendingBreak;
    if (!p) return;
    if (this.broken.has(p.phase)) {
      this.pendingBreak = null;
      return;
    }
    if (++p.ticks < 2) return;
    this.pendingBreak = null;
    this.breaks()?.acceptBreak(EORMEN_BOSS_ID);
    this.gongBreaks--;
    this.actor.restorePoise();
    // The next toll opens a fresh window; the early toll may come again.
    this.floored.delete(p.phase);
    this.warnOnce('the Last Gong: the registry did not count the bar; the next toll opens it again');
  }

  private summon(phase: number): void {
    if (this.summoned.has(phase)) return;
    this.summoned.add(phase);
    const id = HUSKS.groups[phase - 1];
    const enemies = this.ctx.services.get('enemies');
    if (!id || !enemies) return;
    try {
      enemies.reset(id);
      enemies.spawnGroup(id, { aggro: true });
    } catch (err) {
      this.warnOnce(`husk group "${id}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The husks crumble when the fight ends either way (their groups are ephemeral: nothing is spent or saved). */
  private crumbleHusks(): void {
    const enemies = this.ctx.services.get('enemies');
    if (!enemies) return;
    for (const id of HUSKS.groups) {
      try {
        enemies.reset(id);
      } catch (err) {
        this.warnOnce(`husk group "${id}" reset failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.warn(message);
  }

  private breaks(): StructureBreaksService | undefined {
    try {
      return this.ctx.services.get('structureBreaks');
    } catch {
      return undefined;
    }
  }

  private clearTelegraph(): void {
    this.telegraphKind = null;
    this.telegraphT = 0;
    this.model?.setGlow(0);
  }

  /** He turns toward Cael at the turn rate, except while reeling or dying. */
  private turn(dt: number, feet: THREE.Vector3Like): void {
    const st = this.brain.state;
    if (st === 'staggered' || st === 'dying' || st === 'idle') return;
    const c = this.root.position;
    if (Math.hypot(feet.x - c.x, feet.z - c.z) < 1e-3) return;
    const d = angleTo(this.yaw, yawToward(c, feet));
    const step = EORMEN.turnRate * dt;
    this.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
    this.root.rotation.y = this.yaw;
  }

  /** He drifts to keep 6 to 10 m from Cael, on the nave floor; never while winding up a move, reeling or dying. */
  private drift(dt: number, feet: THREE.Vector3Like, dist: number): void {
    if (this.brain.state !== 'ready' && this.brain.state !== 'recover') return;
    if (dist < 1e-3 || (dist >= EORMEN.keepMin && dist <= EORMEN.keepMax)) return;
    const c = this.root.position;
    const away = dist < EORMEN.keepMin ? -1 : 1;
    const want = away < 0 ? EORMEN.keepMin - dist : dist - EORMEN.keepMax;
    const step = Math.min(EORMEN.driftSpeed * dt, want) * away;
    c.x += ((feet.x - c.x) / dist) * step;
    c.z += ((feet.z - c.z) / dist) * step;
    const r = this.places.rect;
    c.x = THREE.MathUtils.clamp(c.x, r.x0 + 1, r.x1 - 1);
    c.z = THREE.MathUtils.clamp(c.z, r.z0 + 1, r.z1 - 1);
  }

  private bladeTouches(at: THREE.Vector3): boolean {
    const feet = this.ctx.player.feet;
    if (at.y < feet.y - 0.2 || at.y > feet.y + PLAYER_HEIGHT + 0.4) return false;
    return Math.hypot(at.x - feet.x, at.z - feet.z) <= PLAYER_RADIUS + BLADES.radius;
  }

  private bladeLands(_id: number): void {
    this.hit(BLADES.attackId, this.swing, BLADES.damage, BLADES.poise, true);
  }

  /** `dodgeOnly`: red, unblockable and never parried (the blades, the toll). Otherwise blockable and parryable (the swipe; a parry is no pip). */
  private hit(attackId: string, swingId: number, amount: number, poise: number, dodgeOnly: boolean): void {
    const player = this.ctx.player.actor;
    if (player.dead) return;
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    const direction = new THREE.Vector3(feet.x - c.x, 0, feet.z - c.z);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, -1);
    direction.normalize();
    this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: player.id,
      amount: amount * this.scale,
      poise,
      kind: 'melee',
      attackId,
      swingId,
      direction,
      unblockable: dodgeOnly || undefined,
      ...(dodgeOnly ? { parryable: false as const } : {}),
    });
  }

  /** No weapon or skill drains his poise: only the Last Gong breaks a bar. */
  private ward(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || !this.registered || this.outcomeT >= 0) return;
    req.poise = 0;
  }

  /** Health stays above the next threshold until this phase's bar, and at the 8 % floor until the last bar. */
  private floor(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered) return;
    let min = Math.ceil(this.actor.maxHealth * EORMEN.healthFloor);
    let phase = this.brain.phase;
    while (this.broken.has(phase)) phase++;
    const next = EORMEN.phases[phase - 1];
    if (next !== undefined) min = Math.max(min, Math.floor(this.actor.maxHealth * next) + 1);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  private outcome(kind: 'released' | 'defeated'): void {
    this.brain.onDefeated();
    this.outcomeKind = kind;
    this.outcomeT = 0;
    this.clearTelegraph();
    this.ring.stop();
    this.flying.clear();
    this.crumbleHusks();
    this.dark.restore();
    this.gong?.setOpen(false);
    this.actor.untargetable = true;
    this.actor.hittable = false;
    if (kind === 'released') this.dissolve(RELEASE_SECONDS, 0xdff4ff);
    else this.model?.play('death');
  }

  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    if (this.outcomeKind === 'defeated' && !this.dissolved && this.outcomeT >= DEATH_CLIP_SECONDS) {
      this.dissolved = true;
      this.dissolve(PRESENTATION.deathSeconds - DEATH_CLIP_SECONDS, 0x2a2a30);
    }
    const total = this.outcomeKind === 'released' ? RELEASE_SECONDS : PRESENTATION.deathSeconds;
    if (this.outcomeT >= total) this.finish(this.outcomeKind ?? 'defeated');
  }

  private dissolve(seconds: number, tint: number): void {
    const vfx = this.ctx.services.get('vfx');
    if (!vfx || !this.model) return;
    try {
      void vfx.dissolve(this.model.root, seconds, { tint }).catch(() => {});
    } catch (err) {
      this.warnOnce(`dissolve failed: ${String(err)}`);
    }
  }

  private finish(end: EormenEnd): void {
    if (this.ended) return;
    this.ended = true;
    if (this.telegraphKind && end === 'reset') this.brain.stopAttack();
    for (const off of this.offs.splice(0)) off();
    for (const off of this.parts.splice(0)) off();
    this.unregister = null;
    this.crumbleHusks();
    this.dark.restore();
    this.gong?.dispose();
    this.gong = null;
    this.flying.dispose();
    this.ring.dispose();
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
