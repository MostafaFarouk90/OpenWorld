import * as THREE from 'three';
import type { Actor } from '../../actors/Actor';
import type { BossDef } from '../../actors/BossRegistry';
import type { GameContext } from '../../core/Game';
import { clampToArena, distToSegment, pickPillar, yawToward, type XZ } from './geometry';
import { PriorBrain, type PriorHooks, type TeleportDest } from './PriorBrain';
import type { PriorModel } from './PriorModel';
import { CenserRing, ShieldShell } from './priorFx';
import {
  CENSER_RADIUS,
  CHAIN,
  PRESENTATION,
  PRIOR,
  PRIOR_BOSS_ID,
  PRIOR_KIND,
  PRIOR_NAME_KEY,
  SUMMONS,
  SUMMON_GROUPS,
  VAULT,
  type PriorMoveDef,
} from './tuning';

export const PRIOR_FLOOR_MODIFIER_ID = 'bosses.prior.floor';
export const CHAIN_SLOW_SOURCE = 'bosses.prior.chain-slow';

export const PRIOR_BOSS_DEF: BossDef = {
  bossId: PRIOR_BOSS_ID,
  nameKey: PRIOR_NAME_KEY,
  phases: PRIOR.phases,
  breaksPerPhase: PRIOR.breaksPerPhase,
  shield: false,
  shieldBreakers: PRIOR.shieldBreakers,
  releaseWindowSeconds: PRIOR.releaseWindowSeconds,
};

/** The parts of the game context the encounter touches. */
export type PriorContext = Pick<
  GameContext,
  'scene' | 'actors' | 'damage' | 'combat' | 'events' | 'bosses' | 'player' | 'services'
>;

export interface PriorPlaces {
  centre: THREE.Vector3;
  centreYaw: number;
  pillars: THREE.Vector3[];
}

/** How an encounter ended, for the plugin: an outcome played out, or a reset (death, load, teardown). */
export type PriorEnd = 'released' | 'defeated' | 'reset';

export interface PriorEncounterOptions {
  model: PriorModel | null;
  places: PriorPlaces;
  warn: (message: string) => void;
  onEnd: (end: PriorEnd) => void;
}

/** Plays a sound key if the audio service has it; a missing key warns once and never breaks the fight. */
function makeSfx(ctx: PriorContext, warn: (m: string) => void): (key: string, at?: THREE.Vector3Like) => void {
  const warned = new Set<string>();
  return (key, at) => {
    const audio = ctx.services.get('audio');
    if (!audio) return;
    try {
      if (at) audio.playAt(key, at);
      else audio.play(key);
    } catch (e) {
      if (warned.has(key)) return;
      warned.add(key);
      warn(`sound "${key}" unavailable (${e instanceof Error ? e.message : String(e)})`);
    }
  };
}

/**
 * One Ashen Prior fight (plans/slice-2-ashen-prior.md sections 3 and 10): the actor and model, the registry
 * registration, the brain's hooks (telegraphs, script hits, teleports, summons, shield), the health floor, poise regen,
 * and the outcome presentation. The plugin owns the trigger, intro, gate and the reset rules; this class owns
 * everything that lives and dies with one Prior.
 */
export class PriorEncounter implements PriorHooks {
  readonly actor: Actor;
  readonly brain: PriorBrain;
  private readonly ctx: PriorContext;
  private readonly model: PriorModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: PriorPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: PriorEnd) => void;
  private readonly sfx: (key: string, at?: THREE.Vector3Like) => void;
  private readonly offs: (() => void)[] = [];
  private readonly ring = new CenserRing();
  private readonly shell = new ShieldShell();
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  /** The final-phase `last` break has happened: the floor is lifted for good. */
  private floorLifted = false;
  private poiseIdle = 0;
  private pillar = -1;
  private chainFrom = new THREE.Vector3();
  private chainDir = new THREE.Vector3(0, 0, -1);
  private slowOff: (() => void) | null = null;
  private slowLeft = 0;
  /** Seconds until the outcome presentation despawns him; < 0 = none running. */
  private despawnIn = -1;
  private dissolveIn = -1;
  private readonly tmp = new THREE.Vector3();

  constructor(ctx: PriorContext, opts: PriorEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.sfx = makeSfx(ctx, opts.warn);
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name ||= 'boss-ashen-prior';
    this.root.position.copy(opts.places.centre);
    this.root.rotation.set(0, opts.places.centreYaw, 0);
    ctx.scene.add(this.root, this.ring.mesh, this.shell.mesh);

    this.actor = ctx.actors.spawn({
      kind: PRIOR_KIND,
      team: 'hostile',
      level: PRIOR.level,
      maxHealth: PRIOR.maxHealth,
      maxPoise: PRIOR.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      // Out of the fight until register(): the intro shows him rising, not fighting.
      hittable: false,
    });
    this.actor.untargetable = true;
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(ctx.damage.addModifier(PRIOR_FLOOR_MODIFIER_ID, (req) => this.floor(req), PRIOR.floorModifierOrder));
    this.brain = new PriorBrain(this);

    const mine = (p: { bossId: string }) => p.bossId === PRIOR_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        if (p.last) this.floorLifted = true;
        this.brain.onBreak();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (mine(p)) this.brain.onPhase(p.phase);
      }),
      ctx.events.on('boss.releaseWindow', (p) => {
        if (mine(p)) this.brain.onReleaseWindow(p.open);
      }),
      ctx.events.on('boss.shield', (p) => {
        if (mine(p)) this.shell.set(p.up);
      }),
      ctx.events.on('boss.released', (p) => {
        if (mine(p)) this.outcome('released');
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome('defeated');
      }),
      ctx.events.on('damage.dealt', (r) => {
        if (r.targetId === this.actor.id && r.outcome === 'hit') this.poiseIdle = 0;
      }),
    );
    this.model?.play('idle', { loop: true });
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

  /** An outcome presentation is playing (the release dissolve or the death). */
  get outcomePlaying(): boolean {
    return this.brain.state === 'released' || this.brain.state === 'dying';
  }

  /** Feet position (the root sits at the feet). */
  feet(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position);
  }

  /** The model for the intro (null headless). */
  get view(): PriorModel | null {
    return this.model;
  }

  /** Starts the fight after the intro: registers the boss (so `boss.started` brings the bar and music) and starts the brain. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, PRIOR_BOSS_DEF);
    } catch (err) {
      this.warn(`could not register the Prior: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    this.actor.hittable = true;
    this.actor.untargetable = false;
    this.brain.start();
    return true;
  }

  /** Fixed tick: brain, glide, facing, poise regen, slow timer, presentation timers, fx and mixer. */
  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.model?.update(dt);
    this.ring.update(dt);
    this.shell.update(dt, this.root.position);
    if (this.slowOff) {
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) this.clearSlow();
    }
    if (this.despawnIn >= 0) {
      if (this.dissolveIn >= 0) {
        this.dissolveIn -= dt;
        if (this.dissolveIn < 0) this.dissolve(PRESENTATION.deathDissolveSeconds, PRESENTATION.deathTint);
      }
      this.despawnIn -= dt;
      if (this.despawnIn < 0) this.finish(this.brain.state === 'released' ? 'released' : 'defeated');
      return;
    }
    if (!this.registered) return;

    const player = this.ctx.player.feet;
    const pos = this.root.position;
    const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.brain.tick(dt, { dist, liveSummons: this.liveSummons() });

    if (this.brain.present && this.brain.state !== 'kneel') {
      this.root.rotation.y = yawToward(pos, player);
    }
    if (this.brain.moving && dist > 1e-3) {
      const step = Math.min(PRIOR.glideSpeed * dt, dist - PRIOR.glideStopDistance);
      if (step > 0) {
        pos.x += ((player.x - pos.x) / dist) * step;
        pos.z += ((player.z - pos.z) / dist) * step;
        clampToArena(pos, this.places.centre, VAULT.arenaHalfExtent);
      }
    }
    // Poise refills after 4 s without a landed hit (design 9.6), outside the stagger and the kneel.
    if (this.brain.state !== 'broken' && this.brain.state !== 'kneel') {
      this.poiseIdle += dt;
      if (this.poiseIdle >= PRIOR.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.actor.restorePoise();
    }
  }

  /**
   * Ends the encounter without an outcome (player death, load, plugin teardown): summons gone, the Prior despawned.
   * `unregisterFirst` (teardown) makes the registry report `boss.ended 'unregistered'`; otherwise the despawn reports
   * `'despawned'`. Either way exactly one `boss.ended`.
   */
  reset(opts: { unregisterFirst?: boolean } = {}): void {
    if (this.ended) return;
    if (opts.unregisterFirst) this.dropRegistration();
    this.finish('reset');
  }

  // ---- PriorHooks ----

  telegraph(move: PriorMoveDef, swingId: number, leadSeconds: number): void {
    this.ctx.events.emit('telegraph', {
      actorId: this.actor.id,
      kind: move.telegraph,
      attackId: move.attackId,
      moveId: `${PRIOR_BOSS_ID}.${move.id}`,
      swingId,
      leadSeconds,
    });
    if (move.id === 'censer') {
      this.model?.play('censerLift');
      this.model?.setGlow(1);
      this.ring.start(this.root.position, leadSeconds);
      this.ctx.services.get('vfx')?.pulseScreen(0.25, 0.2, 0xffffff);
      this.sfx('sfx.prior.gong', this.root.position);
    } else {
      this.model?.play('chain');
    }
  }

  telegraphCancelled(swingId: number): void {
    this.ctx.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId });
    this.ring.stop();
    this.model?.setGlow(0);
  }

  aim(): void {
    const player = this.ctx.player.feet;
    this.chainFrom.copy(this.root.position);
    this.chainDir.set(player.x - this.chainFrom.x, 0, player.z - this.chainFrom.z);
    if (this.chainDir.lengthSq() < 1e-6) this.chainDir.set(0, 0, -1);
    this.chainDir.normalize();
  }

  strike(move: PriorMoveDef, swingId: number): void {
    this.model?.setGlow(0);
    this.ring.stop();
    const player = this.ctx.player.actor;
    if (player.dead) return;
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    if (Math.abs(feet.y - pos.y) > 2.5) return;
    let hit = false;
    if (move.id === 'censer') {
      this.model?.play('censerSwing');
      hit = Math.hypot(feet.x - pos.x, feet.z - pos.z) <= CENSER_RADIUS;
    } else {
      const end: XZ = { x: this.chainFrom.x + this.chainDir.x * CHAIN.length, z: this.chainFrom.z + this.chainDir.z * CHAIN.length };
      hit = distToSegment(feet, this.chainFrom, end) <= CHAIN.radius;
    }
    if (!hit) return;
    const direction = this.tmp.set(feet.x - pos.x, 0, feet.z - pos.z);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
    direction.normalize();
    // The chain is blockable but not parryable (ruling): a script hit has no `attack.window`, so without `parryable: false`
    // the guard's "block pressed within 0.2 s" fallback would parry it and stagger the Prior into a free boss break.
    const result = this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: player.id,
      amount: move.damage,
      poise: move.poise,
      kind: 'melee',
      attackId: move.attackId,
      swingId,
      direction: direction.clone(),
      // The censer's red sweep is dodge-only; the chain stays blockable but never parried.
      ...(move.telegraph === 'dodge' ? { unblockable: true } : { parryable: false as const }),
    });
    if (move.id === 'chain' && result && result.outcome === 'hit') this.applySlow();
  }

  teleportOut(): void {
    this.setPresent(false);
    this.sfx('sfx.prior.teleport', this.root.position);
    this.dissolve(PRIOR.teleportOutSeconds, PRESENTATION.teleportTint);
  }

  teleportIn(dest: TeleportDest): void {
    const player = this.ctx.player.feet;
    if (dest === 'centre' || this.places.pillars.length === 0) {
      this.root.position.copy(this.places.centre);
      this.pillar = -1;
    } else {
      this.pillar = pickPillar(this.places.pillars, this.pillar, player);
      this.root.position.copy(this.places.pillars[this.pillar]);
    }
    this.root.rotation.y = yawToward(this.root.position, player);
    this.sfx('sfx.prior.teleport', this.root.position);
    this.dissolve(PRIOR.teleportInSeconds, PRESENTATION.teleportTint, true);
  }

  arrived(): void {
    this.setPresent(true);
  }

  summonStart(opening: boolean): void {
    this.model?.play('summon', { loop: true });
    if (opening) this.ctx.bosses.setShield(PRIOR_BOSS_ID, true);
  }

  summonRelease(count: number): void {
    this.model?.play('idle', { loop: true });
    const enemies = this.ctx.services.get('enemies');
    if (!enemies) return;
    const live = this.liveSummons();
    let n = Math.min(count, SUMMONS.maxLive - live);
    for (const id of SUMMON_GROUPS) {
      if (n <= 0) break;
      try {
        if (enemies.alive(id).length > 0) continue;
        // reset clears the slot a released or killed summon spent (review B2), then the slot refills.
        enemies.reset(id);
        if (enemies.spawnGroup(id, { aggro: true }).length > 0) n--;
      } catch (err) {
        this.warn(`summon group "${id}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  stagger(): void {
    this.model?.play(Math.random() < 0.5 ? 'hitA' : 'hitB');
  }

  kneel(): void {
    this.model?.play('kneel');
  }

  restorePoise(): void {
    this.actor.restorePoise();
    this.poiseIdle = 0;
  }

  // ---- internals ----

  /** Keeps health at or above the floor until the final-phase `last` break; clamps damage only, never poise. */
  private floor(req: { targetId: string; amount: number }): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered) return;
    const min = Math.ceil(this.actor.maxHealth * PRIOR.healthFloor);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  private liveSummons(): number {
    const enemies = this.ctx.services.get('enemies');
    if (!enemies) return 0;
    let n = 0;
    for (const id of SUMMON_GROUPS) {
      try {
        n += enemies.alive(id).length;
      } catch {
        // an unknown group counts as empty
      }
    }
    return n;
  }

  private setPresent(on: boolean): void {
    if (this.actor.dead) return;
    this.actor.hittable = on;
    this.actor.invulnerable = !on;
    this.actor.untargetable = !on;
  }

  private dissolve(seconds: number, tint: number, reverse = false): void {
    const vfx = this.ctx.services.get('vfx');
    if (!vfx || !this.model) return;
    try {
      void vfx.dissolve(this.model.root, seconds, { tint, reverse }).catch(() => {});
    } catch (err) {
      this.warn(`dissolve failed: ${String(err)}`);
    }
  }

  private applySlow(): void {
    this.slowLeft = CHAIN.slow.seconds;
    if (!this.slowOff) this.slowOff = this.ctx.player.addMoveModifier(CHAIN_SLOW_SOURCE, { speedScale: CHAIN.slow.speedScale });
  }

  private clearSlow(): void {
    this.slowOff?.();
    this.slowOff = null;
    this.slowLeft = 0;
  }

  private outcome(kind: 'released' | 'defeated'): void {
    this.brain.onOutcome(kind);
    this.ring.stop();
    this.shell.set(false);
    this.clearSlow();
    this.resetSummons();
    this.actor.untargetable = true;
    if (kind === 'released') {
      this.actor.hittable = false;
      this.dissolve(PRESENTATION.releaseDissolveSeconds, PRESENTATION.releaseTint);
      this.despawnIn = PRESENTATION.releaseDissolveSeconds;
    } else {
      this.model?.play('death');
      this.dissolveIn = PRESENTATION.deathClipSeconds;
      this.despawnIn = PRESENTATION.deathClipSeconds + PRESENTATION.deathDissolveSeconds;
    }
  }

  private resetSummons(): void {
    const enemies = this.ctx.services.get('enemies');
    if (!enemies) return;
    for (const id of SUMMON_GROUPS) {
      try {
        enemies.reset(id);
      } catch (err) {
        this.warn(`summon group "${id}" reset failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private dropRegistration(): void {
    const off = this.unregister;
    this.unregister = null;
    off?.();
  }

  private finish(end: PriorEnd): void {
    if (this.ended) return;
    this.ended = true;
    this.clearSlow();
    this.resetSummons();
    for (const off of this.offs.splice(0)) off();
    // The registry drops the registration on `actor.despawned` and reports exactly one `boss.ended 'despawned'`; that event
    // may be delivered after this call (a reset from inside another event's dispatch), so the registration is left for
    // it to drop. Only a teardown unregisters first (`reset({ unregisterFirst })`).
    this.unregister = null;
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    this.ring.dispose();
    this.shell.dispose();
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
