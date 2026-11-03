import * as THREE from 'three';
import { ProjectileSystem, type ProjectileHit } from '../../spells/Projectile';
import { actorsInCone, actorsInRadius } from '../../spells/areas';
import { SpellCaster, type SpellHost } from '../../spells/SpellCaster';
import type { SpellDef } from '../../spells/spellDefs';
import { SPELLCAST_CLIPS } from '../../spells/spellClips';
import type { ActorId, ActorLike, Vec3 } from '../../vfx/ports';
import type { EmberwrightHost } from './ports';
import { vec } from './ports';
import { SKILL } from './skills';
import {
  ACTOR_RADIUS, ANVIL_DROP, ATTACKS, BOLT, CHEST_HEIGHT, CINDER_RING, CLASS_ID, FLAME_BALL, FLAME_LASH, FORGE_SPARK, FX,
  GUST_STEP, IGNITE, PLAYER_STAGGER_SECONDS, SPARK_BURST, STAFF_TAP, SURGE_FORM, WARM_BREATH, spellDamage,
} from './tuning';

const TMP = new THREE.Vector3();
const DEG = Math.PI / 180;
/** The player's forward: yaw 0 faces -Z, so forward is (-sin yaw, 0, -cos yaw). */
const forward = (yaw: number): Vec3 => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });
/** actorsInCone looks along (sin, cos) of its yaw, so a player facing turns half round to look where she looks. */
const coneYaw = (facingYaw: number): number => facingYaw + Math.PI;
const PROP_KINDS: ReadonlySet<string> = new Set(['toll-post', 'dummy', 'blocking-dummy', 'ash-scarecrow']);

export const FLAME_LASH_DEF: SpellDef = {
  id: 'emberwright-flame-lash', clip: 'Spellcast_Long', emberCost: 0, cooldown: 0, releaseAt: SPELLCAST_CLIPS.Spellcast_Long.release,
  lockMove: true, kind: 'area', skillId: SKILL.flameLash,
};
export const ANVIL_DROP_DEF: SpellDef = {
  id: 'emberwright-anvil-drop', clip: 'Spellcast_Raise', emberCost: 0, cooldown: 0, releaseAt: SPELLCAST_CLIPS.Spellcast_Raise.release,
  lockMove: true, kind: 'area', skillId: SKILL.anvilDrop,
};
export const WARM_BREATH_DEF: SpellDef = {
  id: 'emberwright-warm-breath', clip: 'Spellcasting', emberCost: 0, cooldown: 0, releaseAt: 0.8,
  lockMove: true, kind: 'area', skillId: SKILL.warmBreath,
};

/** What a spell does, resolved once at the key press. */
interface Aim {
  origin: Vec3;
  dir: Vec3;
  /** In actorsInCone's convention (atan2(dir.x, dir.z)), not the player's facing. */
  yaw: number;
}

/** A volley groups the bolts of one key-2 press, so Forge Spark never chains onto a target the volley already hit. */
interface Volley {
  hit: Set<ActorId>;
}

interface Pending {
  at: number;
  fn(): void;
}

interface Ground {
  x: number;
  y: number;
  z: number;
  radius: number;
  until: number;
  nextTick: number;
}

const ABILITY_COST: Record<string, number> = {
  [SKILL.flameLash]: FLAME_LASH.ember,
  [SKILL.anvilDrop]: ANVIL_DROP.ember,
  [SKILL.warmBreath]: WARM_BREATH.ember,
};

/**
 * The Emberwright's spells: the four attack-key spells fired on the core's `attack.window` open, the three tier-2 actives
 * driven by a `SpellCaster` of their own, burning ground and the Anvil's delayed impact. Every handler is class-gated twice:
 * the worn avatar and progression's class must both be the Emberwright, so a respec mid-swing fires nothing.
 */
export class EmberwrightRuntime {
  readonly caster: SpellCaster;
  readonly projectiles: ProjectileSystem;
  private time = 0;
  private staggeredUntil = -Infinity;
  private blockers = 0;
  private pendingCancel: string | null = null;
  private readonly pending: Pending[] = [];
  private readonly grounds: Ground[] = [];
  /** Swings (by id) whose spell fired this press: their tracer contact is nullified. */
  private readonly fired = new Set<number>();
  private readonly released = new Set<string>();
  private readonly offs: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly host: EmberwrightHost) {
    const h = host;
    const playerId = (): ActorId => h.player.actor.id;
    const spellHost: SpellHost = {
      events: h.events,
      player: h.player,
      actors: h.actors,
      // The spells service owns the pool; the caster only needs value/spend/restore, and every def here costs 0.
      ember: { get value() { return h.ember()?.value ?? 0; }, spend: (n: number) => h.ember()?.spend(n) ?? false, restore: (n: number) => void h.ember()?.restore(n) } as never,
      playClip: (clip, opts) => {
        const c = h.player.avatar?.controller as unknown as { playOneShot?(c: string, o?: { lockMove?: boolean }): boolean } | undefined;
        return c?.playOneShot ? c.playOneShot(clip, opts) : true;
      },
      isStaggered: (id) => id === playerId() && this.time < this.staggeredUntil,
      isBusy: (id) => {
        if (id !== playerId()) return false;
        const c = h.player.avatar?.controller as unknown as { busy?: boolean; activeAttack(): unknown } | undefined;
        return !!c && (c.busy === true || c.activeAttack() !== null);
      },
      inputBlocked: () => this.blockers > 0,
      cancelRequested: () => {
        const r = this.pendingCancel;
        this.pendingCancel = null;
        return r;
      },
    };
    this.caster = new SpellCaster(spellHost);
    for (const [def, onRelease] of [
      [FLAME_LASH_DEF, () => this.flameLash()],
      [ANVIL_DROP_DEF, () => this.anvilDropRelease()],
      [WARM_BREATH_DEF, () => this.warmBreath()],
    ] as const) this.offs.push(this.caster.register(def, onRelease));
    this.projectiles = new ProjectileSystem({ actors: h.actors, heightAt: h.heightAt, rayCast: h.rayCast }, 32);

    const ev = h.events;
    this.offs.push(
      ev.on('attack.window', (e) => e.phase === 'open' && e.actorId === playerId() && this.onWindow(e.attackId, e.swingId)),
      ev.on('actor.staggered', (e) => { if (e.actorId === playerId()) this.staggeredUntil = this.time + PLAYER_STAGGER_SECONDS; }),
      ev.on('spell.released', (e) => { if (e.casterId === playerId()) this.released.add(e.spellId); }),
      ev.on('spell.cancelled', (e) => this.onCancelled(e.casterId, e.spellId)),
      ev.on('player.dodged', () => this.onDodged()),
      ev.on('rest', () => this.reset('rest')),
      ev.on('save.loaded', () => this.reset('load')),
      ev.on('class.changed', () => this.reset('class')),
      ev.on('dialogue.started', () => { this.blockers++; this.requestCancel('dialogue'); }),
      ev.on('dialogue.ended', () => { this.blockers = Math.max(0, this.blockers - 1); }),
      ev.on('cutscene.started', () => { this.blockers++; this.requestCancel('cutscene'); }),
      ev.on('cutscene.ended', () => { this.blockers = Math.max(0, this.blockers - 1); }),
    );
    const bus = ev as unknown as { on(t: string, f: (p: { open?: boolean }) => void): () => void };
    this.offs.push(bus.on('ui.modal', (e) => { if (e.open) this.requestCancel('modal'); }));
  }

  get now(): number {
    return this.time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.caster.cancel('dispose');
    this.caster.dispose();
    this.clearProjectiles();
    this.pending.length = 0;
    this.grounds.length = 0;
    for (const off of this.offs.splice(0).reverse()) off();
  }

  // ---- class gate

  private active(): boolean {
    return this.host.avatarClass() === CLASS_ID && this.host.classId() === CLASS_ID;
  }

  private canAct(): boolean {
    const me = this.host.player.actor;
    if (me.dead || this.time < this.staggeredUntil || this.blockers > 0) return false;
    return !this.host.status()?.has(me.id, 'stun');
  }

  // ---- tick

  update(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt) || this.disposed) return;
    this.time += dt;
    this.caster.update(dt);
    this.projectiles.update(dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at > this.time) continue;
      const [p] = this.pending.splice(i, 1);
      try { p.fn(); } catch (err) { console.warn('[emberwright] pending effect failed', err); }
    }
    this.tickGrounds();
  }

  // ---- attack keys (fired on the window open, so a swing cancelled before it spends nothing)

  /** Ember cost of a key's spell, for the fizzle cue at clip start. */
  attackIndex(clip: string): number {
    return ATTACKS.findIndex((a) => a.clip === clip);
  }

  /** At clip start: the cue that the coming swing will only tap. */
  onClipStart(clip: string): void {
    const i = this.attackIndex(clip);
    if (i < 0 || !this.active()) return;
    const e = this.host.ember();
    if (e && e.value < ATTACKS[i].ember) this.host.fizzle();
  }

  private onWindow(clip: string, swingId: number): void {
    const i = this.attackIndex(clip);
    if (i < 0 || !this.active() || !this.canAct()) return;
    const e = this.host.ember();
    if (!e || !e.spend(ATTACKS[i].ember)) return;
    this.fired.add(swingId);
    if (this.fired.size > 32) this.fired.delete(this.fired.values().next().value as number);
    const aim = this.aim();
    if (i === 0) this.launchBolt(aim, 0, { damage: BOLT.damage, poise: BOLT.poise, speed: BOLT.speed, range: BOLT.range, radius: BOLT.radius, ignite: this.host.learned(SKILL.emberBolt), attackId: 'emberwright.bolt' });
    else if (i === 1) this.sparkBurst(aim);
    else if (i === 2) this.flameBall(aim);
    else this.cinderRing();
  }

  /** The damage modifier: a swing whose spell fired does nothing on contact; otherwise the staff only taps. */
  readonly meleeModifier = (req: { kind: string; attackerId: ActorId | null; swingId?: number; amount: number; poise: number; outcome: string }): void => {
    if (req.kind !== 'melee' || req.attackerId !== this.host.player.actor.id || this.host.avatarClass() !== CLASS_ID) return;
    if (req.swingId !== undefined && this.fired.has(req.swingId)) {
      req.outcome = 'immune';
      return;
    }
    req.amount *= STAFF_TAP;
    req.poise *= STAFF_TAP;
  };

  private aim(): Aim {
    const h = this.host;
    const f = h.player.feet;
    const origin = { x: f.x, y: f.y + CHEST_HEIGHT, z: f.z };
    const lockId = h.lockOnTarget();
    const lock = lockId ? h.actors.get(lockId) : undefined;
    if (lock && !lock.dead && lock.team === 'hostile') {
      lock.worldPosition(TMP);
      const dx = TMP.x - origin.x, dy = TMP.y + 1 - origin.y, dz = TMP.z - origin.z;
      const len = Math.hypot(dx, dy, dz);
      if (len > 1e-6) return { origin, dir: { x: dx / len, y: dy / len, z: dz / len }, yaw: Math.atan2(dx, dz) };
    }
    const yaw = h.player.facingYaw;
    return { origin, dir: forward(yaw), yaw: coneYaw(yaw) };
  }

  private rotated(aim: Aim, deg: number): Vec3 {
    const a = Math.atan2(aim.dir.x, aim.dir.z) + deg * DEG;
    const horiz = Math.hypot(aim.dir.x, aim.dir.z);
    return { x: Math.sin(a) * horiz, y: aim.dir.y, z: Math.cos(a) * horiz };
  }

  private launchBolt(
    aim: Aim, deg: number,
    o: { damage: number; poise: number; speed: number; range: number; radius: number; ignite: boolean; attackId: string; volley?: Volley; chain?: boolean; blast?: boolean },
  ): void {
    const dir = deg === 0 ? aim.dir : this.rotated(aim, deg);
    this.projectiles.launch({
      casterId: this.host.player.actor.id,
      origin: aim.origin,
      direction: dir,
      speed: o.speed,
      lifetime: o.range / o.speed,
      radius: o.radius,
      onHit: (hit) => this.boltLanded(hit, dir, o),
    });
  }

  private boltLanded(
    hit: ProjectileHit, dir: Vec3,
    o: { damage: number; poise: number; ignite: boolean; attackId: string; volley?: Volley; chain?: boolean; blast?: boolean },
  ): void {
    if (this.disposed) return;
    this.host.fx(FX.boltImpact, hit.point);
    if (o.blast) {
      this.flameBlast(hit, dir);
      return;
    }
    if (hit.kind !== 'actor') return;
    const target = this.host.actors.get(hit.actorId);
    if (!target || !this.isTarget(target)) return;
    const done = this.strike(target, { damage: o.damage, poise: o.poise, attackId: o.attackId, dir, point: hit.point, ignite: o.ignite });
    if (!done) return;
    o.volley?.hit.add(target.id);
    if (o.chain && o.volley && this.host.learned(SKILL.forgeSpark)) this.forgeSpark(target, o, o.volley);
  }

  /** Forge Spark: up to two other hostiles within 4 m, half damage, never one the volley already hit; chains do not chain. */
  private forgeSpark(from: ActorLike, o: { damage: number; poise: number }, volley: Volley): void {
    from.worldPosition(TMP);
    const centre = vec(TMP);
    let chained = 0;
    for (const hit of actorsInRadius(this.host.actors, centre, FORGE_SPARK.radius, { team: 'hostile', alive: true })) {
      if (chained >= FORGE_SPARK.chains) break;
      if (hit.actor.id === from.id || volley.hit.has(hit.actor.id)) continue;
      if (this.host.blocked(centre, hit.position)) continue;
      volley.hit.add(hit.actor.id);
      chained++;
      this.host.fx(FX.boltImpact, hit.position);
      this.strike(hit.actor, {
        damage: o.damage * FORGE_SPARK.fraction, poise: o.poise * FORGE_SPARK.fraction, attackId: 'emberwright.forgeSpark',
        dir: this.flatDir(centre, hit.position), point: hit.position, ignite: false,
      });
    }
  }

  private sparkBurst(aim: Aim): void {
    const volley: Volley = { hit: new Set() };
    const n = SPARK_BURST.bolts;
    for (let k = 0; k < n; k++) {
      const deg = (k - (n - 1) / 2) * SPARK_BURST.spreadDeg;
      this.launchBolt(aim, deg, {
        damage: spellDamage(SPARK_BURST.damage), poise: SPARK_BURST.poise, speed: SPARK_BURST.speed, range: SPARK_BURST.range,
        radius: SPARK_BURST.radius, ignite: false, attackId: 'emberwright.sparkBurst', volley, chain: true,
      });
    }
  }

  private flameBall(aim: Aim): void {
    this.launchBolt(aim, 0, {
      damage: spellDamage(FLAME_BALL.damage), poise: FLAME_BALL.poise, speed: FLAME_BALL.speed, range: FLAME_BALL.range,
      radius: FLAME_BALL.radius, ignite: false, attackId: 'emberwright.flameBall', blast: true,
    });
  }

  /** The flame ball bursts where it ends: on an actor, a wall, the ground or at the end of its range. */
  private flameBlast(hit: ProjectileHit, dir: Vec3): void {
    const point = hit.point;
    this.host.fx(FX.blast, point);
    for (const h of this.targetsIn(point, FLAME_BALL.blast)) {
      const direct = hit.kind === 'actor' && hit.actorId === h.actor.id;
      if (!direct && this.host.blocked(point, h.position)) continue;
      const k = direct ? 1 : FLAME_BALL.splash;
      this.strike(h.actor, {
        damage: spellDamage(FLAME_BALL.damage) * k, poise: FLAME_BALL.poise * k, attackId: 'emberwright.flameBall',
        dir: this.flatDir(point, h.position, dir), point: h.position, ignite: false,
      });
    }
  }

  private cinderRing(): void {
    const f = this.host.player.feet;
    const centre = vec(f);
    this.host.fx(FX.ring, centre, { scale: CINDER_RING.radius / 4 });
    for (const h of this.targetsIn(centre, CINDER_RING.radius)) {
      if (this.host.blocked({ x: f.x, y: f.y + 1, z: f.z }, h.position)) continue;
      const dir = this.flatDir(centre, h.position, forward(this.host.player.facingYaw));
      if (this.strike(h.actor, { damage: spellDamage(CINDER_RING.damage), poise: CINDER_RING.poise, attackId: 'emberwright.cinderRing', dir, point: h.position, ignite: false })) {
        this.host.push(h.actor.id, dir, CINDER_RING.pushMetres);
      }
    }
  }

  // ---- the shared hit

  /** One spell hit; ignite is skipped on a poise-breaking hit and on a kneeling target so it never ends a Spare. */
  strike(target: ActorLike, o: { damage: number; poise: number; attackId: string; dir: Vec3; point: Vec3; ignite: boolean }): boolean {
    const h = this.host;
    const result = h.damage.apply({
      attackerId: h.player.actor.id, targetId: target.id, amount: o.damage, poise: o.poise, kind: 'spell', attackId: o.attackId,
      point: new THREE.Vector3(o.point.x, o.point.y, o.point.z), direction: new THREE.Vector3(o.dir.x, 0, o.dir.z),
    });
    if (!result) return false;
    if (o.ignite && result.outcome === 'hit' && !result.staggered && !result.killed && !h.yielding?.(target.id)) this.ignite(target.id);
    return true;
  }

  ignite(targetId: ActorId): boolean {
    return this.host.status()?.apply(targetId, { id: IGNITE.id, kind: 'ignite', dps: IGNITE.dps, seconds: IGNITE.seconds, sourceId: this.host.player.actor.id }) ?? false;
  }

  /** Hostiles, plus the neutral props the player must be able to break (toll-post, dummies); never a neutral person. */
  private isTarget(a: ActorLike): boolean {
    return a.team === 'hostile' || (a.team === 'neutral' && PROP_KINDS.has(a.kind));
  }

  private targetsIn(centre: Vec3, radius: number): ReturnType<typeof actorsInRadius> {
    return actorsInRadius(this.host.actors, centre, radius, { team: ['hostile', 'neutral'], alive: true }).filter((h) => this.isTarget(h.actor));
  }

  private flatDir(from: Vec3, to: Vec3, fallback: Vec3 = { x: 0, y: 0, z: 1 }): Vec3 {
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      const fl = Math.hypot(fallback.x, fallback.z) || 1;
      return { x: fallback.x / fl, y: 0, z: fallback.z / fl };
    }
    return { x: dx / len, y: 0, z: dz / len };
  }

  // ---- tier 2 actives (the abilities handlers call these)

  /** The abilities handler body. Ember and cooldown are the abilities service's; a refusal here costs nothing. */
  castAbility(skillId: string): { ok: true } | { ok: false; reason: string } {
    if (!this.active()) return { ok: false, reason: 'class' };
    if (!this.canAct()) return { ok: false, reason: 'blocked' };
    const id = this.host.player.actor.id;
    const def = skillId === SKILL.flameLash ? FLAME_LASH_DEF : skillId === SKILL.anvilDrop ? ANVIL_DROP_DEF : skillId === SKILL.warmBreath ? WARM_BREATH_DEF : null;
    if (!def) return { ok: false, reason: 'unknown' };
    if (skillId === SKILL.anvilDrop) {
      this.anvilTarget = this.pickAnvilTarget();
      if (!this.anvilTarget) return { ok: false, reason: 'no-target' };
    }
    if (skillId === SKILL.warmBreath && this.alliesInCone().length === 0) return { ok: false, reason: 'no-target' };
    const r = this.caster.cast(id, def.id);
    if (!r.ok) {
      this.anvilTarget = null;
      return { ok: false, reason: r.reason };
    }
    this.released.delete(def.id);
    return { ok: true };
  }

  private flameLash(): void {
    if (!this.active()) return;
    const aim = this.aim();
    const flat = Math.hypot(aim.dir.x, aim.dir.z) || 1;
    const dir = { x: aim.dir.x / flat, y: 0, z: aim.dir.z / flat };
    const f = this.host.player.feet;
    const start = { x: f.x, y: f.y + 1, z: f.z };
    this.host.fx(FX.blast, { x: f.x + dir.x * FLAME_LASH.length * 0.5, y: f.y + 1, z: f.z + dir.z * FLAME_LASH.length * 0.5 });
    for (const h of this.targetsIn(start, FLAME_LASH.length + ACTOR_RADIUS)) {
      const rx = h.position.x - f.x, rz = h.position.z - f.z;
      const along = rx * dir.x + rz * dir.z;
      const across = Math.abs(rx * dir.z - rz * dir.x);
      if (along < 0 || along > FLAME_LASH.length + ACTOR_RADIUS || across > FLAME_LASH.halfWidth + ACTOR_RADIUS) continue;
      if (this.host.blocked(start, { x: h.position.x, y: h.position.y + 1, z: h.position.z })) continue;
      this.strike(h.actor, { damage: spellDamage(FLAME_LASH.damage), poise: FLAME_LASH.poise, attackId: 'emberwright.flameLash', dir, point: h.position, ignite: true });
    }
  }

  private anvilTarget: ActorId | null = null;

  /** Lock-on target, else the nearest hostile within 12 m in a 120 degree cone ahead. */
  private pickAnvilTarget(): ActorId | null {
    const h = this.host;
    const lockId = h.lockOnTarget();
    const lock = lockId ? h.actors.get(lockId) : undefined;
    const f = vec(h.player.feet);
    const chest = { x: f.x, y: f.y + CHEST_HEIGHT, z: f.z };
    const reachable = (a: ActorLike): boolean => {
      a.worldPosition(TMP);
      return Math.hypot(TMP.x - f.x, TMP.z - f.z) <= ANVIL_DROP.range && !h.blocked(chest, { x: TMP.x, y: TMP.y + 1, z: TMP.z });
    };
    if (lock && !lock.dead && this.isTarget(lock) && reachable(lock)) return lock.id;
    const hit = actorsInCone(h.actors, f, coneYaw(h.player.facingYaw), ANVIL_DROP.halfAngleDeg * DEG, ANVIL_DROP.range, { team: ['hostile', 'neutral'], alive: true })
      .filter((x) => this.isTarget(x.actor) && reachable(x.actor))[0];
    return hit ? hit.actor.id : null;
  }

  private anvilDropRelease(): void {
    const id = this.anvilTarget;
    this.anvilTarget = null;
    const target = id ? this.host.actors.get(id) : undefined;
    if (!target || target.dead || !this.active()) return;
    target.worldPosition(TMP);
    const at = vec(TMP);
    this.host.fx(FX.anvil, { x: at.x, y: at.y + 8, z: at.z });
    this.pending.push({ at: this.time + ANVIL_DROP.impactDelay, fn: () => this.anvilImpact(id as ActorId, at) });
  }

  /** A pending impact survives a stagger but not a class change (reset clears the list). */
  private anvilImpact(id: ActorId, fallback: Vec3): void {
    const target = this.host.actors.get(id);
    let at = fallback;
    if (target && !target.dead) {
      target.worldPosition(TMP);
      at = vec(TMP);
    }
    this.host.fx(FX.ring, at, { scale: 0.6 });
    this.host.fx(FX.anvil, at);
    for (const h of this.targetsIn(at, ANVIL_DROP.splashRadius)) {
      const primary = h.actor.id === id;
      const k = primary ? 1 : ANVIL_DROP.splash;
      const ok = this.strike(h.actor, {
        damage: spellDamage(ANVIL_DROP.damage) * k, poise: ANVIL_DROP.poise * k, attackId: 'emberwright.anvilDrop',
        dir: this.flatDir(at, h.position, forward(this.host.player.facingYaw)), point: h.position, ignite: false,
      });
      if (ok && primary) this.host.status()?.apply(h.actor.id, { id: ANVIL_DROP.stunId, kind: 'stun', seconds: ANVIL_DROP.stunSeconds, sourceId: this.host.player.actor.id });
    }
  }

  private alliesInCone(): ReturnType<typeof actorsInCone> {
    const h = this.host;
    return actorsInCone(h.actors, vec(h.player.feet), coneYaw(h.player.facingYaw), WARM_BREATH.halfAngleDeg * DEG, WARM_BREATH.range, { team: 'ally', alive: true });
  }

  private warmBreath(): void {
    if (!this.active()) return;
    const h = this.host;
    const f = vec(h.player.feet);
    this.host.fx(FX.wind, f, { scale: 0.8 });
    for (const hit of this.alliesInCone()) {
      h.damage.heal(hit.actor.id, hit.actor.maxHealth * WARM_BREATH.healFraction);
    }
  }

  // ---- cancel, refund, reset

  private requestCancel(reason: string): void {
    if (this.caster.state !== 'idle') this.pendingCancel = reason;
  }

  /** A cast cancelled before its release refunds the Ember the abilities service already spent (the cooldown stays). */
  private onCancelled(casterId: ActorId, spellId: string): void {
    if (casterId !== this.host.player.actor.id) return;
    const entry: [string, number] | undefined = (
      [[FLAME_LASH_DEF.id, FLAME_LASH.ember], [ANVIL_DROP_DEF.id, ANVIL_DROP.ember], [WARM_BREATH_DEF.id, WARM_BREATH.ember]] as Array<[string, number]>
    ).find(([id]) => id === spellId);
    if (!entry) return;
    this.pendingCancel = null;
    this.anvilTarget = null;
    this.pendingCancel = null;
    const wasReleased = this.released.delete(spellId);
    if (!wasReleased) this.host.ember()?.restore(entry[1]);
  }

  private clearProjectiles(): void {
    // Silent: a ball in flight is dropped, never detonated, by a load, a class change or a rest.
    this.projectiles.clear(true);
  }

  private reset(reason: string): void {
    this.requestCancel(reason);
    this.clearProjectiles();
    this.pending.length = 0;
    this.grounds.length = 0;
    this.fired.clear();
    this.anvilTarget = null;
  }

  // ---- Gust Step

  /** `player.dodged` fires once per hostile swing the dodge made miss. */
  private onDodged(): void {
    if (!this.active() || !this.host.learned(SKILL.gustStep)) return;
    this.host.ember()?.restore(GUST_STEP.ember);
  }

  /** The dodge clip started: a gust pushes hostiles within 2 m away (direction only, no poise). */
  onClipStartDodge(clip: string): void {
    if (!clip.startsWith(GUST_STEP.clipPrefix) || !this.active() || !this.host.learned(SKILL.gustStep) || !this.canAct()) return;
    const f = vec(this.host.player.feet);
    this.host.fx(FX.wind, f, { scale: 0.4 });
    this.host.cool?.(f, GUST_STEP.pushRadius);
    for (const h of actorsInRadius(this.host.actors, f, GUST_STEP.pushRadius, { team: 'hostile', alive: true })) {
      this.host.push(h.actor.id, this.flatDir(f, h.position, forward(this.host.player.facingYaw)), GUST_STEP.pushMetres);
    }
  }

  // ---- burning ground (blaze Surge)

  addGround(x: number, y: number, z: number, radius: number = SURGE_FORM.groundRadius, seconds: number = SURGE_FORM.groundSeconds): void {
    this.grounds.push({ x, y, z, radius, until: this.time + seconds, nextTick: this.time });
    this.host.fx(FX.scorch, { x, y, z }, { scale: radius / 3 });
  }

  groundCount(): number {
    return this.grounds.length;
  }

  private tickGrounds(): void {
    for (let i = this.grounds.length - 1; i >= 0; i--) {
      const g = this.grounds[i];
      if (this.time >= g.until) {
        this.grounds.splice(i, 1);
        continue;
      }
      if (this.time < g.nextTick) continue;
      g.nextTick = this.time + SURGE_FORM.groundTick;
      for (const h of actorsInRadius(this.host.actors, g, g.radius, { team: 'hostile', alive: true })) this.ignite(h.actor.id);
    }
  }

  /** Cost the abilities service charges for a skill (tests and the plugin's refund use the same table). */
  static costOf(skillId: string): number {
    return ABILITY_COST[skillId] ?? 0;
  }
}
