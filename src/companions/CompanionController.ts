// One companion wired into the game: joined state from its flag, the actor and figure, follow and teleport-behind,
// Battle-song, banter, the talk interactable and saved position (plans/slice-2-tobb.md, section 13 overrides);
// Phase B adds quest-derived waits and horseback following (plans/slice-2-tobb-phase-b.md and its review).
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
import { FollowModel, behind, yawToward, type Vec3 } from './FollowModel';
import { RayBudget, findSpot, groundAt, type GroundPorts } from './ground';
import { COMPANION_TUNING, TOBB_TUNING } from './tuning';
import type { AttackSpeedHook, CompanionDef, InteriorsLike, NavLike } from './types';
import { deriveWait, inView, sameWait, type ViewPorts, type Wait, type WaitView } from './WaitDirector';

export interface SavedSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ControllerOptions {
  rng?: () => number;
  warn?: (message: string) => void;
}

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
  /** The post he stands at instead of following, or null. Derived each tick from quest and interior state. */
  private wait: Wait | null = null;
  private waitYaw = 0;
  /** Seconds a different wait has been wanted but not applied (relocation waits until he is out of view). */
  private handoffAge = 0;
  private mounted = false;
  /** Hidden on horseback after falling too far back; reappears behind the player on dismount. */
  private mountHidden = false;

  constructor(
    private readonly ctx: GameContext,
    readonly def: CompanionDef,
    opts: ControllerOptions = {},
  ) {
    this.warn = opts.warn ?? ((m) => console.warn(m));
    this.aura = new AuraWindow(def.aura.seconds);
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
    if (this.ctx.state.getNumber(this.def.rankFlag, 0) < 1) this.ctx.state.setFlag(this.def.rankFlag, 1);
    if (this.actor) return;
    const start = cause === 'flag' ? this.handoverSpot() : null;
    const actor = this.spawn(start);
    if (cause === 'flag') this.ctx.events.emit('companion.joined', { companionId: this.def.id, actorId: actor.id });
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
    const figure = new CompanionFigure();
    const feet = this.ctx.player.feet;
    const at = start ?? { x: feet.x, y: feet.y, z: feet.z };
    figure.root.position.set(at.x, at.y, at.z);
    this.ctx.scene.add(figure.root);
    let actor: Actor | null = null;
    try {
      actor = this.ctx.actors.spawn({
        kind: `companion:${this.def.id}`,
        team: 'ally',
        maxHealth: 1,
        immortal: true,
        hittable: false,
        untargetable: true,
        root: figure.root,
      });
      this.unregisterTalk = this.ctx.interaction.register({
        id: `companion:${this.def.id}`,
        kind: 'talk',
        name: this.ctx.strings.t(this.def.nameKey),
        // He settles about 3.2 m away, so the reach is longer; Cael must face him (the default cone).
        radius: 3.6,
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
        this.director.suppress('death', false);
        this.sinceReset = 0;
        this.requestTeleport();
      }),
      ev.on('fastTravel', () => this.requestTeleport()),
      ev.on('interior.entered', ({ interiorId }) => {
        this.requestTeleport();
        const place = this.def.places.interiors[interiorId];
        if (place && this.sinceReset > TOBB_TUNING.reEmitWindowSeconds) this.emitBark(this.director.area(place));
      }),
      ev.on('interior.exited', () => this.requestTeleport()),
      ev.on('mount.mounted', () => {
        this.mounted = true;
      }),
      ev.on('mount.dismounted', () => {
        this.mounted = false;
        if (!this.mountHidden) return;
        this.mountHidden = false;
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
      ev.on('actor.died', ({ actorId }) => this.presence.remove(actorId)),
      ev.on('actor.despawned', ({ actorId }) => this.presence.remove(actorId)),
      ev.on('trigger.enter', ({ triggerId, actorId }) => {
        const place = this.def.places.triggers[triggerId];
        if (place && actorId === playerId()) this.emitBark(this.director.area(place));
      }),
      ev.on('region.entered', ({ regionId }) => {
        // The tracker reports `previous: null` on every entry, so a load or respawn is told apart by time instead.
        const place = this.def.places.regions[regionId];
        if (place && this.sinceReset > TOBB_TUNING.reEmitWindowSeconds) this.emitBark(this.director.area(place));
      }),
    );
  }

  private onLoaded(): void {
    this.endAura();
    this.director.saveLoaded();
    this.presence.reset();
    this.playerDead = this.ctx.player.actor.dead;
    this.talking = false;
    this.sinceReset = 0;
    // Thread 20 re-emits `mount.mounted` after `save.loaded` for a mounted load.
    this.mounted = false;
    this.mountHidden = false;
    const saved = this.saved;
    this.saved = null;
    if (!this.model) return;
    // A load is black: a wait that holds is applied at once and the saved spot is ignored.
    this.handoffAge = 0;
    const want = deriveWait(this.def.waits, this.waitView());
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

  /** No-op while waiting: doors, fast travel and respawns never pull a waiting companion to the player. */
  private requestTeleport(): void {
    if (!this.model || this.wait) return;
    this.teleportPending = true;
    this.spotCursor.next = 0;
    this.lastTrailPoint = this.model.trail.newest() ?? this.lastTrailPoint;
  }

  // ---- aura --------------------------------------------------------------------------------------------------

  private onBlock(): void {
    if (!this.actor || this.hidden || this.wait || this.playerDead) return;
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
    if (!undo) return;
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

  private emitBark(b: Bark | null): void {
    if (!b || !this.actor || this.hidden || this.wait) return;
    this.ctx.events.emit('companion.banter', { companionId: this.def.id, lineKey: b.lineKey, trigger: b.trigger });
    const t = this.ctx.strings;
    this.ctx.events.emit('hud.toast', { textKey: 'companion.say', params: { name: t.t(this.def.nameKey), line: t.t(b.lineKey) } });
  }

  // ---- ticks -------------------------------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    this.sinceReset += dt;
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
    if (!this.wait && !this.mountHidden) this.follow(dt, player, p.facingYaw, ports);

    if (this.aura.tick(dt)) this.endAura();
    if (edge === 'end') this.emitBark(this.director.combat('end'));
    this.emitBark(this.director.tick(dt));

    this.figure?.setGait(this.hidden ? 'idle' : m.gait);
    this.figure?.update(dt);
    this.applyPose(1);
  }

  private follow(dt: number, player: Vec3, playerYaw: number, ports: GroundPorts): void {
    const m = this.model!;
    if (!this.teleportPending) {
      const newest = m.trail.newest();
      if (newest) this.lastTrailPoint = newest;
      const step = m.step({
        dt,
        player,
        playerYaw,
        groundAt: (x, z, y) => groundAt(ports, x, z, y),
        hold: this.talking,
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
    const want = deriveWait(this.def.waits, this.waitView());
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
    this.director.setActive(!this.hidden);
    if (this.canWalkBack(player)) {
      // Clears the trail and the player history, so the first step after the wait is not taken for a jump.
      m.place({ ...m.pos }, m.yaw);
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
    if (h) this.endAura();
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
      indoors: () => {
        const i = interiors();
        if (i?.current) return true;
        const f = ctx.player.feet;
        return !!i && !!nav()?.hasGrid({ x: f.x, y: f.y, z: f.z });
      },
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
