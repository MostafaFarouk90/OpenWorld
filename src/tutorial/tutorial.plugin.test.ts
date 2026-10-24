import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { ThirdPersonCamera } from '../rendering/ThirdPersonCamera';
import type { TutorialDirector } from './TutorialDirector';
import { tutorialFromQuery } from './tutorial.plugin';

// Every test boots the whole manifest (3 to 5 s alone, more under load): the 5 s default is not a safe limit (review R3-3).
vi.setConfig({ testTimeout: 30_000 });

let physics: PhysicsWorld;
const disposers: (() => void)[] = [];

beforeEach(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  for (const d of disposers.splice(0)) d();
  physics.dispose();
  vi.restoreAllMocks();
});

/** Every real plugin, headless (no document: no start screen, no DOM widgets). */
async function boot(opts: { cameraRig?: ThirdPersonCamera } = {}) {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, cameraRig: opts.cameraRig, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const statuses = await game.loadPlugins(PLUGIN_MODULES);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    game.dispose();
    world.dispose();
  };
  disposers.push(dispose);
  const director = (globalThis as { __tutorial?: TutorialDirector }).__tutorial!;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  return { game, world, moveModifiers, events, statuses, director, run, dispose };
}

describe('tutorial plugin on the real game', () => {
  it('sets up with every other plugin and registers its quests, anchors and persistable', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'tutorial')?.state).toBe('ok');
    const quests = t.game.ctx.services.get('quests')!;
    for (const id of ['t01', 't02', 't04', 't15', 't-skirmish']) expect(quests.get(id)).toBeDefined();
    expect(t.game.ctx.anchors.find('tutorial.gaut.chapel')).toBeDefined();
  });

  it('begin(full) starts T01 with its quest, the verb locks and no Second Wind', async () => {
    const t = await boot();
    t.director.begin('full');
    t.run(2);
    expect(t.director.beat).toBe('t01');
    expect(t.game.ctx.services.get('quests')!.state('t01')).toBe('active');
    expect(t.moveModifiers.isActionLocked('attack2')).toBe(true);
    expect(t.moveModifiers.isActionLocked('surge')).toBe(true);
    expect(t.moveModifiers.isActionLocked('attack1')).toBe(false);
    expect(t.game.ctx.services.get('combatVerbs')!.secondWindCharges).toBe(0);
    expect(t.events.some((e) => e.type === 'tutorial.beat')).toBe(true);
  });

  it('T05 sets the Heartshard flag, plays the crack cutscene and asks for the churchyard wraiths after it', async () => {
    const t = await boot();
    const enemies = t.game.ctx.services.get('enemies')!;
    const spawn = vi.spyOn(enemies, 'spawnGroup');
    t.director.begin('full', 't05');
    t.run(2);
    expect(t.game.ctx.state.getBool('tutorial.heartshard-awakened')).toBe(true);
    expect(t.game.ctx.input.contexts.top()).toBe('cutscene');
    expect(spawn).not.toHaveBeenCalled();
    t.run(200);
    expect(t.game.ctx.input.contexts.top()).toBe('gameplay');
    // Headless there is no enemy model, so the spawn finds nothing and is retried.
    expect(spawn).toHaveBeenCalledWith('t05.churchyard', expect.objectContaining({ aggro: true }));
    const started = t.events.filter((e) => e.type === 'cutscene.started').length;
    const ended = t.events.filter((e) => e.type === 'cutscene.ended').length;
    expect(started).toBe(ended);
  });

  it('T12 to T13 starts M01 (journal) while the gated spawner keeps its wraiths back', async () => {
    const t = await boot();
    t.director.begin('full', 't13');
    t.run(2);
    expect(t.game.ctx.services.get('quests')!.state('m01')).toBe('active');
    expect(t.game.ctx.services.get('enemies')!.alive('m01.lanes')).toHaveLength(0);
    expect(t.game.ctx.services.get('progression')!.level).toBe(2);
  });

  it('a lethal hit in a crisis beat after Second Wind restarts the beat instead of killing', async () => {
    const t = await boot();
    t.director.begin('full', 't09');
    t.run(2);
    const p = t.game.ctx.player.actor;
    const hit = () =>
      t.game.ctx.damage.apply({ attackerId: null, targetId: p.id, amount: p.maxHealth * 3, poise: 0, kind: 'script', unblockable: true });
    hit();
    expect(p.dead).toBe(false); // Second Wind
    t.run(120); // past its invulnerability
    hit();
    expect(p.dead).toBe(false); // tutorial restart
    expect(t.director.restartInFlight).toBe(true);
  });

  it('skipping T04 while the real vow dialogue is open lands on T05, not past it', async () => {
    const t = await boot();
    t.director.begin('full', 't04');
    t.run(2);
    t.director.onEvent({ type: 'trigger', id: 'trg.t04.chapel' });
    t.director.onEvent({ type: 'interact', id: 'kneel:chapel' });
    t.run(2);
    expect(t.game.ctx.services.get('dialogue')!.active).toBeTruthy();
    t.director.skipCurrent();
    t.run(2);
    expect(t.director.beat).toBe('t05');
    const beats = t.events.filter((e) => e.type === 'tutorial.beat').map((e) => e.payload as { beatId: string; state: string });
    expect(beats.filter((b) => b.beatId === 't05' && b.state === 'started')).toHaveLength(1);
    expect(beats.some((b) => b.beatId === 't05' && b.state === 'skipped')).toBe(false);
  });

    it('the cutscene camera renders in the tutorial world band, after VFX and damage numbers', async () => {
    const t = await boot();
    // Probes at the band edges pin the order inside 300..399.
    t.game.systems.add({ id: 'probe.299', renderPhase: 'world', order: 299, render: () => {} });
    t.game.systems.add({ id: 'probe.400', renderPhase: 'world', order: 400, render: () => {} });
    const order = t.game.systems.order('world');
    const at = order.indexOf('tutorial-cutscene-camera');
    expect(at).toBeGreaterThan(order.indexOf('probe.299'));
    expect(at).toBeLessThan(order.indexOf('probe.400'));
    expect(at).toBeGreaterThan(order.indexOf('enemies.render'));
  });

    it('teardown mid-cutscene emits cutscene.ended once and lifts the locks', async () => {
    const t = await boot();
    t.director.begin('full', 't05');
    t.run(2);
    t.dispose();
    const started = t.events.filter((e) => e.type === 'cutscene.started').length;
    const ended = t.events.filter((e) => e.type === 'cutscene.ended').length;
    expect(started).toBe(1);
    expect(ended).toBe(1);
    expect(t.moveModifiers.isActionLocked('attack2')).toBe(false);
    expect(t.moveModifiers.state().freeze).toBe(false);
  });
});

describe('arrival facing', () => {
  const rig = () =>
    new ThirdPersonCamera(
      new THREE.PerspectiveCamera(60),
      { consumeMouseDelta: () => ({ dx: 0, dy: 0 }), consumeWheel: () => 0 } as never,
      { raycast: () => null } as never,
      {} as never,
    );
  /** Degrees between the camera's forward and the direction to an anchor. */
  const offAxis = (t: Awaited<ReturnType<typeof boot>>, cam: ThirdPersonCamera, anchor: string) => {
    const a = t.game.ctx.anchors.find(anchor)!.position;
    const p = t.game.ctx.player.feet;
    const f = cam.toWorld(0, 1);
    const dx = a.x - p.x;
    const dz = a.z - p.z;
    return (Math.acos((f.x * dx + f.z * dz) / Math.hypot(dx, dz)) * 180) / Math.PI;
  };

  it('a fresh run starts looking at the village gate and the scarecrow', async () => {
    const cam = rig();
    const t = await boot({ cameraRig: cam });
    cam.yaw = 0; // as booted: looking south, away from the village
    t.director.begin('full');
    t.run(2);
    expect(offAxis(t, cam, 'brightwater.scarecrow')).toBeLessThan(15);
  });

  it('a ?tutorial= jump faces that beat\'s first target (T05: the churchyard wraiths)', async () => {
    const cam = rig();
    const t = await boot({ cameraRig: cam });
    t.director.begin('full', 't05');
    t.run(2);
    expect(offAxis(t, cam, 'spawn.t05.wraith-3')).toBeLessThan(40);
  });

  it('a save load arrives facing the saved heading', async () => {
    const cam = rig();
    const t = await boot({ cameraRig: cam });
    // The save plugin restores the player through the waystones' safe teleport (save.plugin.ts).
    void t.game.ctx.services.get('waystones')!.safeTeleport({ x: 0, y: 0, z: 40 }, Math.PI / 2);
    t.run(120); // past the fade-out
    expect(cam.yaw).toBeCloseTo(Math.PI / 2);
    expect(t.game.ctx.player.facingYaw).toBeCloseTo(Math.PI / 2);
  });
});

describe('tutorialFromQuery', () => {
  it('reads modes and beat jumps and ignores junk', () => {
    expect(tutorialFromQuery('?tutorial=veteran')).toEqual({ mode: 'veteran' });
    expect(tutorialFromQuery('?tutorial=t09')).toEqual({ mode: 'full', at: 't09' });
    expect(tutorialFromQuery('?tutorial=skirmish')).toBeNull();
    expect(tutorialFromQuery('?tutorial=bogus')).toBeNull();
    expect(tutorialFromQuery('')).toBeNull();
  });
});

describe('clarity wiring on the real game', () => {
  const frame = (t: Awaited<ReturnType<typeof boot>>, n = 1) => {
    for (let i = 0; i < n; i++) {
      t.run(1);
      t.game.render(1, 1 / 60);
    }
  };
  const target = (t: Awaited<ReturnType<typeof boot>>) => t.game.ctx.services.get('tutorial')!.target();
  const near = (t: Awaited<ReturnType<typeof boot>>, anchor: string) => {
    const p = target(t);
    const a = t.game.ctx.anchors.find(anchor)!.position;
    return !!p && Math.hypot(p.x - a.x, p.z - a.z) < 0.01;
  };

  it('the tutorial service points at the current step: the gate, then the scarecrow, and nothing in a fight', async () => {
    const t = await boot();
    t.director.begin('full');
    frame(t, 2);
    expect(near(t, 'brightwater.gate')).toBe(true);
    t.director.onEvent({ type: 'trigger', id: 'trg.t01.gate' });
    frame(t, 2);
    expect(near(t, 'brightwater.scarecrow')).toBe(true);
  });

  it('a fight has no beacon: the enemies are the target', async () => {
    const t = await boot();
    t.director.begin('full', 't09');
    frame(t, 2);
    expect(target(t)).toBeNull();
  });

  it('T03 points at the first talk still open', async () => {
    const t = await boot();
    t.director.begin('full', 't03');
    frame(t, 2);
    expect(near(t, 'npc-post.stane')).toBe(true);
    t.game.ctx.services.get('quests')!.completeObjective('t03', 'o1');
    frame(t, 1);
    expect(near(t, 'npc-post.edda')).toBe(true);
  });

  it('T12 points at the barrel while the flask is still owed', async () => {
    const t = await boot();
    t.director.begin('full', 't12');
    frame(t, 2);
    expect(near(t, 'kettlewick.barrel')).toBe(true);
  });

  it('a save load restores the beacon on the loaded step', async () => {
    const t = await boot();
    t.director.begin('full', 't07');
    frame(t, 2);
    expect(near(t, 'lane.cart')).toBe(true);
    const saved = t.director.serialize();
    t.dispose();
    // A fresh game that loads the save (begin would be ignored on a run that has begun).
    const t2 = await boot();
    frame(t2, 2);
    expect(near(t2, 'lane.cart')).toBe(false);
    t2.director.load(saved);
    t2.director.onSaveLoaded();
    frame(t2, 4);
    expect(t2.director.beat).toBe('t07');
    expect(near(t2, 'lane.cart')).toBe(true);
  });

  it('the village burns from the crack and the townsfolk are gone until the fires are out (M01)', async () => {
    const t = await boot();
    t.director.begin('full', 't03');
    frame(t, 2);
    const fires = () => t.game.ctx.scene.getObjectByName('crisis-dressing')!.children.filter((c) => c.name.startsWith('crisis-fire:') && c.visible).length;
    const folk = () => t.game.ctx.scene.children.filter((c) => c.name.startsWith('townsfolk.') && c.visible).length;
    expect(fires()).toBe(0);
    expect(folk()).toBeGreaterThan(0);
    t.game.ctx.state.setFlag('tutorial.heartshard-awakened', true); // the crack
    frame(t, 2);
    expect(fires()).toBeGreaterThan(0);
    expect(fires()).toBeLessThanOrEqual(3);
    expect(folk()).toBe(0);
    t.game.ctx.state.setFlag('tutorial.complete', true);
    frame(t, 1);
    expect(folk()).toBe(0); // still burning: nobody idles beside the fires
    const q = t.game.ctx.services.get('quests')!;
    q.start('m01');
    q.complete('m01');
    frame(t, 1);
    expect(folk()).toBeGreaterThan(0);
  });

  it('a run past the T12 kit step marks the kit objective done, so the journal objective is current', async () => {
    const t = await boot();
    t.director.begin('full', 't13');
    frame(t, 2);
    expect(t.game.ctx.state.getBool('tutorial.t12.kitDone')).toBe(true);
    expect(t.game.ctx.services.get('quests')!.state('t12')).toBe('completed');
  });

  it('learning a passive at T13 completes its quest at once (QA round 3)', async () => {
    const t = await boot();
    t.director.begin('full', 't13');
    frame(t, 2);
    expect(t.game.ctx.services.get('progression')!.learn('knight.rimBash').ok).toBe(true);
    frame(t, 3);
    expect(t.director.beat).toBe('t14');
    expect(t.game.ctx.services.get('quests')!.state('t13')).toBe('completed');
  });

  it('an old save made mid-T12 (quest holds only o1) still completes the bakery beat (review B1)', async () => {
    const t = await boot();
    t.director.begin('full', 't12');
    frame(t, 2);
    const inv = t.game.ctx.services.get('inventory')!;
    inv.equip('squires-arming-sword' as never);
    frame(t, 2);
    const save = t.director.serialize();
    // What a save from before the step objectives holds: t12 active with only the journal objective.
    (t.game.ctx.persist as unknown as { get(k: string): { load(d: unknown): void } }).get('quests').load({
      quests: { ...JSON.parse(JSON.stringify((t.game.ctx.persist as unknown as { get(k: string): { serialize(): { quests: object } } }).get('quests').serialize().quests)), t12: { state: 'active', objectives: { o1: 0 } } },
    });
    const q = t.game.ctx.services.get('quests')!;
    expect(q.objectives('t12')[0].progress).toBe(0);
    t.director.load(save);
    t.director.onSaveLoaded();
    frame(t, 2);
    expect(q.objectives('t12')[0].progress).toBe(1); // reconciled with the director's one equipped item
    inv.equip('gauts-spare-tabard' as never);
    t.director.onEvent({ type: 'itemUsed' } as never);
    frame(t, 3);
    expect(q.objectives('t12')[0].done).toBe(true);
    t.game.ctx.events.emit('interact', { interactableId: 'use:t12-journal-open' } as never);
    frame(t, 3);
    expect(q.state('t12')).toBe('completed');
  });

  it('a feedback sound that throws never stalls a beat transition (review M2)', async () => {
    const t = await boot();
    // Headless has no audio service; stand in one whose every key is unregistered.
    const play = vi.fn(() => {
      throw new Error('Unknown sound');
    });
    (t.game.ctx.services as unknown as { provide(k: string, v: unknown): void }).provide('audio', { play });
    t.director.begin('full', 't07');
    frame(t, 2);
    t.director.onEvent({ type: 'trigger', id: 'trg.t07.cart' });
    frame(t, 1);
    expect(t.director.currentStep).toBe(1);
    t.director.onEvent({ type: 'trigger', id: 'trg.t07.fence' });
    frame(t, 2);
    expect(t.director.beat).toBe('t08');
    expect(play).toHaveBeenCalled();
  });

  it('beat cards: a fresh run names the beat "1 of 15", a finished beat shows its done card first, a reload shows none', async () => {
    const t = await boot();
    const cards = () => (globalThis as { __tutorialCards?: { beats: { showing: { kind: string; kicker: string; title: string } | null } } }).__tutorialCards!.beats;
    t.director.begin('full');
    frame(t, 2);
    expect(cards().showing).toMatchObject({ kind: 'start', kicker: 'Knighting Day · 1 of 15' });
    t.director.onEvent({ type: 'trigger', id: 'trg.t01.gate' });
    t.game.ctx.state.setFlag('place.scarecrow.toppled', true);
    t.director.onEvent({ type: 'flag', key: 'place.scarecrow.toppled' } as never);
    frame(t, 2);
    expect(t.director.beat).toBe('t02');
    expect(cards().showing?.kind).toBe('done');
    frame(t, 160); // past the done card
    expect(cards().showing).toMatchObject({ kind: 'start', kicker: 'Knighting Day · 2 of 15' });
    const saved = t.director.serialize();
    t.dispose();
    const t2 = await boot();
    t2.director.load(saved);
    t2.director.onSaveLoaded();
    frame(t2, 4);
    expect(t2.director.beat).toBe('t02');
    expect(cards().showing).toBeNull();
  });

  it('a save load in the same session clears the cards about the beat before it', async () => {
    const t = await boot();
    const cards = (globalThis as { __tutorialCards?: { beats: { showing: unknown }; lines: { count(s: string): number } } }).__tutorialCards!;
    t.director.begin('full', 't03');
    frame(t, 2);
    expect(cards.beats.showing).not.toBeNull();
    t.game.ctx.events.emit('save.loaded', { slot: 'auto' });
    expect(cards.beats.showing).toBeNull();
    expect(cards.lines.count('subtitle')).toBe(0);
  });

  it('the ?act1= jump (kettlewick, T15 skipped at once) leaves no T15 lines or beat card up', async () => {
    const t = await boot();
    const cards = (globalThis as { __tutorialCards?: { beats: { showing: unknown }; lines: { count(s: string): number } } }).__tutorialCards!;
    t.director.begin('kettlewick');
    frame(t, 2);
    expect(t.director.beat).toBe('t15');
    expect(cards.lines.count('subtitle')).toBeGreaterThan(0);
    t.director.skipCurrent();
    frame(t, 2);
    expect(t.director.complete).toBe(true);
    expect(cards.lines.count('subtitle')).toBe(0);
    expect(cards.beats.showing).toBeNull();
  });

  it('a skipped beat drops its lines before the next beat\'s lines show; the tutorial\'s end drops the last beat\'s', async () => {
    const t = await boot();
    const cards = (globalThis as { __tutorialCards?: { beats: { showing: { kind: string } | null }; lines: { count(s: string): number } } }).__tutorialCards!;
    t.director.begin('full', 't15');
    frame(t, 2);
    const t15Lines = cards.lines.count('subtitle');
    expect(t15Lines).toBeGreaterThan(0);
    // A normal finish of the last beat: its lines go, its done card stays.
    t.game.ctx.events.emit('tutorial.beat', { beatId: 't15', state: 'completed' });
    expect(cards.lines.count('subtitle')).toBe(0);
    t.dispose();
    // A skip mid-tutorial clears only the skipped beat's lines; the next beat's own lines still show.
    const t2 = await boot();
    const cards2 = (globalThis as { __tutorialCards?: { lines: { count(s: string): number } } }).__tutorialCards!;
    t2.director.begin('full', 't14');
    frame(t2, 2);
    t2.director.skipCurrent();
    frame(t2, 2);
    expect(t2.director.beat).toBe('t15');
    expect(cards2.lines.count('subtitle')).toBe(t15Lines);
  });

  it('cards wait out a cutscene instead of running out unseen', async () => {
    const t = await boot();
    const cards = (globalThis as { __tutorialCards?: { beats: { showing: unknown } } }).__tutorialCards!;
    t.director.begin('full', 't03');
    frame(t, 2);
    t.game.ctx.hud.setVisible(false);
    for (let i = 0; i < 400; i++) t.game.render(1, 1 / 60);
    expect(cards.beats.showing).not.toBeNull();
    t.game.ctx.hud.setVisible(true);
    for (let i = 0; i < 300; i++) t.game.render(1, 1 / 60);
    expect(cards.beats.showing).toBeNull();
  });

  it('?act1= style state (M01 and M02 done) shows no fire', async () => {
    const t = await boot();
    t.game.ctx.state.setFlag('tutorial.heartshard-awakened', true);
    const q = t.game.ctx.services.get('quests')!;
    for (const id of ['m01', 'm02']) {
      q.start(id);
      q.complete(id);
    }
    frame(t, 2);
    const fires = t.game.ctx.scene.getObjectByName('crisis-dressing')!.children.filter((c) => c.name.startsWith('crisis-fire:') && c.visible);
    expect(fires).toHaveLength(0);
  });
});
