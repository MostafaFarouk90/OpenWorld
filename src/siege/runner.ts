// One running siege (plans/act5-N4.md sections 4 to 12): the shipped wave director runs the foes, the gate and the
// rams; this runner stands the roster's squads, the gate's taunters, the assist rule and the dragons round it, and runs
// the breaks (orders, the gong, the crates), the storm, the sally, the sappers and the wounded beat. Everything it
// builds is rebuilt from the director's state and the `siege.*` flags, so a load needs no persistable of its own.
import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import { mercyStateOf } from '../actors/DamageResolver';
import type { GameContext } from '../core/Game';
import type { NpcModelLoader } from '../npcs/types';
import type { Vec3 } from '../physics/PhysicsWorld';
import type { WaveDirector } from '../waves/director';
import { WAVE_SETS } from '../waves/defs';
import { M52_GUARD_LINE, SIEGE_KINDS } from '../waves/defs/act5';
import { spawnerId } from '../waves/spawners';
import type { Cart } from '../waves/structures';
import { EscortRider, type HorseLoader } from '../companions/escort/escortHorse';
import type { SiegeOrderId } from '../caldera/siege';
import '../caldera/events';
import './events';
import { AssistRule } from './assist';
import { BreathMark, dragonLoop, SiegeDragon } from './dragons';
import { GateTaunters } from './gate';
import { offerFlag, OFFERED_ORDERS, ORDERS_SPEAKER, ORDERS_TREE, orderEvent, type OfferedOrder } from './orders.dialogue';
import { SIEGE_POSTS, siegeRoster, type RosterSquad, type SiegeId, type SiegeRoster } from './roster';
import { namedDef, Squad } from './squads';
import { SIEGE_FLASK_FALLBACK_ID, SIEGE_FLASK_ID, siegeSupply } from './supply';
import { BREAK, DRAGON, GATE, ORDERS, ROLE, SALLY, SAPPERS, STORM, WOUNDED } from './tuning';

export type SiegeHost = GameContext;

/** The wave set each siege runs (R27's far end open under F6 Leaders: four waves). */
export function siegeSetId(siegeId: SiegeId, flags: { getFlag(k: string): unknown }): string {
  if (siegeId === 'm52') return 'rim-siege';
  return flags.getFlag('story.r21.choice') === 'leaders' ? 'stokers-tunnel-open' : 'stokers-tunnel';
}

/** The set ids back to their siege. */
export const SET_SIEGE: Readonly<Record<string, SiegeId>> = { 'rim-siege': 'm52', 'stokers-tunnel': 'r27', 'stokers-tunnel-open': 'r27' };

export const SIEGE_FLAGS = {
  /** The order given in the break after wave `n` (1-based). */
  order: (siegeId: string, n: number) => `siege.${siegeId}.order.${n}`,
  /** The wounded companion's id (Q2 a). */
  wounded: 'siege.m52.wounded',
  /** Set when a siege completes. */
  done: (siegeId: string) => `siege.${siegeId}.done`,
} as const;

export const SIEGE_ANCHORS = {
  start: { m52: 'caldera.siege.start', r27: 'caldera.int.tunnel.checkpoint' },
  orders: { m52: 'caldera.siege.orders', r27: 'caldera.int.tunnel.post.3' },
  crates: 'caldera.siege.crates',
  aid: 'caldera.siege.aid',
  sky: (n: number) => `caldera.siege.sky.${n}`,
} as const;

type BreakPhase = 'orders' | 'beat';

interface Strike {
  dragonId: string;
  mark: BreathMark;
  at: Vec3;
  /** 'circle' a breath, 'line' the hill wyrm's strafe, 'ram' the first-ram strike. */
  shape: 'circle' | 'line' | 'ram';
  dir?: { x: number; z: number };
  ram?: Cart;
}

interface Rider {
  rider: EscortRider;
  side: number;
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** A small deterministic generator (the volley's target pick); seeded per siege so tests repeat. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SiegeRun {
  readonly roster: SiegeRoster;
  readonly setId: string;
  readonly squads: Squad[] = [];
  private gate: GateTaunters | null = null;
  readonly assist: AssistRule;
  readonly dragons: SiegeDragon[] = [];
  private readonly strikes: Strike[] = [];
  private readonly offs: Array<() => void> = [];
  private readonly releases = new Map<string, () => void>();
  private fireActor: Actor;
  private readonly rng: () => number;
  private readonly warned = new Set<string>();
  private memberSet = new Set<ActorId>();
  private memberPos: Array<{ a: Actor; p: THREE.Vector3 }> = [];
  private readonly tmp = new THREE.Vector3();

  /** 1-based wave now running (or the one just cleared, in a break). */
  wave = 0;
  private waveT = 0;
  breakPhase: BreakPhase | null = null;
  private breakTimer = 0;
  /** Effects of the order given for the running wave. */
  private volleyScale = 1;
  private boostLeft = 0;
  private storming = false;
  private crateTaken = false;
  /** Resupplies used: one `flasks` order flag each (so a load keeps the count). */
  private get resupplyUsed(): number {
    let n = 0;
    for (let w = 1; w <= this.waveCount(); w++) if (this.host.state.getFlag(SIEGE_FLAGS.order(this.siegeId, w)) === 'flasks') n++;
    return n;
  }
  private sallyDone = false;
  private sally: { t: number; riders: Rider[]; from: Vec3; to: Vec3; hit: Set<ActorId> } | null = null;
  private ramSpawnT: number | null = null;
  private readonly sapped = new Set<string>();
  private firstRamBreathDone = false;
  private woundedDone = false;
  private wavePlan: Array<{ dragon: number; at: number; fired: boolean }> = [];
  private readonly arrivedSent = new Set<string>();

  constructor(
    private readonly host: SiegeHost,
    readonly siegeId: SiegeId,
    private readonly director: WaveDirector,
    private readonly warn: (m: string) => void,
  ) {
    this.roster = siegeRoster(host.state, siegeId);
    if (this.roster.snapshotMissing) this.warnOnce('snapshot', `siege '${siegeId}': no M52 favour snapshot; every band reads Cold`);
    this.setId = siegeSetId(siegeId, host.state);
    this.rng = mulberry(siegeId === 'm52' ? 52 : 27);
    const root = new THREE.Group();
    root.name = 'siege-fire';
    this.fireActor = host.actors.spawn({ kind: 'siege-fire', team: 'ally', maxHealth: 1e9, maxPoise: 0, root, owner: root, untargetable: true });
    this.assist = new AssistRule(host, { handlerId: `siege.${siegeId}.assist`, isSiegeFoe: (id) => this.memberSet.has(id) });
    this.woundedDone = siegeId === 'r27' || typeof host.state.getFlag(SIEGE_FLAGS.wounded) === 'string';
    try {
      this.build();
    } catch (err) {
      this.dispose();
      throw err;
    }
  }

  private build(): void {
    const host = this.host;
    const siegeId = this.siegeId;
    this.listen();
    this.hold('movement', () =>
      host.services.require('movementMode').push('siege', () => {
        const a = host.anchors.find(SIEGE_ANCHORS.start[siegeId]);
        return a ? { position: a.position, yaw: a.yaw ?? 0 } : null;
      }),
    );
    this.holdClear();
    this.buildWorld();
    this.registerPosts();
    this.restoreWounded();
  }

  // ---- reads ------------------------------------------------------------------------------------------

  get waves(): number {
    return this.waveCount();
  }

  private waveCount(): number {
    return SET_SIZES[this.setId] ?? 0;
  }

  get gatePct(): number {
    const b = this.director.barricade;
    return b ? Math.round((b.health / b.max) * 1000) / 10 : 0;
  }

  get storm(): boolean {
    return this.storming;
  }

  /** The orders on offer in the current break (empty outside one). */
  offered(): OfferedOrder[] {
    if (this.breakPhase !== 'orders') return [];
    return OFFERED_ORDERS.filter((id) => id === 'hold' || this.host.state.getFlag(offerFlag(id)) === true);
  }

  rams(): { id: string; stalled: number }[] {
    const carts = this.director.parts?.carts.all ?? [];
    return carts.filter((c) => c.role === 'ram' && c.active).map((c) => ({ id: c.id, stalled: c.stalled }));
  }

  // ---- building ---------------------------------------------------------------------------------------

  private warnOnce(key: string, m: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(m);
  }

  private hold(key: string, make: () => () => void): void {
    this.releases.get(key)?.();
    this.releases.set(key, make());
  }

  private release(key: string): void {
    this.releases.get(key)?.();
    this.releases.delete(key);
  }

  private holdClear(): void {
    const w = this.host.services.get('weather');
    if (!w) return;
    this.release('storm');
    this.storming = false;
    if (!this.releases.has('clear')) this.hold('clear', () => w.holdClear(`siege.${this.siegeId}`));
  }

  private forceStorm(): void {
    const w = this.host.services.get('weather');
    const g = this.director.geometry;
    if (!w || !g) return;
    this.release('clear');
    const h = STORM.courtHalf;
    const o = g.origin;
    this.hold('storm', () => w.forceStorm(`siege.${this.siegeId}`, { area: { box: { minX: o.x - h, maxX: o.x + h, minZ: o.z - h, maxZ: o.z + h } } }));
    const lee = this.anchor(SIEGE_POSTS.lee) ?? { x: o.x, y: 0, z: o.z };
    if (w.addShelterZone) this.hold('lee', () => w.addShelterZone!({ id: `siege.${this.siegeId}.lee`, at: { x: lee.x, z: lee.z }, radius: STORM.leeRadius }));
    this.storming = true;
  }

  private anchor(id: string): Vec3 | null {
    return this.host.anchors.find(id)?.position ?? null;
  }

  /** Squads, the gate's taunters; built when the director has built its set. */
  private buildWorld(): void {
    const g = this.director.geometry;
    if (!g || this.gate) return;
    const b = this.director.barricade;
    this.gate = new GateTaunters(this.host, {
      siegeId: this.siegeId,
      points: g.gate,
      maxHealth: b?.max ?? GATE.m52Health,
      accepts: (id) => !this.assist.assisted(id),
      damageGate: (n) => void this.director.damageBarricade(n),
      standing: () => !this.director.breached && !(this.director.barricade?.destroyed ?? true),
    });
    // Foes face the lanes: the squads face away from the court, toward the lane heads (yaw 0 faces -Z).
    let lx = 0;
    let lz = 0;
    for (const p of g.lanes.values()) {
      lx += p.x - g.origin.x;
      lz += p.z - g.origin.z;
    }
    const yaw = g.lanes.size > 0 ? Math.atan2(-lx, -lz) : 0;
    const castShadow = this.host.services.get('graphics')?.shadows === 'full';
    const loader = this.host.assets as unknown as NpcModelLoader | null;
    for (const s of this.roster.squads) {
      const post = this.postFor(s, g.origin, yaw);
      this.squads.push(
        new Squad(this.host, {
          squad: s,
          siegeId: this.siegeId,
          post,
          yaw,
          loader,
          castShadow,
          scales: { damage: () => (this.boostLeft > 0 ? ORDERS.gongBoostScale : 1), volley: () => this.volleyScale * (this.storming ? STORM.archerScale : 1) },
          inField: (x, z) => flat({ x, z }, g.origin) <= ROLE.archers.fieldMetres,
          isFoe: (id) => this.memberSet.has(id),
          hostileWithin: (at, r) => this.memberPos.some((m) => flat(m.p, at) <= r),
          rng: this.rng,
        }),
      );
    }
  }

  /** A squad's post anchor, or a stand-in round the gate when it is missing (warned once). */
  private postFor(s: RosterSquad, origin: { x: number; z: number }, yaw: number): Vec3 {
    const p = this.anchor(s.post);
    if (p) return p;
    const inner = this.gateInner(s.post, yaw);
    if (inner) return inner;
    this.warnOnce(`post:${s.post}`, `siege post '${s.post}' has no anchor; squad '${s.id}' stands behind the gate`);
    const i = this.roster.squads.indexOf(s);
    const back = 6 + (i % 3) * 3;
    const side = ((i % 5) - 2) * 6;
    const y = this.host.player.feet.y;
    return { x: origin.x + Math.sin(yaw) * back + Math.cos(yaw) * side, y, z: origin.z + Math.cos(yaw) * back - Math.sin(yaw) * side };
  }

  /**
   * The gate's inner posts: `GATE.innerOffset` metres inside the gate line (away from the lanes), at its middle or its
   * two ends. Null for any other post.
   */
  private gateInner(post: string, yaw: number): Vec3 | null {
    const g = this.director.geometry;
    if (!g || g.gate.length === 0) return null;
    const pts = g.gate;
    const at = post === SIEGE_POSTS.gateInner ? null : post === SIEGE_POSTS.gateLeft ? pts[0] : post === SIEGE_POSTS.gateRight ? pts[pts.length - 1] : undefined;
    if (at === undefined) return null;
    const base = at ?? { x: g.origin.x, y: pts.reduce((n, q) => n + q.y, 0) / pts.length, z: g.origin.z };
    // yaw faces the lanes (-Z at 0): inside is +forward's opposite.
    return { x: base.x + Math.sin(yaw) * GATE.innerOffset, y: base.y, z: base.z + Math.cos(yaw) * GATE.innerOffset };
  }

  /** The war post (orders) and Oswin's crates: interactables while a break stands. */
  private registerPosts(): void {
    const orders = this.anchor(SIEGE_ANCHORS.orders[this.siegeId]);
    if (orders) {
      this.hold('post.orders', () =>
        this.host.interaction.register({
          id: `talk:siege-orders-${this.siegeId}`,
          kind: 'talk',
          position: (out) => out.set(orders.x, orders.y, orders.z),
          radius: 3,
          coneDegrees: 360,
          promptKey: 'siege.prompt.orders',
          priority: 5,
          enabled: () => this.breakPhase === 'orders',
          onInteract: () => void this.host.services.get('dialogue')?.start(ORDERS_TREE[this.siegeId], ORDERS_SPEAKER[this.siegeId]),
        }),
      );
    } else this.warnOnce('orders', `siege '${this.siegeId}': no war post anchor; breaks end on the ${BREAK.orderTimeoutS} s timeout`);
    const crates = this.siegeId === 'm52' ? this.anchor(SIEGE_ANCHORS.crates) : null;
    if (crates && this.roster.supply && this.supply().perBreak > 0) {
      this.hold('post.crates', () =>
        this.host.interaction.register({
          id: `use:siege-crates-${this.siegeId}`,
          kind: 'use',
          position: (out) => out.set(crates.x, crates.y, crates.z),
          radius: 2.5,
          coneDegrees: 360,
          promptKey: 'siege.prompt.crates',
          priority: 4,
          enabled: () => this.breakPhase !== null && !this.crateTaken,
          onInteract: () => void this.takeCrate(),
        }),
      );
    }
  }

  supply(): { perBreak: number; resupplies: number } {
    const s = this.roster.supply;
    return s ? siegeSupply(s.band, s.road) : { perBreak: 0, resupplies: 0 };
  }

  /** The crate's flasks for this break (once a break). Returns the number given. */
  takeCrate(): number {
    if (this.breakPhase === null || this.crateTaken) return 0;
    this.crateTaken = true;
    return this.giveFlasks(this.supply().perBreak);
  }

  private giveFlasks(n: number): number {
    const inv = this.host.services.get('inventory');
    if (!inv || n <= 0) return 0;
    const got = inv.add(SIEGE_FLASK_ID, n);
    return got > 0 ? got : inv.add(SIEGE_FLASK_FALLBACK_ID, n);
  }

  // ---- events -----------------------------------------------------------------------------------------

  private mine(defId: string): boolean {
    return defId === this.setId;
  }

  private listen(): void {
    const ev = this.host.events;
    const id = this.siegeId;
    this.offs.push(
      ev.on('wave.started', (p) => {
        // During a load the service rebuilds the run after `save.loaded` and resumes it; this (stale) run stays quiet.
        // Mapped on this run's next tick (or by `flush`): during a load the director restarts its wave inside its own
        // `save.loaded` handler, before the service rebuilds the run, so the stale run must not act on it.
        if (this.mine(p.defId)) this.pendingStart = { n: p.index + 1, resumed: this.pendingStart?.resumed === true && this.pendingStart.n === p.index + 1 };
      }),
      ev.on('wave.cleared', (p) => {
        if (this.mine(p.defId)) this.onWaveCleared(p.index + 1);
      }),
      ev.on('waves.breached', (p) => {
        if (!this.mine(p.defId)) return;
        this.breachedThisWave = true;
        ev.emit('siege.gate.breached', { siegeId: id });
      }),
      ev.on('actor.died', (p) => {
        if (this.guards.delete(p.actorId)) ev.emit('siege.guard.fallen', { siegeId: id, actorId: p.actorId });
      }),
      ev.on('structure.damaged', (p) => {
        const b = this.director.barricade;
        if (b && this.director.current?.defId === this.setId && p.id === this.gateId()) ev.emit('siege.gate.damaged', { siegeId: id, pct: Math.max(0, Math.round((p.health / b.max) * 1000) / 10) });
      }),
      ev.on('waves.cart.windup', (p) => {
        if (this.mine(p.defId) && p.role === 'ram') ev.emit('siege.ram.creak', { siegeId: id, id: p.id });
      }),
      ev.on('waves.cart.struck', (p) => {
        if (!this.mine(p.defId) || p.role !== 'ram') return;
        ev.emit('siege.ram.hit', { siegeId: id, id: p.id });
        if (this.wave === 3) this.wound();
      }),
    );
    for (const o of OFFERED_ORDERS) this.offs.push(ev.on(orderEvent(o), () => this.give(o)));
  }

  private gateId(): string {
    return this.setId === 'rim-siege' ? 'caldera.siege.gate' : 'caldera.tunnel.line';
  }

  /** The gate fell in the current wave (reported on `siege.wave.cleared`). */
  private breachedThisWave = false;
  /** Live household guards (M52 wave 4), watched for `siege.guard.fallen`. */
  private readonly guards = new Set<ActorId>();

  /** A wave start the director announced, mapped on the next tick. */
  private pendingStart: { n: number; resumed: boolean } | null = null;

  /** Maps a pending wave start now (the service's `start`, so wave 1's events go out with it). */
  flush(): void {
    const p = this.pendingStart;
    this.pendingStart = null;
    if (p) this.onWaveStarted(p.n, p.resumed);
  }

  /**
   * After a load: the director restarted its wave inside its `save.loaded` handler (the bus delivers that
   * `wave.started` after every `save.loaded` handler, so it reaches this run, not the stale one). Marks it as resumed
   * (no gong) and maps it on the next tick; re-emits `siege.wave.started` and the gate for N9.
   */
  resume(): void {
    const cur = this.director.current;
    if (cur && cur.defId === this.setId && this.director.phase === 'running' && !this.director.parked) this.pendingStart = { n: cur.index + 1, resumed: true };
  }

  private onWaveStarted(n: number, resumed: boolean): void {
    if (resumed && n > FIRST_RAM_WAVE[this.setId]) this.firstRamBreathDone = true;
    this.buildWorld();
    this.wave = n;
    this.waveT = 0;
    this.breachedThisWave = false;
    this.guards.clear();
    this.breakPhase = null;
    this.ramSpawnT = null;
    this.sapped.clear();
    this.clearOffers();
    for (const s of this.squads) s.reviveAll();
    // The order given for this wave (read from its flag, so a load in or after the break keeps it).
    const order = this.host.state.getFlag(SIEGE_FLAGS.order(this.siegeId, n - 1));
    this.director.impactScale = order === 'brace' ? ORDERS.braceImpactScale : 1;
    this.volleyScale = order === 'loose' ? ORDERS.looseScale : 1;
    this.boostLeft = 0;
    if (order === 'gong') {
      for (const s of this.squads) s.set.rally(true);
      this.boostLeft = ORDERS.gongBoostS;
    }
    if (n > 1 && !resumed) this.host.events.emit('siege.gong', { siegeId: this.siegeId, by: order === 'gong' || this.r29Done() ? 'cael' : 'ansgar' });
    // The storm: waves 2 and 4 of M52, unless the Ashwalkers' storm-cover stands.
    if (this.siegeId === 'm52' && (n === 2 || n === 4) && !this.roster.stormCover) this.forceStorm();
    else {
      this.release('lee');
      this.holdClear();
    }
    this.arriveDragons(n);
    this.planStrikes();
    const b = this.director.barricade;
    if (b) this.host.events.emit('siege.gate.damaged', { siegeId: this.siegeId, pct: this.gatePct });
    this.host.events.emit('siege.wave.started', { siegeId: this.siegeId, n });
  }

  private onWaveCleared(n: number): void {
    this.host.events.emit('siege.wave.cleared', { siegeId: this.siegeId, n, breached: this.breachedThisWave });
    if (n >= this.waveCount()) {
      this.complete();
      return;
    }
    if (this.roster.engineers) this.director.mendBarricade((this.director.barricade?.max ?? 0) * GATE.engineersMendPct);
    this.release('lee');
    this.holdClear();
    this.breakPhase = 'orders';
    this.breakTimer = BREAK.orderTimeoutS;
    this.crateTaken = false;
    const offers = this.offers();
    for (const o of OFFERED_ORDERS) if (o !== 'hold') this.host.state.setFlag(offerFlag(o), offers.includes(o));
    this.host.events.emit('siege.break', { siegeId: this.siegeId, n, orders: offers });
  }

  /** R29 "The Last Gong" complete: the gong is Cael's to order. */
  private r29Done(): boolean {
    return this.host.services.get('quests')?.state('r29') === 'completed';
  }

  /** The orders the roster allows (plan section 6). */
  private offers(): OfferedOrder[] {
    const out: OfferedOrder[] = ['hold', 'brace'];
    if (this.roster.squads.some((s) => s.role === 'archers')) out.push('loose');
    if (this.supply().resupplies > this.resupplyUsed) out.push('flasks');
    if (this.r29Done()) out.push('gong');
    return this.siegeId === 'r27' ? out.filter((o) => o === 'hold' || o === 'gong') : out;
  }

  private clearOffers(): void {
    for (const o of OFFERED_ORDERS) if (o !== 'hold' && this.host.state.getFlag(offerFlag(o)) !== undefined) this.host.state.setFlag(offerFlag(o), false);
  }

  /** An order from the war post (or the timeout's `hold`). Ignored outside a break's order phase or when not on offer. */
  give(id: OfferedOrder): boolean {
    if (this.breakPhase !== 'orders' || !this.offers().includes(id)) return false;
    this.host.state.setFlag(SIEGE_FLAGS.order(this.siegeId, this.wave), id);
    if (id === 'flasks') {
      this.giveFlasks(this.supply().perBreak);
    }
    this.host.events.emit('siege.order', { siegeId: this.siegeId, id: id as SiegeOrderId });
    this.clearOffers();
    this.breakPhase = 'beat';
    this.breakTimer = BREAK.beatS;
    return true;
  }

  /** The last wave cleared; the service disposes the run after this tick. */
  finished = false;

  private complete(): void {
    this.finished = true;
    this.host.state.setFlag(SIEGE_FLAGS.done(this.siegeId), true);
    this.breakPhase = null;
    this.host.events.emit('siege.completed', { siegeId: this.siegeId });
  }

  // ---- dragons ----------------------------------------------------------------------------------------

  private arriveDragons(n: number): void {
    const g = this.director.geometry;
    if (!g) return;
    const marks: Vec3[] = [];
    for (let i = 1; i <= 6; i++) {
      // N1's sky marks are ground points flown `skyHeights` above (SIEGE_POINTS in src/caldera/calderaSites.ts).
      const p = this.anchor(SIEGE_ANCHORS.sky(i));
      if (p) marks.push({ x: p.x, y: p.y + DRAGON.skyHeights[i - 1], z: p.z });
    }
    const gate = g.gate[0] ?? { x: g.origin.x, y: this.host.player.feet.y, z: g.origin.z };
    for (const [k, d] of this.roster.dragons.entries()) {
      if (n < d.arriveWave || this.dragons.some((x) => x.id === d.id)) continue;
      const cam = () => this.host.player.feet;
      this.dragons.push(new SiegeDragon(d.id, this.host.scene, dragonLoop(marks, { x: g.origin.x, y: gate.y, z: g.origin.z }, k), k / Math.max(1, this.roster.dragons.length), cam));
      if (!this.arrivedSent.has(d.id)) {
        this.arrivedSent.add(d.id);
        this.host.events.emit('siege.ally.arrived', { siegeId: this.siegeId, id: d.id });
        this.host.events.emit('dragon.flight', { actorId: `siege-dragon-${d.id}`, on: true });
      }
    }
  }

  private planStrikes(): void {
    this.wavePlan = this.dragons.map((_, i) => ({ dragon: i, at: DRAGON.strikeAtS + i * DRAGON.strikeEveryS, fired: false }));
  }

  private strike(i: number): void {
    const d = this.dragons[i];
    const g = this.director.geometry;
    if (!d || !g) return;
    // The Hearthbound first-ram strike: the first ram of the siege, once.
    const ram = this.roster.firstRamBreath && !this.firstRamBreathDone ? this.director.parts?.carts.all.find((c) => c.role === 'ram' && c.active) : undefined;
    let at: Vec3;
    let shape: Strike['shape'];
    if (ram) {
      this.firstRamBreathDone = true;
      const l = ram.localPosition();
      at = { x: g.origin.x + l.x, y: this.host.player.feet.y, z: g.origin.z + l.z };
      shape = 'ram';
    } else {
      const target = this.memberPos.filter((m) => flat(m.p, g.origin) > 4);
      if (target.length === 0) return;
      const t = target[Math.floor(this.rng() * target.length)];
      at = { x: t.p.x, y: t.p.y, z: t.p.z };
      shape = d.id === 'hill-wyrm' ? 'line' : 'circle';
    }
    const len = Math.max(1e-6, flat(at, g.origin));
    const dir = { x: (g.origin.x - at.x) / len, z: (g.origin.z - at.z) / len };
    d.breathe(DRAGON.telegraphS + 0.6);
    this.strikes.push({ dragonId: d.id, mark: new BreathMark(this.host.scene, at, shape === 'line' ? DRAGON.wyrmStrafeWidth : DRAGON.breathRadius), at, shape, dir, ...(ram ? { ram } : {}) });
    this.host.events.emit('siege.dragon.breath', { siegeId: this.siegeId, dragonId: d.id, at });
  }

  private land(s: Strike): void {
    if (s.shape === 'ram' && s.ram) {
      if (s.ram.active) {
        this.host.damage.apply({ attackerId: this.fireActor.id, targetId: s.ram.actor.id, amount: s.ram.actor.maxHealth * DRAGON.firstRamPct, poise: 0, kind: 'spell', attackId: 'siege.dragon-fire' });
        s.ram.stall(DRAGON.firstRamStallS);
        this.host.events.emit('siege.ram.stall', { siegeId: this.siegeId, id: s.ram.id, seconds: DRAGON.firstRamStallS });
      }
      return;
    }
    const half = DRAGON.wyrmStrafeLen / 2;
    for (const m of this.memberPos) {
      if (m.a.dead || mercyStateOf(m.a) !== 'none') continue;
      let hit: boolean;
      if (s.shape === 'line' && s.dir) {
        const rx = m.p.x - s.at.x;
        const rz = m.p.z - s.at.z;
        const along = rx * s.dir.x + rz * s.dir.z;
        const across = Math.abs(rx * s.dir.z - rz * s.dir.x);
        hit = Math.abs(along) <= half && across <= DRAGON.wyrmStrafeWidth;
      } else hit = flat(m.p, s.at) <= DRAGON.breathRadius;
      if (!hit) continue;
      const pct = s.shape === 'line' ? DRAGON.wyrmStrafePct : DRAGON.breathPct;
      this.host.damage.apply({ attackerId: this.fireActor.id, targetId: m.a.id, amount: m.a.maxHealth * pct, poise: 0, kind: 'spell', attackId: 'siege.dragon-fire' });
    }
  }

  // ---- the sally, the sappers, the wounded beat -------------------------------------------------------

  private startSally(ram: Cart): void {
    const g = this.director.geometry;
    if (!g || this.sallyDone) return;
    this.sallyDone = true;
    const from = g.gate[Math.floor(g.gate.length / 2)] ?? { x: g.origin.x, y: this.host.player.feet.y, z: g.origin.z };
    const l = ram.localPosition();
    const to = { x: g.origin.x + l.x, y: from.y, z: g.origin.z + l.z };
    const def = namedDef('wystan') ?? { id: 'siege-rider', nameKey: 'siege.ally.halvard', model: 'knight', scale: 1, tint: 0x8a2a24, dialogueId: '', idleClip: 'idle' };
    const riders: Rider[] = [];
    for (let i = 0; i <= SALLY.riders; i++) {
      const r = new EscortRider(i === 0 ? def : { ...def, id: `siege-rider-${i}` });
      r.load(this.host.assets as unknown as HorseLoader | null, this.host.assets as unknown as NpcModelLoader | null, () => {}).catch(() => {});
      this.host.scene.add(r.root);
      riders.push({ rider: r, side: i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 1.6 });
    }
    this.sally = { t: 0, riders, from, to, hit: new Set() };
    ram.stall(SALLY.ramStallS);
    this.host.events.emit('siege.ram.stall', { siegeId: this.siegeId, id: ram.id, seconds: SALLY.ramStallS });
    this.host.events.emit('siege.ally.arrived', { siegeId: this.siegeId, id: 'sally' });
  }

  private tickSally(dt: number): void {
    const s = this.sally;
    if (!s) return;
    s.t += dt;
    const len = Math.max(1, flat(s.from, s.to));
    const run = len / SALLY.speed;
    const k = s.t <= run ? s.t / run : Math.max(0, 2 - s.t / run);
    const dx = (s.to.x - s.from.x) / len;
    const dz = (s.to.z - s.from.z) / len;
    const yaw = Math.atan2(-dx, -dz) + (s.t <= run ? 0 : Math.PI);
    for (const r of s.riders) {
      const x = s.from.x + (s.to.x - s.from.x) * k + dz * r.side;
      const z = s.from.z + (s.to.z - s.from.z) * k - dx * r.side;
      r.rider.root.position.set(x, s.from.y, z);
      r.rider.root.rotation.y = yaw;
      r.rider.setSpeed(SALLY.speed);
      r.rider.update(dt);
      for (const m of this.memberPos) {
        if (s.hit.has(m.a.id) || m.a.dead || mercyStateOf(m.a) !== 'none') continue;
        if (Math.hypot(m.p.x - x, m.p.z - z) > SALLY.reach) continue;
        s.hit.add(m.a.id);
        this.host.damage.apply({ attackerId: this.fireActor.id, targetId: m.a.id, amount: m.a.maxHealth * SALLY.hitPct, poise: 0, kind: 'melee', attackId: 'siege.sally' });
      }
    }
    if (s.t >= run * 2) this.endSally();
  }

  private endSally(): void {
    for (const r of this.sally?.riders ?? []) {
      r.rider.root.removeFromParent();
      r.rider.dispose();
    }
    this.sally = null;
  }

  private tickRams(): void {
    const g = this.director.geometry;
    if (!g) return;
    for (const c of this.director.parts?.carts.all ?? []) {
      if (c.role !== 'ram' || !c.active) continue;
      if (this.ramSpawnT === null) this.ramSpawnT = this.waveT;
      if (this.roster.sally && this.wave === 3 && !this.sallyDone && this.waveT - this.ramSpawnT >= SALLY.afterRamS) this.startSally(c);
      if (this.sapped.has(c.id)) continue;
      const l = c.localPosition();
      const p = { x: g.origin.x + l.x, z: g.origin.z + l.z };
      // Sappers stand at the gate: a ram within reach of the gate line stalls while any of them stands.
      const sappers = this.squads.some((s) => s.def.role === 'sappers' && s.standing > 0);
      if (sappers && g.gate.some((q) => flat(q, p) <= SAPPERS.reach)) {
        this.sapped.add(c.id);
        c.stall(SAPPERS.stallS);
        this.host.events.emit('siege.ram.stall', { siegeId: this.siegeId, id: c.id, seconds: SAPPERS.stallS });
      }
    }
  }

  private watchGuards(): void {
    const enemies = this.host.services.get('enemies');
    if (!enemies) return;
    for (const id of enemies.alive(M52_GUARD_SPAWNER)) this.guards.add(id);
  }

  /** The wounded beat (Q2 a): the companion in the second seat (else the first) sits out at the aid post. Once. */
  private wound(): void {
    if (this.woundedDone || this.siegeId !== 'm52') return;
    const comp = this.host.services.get('companions');
    const party = comp?.active() ?? [];
    const who = party[1] ?? party[0];
    this.woundedDone = true;
    if (!comp || !who) return;
    this.host.state.setFlag(SIEGE_FLAGS.wounded, who);
    this.sitOut(who);
    this.host.events.emit('siege.companion.wounded', { siegeId: this.siegeId, companionId: who });
  }

  private sitOut(who: string): void {
    const comp = this.host.services.get('companions');
    if (comp?.sitOut) this.hold('wounded', () => comp.sitOut!(who, SIEGE_ANCHORS.aid));
  }

  private restoreWounded(): void {
    const who = this.host.state.getFlag(SIEGE_FLAGS.wounded);
    if (this.siegeId === 'm52' && typeof who === 'string') this.sitOut(who);
  }

  // ---- the tick ---------------------------------------------------------------------------------------

  private refreshMembers(): void {
    const ids = this.director.members;
    this.memberSet = new Set(ids);
    this.memberPos = [];
    for (const id of ids) {
      const a = this.host.actors.get(id);
      if (!a || a.dead || !a.root) continue;
      a.root.getWorldPosition(this.tmp);
      this.memberPos.push({ a, p: this.tmp.clone() });
    }
  }

  fixedUpdate(dt: number): void {
    this.flush();
    this.refreshMembers();
    this.assist.fixedUpdate(dt);
    if (this.director.parked || !this.director.current || this.director.isPaused) return; // nothing runs while the set waits
    this.buildWorld();
    this.gate?.fixedUpdate(dt);
    for (const s of this.squads) s.fixedUpdate(dt);
    for (const d of this.dragons) d.update(dt);
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      if (s.mark.update(dt)) this.land(s);
      if (s.mark.done) this.strikes.splice(i, 1);
    }
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    this.tickSally(dt);
    if (this.director.phase === 'running') {
      this.waveT += dt;
      for (const p of this.wavePlan) {
        if (p.fired || this.waveT < p.at) continue;
        p.fired = true;
        this.strike(p.dragon);
      }
      this.tickRams();
      if (this.setId === 'rim-siege' && this.wave === 4) this.watchGuards();
      if (this.wave === 3 && !this.woundedDone && this.waveT >= WOUNDED.fallbackS) this.wound();
    } else if (this.breakPhase !== null) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) {
        if (this.breakPhase === 'orders') {
          if (!this.give('hold')) this.breakPhase = 'beat';
        } else {
          this.breakPhase = null;
          this.director.advance();
        }
      }
    }
  }

  /** Squads' standing and kneeling (N9's chips). */
  allies(): { id: string; role: string; standing: number; kneeling: number }[] {
    return this.squads.map((s) => ({ id: s.def.id, role: s.def.role, standing: s.standing, kneeling: s.kneeling }));
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    for (const r of [...this.releases.keys()]) this.release(r);
    this.clearOffers();
    this.endSally();
    for (const s of this.strikes.splice(0)) s.mark.dispose();
    for (const d of this.dragons.splice(0)) {
      this.host.events.emit('dragon.flight', { actorId: `siege-dragon-${d.id}`, on: false });
      d.dispose();
    }
    for (const s of this.squads.splice(0)) s.dispose();
    this.gate?.dispose();
    this.gate = null;
    this.assist.dispose();
    this.director.impactScale = 1;
    this.host.actors.despawn(this.fireActor.id);
  }
}

/** The household guard's spawner (M52 wave 4, the ram lane). */
export const M52_GUARD_SPAWNER = spawnerId('rim-siege', 3, 'ram', SIEGE_KINDS.guard, 'shield', M52_GUARD_LINE);

/** The 1-based wave of each set's first ram (Infinity: none). */
const FIRST_RAM_WAVE: Readonly<Record<string, number>> = Object.fromEntries(
  Object.keys(SET_SIEGE).map((id) => {
    const i = WAVE_SETS[id]?.waves.findIndex((w) => w.carts.some((c) => c.role === 'ram')) ?? -1;
    return [id, i >= 0 ? i + 1 : Infinity];
  }),
);

/** Waves per set (read from the defs at import). */
const SET_SIZES: Readonly<Record<string, number>> = Object.fromEntries(Object.keys(SET_SIEGE).map((id) => [id, WAVE_SETS[id]?.waves.length ?? 0]));
