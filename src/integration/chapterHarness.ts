import * as THREE from 'three';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import type { PluginStatus } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FakeIndexedDb } from '../save/__fixtures__/fakeIndexedDb';
import { heightAt } from '../terrain/heightfield';
import type { TutorialDirector } from '../tutorial/TutorialDirector';
import { TerrainColliders } from '../world/TerrainColliders';
import { TrainingDummies } from '../world/TrainingDummies';
import { World } from '../world/World';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetLoader } from '../assets/AssetLoader';
import { KnightAvatar } from '../characters/KnightAvatar';
import { ASSETS } from '../assets/AssetManifest';

/**
 * A headless game with EVERY real plugin (`PLUGIN_MODULES`), the `dummies` core service wired the way
 * src/world/startWorld.ts wires it, and the real save plugin on a `FakeIndexedDb` installed as
 * `globalThis.indexedDB`. No document and no asset loader: no start screen, no Continue modal, no humanoid models.
 *
 * Usage: `const h = await bootChapter(); await reachPhaseAStart(h); ... h.dispose();`
 */
export interface ChapterHarness {
  game: Game;
  ctx: Game['ctx'];
  world: World;
  moveModifiers: MoveModifiers;
  fake: FakeIndexedDb;
  statuses: PluginStatus[];
  events: { type: keyof GameEventMap; payload: unknown }[];
  of<K extends keyof GameEventMap>(type: K): GameEventMap[K][];
  /** Synchronous fixed ticks. */
  run(ticks: number): void;
  /** The virtual `performance.now()` (only with `virtualClock`); settable to jump forward. */
  clock: { ms: number };
  key(type: 'keydown' | 'keyup', code: string): void;
  /** A mouse button event on the canvas element (0 left, 2 right). */
  mouse(type: 'mousedown' | 'mouseup', button: number): void;
  /** Fixed ticks, draining promises and timers every 30 ticks (teleports, saves, interior transitions). */
  runAsync(ticks: number): Promise<void>;
  /** Drains pending promises and timers (the fake IndexedDB answers on timers). */
  flush(): Promise<void>;
  /** keydown, tick, keyup, tick through the InputManager's window. */
  press(code: string): void;
  /** keydown, `seconds` of ticks (plus two), keyup, tick. */
  hold(code: string, seconds: number): void;
  /**
   * Opens a dialogue through the real `dialogue` service and presses keys until it closes: Digit<n> first (a no-op
   * on a node without choices), KeyF otherwise. `choices` are the 1-based picks in order (default 1). Returns the
   * number of nodes the player read (one effective key press each).
   */
  talk(dialogueId: string, npcId: string, choices?: number[]): number;
  /** Teleports the player's feet and ticks until the collider patch there is ready, then `settle` ticks. */
  teleport(p: { x: number; y?: number; z: number }, settle?: number, yaw?: number): Promise<void>;
  /** Stands `dist` metres from `target` (offset along `from`, default +X) facing it, on the ground. */
  approach(target: THREE.Vector3Like, dist?: number, from?: { x: number; z: number }): Promise<void>;
  /** Teleports into the centre of a registered trigger volume and ticks until the real trigger reports the player inside. */
  enterTrigger(triggerId: string): Promise<void>;
  /** A trigger's centre, read from the core trigger registry; null when it is not registered. */
  triggerCentre(triggerId: string): THREE.Vector3 | null;
  /** An anchor's position; throws when it is missing. */
  anchor(id: string): THREE.Vector3;
  director(): TutorialDirector;
  dispose(): void;
}

export interface ChapterBootOptions {
  /** Reuse a fake (to load what an earlier boot saved); a fresh one by default. */
  fake?: FakeIndexedDb;
  /**
   * Character models read from public/assets on disk (Knight, Mage, ...), so the enemies plugin starts its auto
   * spawners and humanoid enemies, NPC figures and the Prior's model exist. Off: headless, no humanoids spawn.
   */
  models?: boolean;
  /**
   * Replaces `performance.now()` with a clock that advances exactly one fixed step (1000/60 ms) per tick, so
   * wall-clock-judged mechanics (the wardstone metronome) can be played on the beat. Restored on dispose.
   */
  virtualClock?: boolean;
}

const gltfCache = new Map<string, Promise<GLTF>>();

/**
 * An `AssetLoader` stand-in that parses the manifest's GLB files from disk (node:fs), memoised across boots. Loads
 * resolve only after `gate` does: as in the browser, the Knight arrives after every plugin has set up (and thread 4's
 * anchors exist), so the enemy spawners never start against a half-built world.
 */
export async function diskAssets(gate: Promise<void> = Promise.resolve()): Promise<AssetLoader> {
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(p: string): Uint8Array };
  const entries = ASSETS as Record<string, { url: string }>;
  const load = (id: string): Promise<GLTF> => {
    let p = gltfCache.get(id);
    if (!p) {
      const entry = entries[id];
      if (!entry) return Promise.reject(new Error(`unknown asset ${id}`));
      const file = readFileSync(`public/${entry.url.replace(/^\/+/, '')}`);
      const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      p = new Promise<GLTF>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
      gltfCache.set(id, p);
    }
    return p;
  };
  const loaded = new Map<string, GLTF>();
  const get = (id: string): GLTF => {
    const g = loaded.get(id);
    if (!g) throw new Error(`asset ${id} not loaded`);
    return g;
  };
  return {
    load: async (id: string) => {
      await gate;
      const g = await load(id);
      loaded.set(id, g);
      return g;
    },
    preload: async (ids: string[]) => {
      for (const id of ids) loaded.set(id, await load(id));
    },
    get,
    has: (id: string) => loaded.has(id),
    instantiate: (id: string) => cloneSkinned(get(id).scene),
    animations: (id: string) => get(id).animations,
    dispose: () => {},
  } as unknown as AssetLoader;
}

/** The virtual `performance.now()` at boot (systems that read the clock at setup, like the wardstone metronome, see this). */
export const CLOCK_START_MS = 1_000_000;

type TriggerMap = Map<string, { def: { shape: { center: THREE.Vector3Like } } }>;

export async function bootChapter(opts: ChapterBootOptions = {}): Promise<ChapterHarness> {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const fake = opts.fake ?? new FakeIndexedDb();
  (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
  const physics = new PhysicsWorld();
  await physics.init();
  const realNow = performance.now.bind(performance);
  const clock = { ms: CLOCK_START_MS };
  const originalNow = performance.now;
  if (opts.virtualClock) performance.now = () => clock.ms;
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  let openGate: () => void = () => {};
  const gate = new Promise<void>((r) => (openGate = r));
  const assets = opts.models ? await diskAssets(gate) : null;
  const game = new Game({ scene, physics, world, input, moveModifiers, assets, report: () => {} });
  const ctx = game.ctx;

  // What startWorld does for the `dummies` core service (startWorld.ts): provided before any plugin sets up.
  const dummies = new TrainingDummies(() => {});
  ctx.services.provide('dummies', dummies);
  dummies.configureBlocking({
    scene: ctx.scene,
    actors: ctx.actors,
    damage: ctx.damage,
    events: ctx.events,
    combat: ctx.combat,
    playerFeet: () => ctx.player.feet,
  });
  ctx.systems.add({ id: 'world.blockingDummies', fixedPhase: 'afterCombat', order: 50, fixedUpdate: (dt) => dummies.updateBlocking(dt) });

  const events: { type: keyof GameEventMap; payload: unknown }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const statuses = await game.loadPlugins(PLUGIN_MODULES);
  openGate();
  if (assets) {
    // As startWorld does once the Knight has loaded: the avatar drives the player's pose (and trigger position) per tick.
    const avatar = await KnightAvatar.load(assets as never, { warn: () => {} });
    world.setAvatar(avatar);
    game.attachAvatar(avatar);
  }

  const run = (n: number) => {
    for (let i = 0; i < n; i++) {
      if (opts.virtualClock) clock.ms += 1000 / 60;
      game.fixedUpdate();
    }
  };
  const flush = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const runAsync = async (n: number) => {
    for (let i = 0; i < n; i++) {
      run(1);
      if (i % 30 === 29) await flush();
    }
    await flush();
  };
  const key = (type: 'keydown' | 'keyup', code: string) => {
    const e = Object.assign(new Event(type), { code, repeat: false, preventDefault: () => {} });
    // Node stamps events with its own clock; the input map reads `timeStamp` as performance time.
    Object.defineProperty(e, 'timeStamp', { value: opts.virtualClock ? clock.ms : realNow() });
    win.dispatchEvent(e);
  };
  const press = (code: string) => {
    key('keydown', code);
    run(1);
    key('keyup', code);
    run(1);
  };
  const mouse = (type: 'mousedown' | 'mouseup', button: number) => {
    const e = Object.assign(new Event(type), { button, preventDefault: () => {} });
    Object.defineProperty(e, 'timeStamp', { value: opts.virtualClock ? clock.ms : realNow() });
    element.dispatchEvent(e);
  };
  const hold = (code: string, seconds: number) => {
    key('keydown', code);
    run(Math.ceil(seconds * 60) + 2);
    key('keyup', code);
    run(1);
  };
  let choicesMade = 0;
  game.events.on('dialogue.choice', () => choicesMade++);
  const talk = (dialogueId: string, npcId: string, choices: number[] = []) => {
    const dialogue = ctx.services.require('dialogue');
    if (!dialogue.start(dialogueId, npcId)) throw new Error(`dialogue ${dialogueId} with ${npcId} did not open`);
    const picks = [...choices];
    let nodes = 0;
    for (let guard = 0; guard < 100 && dialogue.active; guard++) {
      nodes++;
      const before = choicesMade;
      press(`Digit${picks[0] ?? 1}`);
      if (choicesMade !== before) {
        picks.shift();
        continue;
      }
      press('KeyF');
    }
    if (dialogue.active) throw new Error(`dialogue ${dialogueId} did not close`);
    return nodes;
  };

  const triggerCentre = (id: string): THREE.Vector3 | null => {
    const e = (ctx.triggers as unknown as { triggers: TriggerMap }).triggers.get(id);
    return e ? new THREE.Vector3(e.def.shape.center.x, e.def.shape.center.y, e.def.shape.center.z) : null;
  };
  const teleport = async (p: { x: number; y?: number; z: number }, settle = 2, yaw?: number) => {
    const h = ctx.player.teleport({ x: p.x, y: p.y ?? heightAt(p.x, p.z) + 0.05, z: p.z }, yaw);
    for (let i = 0; i < 600 && !h.ready(); i++) {
      run(1);
      if (i % 30 === 29) await flush();
    }
    run(settle);
  };
  const approach = async (target: THREE.Vector3Like, dist = 1.2, from = { x: 1, z: 0 }) => {
    const l = Math.hypot(from.x, from.z) || 1;
    const x = target.x + (from.x / l) * dist;
    const z = target.z + (from.z / l) * dist;
    // Yaw 0 faces -Z: the facing vector is (-sin yaw, -cos yaw).
    const yaw = Math.atan2(-(target.x - x), -(target.z - z));
    await teleport({ x, y: Math.max(heightAt(x, z), target.y) + 0.05, z }, 2, yaw);
  };
  const enterTrigger = async (id: string) => {
    const c = triggerCentre(id);
    if (!c) throw new Error(`no trigger ${id}`);
    // Feet a little under the centre so the actor's reference point lands inside short boxes.
    await teleport({ x: c.x, y: Math.max(c.y - 0.5, heightAt(c.x, c.z) + 0.05), z: c.z }, 1);
    for (let i = 0; i < 30 && !ctx.triggers.isInside(id); i++) run(1);
    if (!ctx.triggers.isInside(id)) throw new Error(`player not inside ${id} (feet ${ctx.player.feet.toArray().map((v) => v.toFixed(1))}, centre ${c.toArray()})`);
  };
  const anchor = (id: string) => {
    const a = ctx.anchors.find(id);
    if (!a) throw new Error(`no anchor ${id}`);
    return new THREE.Vector3(a.position.x, a.position.y, a.position.z);
  };
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  let disposed = false;
  return {
    game, ctx, world, moveModifiers, fake, statuses, events, of, run, clock, key, mouse, runAsync, flush, press, hold, talk, teleport, approach, enterTrigger, triggerCentre, anchor,
    director: () => (globalThis as { __tutorial?: TutorialDirector }).__tutorial!,
    dispose() {
      if (disposed) return;
      disposed = true;
      game.dispose();
      world.dispose();
      if (opts.virtualClock) performance.now = originalNow;
      if ((globalThis as { indexedDB?: unknown }).indexedDB === fake.factory) delete (globalThis as { indexedDB?: unknown }).indexedDB;
    },
  };
}

/**
 * Seeds `file` (a stored `SaveFile`, e.g. a Phase A fixture) into both slots the save plugin reads (`autosave` and
 * `slot-0`) BEFORE boot, boots every plugin, presses Continue (`save.continueNow()`) and ticks until the load has
 * settled. `loaded` is what `continueNow` resolved (false when the save was refused).
 */
export async function bootFromSave(
  file: unknown,
  opts: Omit<ChapterBootOptions, 'fake'> = { models: true },
): Promise<ChapterHarness & { loaded: boolean }> {
  const fake = new FakeIndexedDb();
  fake.seed('autosave', JSON.parse(JSON.stringify(file)));
  fake.seed('slot-0', JSON.parse(JSON.stringify(file)));
  const h = await bootChapter({ ...opts, fake });
  await h.flush();
  h.run(2);
  const pending = h.ctx.services.require('save').continueNow();
  let loaded: boolean | null = null;
  void pending.then((v) => (loaded = v));
  for (let i = 0; i < 40 && loaded === null; i++) await h.runAsync(15);
  await h.runAsync(30);
  return Object.assign(h, { loaded: loaded === true });
}
