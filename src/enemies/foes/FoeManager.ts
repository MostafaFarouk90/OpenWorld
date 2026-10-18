import { LEVEL } from '../tuning';
import type { ActorId, DamageRequestLike, EnemyEvents, EnemyHost } from '../ports';
import type { SpawnRequest } from '../spawners';
import { Blightbloom } from './Blightbloom';
import type { Foe } from './Foe';
import { Scarecrow } from './Scarecrow';
import { TollPost } from './TollPost';
import { BLOOM, SCARECROW, TOLL, isFireAttack } from './tuning';
import type { FoeDef, FoeEnd, FoeEnv, FoeSpawnInfo, RaiseWraithRequest } from './types';

export interface FoeManagerDeps {
  host: EnemyHost;
  rng: () => number;
  /** A foe left the world (spawner bookkeeping lives in the enemies manager). */
  gone(foe: Foe, how: FoeEnd): void;
  raiseWraith(req: RaiseWraithRequest): ActorId | null;
  isPileSpent(pileId: string): boolean;
  markPileSpent(pileId: string): void;
}

/** Health scaling for a foe's level, as `scaleStats` does for enemies. */
export function scaleFoeStats(def: FoeDef, level: number): { maxHealth: number; damageScale: number } {
  const steps = Math.max(0, (Number.isFinite(level) ? level : 1) - 1);
  return {
    maxHealth: Math.round(def.maxHealth * (1 + LEVEL.healthPerLevel * steps)),
    damageScale: 1 + LEVEL.damagePerLevel * steps,
  };
}

/**
 * Every live foe: spawning from a spawner request, the four phases, the bus listeners and the foes'
 * damage modifiers (scarecrow claw and no-death clamp, bloom hit units, toll post heavy-only).
 */
export class FoeManager {
  private readonly foes = new Map<ActorId, Foe>();
  private readonly unsubs: Array<() => void> = [];
  /** Raw (pre-scaling) poise of hits on toll posts, keyed by the request object the resolver passes along. */
  private readonly rawPoise = new WeakMap<object, number>();
  private readonly env: FoeEnv;
  private counter = 0;
  private disposed = false;

  constructor(private readonly deps: FoeManagerDeps) {
    this.env = {
      host: deps.host,
      rng: deps.rng,
      gone: (self, how) => this.onGone(self as Foe, how),
      raiseWraith: (req) => deps.raiseWraith(req),
      isPileSpent: (id) => deps.isPileSpent(id),
      markPileSpent: (id) => deps.markPileSpent(id),
    };
    this.listen();
  }

  get count(): number {
    return this.foes.size;
  }

  get(actorId: ActorId): Foe | undefined {
    return this.foes.get(actorId);
  }

  all(): Foe[] {
    return [...this.foes.values()];
  }

  // ---- phases ------------------------------------------------------------------------------------

  think(dt: number): void {
    for (const f of this.foes.values()) f.think(dt);
  }

  animate(dt: number): void {
    for (const f of this.foes.values()) f.animate(dt);
  }

  react(dt: number): void {
    for (const f of [...this.foes.values()]) f.react(dt);
  }

  render(alpha: number): void {
    for (const f of this.foes.values()) f.render(alpha);
  }

  // ---- spawning ----------------------------------------------------------------------------------

  /** Builds one foe for a spawner request; null (with a warning) when it cannot be built. */
  spawn(req: SpawnRequest & { def: FoeDef }): ActorId | null {
    if (this.disposed) return null;
    const def = req.def;
    const stats = scaleFoeStats(def, req.level);
    const info: FoeSpawnInfo = {
      def,
      slug: `${def.kind}-${++this.counter}`,
      spawnerId: req.spawnerId,
      spawnTag: req.spawnTag,
      feet: req.feet,
      yaw: req.yaw,
      level: req.level,
      maxHealth: Math.max(1, Math.round(stats.maxHealth * (req.options.healthScale ?? 1))),
      damageScale: stats.damageScale * (req.options.damageScale ?? 1),
      piles: req.piles ?? [],
      anchorId: req.anchorId ?? null,
      aggro: req.options.aggro === true,
    };
    let foe: Foe;
    try {
      switch (def.kind) {
        case 'ash-scarecrow':
          foe = new Scarecrow(this.env, info);
          break;
        case 'blightbloom':
          foe = new Blightbloom(this.env, info);
          break;
        case 'toll-post':
          foe = new TollPost(this.env, info);
          break;
      }
    } catch (err) {
      this.deps.host.warn(`enemies: could not spawn ${def.kind} for ${req.spawnerId}: ${String(err)}`);
      return null;
    }
    this.foes.set(foe.id, foe);
    return foe.id;
  }

  private onGone(foe: Foe, how: FoeEnd): void {
    this.foes.delete(foe.id);
    if (this.disposed) return;
    this.deps.gone(foe, how);
  }

  // ---- bus and damage modifiers ----------------------------------------------------------------------

  private listen(): void {
    const host = this.deps.host;
    const on = <K extends keyof EnemyEvents>(type: K, fn: (p: EnemyEvents[K]) => void) => this.unsubs.push(host.events.on(type, fn));
    on('damage.dealt', (r) => this.foes.get(r.targetId)?.damaged(r));
    on('actor.died', (p) => this.foes.get(p.actorId)?.died());
    // Despawned by someone else (a script): clean up without despawning again.
    on('actor.despawned', (p) => this.foes.get(p.actorId)?.cleanup());

    // Attacker band: the scarecrow's claw damage; the toll post's raw poise, before anything scales it.
    this.unsubs.push(
      host.damage.addModifier(
        'foes.claw',
        (req, _target, attacker) => {
          if (!attacker || req.kind !== 'melee') return;
          const foe = this.foes.get(attacker.id);
          if (!(foe instanceof Scarecrow) || foe.state !== 'swing') return;
          req.amount = SCARECROW.clawDamage * foe.damageScale;
          req.poise = SCARECROW.clawPoise;
          req.attackId = SCARECROW.clawId;
        },
        -150,
      ),
      host.damage.addModifier(
        'foes.toll-post.raw',
        (req, target) => {
          if (target.kind === 'toll-post') this.rawPoise.set(req, req.poise ?? req.amount);
        },
        -200,
      ),
      // Defender band: the toll post blocks everything lighter than a heavy blow.
      host.damage.addModifier(
        'foes.toll-post.heavy',
        (req, target) => {
          if (target.kind !== 'toll-post' || req.outcome !== 'hit') return;
          const poise = this.rawPoise.get(req) ?? req.poise ?? req.amount;
          this.rawPoise.delete(req);
          if (poise >= TOLL.heavyPoise) return;
          req.outcome = 'blocked';
          req.amount = 0;
          req.poise = 0;
        },
        -90,
      ),
      // Last of the defender band: what a hit may do to the scarecrow and the bloom.
      host.damage.addModifier(
        'foes.defender',
        (req, target) => {
          if (req.outcome !== 'hit') return;
          if (target.kind === 'ash-scarecrow') this.clampScarecrow(req, target.health);
          else if (target.kind === 'blightbloom') this.bloomHit(req, target.health, target.maxHealth);
        },
        -1,
      ),
    );
  }

  /** Plain hits and the Surge never kill a scarecrow: they leave it at least 1 health. */
  private clampScarecrow(req: DamageRequestLike, health: number): void {
    req.amount = Math.max(0, Math.min(req.amount, health - 1));
    req.poise = 0;
  }

  /** Two regular hits, or any fire or Surge hit, destroy a bloom. */
  private bloomHit(req: DamageRequestLike, health: number, maxHealth: number): void {
    if (isFireAttack(req.attackId)) {
      req.amount = Math.max(req.amount, health);
      return;
    }
    if (req.amount <= 0) return;
    req.amount = Math.min(health, maxHealth / BLOOM.hitsToKill);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    for (const f of [...this.foes.values()]) f.despawn();
    this.foes.clear();
  }
}
