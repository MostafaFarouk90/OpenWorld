import type { ActorId } from '../actors/Actor';
import type { GameContext } from '../core/Game';
import type { WavesService } from '../core/coreServices';
import type { Vec3 } from '../physics/PhysicsWorld';
import { Defenders, type DefenderBodyFactory } from './defenders';
import { spawnerId } from './spawners';
import { BarricadeFx, BarricadeState, Carts, type Cart, type CartOutcome, type StructureHost } from './structures';
import { cartId, CART, DIRECTOR } from './tuning';
import type { StructureKind, WaveCartDef, WaveSetDef, WaveSpawnDef, WavesSaved } from './types';
import type { CartRole } from './structures';
import './events';

export type DirectorHost = StructureHost & Pick<GameContext, 'anchors' | 'services' | 'player'>;

export interface DirectorOptions {
  defs: Readonly<Record<string, WaveSetDef>>;
  makeBody: DefenderBodyFactory;
  warn?: (message: string) => void;
}

/** `enemies.view` states that no longer hold a wave open: killed, or spared, calmed or released and walking off. */
const GONE_STATES: ReadonlySet<string> = new Set(['dead', 'spared', 'calmed', 'released']);

type Phase = 'running' | 'intermission' | 'beat';

interface Run {
  def: WaveSetDef;
  index: number;
  phase: Phase;
  /** False while parked (loaded far from the barricade): nothing is built. */
  live: boolean;
  /** Seconds left in an intermission or a restart beat. */
  timer: number;
  /** Barricade health when the current wave started. */
  startHealth: number;
  /** Parked: the barricade health to restore when the set is rebuilt. */
  parkedHealth?: number;
  /** N4: the barricade fell in this wave of a `breach` set (the court is being cleared). */
  breached: boolean;
}

type Item = { at: number; spawn: WaveSpawnDef } | { at: number; cart: WaveCartDef; n: number };

interface WaveRun {
  t: number;
  items: Item[];
  cursor: number;
  members: ActorId[];
  carts: Cart[];
}

interface World {
  def: WaveSetDef;
  origin: { x: number; z: number };
  barricadePoints: Vec3[];
  lanes: Map<string, Vec3>;
  yaw: number;
  barricade: BarricadeState;
  fx: BarricadeFx;
  carts: Carts;
  defenders: Defenders;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The wave director: idle, intermission, running(index), done (plans/act2-A7.md with its review folds). Registered as the
 * `waves` service; a system in the `rules` phase ticks it. With no set running a tick returns at once.
 */
export class WaveDirector implements WavesService {
  private run: Run | null = null;
  private world: World | null = null;
  private wave: WaveRun | null = null;
  private readonly completed: string[] = [];
  private pending: { def: WaveSetDef; index: number; phase: 'running' | 'intermission'; barricade?: number } | null = null;
  private sawEntry = false;
  private readonly warned = new Set<string>();
  private readonly offs: Array<() => void> = [];
  private readonly warn: (m: string) => void;
  private _impactScale = 1;

  constructor(
    private readonly host: DirectorHost,
    private readonly opts: DirectorOptions,
  ) {
    this.warn = opts.warn ?? ((m) => console.warn(`[waves] ${m}`));
    this.offs.push(
      host.events.on('actor.died', (p) => {
        if (p.actorId === host.actors.player.id) this.onPlayerDied();
      }),
      host.events.on('save.loaded', () => this.onSaveLoaded()),
    );
  }

  // ---- WavesService -----------------------------------------------------------------------------------

  get current(): { defId: string; index: number } | null {
    return this.run ? { defId: this.run.def.id, index: this.run.index } : null;
  }

  start(defId: string): boolean {
    const def = this.opts.defs[defId];
    if (!def) return false;
    if (this.run || this.completed.includes(defId)) return false;
    if (!this.host.services.get('enemies')) {
      this.warn(`cannot start '${defId}': no enemies service`);
      return false;
    }
    this.run = { def, index: 0, phase: 'running', live: true, timer: 0, startHealth: def.barricadeHealth, breached: false };
    if (!this.build(def)) {
      this.run = null;
      return false;
    }
    this.startWave(0, false);
    return true;
  }

  stop(): void {
    if (!this.run && !this.world) return;
    this.teardown();
    this.run = null;
    this.pending = null;
  }

  /**
   * Stable ids and sizes for the HUD (A15): the barricade and every cart of every set. Undefined for anything else. N4:
   * a cart also names its role ('brazier' or 'ram').
   */
  structure(id: string): { kind: StructureKind; maxHealth: number; role?: CartRole } | undefined {
    for (const def of Object.values(this.opts.defs)) {
      if (def.barricadeId === id) return { kind: 'barricade', maxHealth: def.barricadeHealth };
      for (let w = 0; w < def.waves.length; w++) {
        const carts = def.waves[w].carts;
        for (let n = 1; n <= carts.length; n++) if (cartId(def.id, w, n) === id) return { kind: 'cart', maxHealth: CART.maxHealth, role: carts[n - 1].role ?? 'brazier' };
      }
    }
    return undefined;
  }

  /**
   * N4: scales every cart strike on the barricade from now on (the siege's `brace` order halves them). 1 is the shipped
   * value; a bad value reads as 1. The caller puts it back.
   */
  set impactScale(k: number) {
    this._impactScale = Number.isFinite(k) && k >= 0 ? k : 1;
  }

  get impactScale(): number {
    return this._impactScale;
  }

  /**
   * N4: ends the current intermission now (the siege's break ends on an order and the gong, not a timer). False when
   * no live set is in an intermission.
   */
  advance(): boolean {
    const run = this.run;
    if (!run || !run.live || run.phase !== 'intermission' || !this.world) return false;
    this.startWave(run.index + 1, false);
    return true;
  }

  /** N4: heals the barricade by `n` health (R19's engineers between waves), never above its maximum; false when none stands. */
  mendBarricade(n: number): boolean {
    const world = this.world;
    if (!world || !(n > 0) || world.barricade.destroyed) return false;
    world.barricade.restore(Math.min(world.barricade.maxHealth, world.barricade.health + n));
    world.fx.reset(world.barricade.health);
    return true;
  }

  /**
   * N4: takes `n` health off the barricade from outside the carts (the siege's foot soldiers at the gate). The fall is
   * handled on the next tick as any fall is (a breach in a `breach` set, else the shipped fail). False when none stands.
   */
  damageBarricade(n: number): boolean {
    const world = this.world;
    if (!world || !this.run?.live || this.run.phase !== 'running' || !(n > 0) || world.barricade.destroyed) return false;
    world.barricade.damage(n);
    world.fx.show(world.barricade.health);
    return true;
  }

  /** N4: the barricade's health now and its maximum (null with no set built). */
  get barricade(): { health: number; max: number; destroyed: boolean } | null {
    const b = this.world?.barricade;
    return b ? { health: b.health, max: b.maxHealth, destroyed: b.destroyed } : null;
  }

  /** N4: the current wave's live members (actor ids; gone ones filtered out). */
  get members(): readonly ActorId[] {
    return this.wave ? this.wave.members.filter((id) => !this.gone(id)) : [];
  }

  /** N4: the set's origin and gate points (engine), null with no set built. */
  get geometry(): { origin: { x: number; z: number }; gate: readonly Vec3[]; lanes: ReadonlyMap<string, Vec3> } | null {
    const w = this.world;
    return w ? { origin: w.origin, gate: w.barricadePoints, lanes: w.lanes } : null;
  }

  /** N4: the barricade fell in the current wave of a `breach` set. */
  get breached(): boolean {
    return this.run?.breached ?? false;
  }

  /** N4: live wave members (not gone) plus live carts, the number `maxAlive` caps. 0 with no wave running. */
  get alive(): number {
    const wave = this.wave;
    if (!wave || !this.world) return 0;
    let n = 0;
    for (const id of wave.members) if (!this.gone(id)) n++;
    for (const c of wave.carts) if (c.active) n++;
    return n;
  }

  /** Live objects (tests). */
  get parts(): { carts: Carts; defenders: Defenders; barricade: BarricadeState } | null {
    return this.world ? { carts: this.world.carts, defenders: this.world.defenders, barricade: this.world.barricade } : null;
  }

  get phase(): Phase | null {
    return this.run?.phase ?? null;
  }

  get parked(): boolean {
    return !!this.run && !this.run.live;
  }

  // ---- persistence ------------------------------------------------------------------------------------

  serialize(): WavesSaved {
    const done = this.completed.length > 0 ? [...this.completed] : undefined;
    let out: WavesSaved;
    if (this.run) {
      const r = this.run;
      const phase = r.phase === 'intermission' ? 'intermission' : 'running';
      const health = r.phase === 'intermission' ? this.world?.barricade.health ?? r.parkedHealth ?? r.startHealth : r.startHealth;
      out = { defId: r.def.id, index: r.index, phase };
      if (health < r.def.barricadeHealth) out.barricade = health;
      if (done) out.done = done;
    } else if (this.completed.length > 0) {
      const last = this.completed[this.completed.length - 1];
      const def = this.opts.defs[last];
      out = { defId: last, index: Math.max(0, (def?.waves.length ?? 1) - 1), phase: 'done' };
      if (this.completed.length > 1) out.done = this.completed.slice(0, -1);
    } else {
      out = { defId: null, index: 0, phase: 'idle' };
    }
    return out;
  }

  load(data: unknown, version: number): void {
    this.sawEntry = true;
    this.teardown();
    this.run = null;
    this.pending = null;
    this.completed.length = 0;
    if (version !== 1 || !isRecord(data)) {
      this.warn(`dropped a waves save (version ${String(version)})`);
      return;
    }
    const known = (id: unknown): id is string => typeof id === 'string' && !!this.opts.defs[id];
    if (Array.isArray(data['done'])) for (const id of data['done']) if (known(id) && !this.completed.includes(id)) this.completed.push(id);
    const phase = data['phase'];
    if (phase === 'idle' || data['defId'] === null) return;
    const defId = data['defId'];
    if (!known(defId)) {
      this.warn(`dropped a waves save naming unknown set ${JSON.stringify(defId)}`);
      return;
    }
    const def = this.opts.defs[defId];
    const index = data['index'];
    if (phase === 'done') {
      if (!this.completed.includes(defId)) this.completed.push(defId);
      return;
    }
    if ((phase !== 'running' && phase !== 'intermission') || typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= def.waves.length) {
      this.warn(`dropped a corrupt waves save for '${defId}'`);
      return;
    }
    if (phase === 'intermission' && index + 1 >= def.waves.length) {
      this.warn(`dropped a waves save for '${defId}': intermission after the last wave`);
      return;
    }
    const b = data['barricade'];
    const barricade = typeof b === 'number' && Number.isFinite(b) && b > 0 && b <= def.barricadeHealth ? b : undefined;
    this.pending = { def, index, phase, barricade };
  }

  // ---- events -----------------------------------------------------------------------------------------

  /** After `save.loaded`: a pre-A7 save (no entry) leaves the director idle; a stored run resumes near the barricade, else parks. */
  private onSaveLoaded(): void {
    if (!this.sawEntry) {
      this.teardown();
      this.run = null;
      this.pending = null;
      this.completed.length = 0;
      return;
    }
    this.sawEntry = false;
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    this.run = {
      def: p.def,
      index: p.index,
      phase: p.phase,
      live: false,
      timer: 0,
      startHealth: p.barricade ?? p.def.barricadeHealth,
      parkedHealth: p.barricade,
      breached: false,
    };
    this.tryResume();
  }

  private onPlayerDied(): void {
    if (this.run?.live && this.run.phase === 'running') this.fail();
  }

  // ---- the tick ---------------------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    const run = this.run;
    if (!run) return; // idle: free
    if (this.paused(run.def)) return;
    if (!run.live) {
      this.tryResume();
      return;
    }
    const world = this.world;
    if (!world) return;
    world.carts.fixedUpdate(dt);
    world.defenders.fixedUpdate(dt);
    switch (run.phase) {
      case 'running':
        this.tickWave(run, world, dt);
        break;
      case 'intermission':
        run.timer -= dt;
        if (run.timer <= 0) this.startWave(run.index + 1, false);
        break;
      case 'beat':
        run.timer -= dt;
        if (run.timer <= 0) this.startWave(run.index, true);
        break;
    }
  }

  private tickWave(run: Run, world: World, dt: number): void {
    const wave = this.wave!;
    wave.t += dt;
    const cap = run.def.maxAlive;
    let alive = cap !== undefined ? this.alive : 0;
    while (wave.cursor < wave.items.length && wave.items[wave.cursor].at <= wave.t + 1e-9) {
      // N4: a due item waits for a slot under the set's alive cap (carts count one each).
      if (cap !== undefined && alive >= cap) break;
      const before = wave.members.length + wave.carts.length;
      this.issue(run, world, wave.items[wave.cursor++]);
      alive += wave.members.length + wave.carts.length - before;
    }
    if (world.barricade.destroyed) {
      if (!run.def.breach) {
        this.fail();
        return;
      }
      if (!run.breached) {
        run.breached = true;
        world.fx.collapse();
        this.host.events.emit('waves.breached', { defId: run.def.id, index: run.index });
      }
    }
    if (wave.cursor < wave.items.length) return;
    if (world.carts.threats > 0 || wave.carts.some((c) => c.active)) return;
    if (!wave.members.every((id) => this.gone(id))) return;
    this.cleared(run, world);
  }

  private issue(run: Run, world: World, item: Item): void {
    const wave = this.wave!;
    if ('spawn' in item) {
      const s = item.spawn;
      const enemies = this.host.services.get('enemies');
      const sid = spawnerId(run.def.id, run.index, s.lane, s.kind, s.role, s.line);
      const ids = enemies?.spawnGroup(sid, { count: 1, aggro: true }) ?? [];
      if (ids.length === 0) this.warnOnce(`spawn:${sid}`, `spawner '${sid}' spawned nothing (missing anchor or spawner?)`);
      wave.members.push(...ids);
      return;
    }
    const lane = world.lanes.get(item.cart.lane);
    const target = lane ? nearest(world.barricadePoints, lane) : null;
    if (!lane || !target) {
      this.warnOnce(`lane:${item.cart.lane}`, `cart lane '${item.cart.lane}' has no anchor; the cart is skipped`);
      return;
    }
    // A3's lanes run 115 to 235 m up the road; the cart joins it `CART.startDistance` from the line, in sight of the player.
    const dx = lane.x - target.x;
    const dz = lane.z - target.z;
    const len = Math.hypot(dx, dz);
    const k = len > CART.startDistance ? CART.startDistance / len : 1;
    const start = { x: target.x + dx * k, y: target.y + (lane.y - target.y) * k, z: target.z + dz * k };
    const role: CartRole = item.cart.role ?? 'brazier';
    const defId = run.def.id;
    const cart = world.carts.spawn({
      id: cartId(run.def.id, run.index, item.n),
      start,
      end: target,
      origin: world.origin,
      onResolve: (c, how) => this.onCart(c, how),
      ...(item.cart.role ? { role: item.cart.role } : {}),
      onWindup: (c) => this.host.events.emit('waves.cart.windup', { defId, id: c.id, role }),
      // N4: a ram in a breach set strikes again and again while the barricade stands (Act 2's sets have no rams).
      ...(role === 'ram' && run.def.breach
        ? { onStrike: (c: Cart) => this.strikeBarricade(c, role), canStrike: () => !!this.world && !this.world.barricade.destroyed }
        : {}),
    });
    if (cart) wave.carts.push(cart);
  }

  private onCart(cart: Cart, how: CartOutcome): void {
    const world = this.world;
    if (how !== 'arrived' || !world) return;
    // A ram that went inert at a breach resolves 'arrived' with no strike left to land.
    if (world.barricade.destroyed) return;
    this.strikeBarricade(cart, cart.role);
  }

  private strikeBarricade(cart: Cart, role: CartRole): void {
    const world = this.world;
    const run = this.run;
    if (!world || !run || world.barricade.destroyed) return;
    const base = run.def.cartImpact?.[role] ?? CART.impactDamage;
    const damage = base * this._impactScale;
    world.barricade.damage(damage);
    world.fx.show(world.barricade.health);
    this.host.events.emit('waves.cart.struck', { defId: run.def.id, id: cart.id, role, damage });
    if (world.barricade.destroyed) world.fx.collapse();
  }

  private gone(id: ActorId): boolean {
    const a = this.host.actors.get(id);
    if (!a || a.dead) return true;
    const st = this.host.services.get('enemies')?.view(id)?.state;
    return st !== undefined && GONE_STATES.has(st);
  }

  private cleared(run: Run, world: World): void {
    const { def, index } = run;
    // N4: a breach is patched before anything reads the barricade (the intermission save, the next wave's start).
    if (run.breached && def.breach) {
      run.breached = false;
      world.barricade.restore(Math.max(1, Math.round(def.barricadeHealth * def.breach.patchToPct)));
      world.fx.reset(world.barricade.health);
    }
    this.host.events.emit('wave.cleared', { defId: def.id, index });
    if (index >= def.waves.length - 1) {
      this.completed.push(def.id);
      this.teardown();
      this.run = null;
      return;
    }
    run.phase = 'intermission';
    run.timer = def.intermission ?? DIRECTOR.intermissionSeconds;
    world.defenders.reviveAll();
  }

  /** The barricade fell or the player died: despawn the wave, wait a beat, restart the same wave. */
  private fail(): void {
    const run = this.run;
    const world = this.world;
    if (!run || !world) return;
    this.host.events.emit('waves.failed', { defId: run.def.id, index: run.index });
    this.clearWave(run);
    world.carts.despawnAll();
    run.phase = 'beat';
    run.timer = run.def.restartBeat ?? DIRECTOR.restartBeatSeconds;
    if (world.barricade.destroyed) world.fx.collapse();
  }

  private startWave(index: number, restart: boolean): void {
    const run = this.run!;
    const world = this.world!;
    const def = run.def;
    run.index = index;
    run.phase = 'running';
    run.breached = false;
    if (restart) {
      world.barricade.restore(run.startHealth);
    } else {
      run.startHealth = world.barricade.health;
      world.barricade.announce();
    }
    world.fx.reset(world.barricade.health);
    this.clearWave(run); // fresh spawners
    world.defenders.reviveAll();
    const w = def.waves[index];
    const items: Item[] = [];
    for (const spawn of w.spawns) for (let i = 0; i < spawn.count; i++) items.push({ at: spawn.delay + i * spawn.stagger, spawn });
    w.carts.forEach((cart, i) => items.push({ at: cart.delay, cart, n: i + 1 }));
    items.sort((a, b) => a.at - b.at);
    this.wave = { t: 0, items, cursor: 0, members: [], carts: [] };
    this.host.events.emit('wave.started', { defId: def.id, index });
  }

  /** Despawns the current wave's enemies and resets its spawners. */
  private clearWave(run: Run): void {
    const enemies = this.host.services.get('enemies');
    if (enemies) {
      const ids = new Set<string>();
      for (const s of run.def.waves[run.index]?.spawns ?? []) ids.add(spawnerId(run.def.id, run.index, s.lane, s.kind, s.role, s.line));
      for (const id of ids) enemies.reset(id);
    }
    this.wave = null;
  }

  // ---- building and resuming --------------------------------------------------------------------------

  private build(def: WaveSetDef): boolean {
    this.teardown();
    const find = (id: string): Vec3 | null => this.host.anchors.find(id)?.position ?? null;
    const barricadePoints = def.barricadeAnchors.map(find).filter((p): p is Vec3 => p !== null);
    if (barricadePoints.length === 0) {
      this.warn(`cannot build '${def.id}': none of its barricade anchors exist (${def.barricadeAnchors.join(', ')})`);
      return false;
    }
    const origin = {
      x: barricadePoints.reduce((s, p) => s + p.x, 0) / barricadePoints.length,
      z: barricadePoints.reduce((s, p) => s + p.z, 0) / barricadePoints.length,
    };
    const lanes = new Map<string, Vec3>();
    for (const [key, anchor] of Object.entries(def.lanes)) {
      const p = find(anchor);
      if (p) lanes.set(key, p);
    }
    let lx = 0;
    let lz = 0;
    for (const p of lanes.values()) {
      lx += p.x - origin.x;
      lz += p.z - origin.z;
    }
    const yaw = lanes.size > 0 ? Math.atan2(-lx, -lz) : 0;
    const posts: Vec3[] = [];
    for (const post of def.defenders) {
      const p = find(post.anchor);
      if (!p) {
        this.warnOnce(`post:${post.anchor}`, `militia post '${post.anchor}' has no anchor; skipped`);
        continue;
      }
      posts.push({ x: p.x + (post.dx ?? 0), y: p.y, z: p.z + (post.dz ?? 0) });
    }
    const defenders = new Defenders(this.host, this.opts.makeBody);
    defenders.build(posts, yaw);
    this.world = {
      def,
      origin,
      barricadePoints,
      lanes,
      yaw,
      barricade: new BarricadeState(def.barricadeId, def.barricadeHealth, this.host.events),
      fx: new BarricadeFx(this.host.scene, barricadePoints, def.barricadeHealth),
      carts: new Carts(this.host),
      defenders,
    };
    return true;
  }

  private tryResume(): void {
    const run = this.run;
    if (!run || run.live || this.paused(run.def)) return;
    if (!this.build(run.def)) {
      this.run = null;
      return;
    }
    run.live = true;
    const world = this.world!;
    if (run.parkedHealth !== undefined) world.barricade.restore(run.parkedHealth);
    if (run.phase === 'intermission') this.startWave(run.index + 1, false);
    else this.startWave(run.index, false);
  }

  /** Despawns everything the set built. Emits nothing. */
  private teardown(): void {
    const run = this.run;
    if (this.world) {
      if (run) this.clearWave(run);
      this.world.carts.dispose();
      this.world.defenders.despawnAll();
      this.world.fx.dispose();
      this.world = null;
    }
    this.wave = null;
  }

  /** Beyond the radius, indoors, travelling or dead: timers, carts and the beat all wait. */
  private paused(def: WaveSetDef): boolean {
    const player = this.host.actors.player;
    if (player.dead) return true;
    const inside = this.host.services.get('interiors')?.current ?? null;
    if (inside !== (def.interior ?? null)) return true;
    if (this.host.services.get('waystones')?.travelling) return true;
    const origin = this.world?.origin ?? this.originOf(def);
    if (!origin) return true;
    const f = this.host.player.feet;
    return Math.hypot(f.x - origin.x, f.z - origin.z) > (def.radius ?? DIRECTOR.activeRadius);
  }

  private originOf(def: WaveSetDef): { x: number; z: number } | null {
    const pts = def.barricadeAnchors.map((id) => this.host.anchors.find(id)?.position).filter((p): p is Vec3 => !!p);
    if (pts.length === 0) return null;
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(message);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.teardown();
    this.run = null;
  }
}

function nearest(points: readonly Vec3[], from: Vec3): Vec3 | null {
  let best: Vec3 | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
