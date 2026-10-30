// One companion wired into the game: joined state from its flag, the actor and figure, follow and teleport-behind,
// Battle-song, banter, the talk interactable and saved position (plans/slice-2-tobb.md, section 13 overrides);
// Phase B adds quest-derived waits and horseback following (plans/slice-2-tobb-phase-b.md and its review).
// Act 2 (A5, plans/act2-A5.md): the party wait, own vitals and the downed rule, Hrolf's light fighting and Stonehide.
import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { GameContext } from '../core/Game';
import type { GateCause } from '../state/FlagGates';
import { heightAt } from '../terrain/heightfield';
import type { NpcModelLoader } from '../npcs/types';
import '../hud/events';
import { AuraWindow } from './AuraWindow';
import { BanterDirector, type Bark } from './BanterDirector';
import { CombatPresence } from './CombatPresence';
import { CompanionFigure } from './CompanionFigure';
import { ENEMY_DEFS } from '../enemies/defs';
import { HrolfBrain, type BrainView, type Foe } from './HrolfBrain';
import { CompanionVitals, type VitalsEdge } from './vitals';
import './events';
import { FollowModel, behind, yawToward, type Vec3 } from './FollowModel';
import { RayBudget, findSpot, groundAt, type GroundPorts } from './ground';
import { COMPANION_TUNING, HROLF_TUNING, TOBB_TUNING } from './tuning';
import type { AttackSpeedHook, CompanionDef, InteriorsLike, NavLike } from './types';
import { deriveWait, inView, sameWait, type ViewPorts, type Wait, type WaitRule, type WaitView } from './WaitDirector';

export interface SavedSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ControllerOptions {
  rng?: () => number;
  warn?: (message: string) => void;
  /** The party seat (A5): false sends a joined companion to his Tilted Anvil post. Absent reads as always active. */
  isActive?: () => boolean;
  /** True while a non-lethal trial runs (Hrolf never fights then). */
  trialRunning?: () => boolean;
  /** The shared bark gate (A5): false holds this bark because another companion just spoke. Absent always allows. */
  claimBark?: (id: string) => boolean;
}

/** The camp post an inactive companion waits at (the Tilted Anvil, A5). */
export const partyPost = (id: string): string => `npc-post.${id}.tilted-anvil`;

/** Untyped lookups for services whose types live in threads that may not be merged yet. */
function anyService<T>(ctx: GameContext, name: string): T | undefined {
  return (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;
}

/** A saved spot whose height is further than this from the player's (or from its ground) is not trusted. */
const MAX_SAVED_HEIGHT_GAP = 10;
/** Indoors, `nav.path` is asked again after this long or when the goal moved this far. */
const REPATH_SECONDS = 0.5;
const REPATH_MOVE = 1;
const WAYPOINT_REACHED = 0.6;

/** A door event this soon after a wait ended with a walk back is the same door's fade-in finishing. */
const WALK_BACK_DOOR_WINDOW = 2;

const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export class CompanionController {
  private actor: Actor | null = null;
  private figure: CompanionFigure | null = null;
  private model: FollowModel | null = null;
  private unregisterTalk: (() => void) | null = null;
  private hidden = false;
  private teleportPending = false;
  private readonly spotCursor = { next: 0 };
  private lastTrailPoint: Vec3 | null = null;
  private talking = false;
  private readonly aura: AuraWindow;
  private auraUndo: (() => void) | null = null;
  private readonly director: BanterDirector;
  private readonly presence = new CombatPresence();
  private readonly budget = new RayBudget();
  private readonly prev = { x: 0, y: 0, z: 0 };
  private saved: SavedSpot | null = null;
  /** Seconds since the last load or respawn (an `interior.entered` inside the window is a re-emit). */
  private sinceReset = Infinity;
  private playerDead = false;
  private readonly warned = new Set<string>();
  private path: { goal: Vec3; points: Vec3[] } | null = null;
  private pathAge = 0;
  private readonly offs: (() => void)[] = [];
  private readonly warn: (m: string) => void;
  private disposed = false;
  private readonly isActive: () => boolean;
  private readonly claimBark: (id: string) => boolean;
  private readonly trialRunning: () => boolean;
  private readonly rules: readonly WaitRule[];
  /** A5's own health pool; null for Tobb (no damage reaches him). */
  readonly vitals: CompanionVitals | null;
  private readonly brain: HrolfBrain | null;
  /** Foes Cael has landed a hit on (a beast needs one before Hrolf joins in). */
  private readonly struck = new Set<string>();
  private stonehideOn = false;
  private flameOn = false;
  /** Seconds since Calming flame last healed (it heals every `everySeconds` while it burns). */
  private flameClock = 0;
  /** A vitals edge raised inside a damage modifier, emitted on the next tick. */
  private pendingEdge: VitalsEdge = null;
  /** The post he stands at instead of following, or null. Derived each tick from quest and interior state. */
  private wait: Wait | null = null;
  private waitYaw = 0;
  /** Seconds a different wait has been wanted but not applied (relocation waits until he is out of view). */
  private handoffAge = 0;
  private mounted = false;
  /** Hidden on horseback after falling too far back; reappears behind the player on dismount. */
  private mountHidden = false;
  /** Hidden while the player glides, rides the ferry or dives (v0.7 item 25); reappears behind the player at the end. */
  private modeHidden = false;
  /** Seconds left in which a door event does not teleport him, after a wait ended with a walk back. */
  private walkBackWindow = 0;

  constructor(
    private readonly ctx: GameContext,
    readonly def: CompanionDef,
    opts: ControllerOptions = {},
  ) {
    this.warn = opts.warn ?? ((m) => console.warn(m));
    this.isActive = opts.isActive ?? (() => true);
    this.trialRunning = opts.trialRunning ?? (() => false);
    this.claimBark = opts.claimBark ?? (() => true);
    this.rules = [{ reason: 'party', anchorId: partyPost(def.id), inactive: true }, ...def.waits];
    this.vitals = def.vitals ? new CompanionVitals(def.vitals.maxHealth, def.downed.kneelSeconds) : null;
    this.brain = def.combat ? new HrolfBrain({ ...HROLF_TUNING, ...def.combat }) : null;
    this.aura = new AuraWindow(def.aura?.seconds ?? 1);
    this.director = new BanterDirector(def.banter, opts.rng ?? Math.random);
    this.listen();
    this.offs.push(ctx.gates.flag(def.joinFlag, (open, cause) => (open ? this.onJoined(cause) : this.onLeft(cause))));
  }

  // ---- state -------------------------------------------------------------------------------------------------

  get joined(): boolean {
    return this.actor !== null;
  }

  get isHidden(): boolean {
    return this.hidden;
  }

  get actorId(): string | null {
    return this.actor?.id ?? null;
  }

  get position(): Vec3 | null {
    return this.model ? { ...this.model.pos } : null;
  }

  get yaw(): number {
    return this.model?.yaw ?? 0;
  }

  /** The current wait, or null while following. */
  get waiting(): Wait | null {
    return this.wait ? { ...this.wait } : null;
  }

  get auraActive(): boolean {
    return this.auraUndo !== null;
  }

  get downed(): boolean {
    return this.vitals?.downed ?? false;
  }

  get stonehideActive(): boolean {
    return this.stonehideOn;
  }

  get calmingFlameActive(): boolean {
    return this.flameOn;
  }

  /** Hrolf's current target, for tests and the debug overlay. */
  get combatTarget(): string | null {
    return this.brain?.currentTarget ?? null;
  }

  rank(): number {
    if (!this.ctx.state.getBool(this.def.joinFlag)) return 0;
    return Math.max(1, Math.floor(this.ctx.state.getNumber(this.def.rankFlag, 1)));
  }

  /** The persisted spot, or null when not spawned. */
  serialize(): SavedSpot | null {
    const m = this.model;
    if (!this.actor || !m) return null;
    return { x: m.pos.x, y: m.pos.y, z: m.pos.z, yaw: m.yaw };
  }

  /** Called from the persistable's `load`, before `save.loaded`; applied on `save.loaded`. */
  stashSaved(spot: SavedSpot | null): void {
    this.saved = spot;
  }

  // ---- join and leave ----------------------------------------------------------------------------------------

  private onJoined(cause: GateCause): void {
    if (this.disposed) return;
    const firstRank = this.ctx.state.getNumber(this.def.rankFlag, 0) < 1;
    if (firstRank) this.ctx.state.setFlag(this.def.rankFlag, 1);
    if (this.actor) return;
    const start = cause === 'flag' ? this.handoverSpot() : null;
    const actor = this.spawn(start);
    if (cause === 'flag') {
      this.ctx.events.emit('companion.joined', { companionId: this.def.id, actorId: actor.id });
      if (firstRank) this.ctx.events.emit('companion.bond', { companionId: this.def.id, rank: 1 });
    }
  }

  private onLeft(cause: GateCause): void {
    if (!this.actor) return;
    const actorId = this.actor.id;
    this.despawn();
    if (cause === 'flag') this.ctx.events.emit('companion.left', { companionId: this.def.id, actorId });
  }

  /** The NPC's last position, then its post, else null (placed behind the player). */
  private handoverSpot(): Vec3 | null {
    const npcs = this.ctx.services.get('npcs');
    const p = npcs?.position(this.def.npcId);
    if (p && [p.x, p.y, p.z].every(Number.isFinite)) return p;
    const a = this.ctx.anchors.find(this.def.npcPost);
    return a ? { ...a.position } : null;
  }

  private spawn(start: Vec3 | null): Actor {
    const figure = new CompanionFigure(this.def.look);
    const feet = this.ctx.player.feet;
    const at = start ?? { x: feet.x, y: feet.y, z: feet.z };
    figure.root.position.set(at.x, at.y, at.z);
    this.ctx.scene.add(figure.root);
    let actor: Actor | null = null;
    try {
      actor = this.ctx.actors.spawn({
        kind: `companion:${this.def.id}`,
        team: 'ally',
        maxHealth: this.vitals?.maxHealth ?? 1,
        immortal: true,
        hittable: false,
        untargetable: true,
        root: figure.root,
      });
      this.vitals?.restore();
      this.unregisterTalk = this.ctx.interaction.register({
        id: `companion:${this.def.id}`,
        kind: 'talk',
        name: this.ctx.strings.t(this.def.nameKey),
        // He settles about 3.2 m away, so the reach is longer; Cael must face him (the default cone).
        radius: 3.6,
        // Always at Cael's side: a quest prop or note that an objective needs wins F at a similar distance (playtest bug 2).
        ambient: true,
        position: (out) => {
          const m = this.model;
          return m ? out.set(m.pos.x, m.pos.y, m.pos.z) : out;
        },
        enabled: () => this.actor !== null && !this.hidden && !this.presence.fighting,
        onInteract: () => this.talk(),
      });
    } catch (err) {
      if (actor) this.ctx.actors.despawn(actor.id);
      figure.dispose();
      throw err;
    }
    this.actor = actor;
    this.figure = figure;
    this.model = new FollowModel(at, this.ctx.player.facingYaw);
    this.prev.x = at.x;
    this.prev.y = at.y;
    this.prev.z = at.z;
    this.hidden = false;
    // Without a handover spot (a load, or no NPC) he is placed behind the player before he is seen.
    if (!start) {
      this.requestTeleport();
      this.hidden = true;
      figure.root.visible = false;
    }
    this.director.setActive(!this.hidden);
    void figure.load(this.loader(), this.warn);
    return actor!;
  }

  private despawn(): void {
    this.endAura();
    this.director.setActive(false);
    this.unregisterTalk?.();
    this.unregisterTalk = null;
    if (this.actor) this.ctx.actors.despawn(this.actor.id);
    this.actor = null;
    this.figure?.dispose();
    this.figure = null;
    this.model = null;
    this.talking = false;
    this.teleportPending = false;
    this.hidden = false;
    this.wait = null;
    this.handoffAge = 0;
    this.mountHidden = false;
    this.modeHidden = false;
    this.brain?.reset();
    this.setStonehide(false);
    this.setFlame(false);
    this.vitals?.restore();
    this.pendingEdge = null;
  }

  private loader(): NpcModelLoader | null {
    const a = this.ctx.assets as unknown as Partial<NpcModelLoader> | null;
    return a && typeof a.load === 'function' && typeof a.instantiate === 'function' && typeof a.animations === 'function'
      ? (a as NpcModelLoader)
      : null;
  }

  private talk(): void {
    const d = this.ctx.services.get('dialogue');
    if (!d) {
      this.warnOnce('dialogue', 'companions: no "dialogue" service; talking to the companion does nothing yet');
      return;
    }
    try {
      d.start(this.def.dialogueId, this.def.npcId);
    } catch (err) {
      this.warn(`companions: dialogue.start("${this.def.dialogueId}") threw: ${String(err)}`);
    }
  }

  // ---- events ------------------------------------------------------------------------------------------------

  private listen(): void {
    const ev = this.ctx.events;
    const playerId = () => this.ctx.player.actor.id;
    this.offs.push(
      ev.on('player.blocked', () => this.onBlock()),
      ev.on('player.parried', () => this.onBlock()),
      ev.on('player.died', () => {
        this.playerDead = true;
        this.endAura();
        this.presence.reset();
        this.director.suppress('death', true);
      }),
      ev.on('player.respawned', () => {
        this.playerDead = false;
        this.standUp();
        this.director.suppress('death', false);
        this.sinceReset = 0;
        this.requestTeleport();
      }),
      ev.on('fastTravel', () => this.requestTeleport()),
      ev.on('interior.entered', ({ interiorId }) => {
        this.onDoor();
        const place = this.def.places.interiors[interiorId];
        if (place && this.sinceReset > TOBB_TUNING.reEmitWindowSeconds) this.emitBark(this.area(place));
      }),
      ev.on('interior.exited', () => this.onDoor()),
      ev.on('mount.mounted', () => {
        this.mounted = true;
      }),
      ev.on('mount.dismounted', () => {
        this.mounted = false;
        if (!this.mountHidden) return;
        this.mountHidden = false;
        // The trail from before the hide is far behind by now.
        this.model?.trail.clear();
        this.lastTrailPoint = null;
        this.requestTeleport();
      }),
      ev.on('save.loaded', () => this.onLoaded()),
      ev.on('dialogue.started', ({ npcId }) => {
        this.director.suppress('dialogue', true);
        if (npcId === this.def.npcId) this.talking = true;
      }),
      ev.on('dialogue.ended', () => {
        this.director.suppress('dialogue', false);
        this.talking = false;
      }),
      ev.on('cutscene.started', () => this.director.suppress('cutscene', true)),
      ev.on('cutscene.ended', () => this.director.suppress('cutscene', false)),
      ev.on('ui.modal', ({ id, open }) => this.director.suppress(`modal:${id}`, open)),
      ev.on('boss.started', ({ bossId }) => this.director.bossStarted(bossId)),
      ev.on('boss.defeated', ({ bossId }) => this.director.bossEnded(bossId)),
      ev.on('boss.released', ({ bossId }) => this.director.bossEnded(bossId)),
      ev.on('boss.ended', ({ bossId }) => this.director.bossEnded(bossId)),
      ev.on('ai.aggro', ({ actorId, targetId }) => {
        if (targetId !== playerId() || this.playerDead) return;
        if (this.presence.aggro(actorId) === 'start') this.emitBark(this.director.combat('start'));
      }),
      ev.on('ai.calm', ({ actorId }) => this.presence.remove(actorId)),
      ev.on('actor.died', ({ actorId }) => {
        this.presence.remove(actorId);
        this.struck.delete(actorId);
      }),
      ev.on('actor.despawned', ({ actorId }) => {
        this.presence.remove(actorId);
        this.struck.delete(actorId);
      }),
      ev.on('damage.dealt', (r) => {
        if (!this.brain || r.outcome !== 'hit' || r.kind === 'script' || r.attackerId !== playerId()) return;
        this.struck.add(r.targetId);
      }),
      // Resting restores health (design 8.2): a waystone or inn rest refills him and ends a kneel.
      ev.on('rest', () => this.standUp()),
      ev.on('trigger.enter', ({ triggerId, actorId }) => {
        const place = this.def.places.triggers[triggerId];
        if (place && actorId === playerId()) this.emitBark(this.area(place));
      }),
      ev.on('region.entered', ({ regionId }) => {
        // The tracker reports `previous: null` on every entry, so a load or respawn is told apart by time instead.
        const place = this.def.places.regions[regionId];
        if (place && this.sinceReset > TOBB_TUNING.reEmitWindowSeconds) this.emitBark(this.area(place));
      }),
    );
  }

  private onLoaded(): void {
    this.endAura();
    this.struck.clear();
    this.brain?.reset();
    this.standUp();
    this.director.saveLoaded();
    this.presence.reset();
    this.playerDead = this.ctx.player.actor.dead;
    this.talking = false;
    this.sinceReset = 0;
    // A mounted player always loads dismounted (contract v0.5), so the load clears it.
    this.mounted = false;
    this.mountHidden = false;
    // Core sets the walk mode on the load too (either order): the loader has put the player on the ground.
    this.modeHidden = false;
    this.walkBackWindow = 0;
    const saved = this.saved;
    this.saved = null;
    if (!this.model) return;
    // A load is black: a wait that holds is applied at once and the saved spot is ignored.
    this.handoffAge = 0;
    const want = deriveWait(this.rules, this.waitView());
    if (want) {
      this.enterWait(want);
      return;
    }
    if (this.wait) {
      this.wait = null;
      this.director.setActive(!this.hidden);
    }
    const feet = this.ctx.player.feet;
    const near =
      saved &&
      Math.hypot(saved.x - feet.x, saved.y - feet.y, saved.z - feet.z) <= COMPANION_TUNING.teleportDistance &&
      Math.abs(saved.y - feet.y) <= MAX_SAVED_HEIGHT_GAP;
    if (saved && near) {
      const y = groundAt(this.ports(), saved.x, saved.z, saved.y);
      if (y !== null && Math.abs(y - saved.y) <= MAX_SAVED_HEIGHT_GAP) {
        this.place({ x: saved.x, y, z: saved.z }, saved.yaw);
        return;
      }
    }
    this.requestTeleport();
  }

  /**
   * Door events arrive after the fade-in. A wait that ended at black (within the last 2 s) may already have him
   * walking back in Cael's space; a teleport then would pop in view, so it is skipped.
   */
  private onDoor(): void {
    if (this.walkBackWindow > 0 && !this.wait && !this.hidden && this.canWalkBack(this.ctx.player.feet)) return;
    this.requestTeleport();
  }

  /** No-op while waiting: doors, fast travel and respawns never pull a waiting companion to the player. */
  private requestTeleport(): void {
    if (!this.model || this.wait || this.modeHidden) return;
    this.teleportPending = true;
    this.spotCursor.next = 0;
    this.lastTrailPoint = this.model.trail.newest() ?? this.lastTrailPoint;
  }

  // ---- aura --------------------------------------------------------------------------------------------------

  private onBlock(): void {
    // Battle-song is Tobb's: a def without `aura` gives nothing on a block.
    if (!this.def.aura || !this.actor || this.hidden || this.wait || this.playerDead || !this.isActive()) return;
    const verbs = this.ctx.services.get('combatVerbs') as unknown as Partial<AttackSpeedHook> | undefined;
    if (typeof verbs?.addAttackSpeedMultiplier !== 'function') {
      this.warnOnce('hook', 'companions: combatVerbs.addAttackSpeedMultiplier is missing; Battle-song does nothing');
      return;
    }
    const a = this.def.aura;
    if (this.aura.trigger() === 'started' || !this.auraUndo) {
      try {
        this.auraUndo?.();
        this.auraUndo = verbs.addAttackSpeedMultiplier(a.buffId, a.attackSpeed);
      } catch (err) {
        this.aura.cancel();
        this.auraUndo = null;
        this.warn(`companions: addAttackSpeedMultiplier threw: ${String(err)}`);
        return;
      }
      this.ctx.events.emit('companion.aura', { companionId: this.def.id, auraId: a.id, active: true });
    }
    this.ctx.events.emit('buff.applied', { id: a.buffId, nameKey: a.nameKey, seconds: a.seconds });
  }

  private endAura(): void {
    this.aura.cancel();
    const undo = this.auraUndo;
    if (!undo || !this.def.aura) return;
    this.auraUndo = null;
    try {
      undo();
    } catch (err) {
      this.warn(`companions: attack-speed undo threw: ${String(err)}`);
    }
    this.ctx.events.emit('buff.removed', { id: this.def.aura.buffId });
    this.ctx.events.emit('companion.aura', { companionId: this.def.id, auraId: this.def.aura.id, active: false });
  }

  // ---- banter ------------------------------------------------------------------------------------------------

  /** The area bark for `place`, through the def's story variant (Hrolf's R11 lines). */
  private area(place: string): Bark | null {
    const v = this.def.areaVariant ? this.def.areaVariant(place, (k) => this.ctx.state.getFlag(k)) : place;
    return v ? this.director.area(v) : null;
  }

  /** Act 3 (K5): an event bark (the trial, the reveal, a ferry stop) through the area path, so pacing and gates hold. */
  sayAt(place: string): void {
    this.emitBark(this.area(place));
  }

  /**
   * Act 3 (K5, v0.7 item 25): hidden while the movement mode hides companions; on the way back he is placed behind the
   * player (landing, stop or surfacing point). Idempotent both ways; a companion waiting at a post stays there.
   */
  hideForMode(on: boolean): void {
    if (on) {
      // Re-applied every tick: a companion spawned or joined during the mode is hidden too.
      if (!this.modeHidden) this.teleportPending = false;
      this.modeHidden = true;
      if (!this.wait && !this.hidden) this.setHidden(true);
      return;
    }
    if (!this.modeHidden) return;
    this.modeHidden = false;
    if (!this.model || this.wait) return;
    // The trail from before the mode is far behind by now.
    this.model.trail.clear();
    this.lastTrailPoint = null;
    this.requestTeleport();
  }

  get isModeHidden(): boolean {
    return this.modeHidden;
  }

  private emitBark(b: Bark | null): void {
    // An inactive companion in the hand-off window (still walking to his post) stays quiet.
    if (!b || !this.actor || this.hidden || this.wait || !this.isActive() || !this.claimBark(this.def.id)) return;
    this.ctx.events.emit('companion.banter', { companionId: this.def.id, lineKey: b.lineKey, trigger: b.trigger });
    const t = this.ctx.strings;
    this.ctx.events.emit('hud.toast', { textKey: 'companion.say', params: { name: t.t(this.def.nameKey), line: t.t(b.lineKey) } });
  }

  // ---- ticks -------------------------------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    this.sinceReset += dt;
    this.walkBackWindow = Math.max(0, this.walkBackWindow - dt);
    // Fights are tracked before he joins too, so a fight already running at the join is not announced as new.
    const edge = this.presence.tick(dt);
    const m = this.model;
    if (!m || !this.actor) return;
    this.budget.reset();
    this.prev.x = m.pos.x;
    this.prev.y = m.pos.y;
    this.prev.z = m.pos.z;
    const p = this.ctx.player;
    const player = { x: p.feet.x, y: p.feet.y, z: p.feet.z };
    const ports = this.ports();

    this.updateWait(dt, player, p.facingYaw);
    this.tickVitals(dt);
    if (this.wait) {
      // At his post: no follow and no teleport; he faces Cael while they talk.
      m.gait = 'idle';
      m.speed = 0;
      m.yaw = this.talking ? yawToward(player.x - m.pos.x, player.z - m.pos.z) : this.waitYaw;
    } else if (!this.mountHidden && this.mounted && dist3(m.pos, player) > COMPANION_TUNING.mountHideDistance) {
      // On horseback he jogs along; once too far back he is hidden quietly until the dismount (no teleport loop).
      this.mountHidden = true;
      this.teleportPending = false;
      this.setHidden(true);
    }
    const step = this.brainStep(dt, player);
    if (!this.wait && !this.mountHidden && !this.modeHidden) this.follow(dt, player, p.facingYaw, ports, step?.goal ?? null, step?.face ?? null);
    if (step?.swing) this.figure?.playAttack(HROLF_TUNING.swingSeconds);
    if (step?.hit) this.strike(step.hit);
    this.updateStonehide(player);
    this.tickFlame(dt);

    if (this.aura.tick(dt)) this.endAura();
    if (edge === 'end') this.emitBark(this.director.combat('end'));
    this.emitBark(this.director.tick(dt));

    this.figure?.setGait(this.hidden ? 'idle' : m.gait);
    this.figure?.update(dt);
    this.applyPose(1);
  }

  private follow(
    dt: number,
    player: Vec3,
    playerYaw: number,
    ports: GroundPorts,
    goal: { x: number; z: number } | null = null,
    face: { x: number; z: number } | null = null,
  ): void {
    const m = this.model!;
    // Kneeling: he stays where he fell; a fast travel or door still places him behind Cael.
    if (this.downed && !this.teleportPending) {
      m.gait = 'idle';
      m.speed = 0;
      return;
    }
    if (!this.teleportPending) {
      const newest = m.trail.newest();
      if (newest) this.lastTrailPoint = newest;
      const step = m.step({
        dt,
        player,
        playerYaw,
        groundAt: (x, z, y) => groundAt(ports, x, z, y),
        hold: this.talking,
        goal,
        face,
        steer: (from, to) => this.steer(from, to, dt),
      });
      if (step.teleport) {
        this.teleportPending = true;
        this.spotCursor.next = 0;
        // After a jump the old trail is somewhere else entirely.
        if (step.teleport === 'jump') this.lastTrailPoint = null;
      }
    }
    if (this.teleportPending) this.resolveTeleport(player, playerYaw, ports);
  }

  // ---- waits -------------------------------------------------------------------------------------------------

  private waitView(): WaitView {
    const q = this.ctx.services.get('quests');
    return {
      // Unregistered quests (thread 6's Harrowmark quests before they merge) read as no wait, without a warning.
      questState: (id) => (q && q.get(id) ? q.state(id) : undefined),
      objectiveDone: (id, o) => !!q && !!q.get(id) && q.objectiveDone(id, o),
      interior: this.interiors()?.current ?? null,
      inactive: this.actor !== null && !this.isActive(),
      anchorExists: (id) => {
        if (this.ctx.anchors.find(id)) return true;
        this.warnOnce(`anchor:${id}`, `companions: wait post "${id}" is not defined; ${this.def.id} keeps following`);
        return false;
      },
    };
  }

  private viewPorts(player: Vec3, playerYaw: number): ViewPorts {
    const i = this.interiors();
    const cam = this.ctx.camera;
    return {
      player,
      playerYaw,
      current: i?.current ?? null,
      interiorAt: i && typeof i.interiorAt === 'function' ? (p) => i.interiorAt!(p) : undefined,
      inFrustum: cam
        ? (p) => {
            cam.updateMatrixWorld();
            this.frustum.setFromProjectionMatrix(
              this.projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
            );
            return this.frustum.containsPoint(this.probe.set(p.x, p.y, p.z));
          }
        : undefined,
    };
  }

  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly probe = new THREE.Vector3();

  /**
   * Polled every tick (quest objectives and `interiors.current`, which is set at black before `interior.entered`).
   * A change is applied when nobody sees the pop: at a door's black, with him and his destination out of view, when
   * he can walk back, or after `handoffMaxSeconds` regardless.
   */
  private updateWait(dt: number, player: Vec3, playerYaw: number): void {
    const want = deriveWait(this.rules, this.waitView());
    if (sameWait(want, this.wait)) {
      this.handoffAge = 0;
      return;
    }
    this.handoffAge += dt;
    if (!this.canRelocate(want, player, playerYaw)) return;
    this.handoffAge = 0;
    if (want) this.enterWait(want);
    else this.leaveWait(player);
  }

  private canRelocate(want: Wait | null, player: Vec3, playerYaw: number): boolean {
    if (this.handoffAge >= COMPANION_TUNING.handoffMaxSeconds) return true;
    if (this.interiors()?.transitioning) return true;
    const m = this.model!;
    const v = this.viewPorts(player, playerYaw);
    const fromUnseen = this.hidden || !inView(v, m.pos);
    if (!want) return this.canWalkBack(player) || fromUnseen;
    const a = this.ctx.anchors.find(want.anchorId);
    return fromUnseen && (!a || !inView(v, a.position));
  }

  /** Same space (both outdoors, or the same interior) and within the teleport distance. */
  private canWalkBack(player: Vec3): boolean {
    const m = this.model!;
    const i = this.interiors();
    if (i && typeof i.interiorAt === 'function' && i.interiorAt(m.pos) !== i.interiorAt(player)) return false;
    return dist3(m.pos, player) <= COMPANION_TUNING.teleportDistance;
  }

  private enterWait(w: Wait): void {
    const m = this.model;
    const a = this.ctx.anchors.find(w.anchorId);
    if (!m || !a) return;
    this.wait = { ...w };
    this.waitYaw = a.yaw;
    this.teleportPending = false;
    this.mountHidden = false;
    this.path = null;
    this.endAura();
    this.brain?.reset();
    this.setStonehide(false);
    this.setFlame(false);
    this.standUp();
    m.place(a.position, a.yaw);
    this.prev.x = m.pos.x;
    this.prev.y = m.pos.y;
    this.prev.z = m.pos.z;
    // Visible at his post (3a's hider still hides him while the player is in another space); silent while waiting.
    this.setHidden(false);
    this.director.setActive(false);
  }

  private leaveWait(player: Vec3): void {
    const m = this.model!;
    this.wait = null;
    if (this.modeHidden) {
      // The player is gliding, seated or diving: he comes back when the mode ends.
      this.setHidden(true);
      return;
    }
    this.director.setActive(!this.hidden);
    if (this.canWalkBack(player)) {
      // Clears the trail and the player history, so the first step after the wait is not taken for a jump.
      m.place({ ...m.pos }, m.yaw);
      this.walkBackWindow = WALK_BACK_DOOR_WINDOW;
      return;
    }
    this.lastTrailPoint = null;
    this.requestTeleport();
  }

  private interiors(): InteriorsLike | undefined {
    return anyService<InteriorsLike>(this.ctx, 'interiors');
  }

  /** Render interpolation between the last two fixed poses. */
  render(alpha: number): void {
    if (this.model && this.figure) this.applyPose(Math.max(0, Math.min(1, alpha)));
  }

  private applyPose(alpha: number): void {
    const m = this.model;
    const root = this.figure?.root;
    if (!m || !root) return;
    root.position.set(
      this.prev.x + (m.pos.x - this.prev.x) * alpha,
      this.prev.y + (m.pos.y - this.prev.y) * alpha,
      this.prev.z + (m.pos.z - this.prev.z) * alpha,
    );
    root.rotation.y = m.yaw;
    root.visible = !this.hidden;
  }

  private resolveTeleport(player: Vec3, yaw: number, ports: GroundPorts): void {
    const indoors = ports.indoors();
    const r = findSpot(
      ports,
      { player, playerYaw: yaw, trailPoint: this.lastTrailPoint, indoorFallback: indoors ? this.indoorEntry() : null },
      this.budget,
      this.spotCursor,
    );
    if (r === 'later') return;
    if (r === 'unresident') {
      this.setHidden(true);
      this.spotCursor.next = 0;
      return;
    }
    if (r === 'exhausted') {
      // No clear spot outdoors: right behind the player, where Cael just stood.
      const b = behind(player, yaw, 0.8);
      this.place({ x: b.x, y: player.y, z: b.z }, yaw);
      return;
    }
    this.place(r, yaw);
  }

  /** Puts him at `at` at once (tests and debug tools); ignored while waiting or not spawned. */
  placeAt(at: Vec3, yaw = this.yaw): void {
    if (!this.model || this.wait) return;
    this.place(at, yaw);
  }

  private place(at: Vec3, yaw: number): void {
    const m = this.model;
    if (!m) return;
    m.place(at, yaw);
    this.prev.x = at.x;
    this.prev.y = at.y;
    this.prev.z = at.z;
    this.teleportPending = false;
    this.spotCursor.next = 0;
    this.lastTrailPoint = null;
    this.setHidden(false);
  }

  private setHidden(h: boolean): void {
    if (this.hidden === h) return;
    this.hidden = h;
    if (h) {
      this.endAura();
      this.brain?.reset();
      this.setStonehide(false);
      this.setFlame(false);
    }
    this.director.setActive(!h && this.actor !== null && !this.wait);
    if (this.figure) this.figure.root.visible = !h;
  }

  private indoorEntry(): Vec3 | null {
    const cur = anyService<InteriorsLike>(this.ctx, 'interiors')?.current ?? null;
    const id = cur ? this.def.interiorEntry[cur] : undefined;
    const a = id ? this.ctx.anchors.find(id) : undefined;
    return a ? { ...a.position } : null;
  }

  /** Indoors on a nav grid: the next waypoint of `nav.path` towards `to`, re-asked every 0.5 s or 1 m of goal move. */
  private steer(from: Vec3, to: { x: number; z: number }, dt: number): { x: number; z: number } | null {
    const nav = anyService<NavLike>(this.ctx, 'nav');
    if (!nav?.path || !nav.hasGrid(from)) {
      this.path = null;
      return null;
    }
    const goal = { x: to.x, y: from.y, z: to.z };
    this.pathAge += dt;
    const p = this.path;
    if (!p || this.pathAge >= REPATH_SECONDS || Math.hypot(p.goal.x - goal.x, p.goal.z - goal.z) > REPATH_MOVE) {
      let pts: Vec3[] | null = null;
      try {
        pts = nav.path(from, goal);
      } catch (err) {
        this.warnOnce('nav', `companions: nav.path threw: ${String(err)}`);
      }
      this.path = pts && pts.length ? { goal, points: pts.slice() } : null;
      this.pathAge = 0;
    }
    const pts = this.path?.points;
    if (!pts) return null;
    while (pts.length > 1 && Math.hypot(pts[0].x - from.x, pts[0].z - from.z) < WAYPOINT_REACHED) pts.shift();
    return pts[0];
  }

  // ---- vitals, fighting and Stonehide (A5) ----------------------------------------------------------------------

  /** Standing, following and visible: the state in which he fights, shares damage or heals. */
  get ready(): boolean {
    return (
      this.actor !== null &&
      !!this.model &&
      !this.hidden &&
      !this.wait &&
      !this.mountHidden &&
      !this.downed &&
      !this.playerDead &&
      this.isActive()
    );
  }

  private tickVitals(dt: number): void {
    const v = this.vitals;
    if (!v) return;
    const pending = this.pendingEdge;
    this.pendingEdge = null;
    const edge = v.tick(dt, this.presence.fighting);
    this.syncHealth();
    if (pending) this.emitEdge(pending);
    if (edge) this.emitEdge(edge);
  }

  private emitEdge(edge: VitalsEdge): void {
    if (edge === 'downed') {
      this.brain?.reset();
      this.setStonehide(false);
      this.setFlame(false);
      this.figure?.setKneel(true);
      this.ctx.events.emit('companion.downed', { companionId: this.def.id });
    } else if (edge === 'stood') {
      this.figure?.setKneel(false);
      this.ctx.events.emit('companion.stood', { companionId: this.def.id });
    }
  }

  /** Full health, standing (a load, a respawn, a rest, a wait). */
  private standUp(): void {
    const v = this.vitals;
    if (!v) return;
    const wasPending = this.pendingEdge === 'downed';
    this.pendingEdge = null;
    const edge = v.restore();
    this.syncHealth();
    // A fall not yet announced is simply undone; an announced one gets its `companion.stood`.
    if (edge && !wasPending) this.emitEdge(edge);
    else this.figure?.setKneel(false);
  }

  private syncHealth(): void {
    if (this.actor && this.vitals) this.actor.health = this.vitals.health;
  }

  private brainStep(dt: number, player: Vec3) {
    const b = this.brain;
    const m = this.model;
    if (!b || !m) return null;
    const view: BrainView = {
      self: { x: m.pos.x, z: m.pos.z },
      player: { x: player.x, z: player.z },
      canAct: this.ready && !this.talking && !this.teleportPending,
      playerInCombat: this.presence.fighting,
      trialRunning: this.trialRunning(),
      foes: () => this.foes(),
      mayEngage: (id) => this.ctx.services.get('allyEngagement')?.mayEngage(id) ?? false,
      struckByPlayer: (id) => this.struck.has(id),
    };
    return b.tick(dt, view);
  }

  private foes(): Foe[] {
    const out: Foe[] = [];
    const defs = ENEMY_DEFS as unknown as Readonly<Record<string, { mercy?: { verb?: string } | null } | undefined>>;
    for (const a of this.ctx.actors.ofTeam('hostile')) {
      if (a.dead) continue;
      const at = a.worldPosition(this.probe);
      // Fail safe: a kind outside ENEMY_DEFS (a boss, a later registry) is treated as a beast, so it needs Cael's hit first.
      const def = defs[a.kind];
      out.push({ id: a.id, x: at.x, z: at.z, health: a.health, beast: !def || def.mercy?.verb === 'calm' });
    }
    return out;
  }

  /** One light hit; never below 1 HP (the `companions.ally-no-kill` handler holds what modifiers add on top). */
  private strike(targetId: string): void {
    const self = this.actor;
    const m = this.model;
    const target = this.ctx.actors.get(targetId);
    const c = this.def.combat;
    if (!self || !m || !c || !target || target.dead || !(target.health > 1)) return;
    const at = target.worldPosition(this.probe);
    const dir = new THREE.Vector3(at.x - m.pos.x, 0, at.z - m.pos.z);
    if (dir.lengthSq() > 1e-8) dir.normalize();
    else dir.set(0, 0, -1);
    this.ctx.damage.apply({
      attackerId: self.id,
      targetId,
      amount: Math.min(c.damage, target.health - 1),
      poise: HROLF_TUNING.poise,
      kind: 'melee',
      attackId: `companion.${this.def.id}.chop`,
      direction: dir,
    });
  }

  /**
   * Stonehide (design 8.1), called from the plugin's damage modifier: takes `share` of an enemy's melee or spell hit
   * on Cael while he stands within `radius`, and returns what Cael still takes.
   */
  shareHit(amount: number, player: Vec3): number {
    const sh = this.def.stonehide;
    const v = this.vitals;
    const m = this.model;
    if (!sh || !v || !m || !this.ready || this.trialRunning() || !(amount > 0)) return amount;
    if (Math.hypot(m.pos.x - player.x, m.pos.z - player.z) > sh.radius) return amount;
    const share = amount * sh.share;
    const edge = v.take(share);
    if (edge) this.pendingEdge = edge;
    this.syncHealth();
    return amount - share;
  }

  private updateStonehide(player: Vec3): void {
    const sh = this.def.stonehide;
    const m = this.model;
    if (!sh || !m) return;
    // Not in a trial: the duel's blows are Cael's alone (plan section 8 item 6).
    this.setStonehide(this.ready && !this.trialRunning() && Math.hypot(m.pos.x - player.x, m.pos.z - player.z) <= sh.radius);
  }

  /**
   * Calming flame (design 8.1, plans/act2-A5.md section 2): while she is ready, Cael is out of combat, alive and hurt,
   * she heals him `healFraction` of his max health every `everySeconds`. Never in combat, never at full health.
   */
  private tickFlame(dt: number): void {
    const cf = this.def.calmingFlame;
    if (!cf) return;
    const pl = this.ctx.player.actor;
    // Not in a trial either: the duel's rounds are Cael's alone (as Stonehide).
    const on = this.ready && !this.presence.fighting && !this.trialRunning() && !pl.dead && pl.health < pl.maxHealth;
    this.setFlame(on);
    if (!on) return;
    this.flameClock += dt;
    if (this.flameClock < cf.everySeconds) return;
    this.flameClock -= cf.everySeconds;
    this.ctx.damage.heal(pl.id, pl.maxHealth * cf.healFraction);
  }

  private setFlame(on: boolean): void {
    const cf = this.def.calmingFlame;
    if (!cf || on === this.flameOn) return;
    this.flameOn = on;
    this.flameClock = 0;
    if (on) this.ctx.events.emit('buff.applied', { id: cf.buffId, nameKey: cf.nameKey, seconds: Infinity });
    else this.ctx.events.emit('buff.removed', { id: cf.buffId });
    this.ctx.events.emit('companion.aura', { companionId: this.def.id, auraId: cf.auraId, active: on });
  }

  private setStonehide(on: boolean): void {
    const sh = this.def.stonehide;
    if (!sh || on === this.stonehideOn) return;
    this.stonehideOn = on;
    // A standing aura: the HUD's buff row ignores a non-finite duration, the pip reads `companion.aura`.
    if (on) this.ctx.events.emit('buff.applied', { id: sh.buffId, nameKey: sh.nameKey, seconds: Infinity });
    else this.ctx.events.emit('buff.removed', { id: sh.buffId });
    this.ctx.events.emit('companion.aura', { companionId: this.def.id, auraId: sh.auraId, active: on });
  }

  /** Built once; services are looked up per call, since 3a's may arrive after this plugin. */

  private cachedPorts: GroundPorts | null = null;

  private ports(): GroundPorts {
    if (this.cachedPorts) return this.cachedPorts;
    const ctx = this.ctx;
    const nav = () => anyService<NavLike>(ctx, 'nav') ?? null;
    const interiors = () => anyService<InteriorsLike>(ctx, 'interiors');
    const exclude = ctx.world.player.controller.collider;
    this.cachedPorts = {
      raycast: (o, d, max) => ctx.physics.raycast(o, d, max, exclude),
      isResident: (x, z) => ctx.terrain.isResident(x, z),
      heightAt,
      // Only a real interior counts: Harrowmark's street blocks have nav grids too, and they are outdoors.
      indoors: () => !!interiors()?.current,
      get nav() {
        return nav();
      },
    };
    return this.cachedPorts;
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(message);
  }

  dispose(): void {
    if (this.disposed) return;
    this.despawn();
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
  }
}
