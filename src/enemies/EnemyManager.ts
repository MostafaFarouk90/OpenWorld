import * as THREE from 'three';
import { isHeavyBlow } from '../combat/heavyBlow';
import { HumanoidBody } from './body';
import { mulberry32 } from './ai/moveSelect';
import { ENEMY_DEFS } from './defs';
import { boneMultiplier, Enemy, type EnemyEnv, type EnemySpawn } from './Enemy';
import { EnemyAnimator } from './EnemyAnimator';
import { buildEnemyModel, type EnemyModelSource } from './EnemyModel';
import { isFoeKind } from './foes/defs';
import type { Foe } from './foes/Foe';
import { FoeManager } from './foes/FoeManager';
import type { FoeDef, RaiseWraithRequest } from './foes/types';
import { scaleStats } from './level';
import { makeBossMercyInteractable, makeMercyInteractable, mercyEvents, mercyTargets, nextPulseId, type BossMercySubject, type MercySubject } from './mercy';
import { MercyTally, type TallyRow } from './mercyTally';
import type { ActorId, EnemyEvents, EnemyHost, MercyEventLike } from './ports';
import { SpawnerRegistry, patrolForSlot, type MemberEnd, type SpawnRequest } from './spawners';
import { ASH_GRAB, BOSS_MERCY, GUARD, MERCY, PAIR, WORLD_AI, AI } from './tuning';
import type { EnemyDef, EnemyView, SpawnerDef, SpawnOptions, UnlockVerb } from './types';

function isFoeDef(def: EnemyDef | FoeDef): def is FoeDef {
  return isFoeKind(def.kind);
}

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
  setMercyUnlocked(verb: UnlockVerb, on: boolean): void;
  mercyUnlocked(verb: UnlockVerb): boolean;
  setWarmthTier(w: number): void;
  lockBlockLevel(blockId: string, level: number): void;
  /** Mercies and kills per creature kind, for the codex (thread 8). */
  mercyTally(): Record<string, TallyRow>;
}

/**
 * Every live enemy: spawning through the spawners, the four systems' per-tick work, the bus
 * listeners, the damage modifier, attack tokens, pack alerts, mercy and dormancy.
 */
export class EnemyManager {
  readonly spawners: SpawnerRegistry;
  private readonly enemies = new Map<ActorId, Enemy>();
  /** Brainless mortal foes (scarecrows, blooms, toll posts), spawned through the same spawners. */
  private readonly foes: FoeManager;
  /** Per-enemy end callbacks (the bloom's raised wraiths). */
  private readonly releaseWatchers = new Map<ActorId, { accepted(): void; revoked?(): void }>();
  private readonly goneWatchers = new Map<ActorId, (how: MemberEnd) => void>();
  private readonly tokens = new Map<ActorId, Set<Enemy>>();
  private readonly tokenOf = new Map<Enemy, ActorId>();
  private readonly mercyRemovers = new Map<Enemy, () => void>();
  private readonly subjects = new Map<Enemy, MercySubject>();
  private readonly bossHolds = new Map<string, () => void>();
  private readonly glyphs = new Map<ActorId, { stop(): void }>();
  readonly tally = new MercyTally();
  private readonly unsubs: Array<() => void> = [];
  private readonly rng: () => number;
  private readonly scratch = new THREE.Vector3();
  private readonly tokenAt = new Map<Enemy, number>();
  private clock = 0;
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
      despawn: (id) => (this.enemies.get(id) ?? this.foes.get(id))?.despawn(),
      gates: host.gates,
      rng: this.rng,
    });
    this.foes = new FoeManager({
      host,
      rng: this.rng,
      gone: (foe, how) => this.memberGone(foe, how),
      raiseWraith: (req) => this.raiseWraith(req),
      isPileSpent: (id) => this.spawners.isPileSpent(id),
      markPileSpent: (id) => this.spawners.markPileSpent(id),
      unmarkPileSpent: (id) => this.spawners.unmarkPileSpent(id),
    });
    for (const def of opts.spawners ?? []) this.spawners.define(def);
    this.spawners.bindGates();
    this.listen();
  }

  get count(): number {
    return this.enemies.size;
  }

  /** Live foes (not counted in `count`). */
  get foeCount(): number {
    return this.foes.count;
  }

  get(actorId: ActorId): Enemy | undefined {
    return this.enemies.get(actorId);
  }

  getFoe(actorId: ActorId): Foe | undefined {
    return this.foes.get(actorId);
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
    view: (id) => (this.enemies.get(id) ?? this.foes.get(id))?.view,
    setMercyUnlocked: (verb, on) => this.host.state.setFlag(MERCY.flags[verb], on),
    mercyUnlocked: (verb) => this.mercyUnlocked(verb),
    setWarmthTier: (w) => this.spawners.setWarmthTier(w),
    lockBlockLevel: (b, l) => this.spawners.lockBlockLevel(b, l),
    mercyTally: () => this.tally.snapshot(),
  };

  mercyUnlocked(verb: UnlockVerb): boolean {
    return this.host.state.getBool(MERCY.flags[verb], false);
  }

  // ---- fixed and render phases -------------------------------------------------------------------

  think(dt: number): void {
    this.clock += dt;
    this.updateDormancy();
    for (const e of this.enemies.values()) e.think(dt);
    this.foes.think(dt);
  }

  animate(dt: number): void {
    for (const e of this.enemies.values()) e.animate(dt);
    this.foes.animate(dt);
  }

  react(dt: number): void {
    for (const e of [...this.enemies.values()]) e.react(dt);
    this.foes.react(dt);
  }

  render(alpha: number): void {
    for (const e of this.enemies.values()) e.render(alpha);
    this.foes.render(alpha);
  }

  // ---- spawning --------------------------------------------------------------------------------

  /** Builds one enemy for a spawner request; null (with a warning) when its model cannot be built. */
  spawn(req: SpawnRequest): ActorId | null {
    if (this.disposed) return null;
    // Foes (scarecrow, bloom, toll post) have no Knight model: the model factory is never called for them.
    const def = req.def;
    if (isFoeDef(def)) return this.foes.spawn({ ...req, def });
    let enemy: Enemy;
    try {
      const source = this.makeModel(def);
      const model = buildEnemyModel(source, def, { bus: this.host.combat.bus });
      const animator = new EnemyAnimator(model.owner, source.clips, { warn: (m) => this.host.warn(m) });
      const stats = scaleStats(def, req.level);
      const spawn: EnemySpawn = {
        def: def,
        slug: `${def.kind}-${++this.counter}`,
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
      this.host.warn(`enemies: could not spawn ${def.kind} for ${req.spawnerId}: ${String(err)}`);
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

  /**
   * Raises a wraith (it plays its rise, aggro on) at a pile for a Blightbloom, outside any spawner slot.
   * The wraith belongs to `req.spawnerId` for pack alerts and save-load cleanup; `req.onGone` is called
   * once when it is gone however it ended ('released' is what spends the pile).
   */
  raiseWraith(req: RaiseWraithRequest): ActorId | null {
    const id = this.spawn({
      spawnerId: req.spawnerId,
      spawnTag: req.spawnTag,
      slot: -1,
      def: ENEMY_DEFS['ash-wraith'],
      feet: req.feet,
      yaw: req.yaw,
      level: req.level,
      patrol: [],
      options: { aggro: true, leash: false },
      spentKey: `${req.spawnerId}#raised`,
    });
    if (id !== null) {
      this.goneWatchers.set(id, req.onGone);
      if (req.onReleased) this.releaseWatchers.set(id, { accepted: req.onReleased, revoked: req.onReleaseRevoked });
    }
    return id;
  }

  /** A foe left the world: the same slot bookkeeping as an enemy. */
  private memberGone(foe: Foe, how: MemberEnd): void {
    this.afterGone(foe.id, foe.spawnerId, how);
  }

  private afterGone(id: ActorId, spawnerId: string | null, how: MemberEnd): void {
    if (this.spawners.onMemberGone(id, how) && spawnerId) {
      this.host.events.emit('enemies.groupCleared', { spawnerId });
    }
  }

  // ---- mercy -------------------------------------------------------------------------------------

  private completeMercy(initiator: MercySubject): void {
    const covered = mercyTargets(initiator, this.subjects.values());
    const events = mercyEvents(covered);
    // One charge per completed hold, however many wraiths the pulse covers (design 9.7).
    if (initiator.def.mercy.verb === 'release') this.chargeShard(MERCY.releaseBurn, 'release');
    this.applyMercy(events);
    if (initiator.def.mercy.verb === 'spare') this.sharePackSpare(initiator);
    if (initiator.def.mercy.verb === 'release') {
      const at = initiator.feet(new THREE.Vector3());
      this.releaseFx(at);
    }
  }

  /** Burn and, at 75 or more, a Scar: thread 2's `useShard` when it exists, the bare Burn charge otherwise. */
  private chargeShard(cost: number, source: string): void {
    const spells = this.host.services.get('spells');
    if (!spells) return;
    if (spells.useShard) spells.useShard(cost, source);
    else spells.addBurn?.(cost, source);
  }

  /** The state change, the slot mark, the tally and the `mercy` event for each covered enemy. */
  private applyMercy(events: readonly MercyEventLike[]): void {
    for (const ev of events) {
      const enemy = this.enemies.get(ev.actorId!);
      if (!enemy) continue;
      // Spent now, not when it finally leaves: a save mid-dissolve or mid-walk-off must not bring it back.
      this.spawners.spendMercy(enemy.id);
      if (ev.verb === 'release') this.releaseWatchers.get(enemy.id)?.accepted();
      if (ev.verb === 'release') enemy.release();
      else enemy.spare();
      this.tally.mercy(ev);
      this.host.events.emit('mercy', ev);
    }
  }

  /** A pack shares its mercy: partners of a spared Footman at a poise break are offered the same (design 10). */
  private sharePackSpare(spared: MercySubject): void {
    const sparedEnemy = this.enemies.get(spared.actorId);
    const spawnerId = sparedEnemy?.spawnerId;
    if (!sparedEnemy || !spawnerId) return;
    for (const e of this.enemies.values()) {
      if (e === sparedEnemy || e.spawnerId !== spawnerId) continue;
      if (e.feet.distanceTo(sparedEnemy.feet) <= AI.packShareRadius) e.offerYield();
    }
  }

  private releaseFx(at: THREE.Vector3): void {
    const vfx = this.host.services.get('vfx');
    vfx?.spawnEffect?.('release-pulse', { position: { x: at.x, y: at.y, z: at.z } });
    vfx?.pulseScreen?.(0.5, 0.8, 0xffc040);
  }

  // ---- boss mercy ---------------------------------------------------------------------------------

  /** `boss.releaseWindow`: the boss's hold-T opens with the registry's release window and closes with it. */
  private onBossWindow(bossId: string, open: boolean): void {
    this.closeBossHold(bossId);
    const bosses = this.host.bosses;
    const table = BOSS_MERCY[bossId];
    if (!open || !bosses || !table) return;
    const st = bosses.state(bossId);
    if (!st) return;
    const actorId = st.actorId;
    const subject: BossMercySubject = {
      bossId,
      actorId,
      feet: (out) => {
        const a = this.host.actors.get(actorId);
        return a ? a.worldPosition(out) : out.set(0, 0, 0);
      },
    };
    this.bossHolds.set(
      bossId,
      this.host.interaction.register(
        makeBossMercyInteractable(subject, {
          unlocked: () => this.mercyUnlocked('release'),
          windowOpen: () => bosses.state(bossId)?.releaseOpen === true,
          lockOnTarget: () => this.host.services.get('lockOn')?.targetId ?? null,
          complete: (b) => this.completeBossMercy(b),
        }),
      ),
    );
  }

  private stopGlyph(actorId: ActorId): void {
    this.glyphs.get(actorId)?.stop();
    this.glyphs.delete(actorId);
  }

  private closeBossHold(bossId: string): void {
    this.bossHolds.get(bossId)?.();
    this.bossHolds.delete(bossId);
  }

  private completeBossMercy(boss: BossMercySubject): void {
    const bosses = this.host.bosses;
    const table = BOSS_MERCY[boss.bossId];
    if (!bosses || !table) return;
    // Read the boss position and the summons before the registry fires `boss.released`: its listeners
    // (the encounter script) may despawn the boss or its summons synchronously.
    if (!this.host.actors.get(boss.actorId)) return;
    const at = boss.feet(new THREE.Vector3());
    const pulseId = nextPulseId();
    // The pulse also frees every staggered undead within 4 m, under the same pulseId and one charge.
    const around: MercySubject[] = [];
    const p = new THREE.Vector3();
    for (const s of this.subjects.values()) {
      if (s.def.mercy.verb === 'release' && s.mercyOpen() && s.feet(p).distanceTo(at) <= MERCY.pulseRadius) around.push(s);
    }
    // The registry decides: only a true release charges Burn and pays the ledger row.
    if (!bosses.release(boss.bossId)) return;
    this.closeBossHold(boss.bossId);
    this.chargeShard(table.burn, 'release');
    const bossEvent: MercyEventLike = {
      verb: table.verb,
      tier: 'boss',
      track: table.track,
      creature: boss.bossId,
      actorId: boss.actorId,
      amount: table.amount,
      pulseId,
    };
    this.tally.mercy(bossEvent);
    this.host.events.emit('mercy', bossEvent);
    this.applyMercy(mercyEvents(around.filter((a) => this.enemies.has(a.actorId)), pulseId));
    this.releaseFx(at);
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
      // A pair does not swing in the same instant: the second waits out a short stagger.
      if (self.def.pairAdvance && self.spawnerId) {
        for (const e of set) {
          if (e.spawnerId === self.spawnerId && this.clock - (this.tokenAt.get(e) ?? -Infinity) < PAIR.attackStaggerSeconds) return false;
        }
      }
      set.add(self);
      this.tokenAt.set(self, this.clock);
      this.tokens.set(targetId, set);
      this.tokenOf.set(self, targetId);
      return true;
    },
    releaseToken: (self: Enemy) => {
      const t = this.tokenOf.get(self);
      if (t === undefined) return;
      this.tokenOf.delete(self);
      this.tokenAt.delete(self);
      this.tokens.get(t)?.delete(self);
    },
    partnerOf: (self: Enemy) => {
      if (!self.spawnerId) return null;
      let best: Enemy | null = null;
      let bestD: number = PAIR.maxPartnerDistance;
      for (const e of this.enemies.values()) {
        if (e === self || e.spawnerId !== self.spawnerId || !e.active || e.sleeping) continue;
        const d = e.feet.distanceTo(self.feet);
        if (d <= bestD) {
          best = e;
          bestD = d;
        }
      }
      return best;
    },
    alertPack: (self: Enemy, targetId: ActorId) => {
      if (!self.spawnerId) return;
      for (const e of this.enemies.values()) {
        if (e === self || e.spawnerId !== self.spawnerId) continue;
        if (e.feet.distanceTo(self.feet) <= AI.packShareRadius) e.alert(targetId);
      }
    },
    mercyUnlocked: (verb: UnlockVerb) => this.mercyUnlocked(verb),
    nav: () => this.host.services.get('nav'),
    gone: (self: Enemy, how: 'died' | 'released' | 'spared' | 'despawned') => {
      this.enemies.delete(self.id);
      this.env.releaseToken(self);
      this.subjects.delete(self);
      this.stopGlyph(self.id);
      this.mercyRemovers.get(self)?.();
      this.mercyRemovers.delete(self);
      const watcher = this.goneWatchers.get(self.id);
      this.goneWatchers.delete(self.id);
      this.releaseWatchers.delete(self.id);
      if (this.disposed) return;
      watcher?.(how);
      this.afterGone(self.id, self.spawnerId, how);
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
      const dying = this.enemies.get(p.actorId);
      if (dying) this.tally.killed(dying.def.kind);
      dying?.died();
      for (const e of this.enemies.values()) if (e.id !== p.actorId) e.targetGone(p.actorId);
    });
    on('actor.despawned', (p) => {
      // Despawned by someone else (a script): clean up without despawning again.
      this.enemies.get(p.actorId)?.cleanup();
      for (const e of this.enemies.values()) e.targetGone(p.actorId);
    });
    on('mercy.revoked', (p) => {
      this.tally.revoked(p.actorId);
      const e = this.enemies.get(p.actorId);
      // Hostile again: its slot is live, not spent, so a reload does not drop it.
      if (e?.revoked(this.host.actors.player.id)) {
        this.spawners.unspendMercy(p.actorId);
        this.releaseWatchers.get(p.actorId)?.revoked?.();
      }
    });
    on('enemies.yield', (p) => {
      const e = this.enemies.get(p.actorId);
      if (!e) return;
      // A refreshed window replaces the old glyph.
      this.stopGlyph(p.actorId);
      const h = this.host.services.get('vfx')?.spawnEffect?.('yield-glyph', { position: { x: e.feet.x, y: e.feet.y, z: e.feet.z } }, { seconds: p.seconds });
      if (h && typeof (h as { stop?: unknown }).stop === 'function') this.glyphs.set(p.actorId, h as { stop(): void });
    });
    // The glyph goes when the yield ends: resume, mercy, death or despawn.
    on('enemies.state', (p) => {
      if (p.from === 'yield') this.stopGlyph(p.actorId);
    });
    on('boss.releaseWindow', (p) => this.onBossWindow(p.bossId, p.open));
    on('boss.released', (p) => this.closeBossHold(p.bossId));
    on('boss.ended', (p) => this.closeBossHold(p.bossId));
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
      // An enemy leaving after a mercy the loaded save never saw is gone from this world: despawn it
      // (no spend, no clear) and refill its group, so the loaded world keeps the enemy.
      const refill = new Set<string>();
      for (const e of [...this.enemies.values()]) {
        // Summons are never saved: a load drops them, and nothing refills them.
        if ((e.spawnerId && (this.spawners.isCleared(e.spawnerId) || this.spawners.isEphemeral(e.spawnerId))) || spent.has(e.id)) e.despawn();
        else if (e.inMercyExit && e.spawnerId) {
          refill.add(e.spawnerId);
          e.despawnUnseen();
        }
      }
      for (const id of refill) if (!this.spawners.isCleared(id)) this.spawners.spawnGroup(id);
      const active = this.host.services.get('quests')?.active() ?? [];
      for (const f of this.foes.all()) {
        // A foe whose group is cleared or whose slot is spent does not survive a load; neither does an R01
        // scarecrow once its quest is no longer active.
        const quest = f.spawnerId ? this.spawners.questOf(f.spawnerId) : undefined;
        const questOver = f.kind === 'ash-scarecrow' && quest !== undefined && !active.includes(quest);
        if ((f.spawnerId && this.spawners.isCleared(f.spawnerId)) || spent.has(f.id) || questOver) f.despawn();
      }
      for (const questId of active) this.spawners.onQuestStarted(questId, (f) => this.host.state.getBool(f, false));
      const interior = this.host.services.get('interiors')?.current;
      if (interior) this.spawners.onInteriorEntered(interior);
      this.spawners.resyncGates();
    });

    // Defender band (-100..-1): a raised footman shield scales a front hit down; a heavy chop breaks it; the back is open.
    this.unsubs.push(
      this.host.damage.addModifier(
        'enemies.guard',
        (req, target, attacker) => {
          if (req.kind !== 'melee' || req.outcome !== 'hit' || !attacker) return;
          const enemy = this.enemies.get(target.id);
          if (!enemy) return;
          const from = attacker.worldPosition(this.scratch);
          const hit = enemy.guardHit(isHeavyBlow(req), from);
          if (hit === 'broken') enemy.breakGuard();
          else if (hit === 'back') req.amount *= GUARD.backDamageScale;
          else if (hit === 'blocked' && !req.unblockable) {
            req.outcome = 'blocked';
            req.amount *= GUARD.damageScale;
            req.poise *= GUARD.poiseScale;
          }
        },
        GUARD.modifierOrder,
      ),
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
    this.foes.dispose();
    for (const id of [...this.bossHolds.keys()]) this.closeBossHold(id);
    for (const id of [...this.glyphs.keys()]) this.stopGlyph(id);
    for (const e of [...this.enemies.values()]) e.despawn();
    this.enemies.clear();
  }
}
