// One Bellows-Engine fight (D07; plans/act4-L6.md sections 1 to 3): the actor and model, the registry registration, the brain's
// hooks (the punch, the steam jet, the coal shots), the plating (no poise from any hit), the vent's x 1.5, the sealed volleys
// (immune), the health floor, the four valves on L0's structure-break hook, and the death. The arena (BellowsDirector) owns
// the trigger, the intro, the gate and the reset rules.
import * as THREE from 'three';
import type { Actor } from '../../../actors/Actor';
import type { BossDef } from '../../../actors/BossRegistry';
import type { ModifiableRequest } from '../../../actors/DamageResolver';
import type { GameContext } from '../../../core/Game';
import type { StructureBreaksService } from '../../structureBreak';
import { BellowsBrain, type BellowsHooks } from './BellowsBrain';
import type { BellowsModel } from './BellowsModel';
import { CoalShots, SteamCone } from './bellowsFx';
import {
  BELLOWS,
  BELLOWS_BOSS_ID,
  BELLOWS_KIND,
  BELLOWS_NAME_KEY,
  bellowsScale,
  COAL,
  PRESENTATION,
  PUNCH,
  STEAM,
  TELEGRAPH_SECONDS,
  VENT,
  valvePartId,
} from './tuning';
import { ValveBank, type ValveShutResult, type ValveSource } from './valves';

declare module '../../../core/events' {
  interface GameEventMap {
    /** A dark valve turned or struck, or the live one refused (a dry hiss; L8 may voice it). */
    'bellows.valve.dud': { n: number };
    /** Valve `n` is live for the phase (the HUD hint and the real-game log read it). -1: none. */
    'bellows.valve.live': { n: number };
  }
}

export const BELLOWS_FLOOR_MODIFIER_ID = 'bosses.bellows.floor';
export const BELLOWS_PLATE_MODIFIER_ID = 'bosses.bellows.plate';

export const BELLOWS_BOSS_DEF: BossDef = {
  bossId: BELLOWS_BOSS_ID,
  nameKey: BELLOWS_NAME_KEY,
  phases: BELLOWS.phases,
  breaksPerPhase: BELLOWS.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: BELLOWS.releaseWindowSeconds,
};

export interface BellowsPlaces {
  centre: THREE.Vector3;
  centreYaw: number;
  /** The four valves, in number order. */
  valves: THREE.Vector3[];
  /** The three coal chutes behind the engine. */
  chutes: THREE.Vector3[];
}

export type BellowsEnd = 'defeated' | 'reset';

export interface BellowsEncounterOptions {
  model: BellowsModel | null;
  places: BellowsPlaces;
  level: number;
  warn: (message: string) => void;
  onEnd: (end: BellowsEnd) => void;
}

/** The valve to light: of those not used yet, the one farthest from the player (ties by number). -1 when none is left. */
export function pickLiveValve(valves: readonly { x: number; z: number }[], used: ReadonlySet<number>, player: { x: number; z: number }): number {
  let best = -1;
  let bestD = -Infinity;
  for (let i = 0; i < valves.length; i++) {
    if (used.has(i)) continue;
    const d = Math.hypot(valves[i].x - player.x, valves[i].z - player.z);
    if (d > bestD + 1e-9) {
      bestD = d;
      best = i;
    }
  }
  return best;
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

export class BellowsEncounter implements BellowsHooks {
  readonly actor: Actor;
  readonly brain: BellowsBrain;
  private readonly ctx: GameContext;
  private readonly model: BellowsModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: BellowsPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: BellowsEnd) => void;
  private readonly scale: number;
  private readonly offs: (() => void)[] = [];
  private readonly parts: (() => void)[] = [];
  private readonly shots = new CoalShots();
  private readonly steam = new SteamCone();
  private readonly tmp = new THREE.Vector3();
  private valves: ValveBank | null = null;
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  private yaw: number;
  /** Phases whose bar is broken (1-based). */
  private readonly broken = new Set<number>();
  /** Valves that produced a bar (0-based). */
  private readonly used = new Set<number>();
  private live = -1;
  private floorLifted = false;
  private telegraphKind: 'punch' | 'steam' | null = null;
  private telegraphT = 0;
  private jetSwing = -1;
  private outcomeT = -1;
  private pendingBreak: { index: number; phase: number; ticks: number } | null = null;
  private readonly warned = new Set<string>();
  /** The engine's static body (a cylinder of BELLOWS.colliderRadius): the player cannot walk through it. Null without physics. */
  bodyCollider: unknown = null;
  /** `register()` could not mount the valves: the director stops arming until the next trigger enter (no retry loop). */
  mountFailed = false;
  /** Valve shuts that broke a bar (tests and the real-game log). */
  valveBreaks = 0;

  constructor(ctx: GameContext, opts: BellowsEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.scale = bellowsScale(opts.level);
    this.yaw = opts.places.centreYaw;
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-bellows-engine';
    this.root.position.copy(opts.places.centre);
    this.model?.setYaw(this.yaw);
    ctx.scene.add(this.root, this.shots.group, this.steam.mesh);

    this.actor = ctx.actors.spawn({
      kind: BELLOWS_KIND,
      team: 'hostile',
      level: opts.level,
      maxHealth: Math.round(BELLOWS.maxHealth * this.scale),
      maxPoise: BELLOWS.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      hittable: false,
    });
    this.actor.untargetable = true;
    this.actor.data['audio'] = { material: 'metal' };
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    if (opts.model) this.addBody(opts.places.centre);
    this.offs.push(
      ctx.damage.addModifier(BELLOWS_PLATE_MODIFIER_ID, (req) => this.plate(req), BELLOWS.plateModifierOrder),
      ctx.damage.addModifier(BELLOWS_FLOOR_MODIFIER_ID, (req) => this.floor(req), BELLOWS.floorModifierOrder),
    );
    this.brain = new BellowsBrain(this);

    const mine = (p: { bossId: string }) => p.bossId === BELLOWS_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        this.broken.add(p.phase);
        if (p.last) this.floorLifted = true;
        this.pendingBreak = null;
        this.shots.clear();
        this.brain.onBreak();
        this.light(-1);
        // The forced stagger emptied his poise; refill it once the registry has counted the bar, so nothing reads him as
        // staggered through the vent (the Warden's staggered-target bonus, the bar's poise).
        this.actor.restorePoise();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (mine(p)) this.brain.onPhase(p.phase);
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome();
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

  get view(): BellowsModel | null {
    return this.model;
  }

  /** The live valve (0-based), -1 for none (sealed, vented, or this phase's bar is broken). */
  get liveValve(): number {
    return this.live;
  }

  /** The head's yaw (tests). */
  get headYaw(): number {
    return this.yaw;
  }

  /** The valve bank (tests, the real-game driver). */
  get valveBank(): ValveBank | null {
    return this.valves;
  }

  get liveCoal(): number {
    return this.shots.liveCount;
  }

  /** Registers after the intro: the bar and music follow `boss.started`; mounts the valves and the structure parts. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    const breaks = this.breaks();
    if (!breaks) {
      this.warn('no structureBreaks service; the engine does not start');
      return false;
    }
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, {
        ...BELLOWS_BOSS_DEF,
        // The machine breaks only through its valves (the structure-break hook): a parry, a howl or Second Wind is no pip.
        acceptBreak: () => {
          if (breaks.acceptBreak(BELLOWS_BOSS_ID)) return true;
          this.actor.restorePoise();
          return false;
        },
      });
    } catch (err) {
      this.warn(`could not register the engine: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    try {
      this.places.valves.forEach((_, i) => this.parts.push(breaks.register({ id: valvePartId(i + 1), bossId: BELLOWS_BOSS_ID })));
      this.valves = new ValveBank(this.ctx, { places: this.places.valves, onShut: (i, s) => this.shutValve(i, s), warn: this.warn });
    } catch (err) {
      this.warn(`could not mount the valves: ${err instanceof Error ? err.message : String(err)}`);
      this.mountFailed = true;
      this.finish('reset');
      return false;
    }
    this.actor.hittable = true;
    this.actor.untargetable = false;
    this.brain.start();
    this.light(this.pick());
    return true;
  }

  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.model?.update(dt);
    this.steam.update(dt);
    if (this.outcomeT >= 0) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;
    this.checkPendingBreak();
    this.valves?.tick(dt);
    this.shots.update(dt, (at) => this.coalLands(at));
    if (this.ended || this.outcomeT >= 0) return;
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    this.turn(dt, feet);
    this.brain.tick(dt, { dist: Math.hypot(feet.x - c.x, feet.z - c.z) });
    if (this.ended || this.outcomeT >= 0) return;
    if (this.telegraphKind) {
      this.telegraphT += dt;
      const k = Math.min(1, this.telegraphT / TELEGRAPH_SECONDS);
      if (this.telegraphKind === 'punch') this.model?.setDraw(k);
      else this.model?.setFlash(k);
    }
    if (this.steam.active) this.steam.show(this.nozzle(), this.yaw);
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
   * A valve shut by F or a hit (0-based), also the headless driver's path. The live valve, while the engine can take a break,
   * strikes its structure part and forces the stagger the registry counts; anything else is a dud or a refusal.
   */
  shutValve(index: number, _source: ValveSource = 'interact'): ValveShutResult {
    if (!this.contested) return 'refused';
    if (index !== this.live) {
      this.ctx.events.emit('bellows.valve.dud', { n: index + 1 });
      return 'dud';
    }
    if (!this.brain.canBreak || this.broken.has(this.brain.phase)) {
      this.ctx.events.emit('bellows.valve.dud', { n: index + 1 });
      return 'refused';
    }
    const breaks = this.breaks();
    if (!breaks || breaks.strike(valvePartId(index + 1)) !== 'armed') {
      this.warnOnce(`valve ${index + 1} did not arm a break`);
      return 'refused';
    }
    if (this.actor.poise <= 0) this.actor.restorePoise();
    const staggered = this.ctx.damage.stagger(this.actor.id, this.ctx.player.actor.id, Math.max(1, this.actor.poise));
    // The stagger's `boss.break` may arrive after this returns (a hit's events are batched), so a true stagger is the answer.
    if (!staggered) {
      // Drain the armed break so a later parry cannot spend it.
      breaks.acceptBreak(BELLOWS_BOSS_ID);
      this.actor.restorePoise();
      this.warn(`valve ${index + 1}: the registry refused the break`);
      return 'refused';
    }
    this.used.add(index);
    this.valveBreaks++;
    // The bar arrives with the stagger's events (now, or after the hit that shut the valve); `tick` undoes the shut if not.
    this.pendingBreak = { index, phase: this.brain.phase, ticks: 0 };
    return 'vented';
  }

  // ---- BellowsHooks ----

  telegraph(attack: 'punch' | 'steam', swingId: number, lead: number): void {
    const def = attack === 'punch' ? PUNCH : STEAM;
    this.ctx.events.emit('telegraph', { actorId: this.actor.id, kind: def.telegraph, attackId: def.attackId, moveId: def.attackId, swingId, leadSeconds: lead });
    this.telegraphKind = attack;
    this.telegraphT = 0;
  }

  cancelTelegraph(swingId: number): void {
    this.ctx.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId });
    this.clearTelegraph();
  }

  punch(swingId: number): void {
    this.clearTelegraph();
    this.model?.slam();
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    const d = Math.hypot(feet.x - c.x, feet.z - c.z);
    if (d > PUNCH.reach || Math.abs(angleTo(this.yaw, yawToward(c, feet))) > PUNCH.halfArc) return;
    this.hit(PUNCH.attackId, swingId, PUNCH.damage, PUNCH.poise, false);
  }

  jetStart(swingId: number): void {
    this.clearTelegraph();
    this.jetSwing = swingId;
    this.model?.setFlash(1);
    this.steam.show(this.nozzle(), this.yaw);
  }

  jetTick(swingId: number): void {
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    const d = Math.hypot(feet.x - c.x, feet.z - c.z);
    if (d > STEAM.range || Math.abs(angleTo(this.yaw, yawToward(c, feet))) > STEAM.halfArc) return;
    this.hit(STEAM.attackId, swingId, STEAM.damage, STEAM.poise, true);
  }

  jetEnd(): void {
    this.jetSwing = -1;
    this.steam.stop();
    this.model?.setFlash(0);
  }

  coal(swingId: number, offset: number): void {
    const feet = this.ctx.player.feet;
    const c = this.root.position;
    // The flanking shots sit to either side of the player, across the line from the engine.
    const dx = feet.x - c.x;
    const dz = feet.z - c.z;
    const len = Math.hypot(dx, dz) || 1;
    const to = { x: feet.x + (-dz / len) * offset * COAL.flank, y: feet.y, z: feet.z + (dx / len) * offset * COAL.flank };
    const chutes = this.places.chutes;
    const from = chutes.length ? chutes[(swingId + offset + 1 + chutes.length * 4) % chutes.length] : c;
    this.shots.fire({ x: from.x, y: from.y + 5, z: from.z }, to);
    if (offset === 0) {
      this.ctx.events.emit('telegraph', {
        actorId: this.actor.id,
        kind: COAL.telegraph,
        attackId: COAL.attackId,
        moveId: COAL.attackId,
        swingId,
        leadSeconds: COAL.flightSeconds,
      });
    }
  }

  ventStart(): void {
    this.clearTelegraph();
    this.steam.stop();
    this.model?.setVented(true);
  }

  ventEnd(): void {
    // No valve to light here: a vent always follows this phase's bar, and the next phase lights its valve at the seal's end.
    this.model?.setVented(false);
  }

  sealStart(): void {
    this.clearTelegraph();
    this.steam.stop();
    this.light(-1);
  }

  sealEnd(): void {
    if (!this.broken.has(this.brain.phase)) this.light(this.pick());
  }

  // ---- internals ----

  /**
   * Backstop: a shut whose stagger the registry did not count (no `boss.break` by the next tick) would leave the phase with no bar
   * and its valve shut for good. Undo it: drain the armed break, reopen the valve and light it again.
   */
  private checkPendingBreak(): void {
    const p = this.pendingBreak;
    if (!p) return;
    if (this.broken.has(p.phase)) {
      this.pendingBreak = null;
      return;
    }
    if (++p.ticks < 2) return;
    this.pendingBreak = null;
    this.breaks()?.acceptBreak(BELLOWS_BOSS_ID);
    this.used.delete(p.index);
    this.valveBreaks--;
    this.actor.restorePoise();
    this.valves?.reopen(p.index);
    this.live = -2;
    this.light(p.index);
    this.warnOnce(`valve ${p.index + 1}: the registry did not count the bar; the valve reopens`);
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

  private pick(): number {
    return pickLiveValve(this.places.valves, this.used, this.ctx.player.feet);
  }

  private light(index: number): void {
    if (this.live === index) return;
    this.live = index;
    this.valves?.setLive(index);
    this.ctx.events.emit('bellows.valve.live', { n: index < 0 ? -1 : index + 1 });
  }

  private clearTelegraph(): void {
    this.telegraphKind = null;
    this.telegraphT = 0;
    this.model?.setDraw(0);
    if (this.jetSwing < 0) this.model?.setFlash(0);
  }

  /** The head turns toward the player at the turn rate, except while stalled, sealed or blowing the jet. */
  private turn(dt: number, feet: THREE.Vector3Like): void {
    const st = this.brain.state;
    if (st === 'vented' || st === 'sealed' || st === 'jet' || st === 'dying') return;
    const c = this.root.position;
    if (Math.hypot(feet.x - c.x, feet.z - c.z) < 1e-3) return;
    const want = yawToward(c, feet);
    const d = angleTo(this.yaw, want);
    const step = BELLOWS.turnRate * dt;
    this.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
    this.model?.setYaw(this.yaw);
  }

  private nozzle(): THREE.Vector3 {
    if (this.model) return this.model.nozzleWorld(this.tmp);
    const c = this.root.position;
    return this.tmp.set(c.x - Math.sin(this.yaw) * 2.1, c.y + 2.6, c.z - Math.cos(this.yaw) * 2.1);
  }

  /** `dodgeOnly`: red, unblockable and never parried (the jet, coal). Otherwise blockable and parryable (the punch: a parry is no pip). */
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

  private coalLands(at: THREE.Vector3): void {
    const feet = this.ctx.player.feet;
    if (Math.abs(feet.y - at.y) > 2.5 || Math.hypot(feet.x - at.x, feet.z - at.z) > COAL.radius) return;
    this.hit(COAL.attackId, -1, COAL.damage, COAL.poise, true);
  }

  /** Plating: no hit drains poise; sealed: immune; vented: x 1.5. */
  private plate(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || !this.registered || this.outcomeT >= 0) return;
    req.poise = 0;
    if (req.outcome !== 'hit') return;
    if (this.brain.sealed) {
      req.outcome = 'immune';
      return;
    }
    if (this.brain.vented) req.amount *= VENT.damageScale;
  }

  /** Health stays above the next threshold until this phase's bar, and at the 8 % floor until the last bar. */
  private floor(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered) return;
    let min = Math.ceil(this.actor.maxHealth * BELLOWS.healthFloor);
    // The first phase from here whose bar is still whole holds health above its end (one hit cannot cross two thresholds).
    let phase = this.brain.phase;
    while (this.broken.has(phase)) phase++;
    const next = BELLOWS.phases[phase - 1];
    if (next !== undefined) min = Math.max(min, Math.floor(this.actor.maxHealth * next) + 1);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  private outcome(): void {
    this.brain.onDefeated();
    this.outcomeT = 0;
    this.clearTelegraph();
    this.steam.stop();
    this.shots.clear();
    this.light(-1);
    this.actor.untargetable = true;
    this.actor.hittable = false;
    this.model?.setVented(true);
  }

  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    if (this.outcomeT >= PRESENTATION.deathSeconds) this.finish('defeated');
  }

  private addBody(at: THREE.Vector3): void {
    const physics = this.ctx.physics;
    if (!physics?.ready) return;
    try {
      const half = BELLOWS.colliderHeight / 2;
      const desc = physics.rapier.ColliderDesc.cylinder(half, BELLOWS.colliderRadius).setTranslation(at.x, at.y + half, at.z);
      const collider = physics.addStaticCollider(desc);
      this.bodyCollider = collider;
      this.offs.push(() => {
        physics.removeCollider(collider);
        this.bodyCollider = null;
      });
    } catch (err) {
      this.warnOnce(`no body collider (${String(err)})`);
    }
  }

  private finish(end: BellowsEnd): void {
    if (this.ended) return;
    this.ended = true;
    if (this.telegraphKind && end === 'reset') this.brain.stopAttack();
    for (const off of this.offs.splice(0)) off();
    for (const off of this.parts.splice(0)) off();
    // The registry drops the registration on `actor.despawned` (exactly one `boss.ended`); only a teardown unregisters first.
    this.unregister = null;
    this.valves?.dispose();
    this.valves = null;
    this.shots.dispose();
    this.steam.dispose();
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
