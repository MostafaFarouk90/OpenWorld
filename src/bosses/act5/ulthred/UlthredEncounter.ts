// One Ulthred fight (D10; plans/act5-N6.md section 3 and "PR 2 build notes"): the actor and model, the registry registration, the
// brain's hooks, the nine bar floors, the per-phase poise rules (phase 1: only while the hammer is stuck; phase 2: only a cracked
// anvil breaks a bar; phase 3: heavy x 2, light x 0.5), the floor drop to the Anvil at 66% (the same actor moves), the crack-anvils,
// forge-fire, the chains, the spirit-flames, the Scar tax, Vey's armour, and the Heartshard at the ninth break. The director owns
// the hall trigger, the intro, the gate, the arena pieces and the reset rules.
import * as THREE from 'three';
import type { Actor } from '../../../actors/Actor';
import type { BossDef } from '../../../actors/BossRegistry';
import type { ModifiableRequest } from '../../../actors/DamageResolver';
import { ensureAct5Sfx } from '../../../audio/act5/act5SfxEnsure';
import type { GameContext } from '../../../core/Game';
import { spiritFlamesFor } from '../../../quests/content/act5/foundry/spiritFlames';
import { yawToward } from '../../prior/geometry';
import { barFloorHealth, clampToFloor } from '../shared/barFloors';
import { bossPoiseScale } from '../shared/heavyHits';
import { GroundRing } from '../vey/veyFx';
import type { AnvilArena } from './anvilArena';
import { LavaLines } from './lavaLines';
import { UlthredBrain, type UlthredHooks, type UlthredMove } from './UlthredBrain';
import type { ArmourLook, UlthredClip, UlthredModel } from './UlthredModel';
import { distToSegment, GroundLine, lineEnd } from './ulthredFx';
import {
  ANVILS,
  CHAINS,
  FLAMES,
  FORGEFIRE,
  HEARTSHARD,
  LOOK,
  PRESENTATION,
  SCAR_TAX,
  SLAM,
  SWEEP,
  ULTHRED,
  ULTHRED_BOSS_ID,
  ULTHRED_KIND,
  ULTHRED_NAME_KEY,
  VEY_OUTCOME_FLAG,
  ulthredScale,
} from './tuning';

export const ULTHRED_FLOOR_MODIFIER_ID = 'bosses.ulthred.floor';
export const ULTHRED_POISE_MODIFIER_ID = 'bosses.ulthred.poise';
export const ANVIL_INTERACT_PREFIX = 'anvil:crack-';
export const ARMOUR_BARK_KEYS = { body: 'bosses.ulthred.armour.body', hollow: 'bosses.ulthred.armour.hollow' } as const;

export const ULTHRED_BOSS_DEF: BossDef = {
  bossId: ULTHRED_BOSS_ID,
  nameKey: ULTHRED_NAME_KEY,
  phases: ULTHRED.phases,
  breaksPerPhase: ULTHRED.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: ULTHRED.releaseWindowSeconds,
};

export interface UlthredBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface UlthredPlaces {
  centre: THREE.Vector3;
  centreYaw: number;
  bounds: UlthredBounds;
}

export type UlthredEnd = 'defeated' | 'reset';

/** What the director gives the encounter for phase 2 (the drop and the Anvil's pieces). */
export interface UlthredStage {
  /** The Anvil's arena (greybox now, N1's later); null when it could not be built (the drop then resets the fight). */
  anvil(): AnvilArena | null;
  /** Sets a `bossArena` piece's state ('floor', 'ring', 'anvils', 'flames', 'lines'). */
  piece(pieceId: string, state: string): void;
  /** The drop's teleport to the island (`bossArena.phaseTeleport`); false when refused. */
  teleportToAnvil(): Promise<boolean>;
  /** Cael's toast/subtitle line. */
  say(key: string): void;
  /** Puts Cael back at the hall mouth (a drop teleport that landed after the fight had already ended). */
  toHallMouth?(): void;
}

export interface UlthredEncounterOptions {
  model: UlthredModel | null;
  places: UlthredPlaces;
  level: number;
  stage: UlthredStage;
  warn: (message: string) => void;
  onEnd: (end: UlthredEnd) => void;
}

interface AnvilState {
  cracked: boolean;
  primed: number;
}

export class UlthredEncounter implements UlthredHooks {
  readonly actor: Actor;
  readonly brain: UlthredBrain;
  readonly lines: LavaLines;
  private readonly ctx: GameContext;
  private readonly model: UlthredModel | null;
  private readonly root: THREE.Object3D;
  private readonly stage: UlthredStage;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: UlthredEnd) => void;
  private readonly scale: number;
  private readonly offs: (() => void)[] = [];
  private readonly ring = new GroundRing('ulthred-sweep');
  private readonly fires: GroundRing[] = [];
  private readonly slamLine = new GroundLine('ulthred-slam-line');
  private readonly chainLines: GroundLine[] = [];
  private readonly warned = new Set<string>();
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  private poiseIdle = 0;
  private telegraphT = -1;
  private telegraphLead = 1;
  private telegraphMove: UlthredMove | null = null;
  private loopClip: UlthredClip | null = null;
  private outcomeT = 0;
  private dying = false;
  private crackPending = false;
  private dropT = -1;
  private dropHold: (() => void) | null = null;
  private onIsland = false;
  private bounds: UlthredBounds;
  private slamFrom = new THREE.Vector3();
  private slamTo = new THREE.Vector3();
  private fireAt: THREE.Vector3[] = [];
  private chainEnds: [THREE.Vector3, THREE.Vector3][] = [];
  private anvils: AnvilState[] = [];
  private anvilUndos: (() => void)[] = [];
  private heartUndo: (() => void) | null = null;
  /** Global bars broken (0..9; the registry counts per phase). */
  bars = 0;
  /** Phase-1 and phase-3 poise breaks above the floor, which did not count (tests). */
  earlyStaggers = 0;
  /** Lit spirit-flames this fight (phase 3). */
  flames = 0;
  armour: ArmourLook = 'none';
  scarTaxPaid = false;

  constructor(ctx: GameContext, opts: UlthredEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.stage = opts.stage;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.bounds = { ...opts.places.bounds };
    this.scale = ulthredScale(opts.level);
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-ulthred';
    this.root.position.copy(opts.places.centre);
    this.root.rotation.set(0, opts.places.centreYaw, 0);
    ctx.scene.add(this.root, this.ring.group, this.slamLine.mesh);
    for (let i = 0; i < CHAINS.count; i++) {
      const l = new GroundLine(`ulthred-chain-${i + 1}`, LOOK.chain);
      this.chainLines.push(l);
      ctx.scene.add(l.mesh);
    }
    this.lines = new LavaLines(() => ctx.services.get('lava'), this.warn);

    this.actor = ctx.actors.spawn({
      kind: ULTHRED_KIND,
      team: 'hostile',
      level: opts.level,
      maxHealth: Math.round(ULTHRED.maxHealth * this.scale),
      maxPoise: ULTHRED.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      hittable: false,
    });
    this.actor.untargetable = true;
    this.actor.data['audio'] = { material: 'metal' };
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(ULTHRED_POISE_MODIFIER_ID, (req) => this.poise(req), ULTHRED.poiseModifierOrder),
      ctx.damage.addModifier(ULTHRED_FLOOR_MODIFIER_ID, (req) => this.floor(req), ULTHRED.floorModifierOrder),
    );
    this.brain = new UlthredBrain(this);

    const mine = (p: { bossId: string }) => p.bossId === ULTHRED_BOSS_ID && this.registered && !this.ended;
    const player = () => ctx.player.actor.id;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
                if (!mine(p)) return;
        this.bars++;
        // The bar is counted; his guard is whole again for the next one (an early stagger there does not count).
        this.actor.restorePoise();
        this.poiseIdle = 0;
        this.model?.setEmbers(this.bars / 9);
        if (this.bars >= 9) this.kneelStart();
        else this.brain.onBreak();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (!mine(p)) return;
        if (p.phase === 2) this.beginDrop();
        if (p.phase === 3) this.beginPhase3();
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome();
      }),
      ctx.events.on('damage.dealt', (r) => {
        if (r.targetId === this.actor.id && r.outcome === 'hit') this.poiseIdle = 0;
      }),
      ctx.events.on('player.leap', (e) => {
        if (e.phase === 'land' && e.to) this.primeAnvils(e.to);
      }),
      // A player swing opens its attack window (the player emits no `telegraph`; src/siege/gate.ts reads the same event).
      ctx.events.on('attack.window', (w) => {
        if (w.phase === 'open' && w.actorId === player()) this.strikeAnvils();
      }),
    );
    this.loop('idle');
  }

  get fighting(): boolean {
    return this.registered && !this.ended;
  }

  get contested(): boolean {
    return this.fighting && !this.dying;
  }

  get done(): boolean {
    return this.ended;
  }

  get outcomePlaying(): boolean {
    return this.dying;
  }

  get view(): UlthredModel | null {
    return this.model;
  }

  /** The fight has dropped to the Anvil (phases 2 and 3). */
  get island(): boolean {
    return this.onIsland;
  }

  /** The floor drop is running (invulnerable, autosave held). */
  get dropping(): boolean {
    return this.dropT >= 0;
  }

  get kneeling(): boolean {
    return this.brain.state === 'kneel';
  }

  /** Anvils cracked this fight (tests). */
  get cracked(): number {
    return this.anvils.filter((a) => a.cracked).length;
  }

  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, { ...ULTHRED_BOSS_DEF, acceptBreak: () => this.acceptBreak() });
    } catch (err) {
      this.warn(`could not register Ulthred: ${err instanceof Error ? err.message : String(err)}`);
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
    this.lines.tick(dt);
    if (this.dying) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;
    if (this.dropT >= 0) {
      this.tickDrop(dt);
      return;
    }
    const player = this.ctx.player.feet;
    const pos = this.root.position;
    const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.brain.tick(dt, { dist });
    if (this.ended || this.dying) return;
    this.move(dt, player, dist);
    this.glow(dt);
    for (const a of this.anvils) if (a.primed > 0) a.primed = Math.max(0, a.primed - dt);
    const st = this.brain.state;
    if (st !== 'broken' && st !== 'kneel' && st !== 'drop') {
      this.poiseIdle += dt;
      if (this.poiseIdle >= ULTHRED.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.actor.restorePoise();
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

  /** The Heartshard (hold-F at the kneel; also the test helper's route): the only thing that kills him. */
  heartshard(): boolean {
    if (!this.kneeling || this.ended || this.dying) return false;
    const r = this.ctx.damage.apply({
      attackerId: this.ctx.player.actor.id,
      targetId: this.actor.id,
      amount: this.actor.health,
      poise: 0,
      kind: 'script',
      attackId: HEARTSHARD.attackId,
    });
    if (!this.actor.dead) {
      this.warnOnce(`the Heartshard did not land (${r?.outcome ?? 'dropped'}); killing directly`);
      this.ctx.damage.kill(this.actor.id, this.ctx.player.actor.id);
    }
    return true;
  }

  /** Cracks an anvil (a leap and a swing, or the hold-F fallback): his bar breaks. Tests and the interactable call it. */
  crackAnvil(index: number): boolean {
    const a = this.anvils[index];
    if (!a || a.cracked || !this.onIsland || this.brain.phase !== 2 || this.dropping || this.dying || !this.registered) return false;
    a.cracked = true;
    a.primed = 0;
    this.crackPending = true;
    this.actor.restorePoise();
    const staggered = this.ctx.damage.stagger(this.actor.id, this.ctx.player.actor.id, 999);
    if (!staggered) {
      // No break: the anvil stays whole (its prompt and a later leap can still crack it).
      a.cracked = false;
      this.crackPending = false;
      this.warnOnce('a cracked anvil could not stagger him');
      return false;
    }
    this.stage.anvil()?.setAnvilCracked(index, true);
    this.stage.piece('anvils', this.anvilsState());
    this.sfx('sfx.anvil.strike');
    return true;
  }

  private anvilsState(): string {
    return `cracked:${this.anvils.map((x, i) => (x.cracked ? i : -1)).filter((i) => i >= 0).join(',')}`;
  }

  // ---- UlthredHooks ----

  telegraph(move: UlthredMove, swingId: number, leadSeconds: number): void {
    this.ctx.events.emit('telegraph', {
      actorId: this.actor.id,
      kind: move.telegraph,
      attackId: move.attackId,
      moveId: move.attackId,
      swingId,
      leadSeconds,
    });
    this.telegraphT = 0;
    this.telegraphLead = Math.max(0.05, leadSeconds);
    this.telegraphMove = move;
    const pos = this.root.position;
    if (move === SLAM) {
      this.oneShot('slam');
    } else if (move === SWEEP) {
      this.oneShot('sweep');
      this.ring.tell(pos, SWEEP.radius, 0);
    } else if (move === FORGEFIRE) {
      this.oneShot('fire');
      const feet = this.ctx.player.feet;
      const anvil = this.stage.anvil();
      this.fireAt = [...(anvil?.anvils ?? []).map((a) => a.clone()), new THREE.Vector3(feet.x, feet.y, feet.z)];
      while (this.fires.length < this.fireAt.length) {
        const r = new GroundRing(`ulthred-forgefire-${this.fires.length + 1}`, LOOK.fire);
        this.fires.push(r);
        this.ctx.scene.add(r.group);
      }
      this.fireAt.forEach((p, i) => this.fires[i]!.tell(p, FORGEFIRE.radius, 0));
    } else if (move === CHAINS) {
      this.oneShot('chains');
      const c = this.stage.anvil()?.centre ?? pos;
      const base = Math.random() * Math.PI;
      this.chainEnds = Array.from({ length: CHAINS.count }, (_, k) => {
        const yaw = base + (k * Math.PI) / CHAINS.count;
        const half = CHAINS.length / 2;
        return [lineEnd(c, yaw, half), lineEnd(c, yaw + Math.PI, half)] as [THREE.Vector3, THREE.Vector3];
      });
    }
  }

  slam(swingId: number, length: number): void {
    this.endTelegraph();
    const pos = this.root.position;
    this.slamFrom.copy(pos);
    this.slamTo.copy(lineEnd(pos, this.root.rotation.y, length));
    this.slamLine.show(this.slamFrom, this.slamTo, SLAM.halfWidth, 1);
    this.sfx('sfx.ulthred.hammer');
    const feet = this.ctx.player.feet;
    if (Math.abs(feet.y - pos.y) <= 2.5 && distToSegment(feet, this.slamFrom, this.slamTo) <= SLAM.halfWidth) this.hitPlayer(SLAM, swingId, {});
    // Phase 1 only: the hall floor takes a lava line (N3's lava never kills).
    if (this.brain.phase === 1 && !this.onIsland) this.lines.add(this.slamFrom, this.slamTo, pos.y);
    this.lineHideT = 0.5;
  }

  sweep(swingId: number): void {
    this.endTelegraph();
    this.ring.hide();
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    if (Math.abs(feet.y - pos.y) <= 2.5 && Math.hypot(feet.x - pos.x, feet.z - pos.z) <= SWEEP.radius) this.hitPlayer(SWEEP, swingId, {});
  }

  forgefire(swingId: number): void {
    this.endTelegraph();
    for (const r of this.fires) r.hide();
    const feet = this.ctx.player.feet;
    const hit = this.fireAt.some((p) => Math.abs(feet.y - p.y) <= 2.5 && Math.hypot(feet.x - p.x, feet.z - p.z) <= FORGEFIRE.radius);
    if (!hit) return;
    const r = this.hitPlayer(FORGEFIRE, swingId, { unblockable: true });
    if (r && r.outcome === 'hit') {
      try {
        this.ctx.services.get('spells')?.addBurn(FORGEFIRE.burn, 'forge-fire');
      } catch (err) {
        this.warnOnce(`forge-fire Burn failed (${String(err)})`);
      }
    }
  }

  chains(swingId: number): void {
    this.endTelegraph();
    for (const l of this.chainLines) l.hide();
    const feet = this.ctx.player.feet;
    const ground = this.stage.anvil()?.centre.y ?? this.root.position.y;
    if (feet.y - ground > CHAINS.jumpClear) return;
    const hit = this.chainEnds.some(([a, b]) => distToSegment(feet, a, b) <= CHAINS.halfWidth);
    if (hit) this.hitPlayer(CHAINS, swingId, { unblockable: true });
  }

  stagger(): void {
    this.endTelegraph();
    this.ring.hide();
    this.oneShot('stagger');
  }

  kneel(): void {
    this.endTelegraph();
    this.ring.hide();
    this.oneShot('kneel');
  }

  // ---- internals ----

  private lineHideT = 0;

  private hitPlayer(move: { attackId: string; damage: number; poise?: number }, swingId: number, extra: { unblockable?: true }) {
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
      poise: move.poise ?? 0,
      kind: 'melee',
      attackId: move.attackId,
      swingId,
      direction,
      ...extra,
    });
  }

  private floorHealth(): number {
    return barFloorHealth(this.actor.maxHealth, ULTHRED.floors, Math.min(this.bars, ULTHRED.floors.length - 1));
  }

  /**
   * Phase 2: a break counts only from a cracked anvil. Phases 1 and 3: only once his health is held at the bar's floor (Eormen's
   * lesson); earlier, a plain stagger (poise refilled). Never during the drop or the kneel.
   */
  private acceptBreak(): boolean {
    if (this.kneeling || this.dropping || this.dying) {
      this.actor.restorePoise();
      return false;
    }
    if (this.crackPending) {
      this.crackPending = false;
      return true;
    }
    if (this.brain.phase === 2) {
      this.actor.restorePoise();
      return false;
    }
    if (this.actor.health <= this.floorHealth() + this.actor.maxHealth * ULTHRED.floorMargin) return true;
    this.earlyStaggers++;
    this.actor.restorePoise();
    this.oneShot('hit');
    return false;
  }

  /** Phase 1: poise only while the hammer is stuck; phase 2: none from hits; phase 3: heavy x 2, light x 0.5. */
  private poise(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || !this.registered) return;
    if (req.attackId === HEARTSHARD.attackId) return;
    if (this.brain.invulnerable || this.dropping) {
      req.outcome = 'immune';
      return;
    }
    if (req.attackerId !== this.ctx.player.actor.id) {
      req.poise = 0;
      return;
    }
    const phase = this.brain.phase;
    if (phase === 2 || (phase === 1 && !this.brain.stuck)) {
      req.poise = 0;
      return;
    }
    req.poise *= bossPoiseScale(req);
  }

  /** Health stops at the next unbroken bar's floor; the spirit-flames lift Cael's hits in phase 3; only the Heartshard kills. */
  private floor(req: ModifiableRequest): void {
    if (req.targetId !== this.actor.id || !this.registered || this.dying) return;
    if (req.attackId === HEARTSHARD.attackId) {
      if (this.kneeling) {
        req.outcome = 'hit';
        req.amount = Math.max(req.amount, this.actor.health);
      } else req.amount = 0;
      return;
    }
    if (this.kneeling) {
      req.amount = 0;
      return;
    }
    if (this.flames > 0 && req.attackerId === this.ctx.player.actor.id && req.outcome === 'hit') req.amount *= 1 + FLAMES.bonus * this.flames;
    clampToFloor(req, this.actor.health, this.floorHealth() || 1);
  }

  // -- the drop (phase 2 begins)

  private beginDrop(): void {
    this.brain.onDrop();
    this.brain.setPhase(2);
    this.endTelegraph();
    this.ring.hide();
    this.lines.clear();
    this.stage.piece('lines', 'clear');
    this.dropT = 0;
    this.dropHold = this.ctx.services.get('save')?.suspend('ulthred.drop') ?? null;
    this.stage.piece('floor', 'cracked');
    this.oneShot('roar');
  }

  private tickDrop(dt: number): void {
    const before = this.dropT;
    this.dropT += dt;
    if (before < ULTHRED.breakAt && this.dropT >= ULTHRED.breakAt) this.stage.piece('floor', 'broken');
    if (before < ULTHRED.dropSeconds && this.dropT >= ULTHRED.dropSeconds) void this.landOnAnvil();
    // A teleport that never answers: the fight resets rather than hang invulnerable with autosave held.
    if (this.landing !== 0 && this.dropT >= ULTHRED.dropSeconds + ULTHRED.dropTimeoutSeconds) {
      this.landing = 0;
      this.warnOnce('the drop teleport did not answer; the fight resets');
      this.releaseDrop();
      this.reset();
    }
  }

  /** The pending drop teleport's token (0 when none): a late answer to a cancelled one is ignored. */
  private landing = 0;
  private landSeq = 0;

  private async landOnAnvil(): Promise<void> {
    const anvil = this.stage.anvil();
    const token = ++this.landSeq;
    this.landing = token;
    let ok = false;
    if (anvil) {
      try {
        ok = await this.stage.teleportToAnvil();
      } catch (err) {
        this.warnOnce(`the drop teleport threw (${String(err)})`);
      }
    }
    if (this.landing !== token || this.ended) {
      // The fight ended (or timed out) while the teleport ran: a Cael who landed on the island goes back to the hall.
      if (ok) this.stage.toHallMouth?.();
      return;
    }
    this.landing = 0;
    this.dropT = Infinity;
    if (!ok || !anvil) {
      this.warnOnce(anvil ? 'the drop teleport was refused; the fight resets (the pit steps lead out)' : 'no Anvil arena; the fight resets');
      this.releaseDrop();
      this.reset();
      return;
    }
    // The same actor moves to the Anvil: never re-registered, so the registry keeps the phase.
    const c = anvil.centre;
    this.root.position.set(c.x, c.y, c.z);
    this.root.rotation.y = yawToward(this.root.position, this.ctx.player.feet);
    const r = 30;
    this.bounds = { x0: c.x - r, x1: c.x + r, z0: c.z - r, z1: c.z + r };
    this.onIsland = true;
    this.anvils = anvil.anvils.map(() => ({ cracked: false, primed: 0 }));
    this.mountAnvilPrompts(anvil);
    this.stage.piece('ring', 'turning');
    this.releaseDrop();
    this.dropT = -1;
    this.brain.onDropDone();
  }

  private releaseDrop(): void {
    const hold = this.dropHold;
    this.dropHold = null;
    try {
      hold?.();
    } catch (err) {
      this.warnOnce(`autosave release failed (${String(err)})`);
    }
  }

  private mountAnvilPrompts(anvil: AnvilArena): void {
    anvil.anvils.forEach((at, i) => {
      this.anvilUndos.push(
        this.ctx.interaction.register({
          id: `${ANVIL_INTERACT_PREFIX}${i + 1}`,
          kind: 'use',
          position: (out) => out.set(at.x, at.y + 0.6, at.z),
          radius: ANVILS.interactRadius,
          holdSeconds: ANVILS.holdSeconds,
          coneDegrees: 360,
          promptKey: 'interact.use',
          name: this.ctx.strings.t('bosses.ulthred.anvil'),
          enabled: () => this.brain.phase === 2 && !this.anvils[i]?.cracked && this.contested && !this.dropping,
          onInteract: () => void this.crackAnvil(i),
        }),
      );
    });
  }

  private primeAnvils(to: THREE.Vector3Like): void {
    const anvil = this.stage.anvil();
    if (!anvil || this.brain.phase !== 2 || !this.onIsland) return;
    anvil.anvils.forEach((at, i) => {
      const a = this.anvils[i];
      if (a && !a.cracked && Math.hypot(to.x - at.x, to.z - at.z) <= ANVILS.primeRadius) a.primed = ANVILS.primeSeconds;
    });
  }

  private strikeAnvils(): void {
    const anvil = this.stage.anvil();
    if (!anvil || this.brain.phase !== 2) return;
    const feet = this.ctx.player.feet;
    const i = this.anvils.findIndex((a, k) => a.primed > 0 && !a.cracked && Math.hypot(feet.x - anvil.anvils[k]!.x, feet.z - anvil.anvils[k]!.z) <= ANVILS.strikeRadius);
    if (i >= 0) this.crackAnvil(i);
  }

  // -- phase 3

  private beginPhase3(): void {
    this.brain.setPhase(3);
    const vey = this.ctx.state.getFlag(VEY_OUTCOME_FLAG);
    this.armour = vey === 'defeated' ? 'body' : 'hollow';
    this.model?.setArmour(this.armour);
    this.stage.say(ARMOUR_BARK_KEYS[this.armour]);
    let list: readonly unknown[] = [];
    try {
      list = spiritFlamesFor(this.ctx.state);
    } catch (err) {
      this.warnOnce(`spirit-flames list failed (${String(err)})`);
    }
    this.flames = Math.min(FLAMES.cap, list.length);
    this.stage.anvil()?.setFlames(this.flames);
    this.stage.piece('flames', `lit:${this.flames}`);
    const spells = this.ctx.services.get('spells');
    if (spells && spells.scars >= SCAR_TAX.scars) {
      try {
        spells.addBurn(SCAR_TAX.burn, SCAR_TAX.source);
        this.scarTaxPaid = true;
      } catch (err) {
        this.warnOnce(`Scar tax failed (${String(err)})`);
      }
    }
  }

  // -- the kneel and the Heartshard

  private kneelGuard = false;

  private kneelStart(): void {
    if (this.kneelGuard) return;
    this.kneelGuard = true;
    this.brain.onKneel();
    const at = this.root.position;
    this.heartUndo = this.ctx.interaction.register({
      id: HEARTSHARD.interactId,
      kind: 'use',
      position: (out) => out.set(at.x, at.y + 1, at.z),
      radius: HEARTSHARD.interactRadius,
      holdSeconds: HEARTSHARD.holdSeconds,
      coneDegrees: 360,
      promptKey: 'interact.use',
      name: this.ctx.strings.t('bosses.ulthred.heartshard'),
      enabled: () => this.kneeling && !this.dying,
      onInteract: () => void this.heartshard(),
    });
  }

  private outcome(): void {
    this.brain.onDeath();
    this.dying = true;
    this.outcomeT = 0;
    this.endTelegraph();
    this.ring.hide();
    this.lines.clear();
    this.actor.untargetable = true;
    this.actor.hittable = false;
    this.heartUndo?.();
    this.heartUndo = null;
    this.oneShot('death');
  }

  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    const t = this.outcomeT;
    if (t >= PRESENTATION.deathClipSeconds) this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.deathClipSeconds) / PRESENTATION.deathFadeSeconds));
    if (t >= PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds) this.finish('defeated');
  }

  private move(dt: number, player: THREE.Vector3Like, dist: number): void {
    const pos = this.root.position;
    let speed = 0;
    if (this.brain.approaching && dist > 1e-3) {
      speed = ULTHRED.walkSpeed;
      const step = Math.min(speed * dt, Math.max(0, dist - ULTHRED.preferredDistance));
      pos.x += ((player.x - pos.x) / dist) * step;
      pos.z += ((player.z - pos.z) / dist) * step;
      if (step <= 0) speed = 0;
    }
    const b = this.bounds;
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
      const maxTurn = ULTHRED.turnRate * dt;
      this.root.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
    if (this.lineHideT > 0) {
      this.lineHideT -= dt;
      if (this.lineHideT <= 0) this.slamLine.hide();
    }
  }

  private glow(dt: number): void {
    if (this.telegraphT < 0) return;
    this.telegraphT += dt;
    const k = Math.min(1, this.telegraphT / this.telegraphLead);
    const m = this.telegraphMove;
    const pos = this.root.position;
    if (m === SLAM) {
      this.model?.setHammerGlow(k);
      this.slamLine.show(pos, lineEnd(pos, this.root.rotation.y, this.brain.slamLength), SLAM.halfWidth, k);
    } else if (m === SWEEP) this.ring.tell(pos, SWEEP.radius, k);
    else if (m === FORGEFIRE) this.fireAt.forEach((p, i) => this.fires[i]?.tell(p, FORGEFIRE.radius, k));
    else if (m === CHAINS) this.chainEnds.forEach(([a, b], i) => this.chainLines[i]?.show(a, b, CHAINS.halfWidth, k));
  }

  private endTelegraph(): void {
    const m = this.telegraphMove;
    this.telegraphT = -1;
    this.telegraphMove = null;
    this.model?.setHammerGlow(0);
    // A tell cut short (a break, the drop, death) takes its warning shapes with it; a slam that landed keeps its line a moment.
    if (m === SWEEP) this.ring.hide();
    else if (m === FORGEFIRE) this.fires.forEach((f) => f.hide());
    else if (m === CHAINS) this.chainLines.forEach((l) => l.hide());
    else if (m === SLAM && this.lineHideT <= 0) this.slamLine.hide();
  }

  private loop(clip: UlthredClip): void {
    if (this.loopClip === clip) return;
    this.loopClip = clip;
    this.model?.play(clip, { loop: true });
  }

  private oneShot(clip: UlthredClip): void {
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

  private finish(end: UlthredEnd): void {
    if (this.ended) return;
    this.ended = true;
    for (const off of this.offs.splice(0)) off();
    this.unregister = null;
    this.releaseDrop();
    this.dropT = -1;
    this.lines.clear();
    for (const undo of this.anvilUndos.splice(0)) undo();
    this.heartUndo?.();
    this.heartUndo = null;
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    this.ring.dispose();
    for (const r of this.fires) r.dispose();
    this.slamLine.dispose();
    for (const l of this.chainLines) l.dispose();
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
