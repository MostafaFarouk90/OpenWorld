import * as THREE from 'three';
import { isHeavyBlow } from '../combat/heavyBlow';
import { HumanoidBody, type EnemyBody } from './body';
import { mulberry32 } from './ai/moveSelect';
import { ENEMY_DEFS } from './defs';
import { PathBudget } from './steering/pathFollower';
import { GroundAttacks } from './ranged/GroundAttacks';
import { makeGolemBody } from './golem/body';
import { GOLEM_CORE_ORDER, isCoreHit } from './golem/rules';
import { makeCrawlerBody } from './crawler/body';
import { disposeGroundProp, makeGroundProp } from './ranged/props';
import { RANGED_ATTACK_PREFIX } from './ranged/tuning';
import { boneMultiplier, Enemy, type EnemyEnv, type EnemySpawn } from './Enemy';
import { makeWyrmBody } from './wyrm/body';
import { EnemyAnimator } from './EnemyAnimator';
import { buildEnemyModel, type EnemyModelSource } from './EnemyModel';
import { isFoeKind } from './foes/defs';
import type { Foe } from './foes/Foe';
import { FoeManager } from './foes/FoeManager';
import type { FoeDef, FoeEnd, RaiseWraithRequest } from './foes/types';
import { scaleStats } from './level';
import { CalmCycle, calmOptionLabel, calmOptions, calmPayable, type CalmOption } from './calm';
import { bossMercyInteractableId, makeBossMercyInteractable, makeMercyInteractable, mercyEvents, mercyInteractableId, mercyTargets, nextPulseId, type BossMercySubject, type MercyEnemyDef, type MercySubject } from './mercy';
import { MercyTally, type TallyRow } from './mercyTally';
import { makeQuadrupedBody } from './hound/body';
import { HOUND } from './hound/tuning';
import type { ActorId, EnemyEvents, EnemyHost, MercyEventLike } from './ports';
import { SpawnerRegistry, patrolForSlot, type MemberEnd, type SpawnRequest } from './spawners';
import { ASH_GRAB, BOSS_MERCY, GUARD, MERCY, PAIR, WARM_HAND_BURN, WORLD_AI, AI } from './tuning';
import type { EnemyDef, EnemyView, SpawnerDef, SpawnOptions, UnlockVerb } from './types';
import { makeLineOfSight } from './ai/perception';
import { TauntRegistry, type TauntService } from './taunts';
import { PerceptionHub, type PerceptionProvider, type Unregister } from './perceptionHook';


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
  /** The living member in a spawner's `leaderSlot`, or null. */
  packLeader(spawnerId: string): ActorId | null;
  /**
   * Shoves an enemy `metres` (clamped to 6) along the horizontal `dir` over a short knockback, without a stagger.
   * False (nothing happens) for a non-finite `dir` or `metres <= 0`, an unknown, dead, gone, foe, observer-only or
   * non-hostile actor, a boss, an enemy in any mercy window, and a thief carrying gold.
   */
  push(actorId: ActorId, push: { dir: { x: number; z: number }; metres: number }): boolean;
  /** A6b ground enemies: the live enemies and the thrown Calm, for ground/ground.plugin.ts (not a public contract). */
  ground: {
    get(actorId: ActorId): Enemy | undefined;
    all(): Enemy[];
    /** A thrown offering landed: Calm like a held one's. False when the beast is not open to it. */
    calmByThrow(actorId: ActorId): boolean;
  };
  /** Target choice: a taunter (the Iron Familiar) registers here and nearby enemies target it for its duration. */
  taunts: TauntService;
  /** Perception hook for stealth and skills (thread 18, 15). */
  perception: {
    register(provider: PerceptionProvider): Unregister;
    /** Per-guard read: awareness 0..1, sees and hears as of the enemy's last think; null for an unknown, gone or dormant enemy. */
    state(actorId: ActorId): { awareness: number; sees: boolean; hears: boolean; distance: number } | null;
    /**
     * Stealth's per-tick hold on a watch guard: pauses its patrol and turns it toward `at` (feet) at `AI.turnRate`,
     * holding until the next call; cheap, idempotent, no allocation. `null` releases it and the patrol resumes from
     * where it stands. False (nothing happens) for an unknown, gone, dormant or non-observer-only actor and for
     * non-finite coordinates. A group reset or despawn, `save.loaded` and `sleep` clear any hold.
     */
    face(actorId: ActorId, at: { x: number; y: number; z: number } | null): boolean;
  };
}

/**
 * Every live enemy: spawning through the spawners, the four systems' per-tick work, the bus
 * listeners, the damage modifier, attack tokens, pack alerts, mercy and dormancy.
 */
const PULL_TMP = new THREE.Vector3();
/** After the defender band (guards, shields): a wing hit breaks poise whatever the swing carried. */
const POISE_BREAK_BONES_ORDER = 50;

export class EnemyManager {
  readonly spawners: SpawnerRegistry;
  private readonly enemies = new Map<ActorId, Enemy>();
  /** Brainless mortal foes (scarecrows, blooms, toll posts), spawned through the same spawners. */
  private readonly foes: FoeManager;
  /** Per-enemy end callbacks (the bloom's raised wraiths). */
  private readonly releaseWatchers = new Map<ActorId, { accepted(): void; revoked?(): void }>();
  private readonly goneWatchers = new Map<ActorId, (how: FoeEnd) => void>();
  private readonly tokens = new Map<ActorId, Set<Enemy>>();
  private readonly tokenOf = new Map<Enemy, ActorId>();
  private readonly mercyRemovers = new Map<Enemy, () => void>();
  private readonly subjects = new Map<Enemy, MercySubject>();
  private readonly bossHolds = new Map<string, () => void>();
  private readonly glyphs = new Map<ActorId, { stop(): void }>();
  readonly tally = new MercyTally();
  /** The Calm prompt's offering selection and wheel claim. */
  private readonly calm: CalmCycle;
  private readonly unsubs: Array<() => void> = [];
  private readonly rng: () => number;
  private readonly attacks: GroundAttacks;
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
    this.calm = new CalmCycle(host.calmUi);
    this.attacks = new GroundAttacks(host);
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
    packLeader: (id) => this.packLeaderId(id),
    push: (id, p) => this.pushEnemy(id, p),
    ground: {
      get: (id) => this.enemies.get(id),
      all: () => this.all(),
      calmByThrow: (id) => this.calmByThrow(id),
    },
    taunts: { register: (s) => this.tauntRegistry.register(s) },
    perception: {
      register: (p) => this.perceptionHub.register(p),
      state: (id) => this.enemies.get(id)?.perceptionState() ?? null,
      face: (id, at) => this.enemies.get(id)?.faceToward(at) ?? false,
    },
  };

  /**
   * A thrown offering landed on `actorId` (the Cooling Draught): a Calm like a held offering's, without the inventory step (the
   * thrower consumed it). Refused unless Calm is unlocked and the beast is still open to it (alive, unstruck, not mid-swing).
   */
  private calmByThrow(actorId: ActorId): boolean {
    const enemy = this.enemies.get(actorId);
    const subject = enemy ? this.subjects.get(enemy) : undefined;
    if (!enemy || !subject || !this.mercyUnlocked('calm') || enemy.def.mercy?.verb !== 'calm') return false;
    if (!enemy.mercyOpen) return false;
    this.applyMercy(mercyEvents([subject]));
    this.calmFx(enemy.feet, { kind: 'free' });
    return true;
  }

  readonly tauntRegistry = new TauntRegistry();

  /** True for a registered boss actor (the core registry knows them). */
  private isBoss(actorId: ActorId): boolean {
    const bosses = this.host.bosses;
    if (bosses?.active) for (const b of bosses.active()) if (bosses.state(b)?.actorId === actorId) return true;
    return false;
  }

  readonly perceptionHub = new PerceptionHub((m) => this.host.warn(m));

  private pushEnemy(actorId: ActorId, p: { dir: { x: number; z: number }; metres: number }): boolean {
    const enemy = this.enemies.get(actorId);
    if (!enemy || !p) return false;
    const bosses = this.host.bosses;
    if (bosses?.active) for (const b of bosses.active()) if (bosses.state(b)?.actorId === actorId) return false;
    return enemy.pushAlong(p.dir, p.metres);
  }

  /** The living member in a spawner's `leaderSlot`, or null (no leader slot, or its occupant is gone). */
  packLeaderId(spawnerId: string): ActorId | null {
    const id = this.spawners.leaderOf(spawnerId);
    const e = id ? this.enemies.get(id) : undefined;
    return e && e.active ? e.id : null;
  }

  mercyUnlocked(verb: UnlockVerb): boolean {
    return this.host.state.getBool(MERCY.flags[verb], false);
  }

  // ---- fixed and render phases -------------------------------------------------------------------

  think(dt: number): void {
    this.clock += dt;
    this.tauntRegistry.update(dt);
    this.pathBudget.reset();
    this.updateDormancy();
    for (const e of this.enemies.values()) e.think(dt);
    this.attacks.update(dt);
    this.foes.think(dt);
    // Escaped thieves' slots refill out of the player's sight while their group is live.
    this.spawners.tickRefills(dt, (at) => this.playerCanSee(at));
  }

  /** Whether the player could see a point on the ground: within sight range and with a clear ray. */
  private playerCanSee(at: { x: number; y: number; z: number }): boolean {
    const p = this.host.player.feet;
    if (Math.hypot(p.x - at.x, p.z - at.z) > AI.sightRange) return false;
    const physics = this.host.physics;
    if (!physics) return true;
    return makeLineOfSight(physics, this.host.player.collider)(
      { x: at.x, y: at.y + AI.eyeHeight, z: at.z },
      { x: p.x, y: p.y + AI.chestHeight, z: p.z },
    );
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
    this.calm.update();
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
        slot: req.slot,
      };
      enemy = new Enemy(this.env, spawn, this.makeBody(def));
    } catch (err) {
      this.host.warn(`enemies: could not spawn ${def.kind} for ${req.spawnerId}: ${String(err)}`);
      return null;
    }
    this.enemies.set(enemy.id, enemy);
    const mercyDef = enemy.def.mercy ? (enemy.def as MercyEnemyDef) : null;
    if (!mercyDef) return enemy.id; // no mercy row (the watch guard): nothing to register
    const subject: MercySubject = {
      actorId: enemy.id,
      def: mercyDef,
      slug: enemy.slug,
      feet: (out) => enemy.mercyAnchor(out),
      mercyOpen: () => enemy.mercyOpen,
    };
    this.subjects.set(enemy, subject);
    const holdId = mercyInteractableId(enemy.slug);
    const removeCalm =
      mercyDef.mercy.verb === 'calm'
        ? this.calm.register(holdId, () =>
            enemy.mercyOpen && this.mercyUnlocked('calm') ? calmOptions(mercyDef.mercy, this.host.services.get('inventory'), { cooled: enemy.isCooled }) : [],
          )
        : null;
    const removeHold = this.host.interaction.register(
      makeMercyInteractable(subject, {
        unlocked: (verb) => this.mercyUnlocked(verb),
        lockOnTarget: () => this.host.services.get('lockOn')?.targetId ?? null,
        complete: (s) => this.completeMercy(s),
        calmLabel: () => this.calmLabel(holdId),
      }),
    );
    this.mercyRemovers.set(enemy, () => {
      removeHold();
      removeCalm?.();
    });
    return enemy.id;
  }

  /** The prompt's `{offering}` for the hold `id`, or null when nothing can be paid (the prompt stays hidden). */
  private calmLabel(id: string): string | null {
    const option = this.calm.selected(id);
    return option ? calmOptionLabel(option, (k) => this.host.calmUi?.text(k) ?? k) : null;
  }

  /** The body for a def: the procedural quadruped, or the Knight rig from the model factory. */
  private makeBody(def: EnemyDef): EnemyBody {
    if (def.body === 'golem') return makeGolemBody(def, { bus: this.host.combat.bus, warn: (m) => this.host.warn(m) });
    if (def.body === 'crawler') return makeCrawlerBody(def, { bus: this.host.combat.bus, warn: (m) => this.host.warn(m) });
    if (def.body === 'quadruped') return makeQuadrupedBody(def, { bus: this.host.combat.bus, warn: (m) => this.host.warn(m) });
    if (def.body === 'wyrm') {
      const lowQuality = this.host.services.get('vfx')?.quality === 'low';
      return makeWyrmBody(def, { bus: this.host.combat.bus, warn: (m) => this.host.warn(m), lowQuality });
    }
    const made = this.makeModel(def);
    // Procedural props (the hunters' spear and harpoon) come from ranged/props.ts, the rest from the pack library.
    const procedural: THREE.Object3D[] = [];
    const source = {
      ...made,
      prop: (id: string) => {
        if (!id.startsWith('proc/')) return made.prop?.(id) ?? null;
        const p = makeGroundProp(id);
        if (p) procedural.push(p);
        return p;
      },
    };
    const model = buildEnemyModel(source, def, { bus: this.host.combat.bus });
    const animator = new EnemyAnimator(model.owner, source.clips, { warn: (m) => this.host.warn(m) });
    const body = new HumanoidBody(model, animator);
    if (procedural.length) {
      // The model builder frees only what it cloned; the procedural props own their geometry and materials.
      const dispose = body.dispose.bind(body);
      body.dispose = () => {
        dispose();
        for (const p of procedural) disposeGroundProp(p);
      };
    }
    return body;
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

  /** The player or an ally (the core's mercy-revoke test). */
  private playerTeam(actorId: ActorId | null): boolean {
    return !!actorId && this.host.actors.get(actorId)?.team === 'player';
  }

  private playerSide(actorId: ActorId | null): boolean {
    if (!actorId) return false;
    const team = this.host.actors.get(actorId)?.team;
    return team === 'player' || team === 'ally';
  }

  private completeMercy(initiator: MercySubject): void {
    if (initiator.def.mercy.verb === 'calm') {
      this.completeCalm(initiator);
      return;
    }
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

  /**
   * Calm (design section 2): pays the chosen offering (an item through `inventory.remove`, never a loot grant; or
   * the Warm Hand's Burn), calms the beast and, for a pack leader, every packmate near it.
   */
  private completeCalm(initiator: MercySubject): void {
    const enemy = this.enemies.get(initiator.actorId);
    if (!enemy) return;
    const inventory = this.host.services.get('inventory');
    const option = this.calm.selected(mercyInteractableId(initiator.slug));
    this.calm.finish();
    if (!option || !calmPayable(option, inventory)) return;
    // The item goes first: when it cannot be taken nothing else happens.
    if (option.kind === 'item' && !inventory?.remove(option.itemId, option.count)) return;
    if (option.kind === 'warmHand') this.chargeShard(WARM_HAND_BURN, 'warmHand');
    const covered: MercySubject[] = [initiator];
    if (enemy.spawnerId && this.packLeaderId(enemy.spawnerId) === enemy.id) covered.push(...this.packOf(enemy));
    const events = mercyEvents(covered);
    if (option.kind === 'warmHand') events[0] = { ...events[0], verb: 'warmHand' };
    this.applyMercy(events);
    this.calmFx(enemy.feet, option);
  }

  /** Packmates of a calmed leader: every living one of its group within the pack radius, struck or mid-swing, they all scatter. */
  private packOf(leader: Enemy): MercySubject[] {
    const out: MercySubject[] = [];
    if (!leader.spawnerId) return out;
    for (const e of this.enemies.values()) {
      if (e === leader || e.spawnerId !== leader.spawnerId || !e.active || e.def.mercy?.verb !== 'calm') continue;
      if (e.feet.distanceTo(leader.feet) <= AI.packShareRadius) {
        const s = this.subjects.get(e);
        if (s) out.push(s);
      }
    }
    return out;
  }

  /** Drops the statuses the player put on a beast that is then calmed (actors-and-damage.md section 7). */
  private clearPlayerStatuses(actorId: ActorId): void {
    const status = this.host.services.get('status');
    if (!status) return;
    for (const entry of status.list(actorId)) if (this.playerSide(entry.sourceId)) status.clear(actorId, entry.id);
  }

  private calmFx(at: THREE.Vector3, option: CalmOption): void {
    this.host.services.get('vfx')?.spawnEffect?.(option.kind === 'warmHand' ? 'warm-hand' : 'calm-offering', {
      position: { x: at.x, y: at.y, z: at.z },
    });
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
      else if (ev.verb === 'spare') enemy.spare();
      else {
        this.clearPlayerStatuses(enemy.id);
        enemy.calm();
      }
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
      verb: table.verb,
      burn: table.burn,
      feet: (out) => {
        const a = this.host.actors.get(actorId);
        return a ? a.worldPosition(out) : out.set(0, 0, 0);
      },
    };
    const holdId = bossMercyInteractableId(bossId);
    const removeCalm =
      table.verb === 'calm'
        ? this.calm.register(holdId, () => (bosses.state(bossId)?.releaseOpen && this.mercyUnlocked('calm') ? calmOptions(table, this.host.services.get('inventory')) : []))
        : null;
    const removeHold = this.host.interaction.register(
      makeBossMercyInteractable(subject, {
        unlocked: () => this.mercyUnlocked(table.verb),
        windowOpen: () => bosses.state(bossId)?.releaseOpen === true,
        lockOnTarget: () => this.host.services.get('lockOn')?.targetId ?? null,
        complete: (b) => this.completeBossMercy(b),
        calmLabel: () => this.calmLabel(holdId),
      }),
    );
    this.bossHolds.set(bossId, () => {
      removeHold();
      removeCalm?.();
    });
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
    const calm = table.verb === 'calm';
    const inventory = this.host.services.get('inventory');
    // Calm: settle what is paid before the registry decides; nothing is taken until it says yes.
    let option: CalmOption | null = null;
    if (calm) {
      option = this.calm.selected(bossMercyInteractableId(boss.bossId));
      this.calm.finish();
      if (!option || !calmPayable(option, inventory)) return;
    }
    const at = boss.feet(new THREE.Vector3());
    const pulseId = calm ? undefined : nextPulseId();
    // Release: the pulse also frees every staggered undead within 4 m, under the same pulseId and one charge.
    // Calm: every living member of the boss's summon groups scatters, at any distance (the boss's summons are `ephemeral`, so no slot is spent).
    const around: MercySubject[] = [];
    const p = new THREE.Vector3();
    for (const s of this.subjects.values()) {
      const e = this.enemies.get(s.actorId);
      if (!calm && s.def.mercy.verb === 'release' && s.mercyOpen() && s.feet(p).distanceTo(at) <= MERCY.pulseRadius) around.push(s);
      if (calm && e?.active && !!e.spawnerId && table.summonGroups?.includes(e.spawnerId)) around.push(s);
    }
    // The registry decides: only a true release charges, takes the offering and pays the ledger row.
    if (!bosses.release(boss.bossId)) return;
    this.closeBossHold(boss.bossId);
    // A boss.released listener may have used the loaf in between: the calm is then free, which the warning records.
    if (option?.kind === 'item' && !inventory?.remove(option.itemId, option.count)) {
      this.host.warn(`enemies: ${boss.bossId} calmed but ${option.itemId} could not be taken`);
    }
    if (option?.kind === 'warmHand') this.chargeShard(WARM_HAND_BURN, 'warmHand');
    // A Spare (v0.6) costs no Burn and must not touch the shard at all: `useShard(0)` still scars a player in the cinder zone.
    else if (table.verb === 'release') this.chargeShard(table.burn, 'release');
    const bossEvent: MercyEventLike = {
      verb: option?.kind === 'warmHand' ? 'warmHand' : table.verb,
      tier: 'boss',
      track: table.track,
      creature: boss.bossId,
      actorId: boss.actorId,
      amount: table.amount,
      ledgerId: table.ledgerId,
      ...(pulseId ? { pulseId } : {}),
    };
    this.tally.mercy(bossEvent);
    this.host.events.emit('mercy', bossEvent);
    // The scattered hounds count for the tally and codex only: the boss row pays the favour (track null = codex only).
    const scattered = mercyEvents(around.filter((a) => this.enemies.get(a.actorId)?.active), pulseId);
    this.applyMercy(calm ? scattered.map((ev) => ({ ...ev, track: null })) : scattered);
    if (calm) this.calmFx(at, option!);
    else this.releaseFx(at);
  }

  // ---- shared state used by enemies -----------------------------------------------------------------

  private readonly pathBudget = new PathBudget();
  private readonly env: EnemyEnv;

  private makeEnv(): EnemyEnv {
    return {
    host: this.host,
    attacks: this.attacks,
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
      // The limit is defined by the kinds in play: the largest `attackersPerTarget` among the holders and the
      // requester (default AI.attackersPerTarget), so a hound pack takes 3 and a scene without hounds keeps 2.
      let limit = self.def.attackersPerTarget ?? AI.attackersPerTarget;
      for (const e of set) limit = Math.max(limit, e.def.attackersPerTarget ?? AI.attackersPerTarget);
      if (set.size >= limit) return false;
      // Members of one group do not swing in the same instant: the next waits out a short stagger.
      const gap = self.def.attackStagger ?? (self.def.pairAdvance ? PAIR.attackStaggerSeconds : 0);
      if (gap > 0 && self.spawnerId) {
        for (const e of set) {
          if (e.spawnerId === self.spawnerId && this.clock - (this.tokenAt.get(e) ?? -Infinity) < gap) return false;
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
    taunt: (self: Enemy) => {
      if (this.tauntRegistry.size === 0) return null;
      const opt = self.def.tauntable;
      if (opt === false || (opt !== true && this.isBoss(self.id))) return null;
      if (self.spawnerId && this.spawners.defOf(self.spawnerId)?.untauntable) return null;
      return this.tauntRegistry.pick(self.feet, self.tauntTarget);
    },
    perceptionModifiers: (self: Enemy, targetId: ActorId) => this.perceptionHub.combined(targetId, () => self.pose()),
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
    packNearby: (self: Enemy) => {
      if (!self.spawnerId) return 0;
      let n = 0;
      for (const e of this.enemies.values()) {
        if (e === self || e.spawnerId !== self.spawnerId || !e.active) continue;
        if (e.feet.distanceTo(self.feet) <= HOUND.packRadius) n++;
      }
      return n;
    },
    packLeaderId: (spawnerId: string) => this.packLeaderId(spawnerId),
    alertPack: (self: Enemy, targetId: ActorId) => {
      if (!self.spawnerId) return;
      for (const e of this.enemies.values()) {
        if (e === self || e.spawnerId !== self.spawnerId) continue;
        if (e.feet.distanceTo(self.feet) <= AI.packShareRadius) e.alert(targetId);
      }
    },
    mercyUnlocked: (verb: UnlockVerb) => this.mercyUnlocked(verb),
    nav: () => this.host.services.get('nav'),
    pathBudget: this.pathBudget,
    gone: (self: Enemy, how: MemberEnd) => {
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
      watcher?.(how === 'escaped' || how === 'calmed' || how === 'retired' ? 'despawned' : how);
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
      // The core revokes a mercy on this same test (core.plugin.ts); Calm closes on it too, status ticks included.
      // v0.6: the player only; an ally's hit never closes Calm (actors-and-damage.md section 11).
      if (target && r.outcome === 'hit' && r.kind !== 'script' && this.playerTeam(r.attackerId)) target.markStruck(r.kind === 'status' ? undefined : r.attackerId); // a status tick closes Calm but never provokes a taunted enemy
      // A status tick (bleed, ignite) never flinches, alerts or provokes (actors-and-damage.md section 10).
      if (r.kind === 'status') return;
      if (target) target.damaged(r.attackerId, r.outcome, r.poiseDealt, r.staggered, r.killed, r.kind);
      const attacker = r.attackerId ? this.enemies.get(r.attackerId) : undefined;
      if (attacker && r.outcome === 'hit' && r.kind === 'melee') this.igniteOnBite(attacker, r.targetId);
      if (attacker && r.outcome === 'hit' && r.targetId === this.host.actors.player.id) {
        const move = attacker.brain.currentMove;
        if (move?.onHit === 'slow' && attacker.active) attacker.applySlow(ASH_GRAB.speedScale, ASH_GRAB.seconds);
        if (move?.onHit === 'steal' && attacker.active) attacker.thief?.grabHit();
      }
    });
    on('player.dodged', (p) => {
      if (p.attackerId) this.enemies.get(p.attackerId)?.playerDodged();
    });
    on('actor.staggered', (p) => this.enemies.get(p.actorId)?.staggered(p.byId));
    on('actor.pulled', (p) => {
      const enemy = this.enemies.get(p.actorId);
      const from = enemy ? this.host.actors.get(p.fromId) : undefined;
      if (enemy && from) enemy.pulledToward(from.worldPosition(PULL_TMP), p.distance);
    });
    on('actor.died', (p) => {
      this.attacks.shooterGone(p.actorId);
      const dying = this.enemies.get(p.actorId);
      if (dying) this.tally.killed(dying.def.kind);
      dying?.died();
      for (const e of this.enemies.values()) if (e.id !== p.actorId) e.targetGone(p.actorId);
    });
    on('actor.despawned', (p) => {
      this.attacks.shooterGone(p.actorId);
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
    on('quest.completed', (p) => {
      for (const id of this.spawners.endedWith(p.questId)) this.spawners.despawnGroup(id);
    });
    on('flag.changed', (p) => {
      if (p.value !== true) return;
      // A flag-gated group spawns when its flag turns true while its quest is active.
      const active = this.host.services.get('quests')?.active() ?? [];
      for (const questId of this.spawners.questsGatedBy(p.key)) {
        if (active.includes(questId)) this.spawners.onQuestStarted(questId, (f) => f === p.key || this.host.state.getBool(f, false));
      }
    });
    on('save.loaded', () => {
      this.attacks.clear();
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
        } else if (e.thief && e.thief.stolenGold > 0) {
          // The loaded inventory is the truth about gold: a thief carrying a pouch the save never saw would pay it out
          // again when killed. It vanishes without counting as an escape and its slot is refilled.
          if (e.spawnerId) refill.add(e.spawnerId);
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
      // A group that goes away with its quest does not survive a load where the quest is no longer active (completed since).
      for (const e of [...this.enemies.values()]) {
        const q = e.spawnerId ? this.spawners.endsWithQuest(e.spawnerId) : undefined;
        if (q !== undefined && !active.includes(q)) e.despawn();
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
      // A def's `poiseBreakBones` (the Ember Wyrm's wings): a player-team or ally hit there breaks poise at once.
      this.host.damage.addModifier(
        'enemies.poiseBreakBones',
        (req, target, attacker) => {
          if (req.outcome !== 'hit' || req.kind === 'status' || req.kind === 'script' || !req.bone || !attacker) return;
          if (attacker.team !== 'player' && attacker.team !== 'ally') return;
          const bones = this.enemies.get(target.id)?.def.poiseBreakBones;
          if (bones && bones.includes(req.bone)) req.poise = Math.max(req.poise ?? 0, target.poise);
        },
        POISE_BREAK_BONES_ORDER,
      ),
      // The Cinder Golem: only its back core breaks poise (an instant break); everything else deals health damage only.
      this.host.damage.addModifier(
        'enemies.core',
        (req, target) => {
          if (req.outcome !== 'hit' || (req.kind !== 'melee' && req.kind !== 'spell')) return;
          const enemy = this.enemies.get(target.id);
          if (!enemy || enemy.def.behaviour !== 'back-core') return;
          if (isCoreHit(req.bone, req.direction, enemy.facing)) {
            req.poise = Math.max(req.poise, target.maxPoise);
            enemy.markCoreHit();
          } else {
            req.poise = 0;
          }
        },
        GOLEM_CORE_ORDER,
      ),
      this.host.damage.addModifier(
        'enemies.moves',
        (req, _target, attacker) => {
          if (!attacker || req.kind !== 'melee') return;
          const enemy = this.enemies.get(attacker.id);
          const move = enemy?.brain.currentMove;
          if (!enemy || !move) return;
          // A ranged or area hit carries its own amounts (the move may have changed in flight).
          if (req.attackId?.startsWith(RANGED_ATTACK_PREFIX)) return;
          // A ranged or area move hurts through its bolt or circle only: the fist or spear sweeping the same window deals nothing.
          if (move.ranged || move.area) {
            req.outcome = 'immune';
            return;
          }
          req.amount = move.damage * enemy.damageScale * boneMultiplier(req.bone);
          req.poise = move.poise;
          req.attackId = move.clip;
          if (move.element) req.element = move.element;
          if (move.telegraph === 'dodge') req.unblockable = true;
        },
        -150,
      ),
    );
  }

  /** The burning bite: `status.apply(target, ignite)` through the status service; a no-op while it is absent. */
  private igniteOnBite(attacker: Enemy, targetId: ActorId): void {
    const status = this.host.services.get('status');
    if (!status) return;
    const burn = attacker.burningBite();
    if (!burn) return;
    status.apply(targetId, { id: burn.id, kind: 'ignite', dps: burn.dps, seconds: burn.seconds, sourceId: attacker.id });
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
      else if (!this.groundReady(e)) e.sleep();
      else if (d < WORLD_AI.dormantDistance - WORLD_AI.wakeMargin && i < WORLD_AI.maxAwake - WORLD_AI.wakeRankMargin) e.wake();
    });
  }

  /**
   * False while the terrain collider patch under an enemy standing on the terrain is not built yet (a teleport or a
   * death respawn near a dormant group: only the patch under the player is built at once, the rest stream in over
   * later ticks). Waking there put the kinematic body on nothing, it fell, went dormant 100 m down and never woke
   * (polish B1). Interior enemies, far above the terrain, do not wait. One map lookup per enemy in range.
   */
  private groundReady(e: Enemy): boolean {
    const resident = this.host.groundResident;
    if (!resident) return true;
    const f = e.feet;
    if (resident(f.x, f.z)) return true;
    const ground = this.host.heightAt(f.x, f.z);
    return Number.isFinite(ground) && f.y > ground + WORLD_AI.terrainFreeAbove;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    this.spawners.dispose();
    this.attacks.dispose();
    this.foes.dispose();
    for (const id of [...this.bossHolds.keys()]) this.closeBossHold(id);
    this.calm.dispose();
    for (const id of [...this.glyphs.keys()]) this.stopGlyph(id);
    for (const e of [...this.enemies.values()]) e.despawn();
    this.enemies.clear();
  }
}
