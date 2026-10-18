import { HumanoidBody } from './body';
import { mulberry32 } from './ai/moveSelect';
import { ENEMY_DEFS } from './defs';
import { boneMultiplier, Enemy, type EnemyEnv, type EnemySpawn } from './Enemy';
import { EnemyAnimator } from './EnemyAnimator';
import { buildEnemyModel, type EnemyModelSource } from './EnemyModel';
import { scaleStats } from './level';
import { makeMercyInteractable, mercyEvents, mercyTargets, type MercySubject } from './mercy';
import type { ActorId, EnemyEvents, EnemyHost } from './ports';
import { SpawnerRegistry, patrolForSlot, type SpawnRequest } from './spawners';
import { ASH_GRAB, MERCY, WORLD_AI, AI } from './tuning';
import type { EnemyDef, EnemyView, SpawnerDef, SpawnOptions } from './types';

/** Supplies a fresh model clone (and the shared clips) for a def; the plugin wraps the AssetLoader. */
export type ModelFactory = (def: EnemyDef) => EnemyModelSource;

/** The `enemies` service (services.provide('enemies', ...)), for threads 3 and 9. */
export interface EnemiesService {
  spawnGroup(spawnerId: string, opts?: SpawnOptions): ActorId[];
  despawnGroup(spawnerId: string): void;
  /** Despawns the group and clears its cleared and spent marks, so the next `spawnGroup` refills every slot. */
  reset(spawnerId: string): void;
  alive(spawnerId: string): ActorId[];
  view(actorId: ActorId): EnemyView | undefined;
  setMercyUnlocked(verb: 'release' | 'spare', on: boolean): void;
  mercyUnlocked(verb: 'release' | 'spare'): boolean;
  setWarmthTier(w: number): void;
  lockBlockLevel(blockId: string, level: number): void;
}

/**
 * Every live enemy: spawning through the spawners, the four systems' per-tick work, the bus
 * listeners, the damage modifier, attack tokens, pack alerts, mercy and dormancy.
 */
export class EnemyManager {
  readonly spawners: SpawnerRegistry;
  private readonly enemies = new Map<ActorId, Enemy>();
  private readonly tokens = new Map<ActorId, Set<Enemy>>();
  private readonly tokenOf = new Map<Enemy, ActorId>();
  private readonly mercyRemovers = new Map<Enemy, () => void>();
  private readonly subjects = new Map<Enemy, MercySubject>();
  private readonly unsubs: Array<() => void> = [];
  private readonly rng: () => number;
  private counter = 0;
  private disposed = false;

  constructor(
    private readonly host: EnemyHost,
    private readonly makeModel: ModelFactory,
    opts: { seed?: number; spawners?: readonly SpawnerDef[] } = {},
  ) {
    this.rng = mulberry32(opts.seed ?? 0x5eed);
    this.env = this.makeEnv();
    this.spawners = new SpawnerRegistry({
      anchors: host.anchors,
      warn: (m) => host.warn(m),
      spawn: (req) => this.spawn(req),
      despawn: (id) => this.enemies.get(id)?.despawn(),
      gates: host.gates,
      rng: this.rng,
    });
    for (const def of opts.spawners ?? []) this.spawners.define(def);
    this.spawners.bindGates();
    this.listen();
  }

  get count(): number {
    return this.enemies.size;
  }

  get(actorId: ActorId): Enemy | undefined {
    return this.enemies.get(actorId);
  }

  all(): Enemy[] {
    return [...this.enemies.values()];
  }

  // ---- service ---------------------------------------------------------------------------------

  readonly service: EnemiesService = {
    spawnGroup: (id, opts) => this.spawners.spawnGroup(id, opts),
    despawnGroup: (id) => this.spawners.despawnGroup(id),
    reset: (id) => this.spawners.reset(id),
    alive: (id) => this.spawners.alive(id),
    view: (id) => this.enemies.get(id)?.view,
    setMercyUnlocked: (verb, on) => this.host.state.setFlag(MERCY.flags[verb], on),
    mercyUnlocked: (verb) => this.mercyUnlocked(verb),
    setWarmthTier: (w) => this.spawners.setWarmthTier(w),
    lockBlockLevel: (b, l) => this.spawners.lockBlockLevel(b, l),
  };

  mercyUnlocked(verb: 'release' | 'spare'): boolean {
    return this.host.state.getBool(MERCY.flags[verb], false);
  }

  // ---- fixed and render phases -------------------------------------------------------------------

  think(dt: number): void {
    this.updateDormancy();
    for (const e of this.enemies.values()) e.think(dt);
  }

  animate(dt: number): void {
    for (const e of this.enemies.values()) e.animate(dt);
  }

  react(dt: number): void {
    for (const e of [...this.enemies.values()]) e.react(dt);
  }

  render(alpha: number): void {
    for (const e of this.enemies.values()) e.render(alpha);
  }

  // ---- spawning --------------------------------------------------------------------------------

  /** Builds one enemy for a spawner request; null (with a warning) when its model cannot be built. */
  spawn(req: SpawnRequest): ActorId | null {
    if (this.disposed) return null;
    let enemy: Enemy;
    try {
      const source = this.makeModel(req.def);
      const model = buildEnemyModel(source, req.def, { bus: this.host.combat.bus });
      const animator = new EnemyAnimator(model.owner, source.clips, { warn: (m) => this.host.warn(m) });
      const stats = scaleStats(req.def, req.level);
      const spawn: EnemySpawn = {
        def: req.def,
        slug: `${req.def.kind}-${++this.counter}`,
        spawnerId: req.spawnerId,
        spawnTag: req.spawnTag,
        feet: req.feet,
        yaw: req.yaw,
        level: req.level,
        maxHealth: stats.maxHealth,
        damageScale: stats.damageScale,
        patrol: patrolForSlot(req.patrol.map((a) => a.position), req.slot),
        options: req.options,
      };
      enemy = new Enemy(this.env, spawn, new HumanoidBody(model, animator));
    } catch (err) {
      this.host.warn(`enemies: could not spawn ${req.def.kind} for ${req.spawnerId}: ${String(err)}`);
      return null;
    }
    this.enemies.set(enemy.id, enemy);
    const subject: MercySubject = {
      actorId: enemy.id,
      def: enemy.def,
      slug: enemy.slug,
      feet: (out) => out.copy(enemy.feet),
      mercyOpen: () => enemy.mercyOpen,
    };
    this.subjects.set(enemy, subject);
    this.mercyRemovers.set(
      enemy,
      this.host.interaction.register(
        makeMercyInteractable(subject, {
          unlocked: (verb) => this.mercyUnlocked(verb),
          lockOnTarget: () => this.host.services.get('lockOn')?.targetId ?? null,
          complete: (s) => this.completeMercy(s),
        }),
      ),
    );
    return enemy.id;
  }

  /** Spawns one enemy without a spawner (tests, debug). */
  spawnLoose(kind: EnemyDef['kind'], feet: { x: number; y: number; z: number }, opts: SpawnOptions = {}): ActorId | null {
    return this.spawn({
      spawnerId: 'loose',
      spawnTag: 'loose',
      slot: 0,
      def: ENEMY_DEFS[kind],
      feet,
      yaw: 0,
      level: 1,
      patrol: [],
      options: { ...opts, leash: opts.leash ?? true },
      spentKey: 'loose#0',
    });
  }

  // ---- mercy -------------------------------------------------------------------------------------

  private completeMercy(initiator: MercySubject): void {
    const covered = mercyTargets(initiator, this.subjects.values());
    for (const ev of mercyEvents(covered)) {
      const enemy = this.enemies.get(ev.actorId!);
      if (!enemy) continue;
      if (ev.verb === 'release') enemy.release();
      else enemy.spare();
      this.host.events.emit('mercy', ev);
    }
  }

  // ---- shared state used by enemies -----------------------------------------------------------------

  private readonly env: EnemyEnv;

  private makeEnv(): EnemyEnv {
    return {
    host: this.host,
    rng: () => this.rng(),
    neighbours: (self: Enemy) => {
      const out: { x: number; z: number }[] = [];
      for (const e of this.enemies.values()) {
        if (e !== self && e.active && e.feet.distanceToSquared(self.feet) < 9) out.push({ x: e.feet.x, z: e.feet.z });
      }
      return out;
    },
    acquireToken: (self: Enemy, targetId: ActorId) => {
      if (this.tokenOf.get(self) === targetId) return true;
      this.env.releaseToken(self);
      const set = this.tokens.get(targetId) ?? new Set<Enemy>();
      if (set.size >= AI.attackersPerTarget) return false;
      set.add(self);
      this.tokens.set(targetId, set);
      this.tokenOf.set(self, targetId);
      return true;
    },
    releaseToken: (self: Enemy) => {
      const t = this.tokenOf.get(self);
      if (t === undefined) return;
      this.tokenOf.delete(self);
      this.tokens.get(t)?.delete(self);
    },
    alertPack: (self: Enemy, targetId: ActorId) => {
      if (!self.spawnerId) return;
      for (const e of this.enemies.values()) {
        if (e === self || e.spawnerId !== self.spawnerId) continue;
        if (e.feet.distanceTo(self.feet) <= AI.packShareRadius) e.alert(targetId);
      }
    },
    mercyUnlocked: (verb: 'release' | 'spare') => this.mercyUnlocked(verb),
    gone: (self: Enemy, how: 'died' | 'released' | 'spared' | 'despawned') => {
      this.enemies.delete(self.id);
      this.env.releaseToken(self);
      this.subjects.delete(self);
      this.mercyRemovers.get(self)?.();
      this.mercyRemovers.delete(self);
      if (this.disposed) return;
      if (this.spawners.onMemberGone(self.id, how) && self.spawnerId) {
        this.host.events.emit('enemies.groupCleared', { spawnerId: self.spawnerId });
      }
    },
    };
  }

  // ---- bus ---------------------------------------------------------------------------------------

  private listen(): void {
    const on = <K extends keyof EnemyEvents>(type: K, fn: (p: EnemyEvents[K]) => void) =>
      this.unsubs.push(this.host.events.on(type, fn));

    on('damage.dealt', (r) => {
      const target = this.enemies.get(r.targetId);
      if (target) target.damaged(r.attackerId, r.outcome, r.poiseDealt, r.staggered, r.killed);
      const attacker = r.attackerId ? this.enemies.get(r.attackerId) : undefined;
      if (attacker && r.outcome === 'hit' && r.targetId === this.host.actors.player.id) {
        const move = attacker.brain.currentMove;
        if (move?.onHit === 'slow' && attacker.active) attacker.applySlow(ASH_GRAB.speedScale, ASH_GRAB.seconds);
      }
    });
    on('actor.staggered', (p) => this.enemies.get(p.actorId)?.staggered(p.byId));
    on('actor.died', (p) => {
      this.enemies.get(p.actorId)?.died();
      for (const e of this.enemies.values()) if (e.id !== p.actorId) e.targetGone(p.actorId);
    });
    on('actor.despawned', (p) => {
      // Despawned by someone else (a script): clean up without despawning again.
      this.enemies.get(p.actorId)?.cleanup();
      for (const e of this.enemies.values()) e.targetGone(p.actorId);
    });
    on('mercy.revoked', (p) => this.enemies.get(p.actorId)?.revoked(this.host.actors.player.id));
    on('rest', () => this.spawners.onRest());
    on('interior.entered', (p) => this.spawners.onInteriorEntered(p.interiorId));
    on('quest.started', (p) => this.spawners.onQuestStarted(p.questId, (f) => this.host.state.getBool(f, false)));
    on('flag.changed', (p) => {
      if (p.value !== true) return;
      // A flag-gated group spawns when its flag turns true while its quest is active.
      const active = this.host.services.get('quests')?.active() ?? [];
      for (const questId of this.spawners.questsGatedBy(p.key)) {
        if (active.includes(questId)) this.spawners.onQuestStarted(questId, (f) => f === p.key || this.host.state.getBool(f, false));
      }
    });
    on('save.loaded', () => {
      // The live world follows the save: cleared groups and spent piles go, active quests' groups return.
      const spent = new Set(this.spawners.liveInSpentSlots());
      for (const e of [...this.enemies.values()]) {
        if ((e.spawnerId && this.spawners.isCleared(e.spawnerId)) || spent.has(e.id)) e.despawn();
      }
      const active = this.host.services.get('quests')?.active() ?? [];
      for (const questId of active) this.spawners.onQuestStarted(questId, (f) => this.host.state.getBool(f, false));
      const interior = this.host.services.get('interiors')?.current;
      if (interior) this.spawners.onInteriorEntered(interior);
    });

    this.unsubs.push(
      this.host.damage.addModifier(
        'enemies.moves',
        (req, _target, attacker) => {
          if (!attacker || req.kind !== 'melee') return;
          const enemy = this.enemies.get(attacker.id);
          const move = enemy?.brain.currentMove;
          if (!enemy || !move) return;
          req.amount = move.damage * enemy.damageScale * boneMultiplier(req.bone);
          req.poise = move.poise;
          req.attackId = move.clip;
          if (move.telegraph === 'dodge') req.unblockable = true;
        },
        -150,
      ),
    );
  }

  // ---- dormancy ----------------------------------------------------------------------------------

  private updateDormancy(): void {
    const p = this.host.player.feet;
    const ranked = [...this.enemies.values()]
      .filter((e) => e.active)
      .map((e) => ({ e, d: e.feet.distanceTo(p) }))
      .sort((a, b) => a.d - b.d);
    ranked.forEach(({ e, d }, i) => {
      // Hysteresis, so an enemy on the edge does not flip between sleep and wake every tick.
      if (d > WORLD_AI.dormantDistance || i >= WORLD_AI.maxAwake) e.sleep();
      else if (d < WORLD_AI.dormantDistance - WORLD_AI.wakeMargin && i < WORLD_AI.maxAwake - WORLD_AI.wakeRankMargin) e.wake();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    this.spawners.dispose();
    for (const e of [...this.enemies.values()]) e.despawn();
    this.enemies.clear();
  }
}
