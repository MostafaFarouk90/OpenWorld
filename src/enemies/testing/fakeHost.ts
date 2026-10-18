import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CombatSystem } from '../../combat/CombatSystem';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { AttackWindowSource } from '../../combat/types';
import { isWindowActive } from '../../combat/AttackWindow';
import type { WeaponTracer } from '../../combat/WeaponTracer';
import { KNIGHT } from '../../config/constants';
import type {
  ActorId,
  ActorInitLike,
  ActorLike,
  AnchorLike,
  DamageModifierLike,
  DamageOutcome,
  DamageRequestLike,
  DamageResultLike,
  EnemyEvents,
  EnemyHost,
  InteractableLike,
  InventoryPort,
  NavPort,
  QuestsPortLike,
  TorchState,
  Team,
} from '../ports';

/**
 * A small stand-in for thread 0's core, enough to run enemies headless in tests: a queued event bus,
 * an actor registry with owners, a damage resolver with modifiers and the batch order of
 * actors-and-damage.md section 4, a combat registry over the real CombatSystem with attack.window
 * tracking, anchors, interactables and flags. Not shipped; the plugin adapts the real core.
 */

let knight: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null = null;

export async function loadKnight(): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  if (knight) return knight;
  (globalThis as { self?: unknown }).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(p: string): { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
  };
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    knight = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as never, rej));
  } finally {
    console.warn = warn;
    console.error = error;
  }
  return knight!;
}

export class FakeBus {
  private readonly listeners = new Map<string, Array<(p: unknown) => void>>();
  readonly log: Array<{ type: string; payload: unknown }> = [];
  private queue: Array<[string, unknown]> = [];
  private dispatching = false;
  private batching = 0;

  /** Listeners currently registered for `type`, or for every type (leak checks). */
  listenerCount(type?: string): number {
    if (type !== undefined) return this.listeners.get(type)?.length ?? 0;
    let n = 0;
    for (const l of this.listeners.values()) n += l.length;
    return n;
  }

  on<K extends keyof EnemyEvents>(type: K, l: (p: EnemyEvents[K]) => void): () => void {
    const list = this.listeners.get(type) ?? [];
    const entry = l as (p: unknown) => void;
    list.push(entry);
    this.listeners.set(type, list);
    return () => {
      const cur = this.listeners.get(type) ?? [];
      const i = cur.indexOf(entry);
      if (i >= 0) cur.splice(i, 1);
    };
  }

  emit<K extends keyof EnemyEvents>(type: K, payload: EnemyEvents[K]): void {
    this.queue.push([type, payload]);
    if (this.dispatching || this.batching) return;
    this.flush();
  }

  batch(fn: () => void): void {
    this.batching++;
    try {
      fn();
    } finally {
      this.batching--;
    }
    if (!this.batching && !this.dispatching) this.flush();
  }

  of<K extends keyof EnemyEvents>(type: K): EnemyEvents[K][] {
    return this.log.filter((e) => e.type === type).map((e) => e.payload as EnemyEvents[K]);
  }

  private flush(): void {
    this.dispatching = true;
    try {
      while (this.queue.length) {
        const [type, payload] = this.queue.shift()!;
        this.log.push({ type, payload });
        for (const l of [...(this.listeners.get(type) ?? [])]) l(payload);
      }
    } finally {
      this.dispatching = false;
    }
  }
}

/** The inventory service's gold half, as thread 5 provides it; records every spend. */
export class FakeInventory implements InventoryPort {
  readonly spent: Array<{ amount: number; reason: string }> = [];
  readonly added: number[] = [];
  constructor(public gold: number) {}
  addGold(n: number): void {
    if (Number.isFinite(n) && n > 0) {
      this.gold += Math.floor(n);
      this.added.push(Math.floor(n));
    }
  }
  takeGold(n: number, reason: 'theft' | 'script' = 'script'): number {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const taken = Math.min(this.gold, Math.floor(n));
    this.gold -= taken;
    if (taken > 0) this.spent.push({ amount: taken, reason });
    return taken;
  }
}

export class FakeActor implements ActorLike {
  team: Team;
  level: number;
  health: number;
  maxHealth: number;
  poise: number;
  maxPoise: number;
  hittable = true;
  invulnerable = false;
  root: THREE.Object3D | null;
  data: Record<string, unknown> = {};
  readonly spawnTag?: string;
  constructor(
    readonly id: ActorId,
    readonly kind: string,
    init: ActorInitLike,
  ) {
    this.team = init.team;
    this.level = init.level ?? 1;
    this.maxHealth = this.health = init.maxHealth;
    this.maxPoise = this.poise = init.maxPoise ?? 0;
    this.root = init.root ?? null;
    this.spawnTag = init.spawnTag;
  }
  get dead(): boolean {
    return this.health <= 0;
  }
  worldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.root ? this.root.getWorldPosition(out) : out;
  }
  restorePoise(n?: number): void {
    this.poise = n === undefined ? this.maxPoise : Math.min(this.maxPoise, this.poise + n);
  }
}

const CAN_DAMAGE: Record<Team, Team[]> = {
  player: ['hostile', 'neutral'],
  ally: ['hostile', 'neutral'],
  hostile: ['player', 'ally', 'neutral'],
  neutral: [],
};

export interface FakeHostOptions {
  heightAt?: (x: number, z: number) => number;
  /** Player feet at start. */
  playerFeet?: { x: number; y: number; z: number };
}

/** The whole fake core plus a player with real Knight hurtboxes. */
export class FakeHost {
  readonly scene = new THREE.Scene();
  readonly bus = new FakeBus();
  readonly combatSystem = new CombatSystem();
  readonly actorMap = new Map<ActorId, FakeActor>();
  readonly owners = new Map<unknown, ActorId>();
  readonly modifiers: Array<{ id: string; fn: DamageModifierLike; order: number }> = [];
  readonly interactables = new Map<string, InteractableLike>();
  readonly anchorMap = new Map<string, AnchorLike>();
  readonly flags = new Map<string, boolean | number | string>();
  readonly warnings: string[] = [];
  readonly moveModifiers = new Map<string, { speedScale?: number }>();
  /** Open attack windows by actor id, as the core adapter tracks them. */
  readonly windows: Array<{ actorId: ActorId; phase: 'open' | 'close'; attackId: string }> = [];
  private readonly attackers: Array<{ actorId: ActorId; tracer: WeaponTracer; window: AttackWindowSource; open: boolean }> = [];
  readonly player: FakeActor;
  readonly playerModel: THREE.Object3D;
  readonly playerHurtboxes: HurtboxSet;
  readonly playerFeet: THREE.Vector3;
  loud = false;
  vfx: { dissolve(root: THREE.Object3D, s: number): Promise<void>; spawnEffect?(id: string, t: { position: { x: number; y: number; z: number } }, p?: Record<string, number | string | boolean>): unknown } | undefined;
  /** Thread 2's spells service when a test provides it (`useShard`, or the older `addBurn`). */
  spells: { useShard?(g: number, s: string): void; addBurn?(n: number, s: string): void } | undefined = undefined;
  /** The core boss registry fake: tests set `bossOpen` and read `bossReleases`. */
  bossStates = new Map<string, { actorId: ActorId; releaseOpen: boolean; outcome: 'defeated' | 'released' | null }>();
  bossReleaseResult = true;
  readonly bossReleases: string[] = [];
  /** Thread 3's quests service, when a test provides it. */
  quests: QuestsPortLike | undefined;
  /** The torch `provideTorch()` hands out; null means none carried. */
  torchState: TorchState | null = null;
  lockOnTarget: ActorId | null = null;
  /** Thread 3a's interiors service, when a test provides it. */
  interiors: { current: string | null } | undefined;
  /** Thread 3a's nav service, when a test provides it. */
  nav: NavPort | undefined;
  /** Thread 5's inventory service (gold), when a test provides it (`provideInventory`). */
  inventory: FakeInventory | undefined;
  private readonly gateWatchers: Array<{ test: (get: (k: string) => boolean) => boolean; listener: (open: boolean, cause: 'init' | 'flag' | 'load' | 'recheck') => void; open: boolean }> = [];
  private counter = 0;

  /** Sets a flag as the real state does: stores it, re-evaluates the gates and emits `flag.changed`. */
  setFlag(key: string, value: boolean | number | string): void {
    const previous = this.flags.get(key);
    this.flags.set(key, value);
    this.evaluateGates('flag');
    this.bus.emit('flag.changed', { key, value, previous });
  }

  /** What a save load does: gates re-evaluate, then `save.loaded`. */
  loadFlags(flags: Record<string, boolean | number | string>): void {
    this.flags.clear();
    for (const [k, v] of Object.entries(flags)) this.flags.set(k, v);
    this.evaluateGates('load');
    this.bus.emit('save.loaded', { slot: 'test' });
  }

  private evaluateGates(cause: 'flag' | 'load'): void {
    const get = (k: string) => Boolean(this.flags.get(k));
    for (const w of [...this.gateWatchers]) {
      const open = w.test(get);
      if (open === w.open) continue;
      w.open = open;
      w.listener(open, cause);
    }
  }

  constructor(
    knightScene: THREE.Object3D,
    private readonly opts: FakeHostOptions = {},
  ) {
    this.host = this.makeHost();
    this.playerFeet = new THREE.Vector3(opts.playerFeet?.x ?? 0, opts.playerFeet?.y ?? 0, opts.playerFeet?.z ?? -20);
    const model = SkeletonUtils.clone(knightScene);
    model.rotation.y = Math.PI;
    model.scale.setScalar(KNIGHT.modelScale);
    const root = new THREE.Group();
    root.add(model);
    this.scene.add(root);
    this.playerModel = root;
    root.position.copy(this.playerFeet);
    root.updateMatrixWorld(true);
    this.player = new FakeActor('player', 'player', { kind: 'player', team: 'player', maxHealth: 100, maxPoise: 40, root });
    this.actorMap.set('player', this.player);
    this.playerHurtboxes = new HurtboxSet(model, undefined, model);
    this.owners.set(model, 'player');
    this.combatSystem.addTarget(this.playerHurtboxes);
    this.combatSystem.bus.subscribe((e) => {
      const attackerId = this.owners.get(e.attacker);
      const targetId = this.owners.get(e.target);
      if (!attackerId || !targetId) return;
      const atk = this.attackers.find((a) => a.actorId === attackerId);
      this.apply({
        attackerId,
        targetId,
        amount: e.damage,
        poise: e.damage,
        kind: 'melee',
        bone: e.bone,
        attackId: atk?.window.clipName,
        swingId: atk?.window.swingId,
      });
    });
  }

  /** Gives the world an inventory service holding `gold`. */
  provideInventory(gold: number): FakeInventory {
    this.inventory = new FakeInventory(gold);
    return this.inventory;
  }

  /** Makes the quests service expose a carried torch (`torchState`); the shape is the plan's, not yet on the real service. */
  provideTorch(state: TorchState | null = null): void {
    this.torchState = state;
    this.quests ??= { active: () => [] };
    this.quests.carriedTorch = () => this.torchState;
  }

  /** A lit torch at (x, y, z) with the given contact radius. */
  setTorch(x: number, y: number, z: number, radius = 0.5, lit = true): void {
    this.provideTorch({
      lit,
      radius,
      position: (out) => {
        out.x = x;
        out.y = y;
        out.z = z;
        return out;
      },
    });
  }

  /** Moves the player (and its hurtboxes). */
  movePlayer(x: number, z: number): void {
    this.playerFeet.set(x, this.heightAt(x, z), z);
    this.playerModel.position.copy(this.playerFeet);
    this.playerModel.updateMatrixWorld(true);
  }

  heightAt = (x: number, z: number): number => this.opts.heightAt?.(x, z) ?? 0;

  defineAnchor(id: string, x: number, z: number, tags: string[] = [], yaw = 0): void {
    this.anchorMap.set(id, { id, position: { x, y: this.heightAt(x, z), z }, yaw, tags });
  }

  /** The combat step of the fixed tick: trace every attacker, track window open and close. */
  combatStep(dt: number): void {
    for (const a of this.attackers) this.trackWindow(a);
    this.combatSystem.update(dt);
  }

  private trackWindow(a: { actorId: ActorId; window: AttackWindowSource; open: boolean }): void {
    const active = isWindowActive(a.window);
    if (active && !a.open) {
      a.open = true;
      this.windows.push({ actorId: a.actorId, phase: 'open', attackId: a.window.clipName });
    } else if (!active && a.open) {
      a.open = false;
      this.windows.push({ actorId: a.actorId, phase: 'close', attackId: a.window.clipName });
    }
  }

  apply(req: DamageRequestLike): DamageResultLike | null {
    const target = this.actorMap.get(req.targetId);
    const attacker = req.attackerId ? (this.actorMap.get(req.attackerId) ?? null) : null;
    if (!target || target.dead) return null;
    if (!(req.amount >= 0) || !(req.poise >= 0)) return null;
    if (!target.hittable) return null;
    if (attacker && !CAN_DAMAGE[attacker.team].includes(target.team)) return null;
    const r = { ...req, outcome: (target.invulnerable ? 'immune' : 'hit') as DamageOutcome };
    for (const m of [...this.modifiers].sort((a, b) => a.order - b.order)) m.fn(r, target, attacker);
    const dealt = r.outcome === 'immune' || r.outcome === 'parried' ? 0 : Math.max(0, r.amount);
    const poiseDealt = r.outcome === 'immune' || r.outcome === 'parried' ? 0 : Math.max(0, r.poise);
    target.health = Math.max(0, target.health - dealt);
    const before = target.poise;
    target.poise = Math.max(0, target.poise - poiseDealt);
    const staggered = before > 0 && target.poise === 0;
    const killed = target.health <= 0;
    const result: DamageResultLike = {
      ...r,
      dealt,
      poiseDealt,
      healthAfter: target.health,
      killed,
      saved: false,
      staggered,
    };
    this.bus.batch(() => {
      this.bus.emit('damage.dealt', result);
      if (staggered) this.bus.emit('actor.staggered', { actorId: target.id, byId: req.attackerId });
      if (killed)
        this.bus.emit('actor.died', {
          actorId: target.id,
          killerId: req.attackerId,
          kind: target.kind,
          team: target.team,
          level: target.level,
        });
    });
    return result;
  }

  /** damage.stagger: poise only, actor.staggered when it breaks. */
  stagger(id: ActorId, byId: ActorId | null): void {
    const t = this.actorMap.get(id);
    if (!t || t.dead) return;
    t.poise = 0;
    this.bus.emit('actor.staggered', { actorId: id, byId });
  }

  readonly host: EnemyHost;

  private makeHost(): EnemyHost {
    const self = this;
    return {
    scene: this.scene,
    physics: null,
    actors: {
      spawn: (init) => {
        const id = `${init.kind}#${++this.counter}`;
        const a = new FakeActor(id, init.kind, init);
        this.actorMap.set(id, a);
        if (init.owner) this.owners.set(init.owner, id);
        return a;
      },
      despawn: (id) => {
        if (!this.actorMap.has(id) || id === 'player') return;
        this.actorMap.delete(id);
        for (const [o, a] of this.owners) if (a === id) this.owners.delete(o);
        for (const a of [...this.attackers]) if (a.actorId === id) this.removeAttacker(a);
        this.bus.emit('actor.despawned', { actorId: id });
      },
      get: (id) => this.actorMap.get(id),
      bindOwner: (actor, owner) => {
        if (!this.actorMap.has(actor.id)) throw new Error(`FakeHost: "${actor.id}" is not registered`);
        this.owners.set(owner, actor.id);
        return () => {
          if (this.owners.get(owner) === actor.id) this.owners.delete(owner);
        };
      },
      get player() {
        return self.player;
      },
    },
    damage: {
      addModifier: (id, fn, order = 0) => {
        const entry = { id, fn, order };
        this.modifiers.push(entry);
        return () => {
          const i = this.modifiers.indexOf(entry);
          if (i >= 0) this.modifiers.splice(i, 1);
        };
      },
      kill: (id, killerId = null) => {
        const a = this.actorMap.get(id);
        if (!a || a.dead) return;
        a.health = 0;
        this.bus.emit('actor.died', { actorId: id, killerId, kind: a.kind, team: a.team, level: a.level });
      },
      heal: (id, amount) => {
        const a = this.actorMap.get(id);
        if (!a || a.dead || !(amount > 0)) return 0;
        const before = a.health;
        a.health = Math.min(a.maxHealth, a.health + amount);
        return a.health - before;
      },
    },
    combat: {
      bus: this.combatSystem.bus,
      addAttacker: (actorId, tracer, window) => {
        // As the real CombatRegistry.watch: one window per tracer attacker.
        if (this.attackers.some((a) => a.tracer.attacker === tracer.attacker)) {
          throw new Error(`CombatRegistry: attacker of "${actorId}" is already watched`);
        }
        const entry = { actorId, tracer, window, open: false };
        this.attackers.push(entry);
        this.combatSystem.addAttacker(tracer, window);
        return () => this.removeAttacker(entry);
      },
      addTarget: (h) => {
        this.combatSystem.addTarget(h);
        return () => this.combatSystem.removeTarget(h);
      },
    },
    events: this.bus,
    anchors: {
      find: (id) => this.anchorMap.get(id),
      withTag: (tag) => [...this.anchorMap.values()].filter((a) => a.tags?.includes(tag)),
    },
    interaction: {
      register: (i) => {
        if (this.interactables.has(i.id)) throw new Error(`duplicate interactable ${i.id}`);
        this.interactables.set(i.id, i);
        return () => this.interactables.delete(i.id);
      },
    },
    state: {
      getBool: (key, fallback = false) => {
        const v = this.flags.get(key);
        return typeof v === 'boolean' ? v : fallback;
      },
      setFlag: (key, value) => this.setFlag(key, value),
    },
    gates: {
      watch: (test, listener) => {
        const w = { test, listener, open: test((k) => Boolean(this.flags.get(k))) };
        this.gateWatchers.push(w);
        listener(w.open, 'init');
        return () => {
          const i = this.gateWatchers.indexOf(w);
          if (i >= 0) this.gateWatchers.splice(i, 1);
        };
      },
    },
    services: {
      get: ((name: string) => {
        if (name === 'vfx') return this.vfx;
        if (name === 'lockOn') return { targetId: this.lockOnTarget };
        if (name === 'quests') return this.quests;
        if (name === 'interiors') return this.interiors;
        if (name === 'nav') return this.nav;
        if (name === 'spells') return this.spells;
        if (name === 'inventory') return this.inventory;
        return undefined;
      }) as EnemyHost['services']['get'],
    },
    bosses: {
      state: (id) => self.bossStates.get(id) ?? null,
      release: (id) => {
        self.bossReleases.push(id);
        if (self.bossReleaseResult) {
          const st = self.bossStates.get(id);
          if (st) {
            st.releaseOpen = false;
            st.outcome = 'released';
          }
        }
        return self.bossReleaseResult;
      },
    },
    player: {
      get actor() {
        return self.player;
      },
      get feet() {
        return self.playerFeet;
      },
      collider: null,
      loud: () => this.loud,
      addMoveModifier: (source, mod) => {
        this.moveModifiers.set(source, mod);
        return () => this.moveModifiers.delete(source);
      },
    },
    torch: { carried: () => this.quests?.carriedTorch?.() ?? null },
    heightAt: (x, z) => this.heightAt(x, z),
    warn: (m) => void this.warnings.push(m),
    };
  }

  get attackerCount(): number {
    return this.attackers.length;
  }

  get targetCount(): number {
    return this.combatSystem.targetCount;
  }

  private removeAttacker(entry: { actorId: ActorId; tracer: WeaponTracer; window: AttackWindowSource; open: boolean }): void {
    const i = this.attackers.indexOf(entry);
    if (i < 0) return;
    this.attackers.splice(i, 1);
    this.combatSystem.removeAttacker(entry.tracer);
    if (entry.open) this.windows.push({ actorId: entry.actorId, phase: 'close', attackId: entry.window.clipName });
  }

  /** Clone source for the manager's model factory. */
  static factory(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) {
    return () => ({ model: SkeletonUtils.clone(gltf.scene), clips: gltf.animations });
  }
}

