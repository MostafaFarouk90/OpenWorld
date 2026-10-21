// Emberwright tier 3 (Act 2): Fire Wall, Iron Familiar, Smoke Screen. Ports-based so the unit tests need no game; the plugin
// wires them in one block. Nothing here allocates per tick (the actor scans run at 2 Hz, 0.67 Hz and on cast only).
import * as THREE from 'three';
import type { StatusSpec } from '../../actors/status';
import { AI } from '../../enemies/tuning';
import type { ObserverPose, PerceptionModifiers, PerceptionProvider } from '../../enemies/perceptionHook';
import type { AbilityHandlerResult } from '../../hud/ports';
import type { ActorId, ActorLike, ActorsLike, DamageResultLike, Vec3 } from '../../vfx/ports';
import { FIRE_WALL, IRON_FAMILIAR, SMOKE_SCREEN } from './tuning';

const SCRATCH = new THREE.Vector3();
const EPS = 1e-9;

type Stop = () => void;

/** The mercy state of a real actor (`Actor.mercyState`); the vfx-side ActorLike does not declare it. */
const mercyOf = (a: ActorLike): string => (a as { mercyState?: () => string }).mercyState?.() ?? 'none';

/** A live foe the player's own area effects may hurt: hostile, alive, hittable and in no mercy state. */
const hurtable = (a: ActorLike): boolean => a.team === 'hostile' && !a.dead && a.hittable && mercyOf(a) === 'none';

export interface EffectTransform {
  position: Vec3;
  yaw?: number;
  scale?: number;
}

export interface Tier3Ports {
  /** The worn avatar and progression's class are both the Emberwright. */
  isEmberwright(): boolean;
  learned(skillId: string): boolean;
  /** Not dead, stunned or otherwise unable to cast. */
  canAct(): boolean;
  playerId(): ActorId;
  feet(): Vec3;
  /** The player's facing, with forward (-sin yaw, -cos yaw). */
  facingYaw(): number;
  actors(): ActorsLike;
  apply(req: {
    attackerId: ActorId | null;
    targetId: ActorId;
    amount: number;
    poise: number;
    kind: 'melee' | 'spell';
    attackId: string;
  }): DamageResultLike | null;
  /** Visual, best effort; the returned `stop` ends it early. */
  effect?(id: string, t: EffectTransform, params?: Record<string, unknown>): Stop | null;
}

const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });

function gate(p: Tier3Ports, skillId: string): AbilityHandlerResult | null {
  if (!p.isEmberwright()) return refuse('class');
  if (!p.learned(skillId)) return refuse('not-learned');
  if (!p.canAct()) return refuse('blocked');
  return null;
}

// ---- Fire Wall ----------------------------------------------------------------------------------------------------

export interface FireWallPorts extends Tier3Ports {
  ignite(targetId: ActorId, spec: StatusSpec): boolean;
}

/**
 * Fire Wall. A 6 m line across the facing, 4 m ahead, for 8 s. It blocks nothing; every 0.5 s each live hostile inside its
 * band (0.8 m either side of the line, within the line's length and 3 m of its height) takes 4 fire damage (8 a second) and
 * `ignite` for 3 s under its own status id, so it stacks with Flame Lash's burn rather than refreshing it. A foe in any
 * mercy state is skipped, so the wall never ends a Spare or Calm. There is no `element` field on a damage request: the hit
 * is tagged with the attack id `emberwright.fireWall`. One wall at a time; a recast replaces it.
 */
export class FireWall {
  private live = false;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  /** Unit vectors along the line and across it (the facing). */
  private ax = 1;
  private az = 0;
  private fx = 0;
  private fz = -1;
  private elapsed = 0;
  private nextTick = 0;
  private stopFx: Stop | null = null;

  constructor(private readonly p: FireWallPorts) {}

  get active(): boolean {
    return this.live;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, FIRE_WALL.skillId);
    if (refused) return refused;
    this.end();
    const f = this.p.feet();
    const yaw = this.p.facingYaw();
    this.fx = -Math.sin(yaw);
    this.fz = -Math.cos(yaw);
    this.ax = Math.cos(yaw);
    this.az = -Math.sin(yaw);
    this.cx = f.x + this.fx * FIRE_WALL.ahead;
    this.cz = f.z + this.fz * FIRE_WALL.ahead;
    this.cy = f.y;
    this.elapsed = 0;
    this.nextTick = FIRE_WALL.tickSeconds;
    this.live = true;
    this.stopFx = this.p.effect?.(FIRE_WALL.effectId, { position: { x: this.cx, y: this.cy, z: this.cz }, yaw }, { seconds: FIRE_WALL.seconds, length: FIRE_WALL.length }) ?? null;
    return { ok: true };
  }

  update(dt: number): void {
    if (!this.live) return;
    if (!this.p.isEmberwright() || !this.p.learned(FIRE_WALL.skillId)) {
      this.end();
      return;
    }
    this.elapsed += dt;
    while (this.nextTick <= FIRE_WALL.seconds + EPS && this.elapsed + EPS >= this.nextTick) {
      this.nextTick += FIRE_WALL.tickSeconds;
      this.burn();
    }
    if (this.elapsed + EPS >= FIRE_WALL.seconds) this.end();
  }

  end(): void {
    this.live = false;
    this.stopFx?.();
    this.stopFx = null;
  }

  private inside(a: ActorLike): boolean {
    a.worldPosition(SCRATCH);
    const rx = SCRATCH.x - this.cx;
    const rz = SCRATCH.z - this.cz;
    return (
      Math.abs(rx * this.ax + rz * this.az) <= FIRE_WALL.length / 2 &&
      Math.abs(rx * this.fx + rz * this.fz) <= FIRE_WALL.halfThickness &&
      Math.abs(SCRATCH.y - this.cy) <= FIRE_WALL.halfHeight
    );
  }

  private burn(): void {
    const me = this.p.playerId();
    const amount = FIRE_WALL.dps * FIRE_WALL.tickSeconds;
    for (const a of this.p.actors().all()) {
      if (!hurtable(a) || !this.inside(a)) continue;
      const r = this.p.apply({ attackerId: me, targetId: a.id, amount, poise: 0, kind: 'spell', attackId: FIRE_WALL.attackId });
      if (r && r.outcome === 'hit' && !r.killed && mercyOf(a) === 'none') {
        this.p.ignite(a.id, { id: FIRE_WALL.igniteId, kind: 'ignite', dps: FIRE_WALL.igniteDps, seconds: FIRE_WALL.igniteSeconds, sourceId: me });
      }
    }
  }
}

// ---- Iron Familiar ------------------------------------------------------------------------------------------------

export interface FamiliarBody {
  actor: ActorLike;
  /** Moves the body (feet-independent: the hover height is already in `y`). */
  place(x: number, y: number, z: number): void;
  /** Despawns the actor (`actor.despawned`) and frees the visual. */
  dispose(): void;
}

export interface IronFamiliarPorts extends Tier3Ports {
  /** Creates the ally-team actor `id` at `at`; null when the world refuses. */
  spawn(id: ActorId, at: Vec3): FamiliarBody | null;
  /** `allyEngagement.mayEngage`: alive, no mercy state, and aggroed on the player or an ally. Absent service: false. */
  mayEngage(targetId: ActorId): boolean;
}

/**
 * Iron Familiar. An ally-team actor `familiar:<n>` (60 health, not hittable, not targetable) hovers 1.2 m up for 20 s, stays
 * within 3 m of the player, and every 1.5 s strikes the nearest hostile within 12 m for 6 damage, as a `spell` request
 * with the familiar as attacker. The strike reaches the enemy through `damage.dealt` like any hit.
 * It only picks foes `allyEngagement.mayEngage` allows (already fighting the player or an ally, in no mercy state), and the
 * resolver drops an ally hit on a yielding or calming foe. Because such a foe already has a target, `Brain.provoke` does not
 * move its aggro: the "taunt" is the strike itself, not a retarget (see the real-Enemy test).
 * One at a time; a recast replaces it. It ends on expiry, a save load, the player's death, a class change, a respec
 * (the per-tick check on class and learned) and dispose, and if its actor is despawned by someone else.
 */
export class IronFamiliar {
  private body: FamiliarBody | null = null;
  private id: ActorId | null = null;
  private serial = 0;
  private x = 0;
  private z = 0;
  private left = 0;
  private strikeIn = 0;

  constructor(private readonly p: IronFamiliarPorts) {}

  get active(): boolean {
    return this.body !== null;
  }

  get actorId(): ActorId | null {
    return this.id;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, IRON_FAMILIAR.skillId);
    if (refused) return refused;
    this.end();
    const f = this.p.feet();
    const yaw = this.p.facingYaw();
    // Beside the player, on the right of the facing (cos yaw, -sin yaw).
    const x = f.x + Math.cos(yaw) * IRON_FAMILIAR.spawnSide;
    const z = f.z - Math.sin(yaw) * IRON_FAMILIAR.spawnSide;
    let id: ActorId;
    do id = `${IRON_FAMILIAR.idPrefix}${++this.serial}`;
    while (this.p.actors().get(id));
    const at = { x, y: f.y + IRON_FAMILIAR.hover, z };
    const body = this.p.spawn(id, at);
    if (!body) return refuse('no-room');
    this.body = body;
    this.id = id;
    this.x = x;
    this.z = z;
    this.left = IRON_FAMILIAR.seconds;
    this.strikeIn = IRON_FAMILIAR.strikeSeconds;
    this.p.effect?.(IRON_FAMILIAR.effectId, { position: { x, y: f.y, z }, yaw });
    return { ok: true };
  }

  update(dt: number): void {
    const body = this.body;
    if (!body) return;
    if (!this.p.isEmberwright() || !this.p.learned(IRON_FAMILIAR.skillId) || this.p.actors().get(body.actor.id) !== body.actor) {
      this.end();
      return;
    }
    this.left -= dt;
    if (this.left <= 0) {
      this.end();
      return;
    }
    const f = this.p.feet();
    const dx = f.x - this.x;
    const dz = f.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > IRON_FAMILIAR.followMax) {
      const step = Math.min(IRON_FAMILIAR.speed * dt, d - IRON_FAMILIAR.followStop);
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
    }
    body.place(this.x, f.y + IRON_FAMILIAR.hover, this.z);
    this.strikeIn -= dt;
    if (this.strikeIn <= 0) this.strikeIn = this.strike() ? IRON_FAMILIAR.strikeSeconds : IRON_FAMILIAR.retrySeconds;
  }

  /** True when a blow was thrown. */
  private strike(): boolean {
    const id = this.id;
    if (!id) return false;
    const f = this.p.feet();
    const y = f.y + IRON_FAMILIAR.hover;
    let best: ActorId | null = null;
    let bestD: number = IRON_FAMILIAR.range;
    for (const a of this.p.actors().all()) {
      if (!hurtable(a)) continue;
      a.worldPosition(SCRATCH);
      const d = Math.hypot(SCRATCH.x - this.x, SCRATCH.y - y, SCRATCH.z - this.z);
      if (d > bestD || !this.p.mayEngage(a.id)) continue;
      bestD = d;
      best = a.id;
    }
    if (!best) return false;
    this.p.apply({ attackerId: id, targetId: best, amount: IRON_FAMILIAR.damage, poise: 0, kind: 'spell', attackId: IRON_FAMILIAR.attackId });
    return true;
  }

  end(): void {
    const body = this.body;
    this.body = null;
    this.id = null;
    this.left = 0;
    body?.dispose();
  }
}

// ---- Smoke Screen -------------------------------------------------------------------------------------------------

export interface SmokeScreenPorts extends Tier3Ports {
  /** Thread 18's stealth hooks; absent until that service is there. */
  stealth(): { addSightBlocker?(b: { x: number; z: number; r: number; seconds: number }): Stop } | undefined;
  /** Thread 5's `enemies.perception`; absent until that service is there. */
  perception(): { register(p: PerceptionProvider): Stop } | undefined;
  warn(message: string): void;
}

/** Observers inside the cloud see 3 m: `AI.sightRange * scale`. One shared result, so a provider call allocates nothing. */
const BLIND: Readonly<PerceptionModifiers> = Object.freeze({
  sightRangeScale: SMOKE_SCREEN.sightRange / AI.sightRange,
  coneScale: 1,
  hearingQuietScale: 1,
  hearingLoudScale: 1,
});

/**
 * Smoke Screen. A 5 m cloud 6 m ahead for 8 s. Two parts, both released together: a sight-blocker disc on the stealth
 * service (rays through it fail) and an `enemies.perception` provider that cuts the sight range of any observer standing
 * inside the cloud to 3 m, whoever its target is. It deals no damage and applies no status, so it never touches mercy.
 * Refused ('no-stealth') when neither service is there, since the cast would do nothing. One cloud at a time.
 */
export class SmokeScreen {
  private live = false;
  private cx = 0;
  private cz = 0;
  private elapsed = 0;
  private release: Stop | null = null;
  private unregister: Stop | null = null;
  private stopFx: Stop | null = null;
  private warned = false;
  private readonly provider: PerceptionProvider = {
    modifiers: (_target: ActorId, o: ObserverPose) => {
      if (!this.live) return null;
      const dx = o.feet.x - this.cx;
      const dz = o.feet.z - this.cz;
      return dx * dx + dz * dz <= SMOKE_SCREEN.radius * SMOKE_SCREEN.radius ? BLIND : null;
    },
  };

  constructor(private readonly p: SmokeScreenPorts) {}

  get active(): boolean {
    return this.live;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, SMOKE_SCREEN.skillId);
    if (refused) return refused;
    const stealth = this.p.stealth();
    const perception = this.p.perception();
    const blocks = typeof stealth?.addSightBlocker === 'function';
    if (!blocks && !perception) return refuse('no-stealth');
    this.end();
    const f = this.p.feet();
    const yaw = this.p.facingYaw();
    this.cx = f.x - Math.sin(yaw) * SMOKE_SCREEN.ahead;
    this.cz = f.z - Math.cos(yaw) * SMOKE_SCREEN.ahead;
    this.elapsed = 0;
    this.live = true;
    if (blocks) this.release = stealth!.addSightBlocker!({ x: this.cx, z: this.cz, r: SMOKE_SCREEN.radius, seconds: SMOKE_SCREEN.seconds });
    if (perception) this.unregister = perception.register(this.provider);
    else if (!this.warned) {
      this.warned = true;
      this.p.warn('emberwright: enemies.perception is absent, so the Smoke Screen only breaks sight lines and does not shorten sight range');
    }
    this.stopFx = this.p.effect?.(SMOKE_SCREEN.effectId, { position: { x: this.cx, y: f.y, z: this.cz }, scale: SMOKE_SCREEN.radius }, { seconds: SMOKE_SCREEN.seconds }) ?? null;
    return { ok: true };
  }

  update(dt: number): void {
    if (!this.live) return;
    if (!this.p.isEmberwright() || !this.p.learned(SMOKE_SCREEN.skillId)) {
      this.end();
      return;
    }
    this.elapsed += dt;
    if (this.elapsed + EPS >= SMOKE_SCREEN.seconds) this.end();
  }

  end(): void {
    this.live = false;
    this.release?.();
    this.unregister?.();
    this.stopFx?.();
    this.release = this.unregister = this.stopFx = null;
  }
}

// ---- the three together --------------------------------------------------------------------------------------------

export type Tier3AbilityId = typeof FIRE_WALL.skillId | typeof IRON_FAMILIAR.skillId | typeof SMOKE_SCREEN.skillId;

export interface Tier3Deps {
  base: Tier3Ports;
  ignite(targetId: ActorId, spec: StatusSpec): boolean;
  spawn(id: ActorId, at: Vec3): FamiliarBody | null;
  mayEngage(targetId: ActorId): boolean;
  stealth: SmokeScreenPorts['stealth'];
  perception: SmokeScreenPorts['perception'];
  warn(message: string): void;
}

/** The plugin's one block: the three skills, their per-tick update and one reset for load, death, class change and dispose. */
export class EmberwrightTier3 {
  readonly fireWall: FireWall;
  readonly familiar: IronFamiliar;
  readonly smoke: SmokeScreen;

  constructor(d: Tier3Deps) {
    this.fireWall = new FireWall({ ...d.base, ignite: d.ignite });
    this.familiar = new IronFamiliar({ ...d.base, spawn: d.spawn, mayEngage: d.mayEngage });
    this.smoke = new SmokeScreen({ ...d.base, stealth: d.stealth, perception: d.perception, warn: d.warn });
  }

  cast(skillId: string): AbilityHandlerResult {
    switch (skillId) {
      case FIRE_WALL.skillId: return this.fireWall.cast();
      case IRON_FAMILIAR.skillId: return this.familiar.cast();
      case SMOKE_SCREEN.skillId: return this.smoke.cast();
      default: return refuse('unknown');
    }
  }

  update(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.fireWall.update(dt);
    this.familiar.update(dt);
    this.smoke.update(dt);
  }

  /** Save load, the player's death, a class change, dispose: every skill's state goes. Cooldowns are the abilities service's. */
  reset(): void {
    this.fireWall.end();
    this.familiar.end();
    this.smoke.end();
  }
}
