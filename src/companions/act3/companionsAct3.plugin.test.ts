// K5 (plans/act3-K5.md): the companions-act3 plugin on a reduced manifest (core, companions, companions-act3): companions
// in movement modes (v0.7 item 25), the event barks and the post-reveal variant, and Hrolf's reach while inactive.
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import type { MovementMode } from '../../movement/types';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { heightAt } from '../../terrain/heightfield';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import companionsPlugin, { PARTY_GATE_FLAG, companionControllers } from '../companions.plugin';
import { partyPost } from '../CompanionController';
import { TOBB } from '../tobb';
import { HROLF } from '../hrolf';
import { TOBB_TUNING } from '../tuning';
import { REVEAL_FLAG } from './banter';
import act3Plugin from './companionsAct3.plugin';
import spellsPlugin from '../../spells/spells.plugin';
import { QUENCHED_EVERYWHERE_FLAG, QUENCHED_SEEN_FLAG } from './quenched';
import { YSMERYTH_TRIAL_ID } from './eventBarks';
import '../types';
import './types';

const TIMEOUT = 30_000;

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

type V = { x: number; y: number; z: number };

async function boot(extra: GamePlugin[] = []) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const w = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world: w, input, moveModifiers, report: () => {} });
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const mods: Record<string, PluginModule> = Object.fromEntries(
    [corePlugin, companionsPlugin, act3Plugin, ...extra].map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]),
  );
  await game.loadPlugins(mods);
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const svc = () => ctx.services.require('companions');
  const ctrl = (id: string) => companionControllers().find((c) => c.def.id === id)!;
  const root = (id = 'tobb') => ctx.actors.get(svc().actorId(id)!)!.root!;
  const distToPlayer = (id = 'tobb') => {
    const q = root(id).position;
    const f = ctx.player.feet;
    return Math.hypot(q.x - f.x, q.y - f.y, q.z - f.z);
  };
  const teleportPlayer = (x: number, z: number, yaw?: number) => {
    const h = ctx.player.teleport({ x, y: heightAt(x, z), z }, yaw);
    for (let i = 0; i < 600 && !h.ready(); i++) run(1);
  };
  const mode = (m: MovementMode, at?: V) => ctx.services.require('movementMode').set(m, at ? { position: at, yaw: 0 } : null);
  const done = () => {
    game.dispose();
    w.dispose();
  };
  return { game, ctx, run, of, svc, ctrl, root, distToPlayer, teleportPlayer, mode, events, done };
}

async function joined(extra: GamePlugin[] = []) {
  const t = await boot(extra);
  t.ctx.state.setFlag(TOBB.joinFlag, true);
  t.run(120);
  expect(t.distToPlayer()).toBeLessThan(5);
  return t;
}

describe('companions-act3: boot', () => {
  it('provides act3Allies and registers its strings', async () => {
    const t = await boot();
    expect(t.ctx.services.get('act3Allies')).toBeTruthy();
    expect(t.ctx.strings.t('hud.aura.quenched.on')).toMatch(/Quenched/);
    t.done();
  }, TIMEOUT);
});

describe('companions-act3: the Quenched aura through the real spells service', () => {
  it('registers the Burn gain slot once; after M34 a gain of 10 is 7.5; the toast shows once', async () => {
    const t = await boot([spellsPlugin]);
    t.run(2);
    const spells = t.ctx.services.require('spells');
    spells.addBurn(10, 'test');
    expect(spells.burn).toBe(10);
    spells.clearBurn('test');
    t.ctx.state.setFlag(QUENCHED_EVERYWHERE_FLAG, true);
    spells.addBurn(10, 'test');
    expect(spells.burn).toBeCloseTo(7.5);
    expect(t.of('hud.toast').filter((e) => e.textKey === 'hud.aura.quenched.on')).toHaveLength(1);
    expect(t.ctx.state.getFlag(QUENCHED_SEEN_FLAG)).toBe(true);
    t.ctx.events.emit('region.entered', { regionId: 'greyfen', previous: null });
    expect(t.of('hud.toast').filter((e) => e.textKey === 'hud.aura.quenched.on')).toHaveLength(1);
    t.done();
  }, TIMEOUT);
});

describe('companions-act3: movement modes (item 25)', () => {
  it.each(['dive', 'ferry', 'glide'] as const)('%s hides the companion; walk brings him back behind the player', async (m) => {
    const t = await joined();
    const f = { ...t.ctx.player.feet };
    t.mode(m, f);
    t.run(2);
    expect(t.ctrl('tobb').isHidden).toBe(true);
    expect(t.root().visible).toBe(false);
    // The player travels 80 m while the mode lasts: he stays hidden (no teleport, no bark).
    t.teleportPlayer(f.x - 80, f.z, Math.PI / 2);
    t.ctx.events.emit('interior.entered', { interiorId: 'greyfen-deeps' } as never);
    t.run(30);
    expect(t.root().visible).toBe(false);
    t.mode('walk');
    t.run(3);
    expect(t.root().visible).toBe(true);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  }, TIMEOUT);

  it('haul keeps him following', async () => {
    const t = await joined();
    t.mode('haul');
    t.run(10);
    expect(t.root().visible).toBe(true);
    expect(t.ctrl('tobb').isModeHidden).toBe(false);
    t.done();
  }, TIMEOUT);

  it('hideForMode is idempotent both ways', async () => {
    const t = await joined();
    const c = t.ctrl('tobb');
    c.hideForMode(false);
    t.run(2);
    expect(t.root().visible).toBe(true);
    c.hideForMode(true);
    c.hideForMode(true);
    t.run(2);
    expect(t.root().visible).toBe(false);
    c.hideForMode(false);
    c.hideForMode(false);
    t.run(3);
    expect(t.root().visible).toBe(true);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  }, TIMEOUT);

  it('a load mid-dive brings him back at the safe point (core sets walk on save.loaded)', async () => {
    const t = await joined();
    const f = { ...t.ctx.player.feet };
    t.mode('dive', f);
    t.run(2);
    expect(t.root().visible).toBe(false);
    t.ctx.persist.loadAll([], t.ctx.events, 'test');
    t.run(3);
    expect(t.ctx.services.require('movementMode').current).toBe('walk');
    expect(t.ctrl('tobb').isModeHidden).toBe(false);
    expect(t.root().visible).toBe(true);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  }, TIMEOUT);

  it('a load where the mode event comes before the load handler (the other order) also brings him back', async () => {
    const t = await joined();
    t.mode('ferry', { ...t.ctx.player.feet });
    t.run(2);
    // Walk first, then the companion's own load reset.
    t.mode('walk');
    t.ctx.persist.loadAll([], t.ctx.events, 'test');
    t.run(3);
    expect(t.root().visible).toBe(true);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  }, TIMEOUT);
});

describe('companions-act3: event barks and the reveal variant', () => {
  const banter = (t: Awaited<ReturnType<typeof boot>>) => t.of('companion.banter');

  it("Ysmeryth's trial start is cheered; another trial id is not", async () => {
    const t = await joined();
    t.ctx.events.emit('trial.started', { trialId: 'm13-hrolf', opponentId: 'x', breaksToWin: 3 });
    t.run(1);
    expect(banter(t).filter((b) => b.lineKey.includes('.trial.'))).toEqual([]);
    t.ctx.events.emit('trial.started', { trialId: YSMERYTH_TRIAL_ID, opponentId: 'x', breaksToWin: 3 });
    t.run(1);
    expect(banter(t).map((b) => b.lineKey)).toEqual([expect.stringMatching(/^companion\.tobb\.bark\.area\.trial\.start\.\d$/)]);
    t.done();
  }, TIMEOUT);

  it('the reveal is said on the runtime flag change only, once', async () => {
    const t = await joined();
    t.ctx.state.setFlag(REVEAL_FLAG, true);
    t.run(1);
    expect(banter(t).map((b) => b.lineKey)).toEqual([expect.stringMatching(/\.area\.reveal\.\d$/)]);
    t.ctx.state.setFlag(REVEAL_FLAG, true);
    t.run(TOBB_TUNING.barkCooldownSeconds * 60 + 60);
    expect(banter(t).filter((b) => b.lineKey.includes('.reveal.'))).toHaveLength(1);
    t.done();
  }, TIMEOUT);

  it('a hidden companion (diving) says nothing', async () => {
    const t = await joined();
    t.mode('dive', { ...t.ctx.player.feet });
    t.run(1);
    t.ctx.events.emit('trial.won', { trialId: YSMERYTH_TRIAL_ID });
    t.run(1);
    expect(banter(t)).toEqual([]);
    t.done();
  }, TIMEOUT);

  it('the Dragonspine region speaks of keepers after M32 (the .after pool), wild beasts before', async () => {
    const before = await joined();
    before.run(TOBB_TUNING.reEmitWindowSeconds * 60 + 60);
    before.ctx.events.emit('region.entered', { regionId: 'dragonspine', previous: null });
    before.run(1);
    expect(banter(before).map((b) => b.lineKey)).toEqual([expect.stringMatching(/\.area\.dragonspine\.\d$/)]);
    before.done();

    const after = await joined();
    after.ctx.state.setFlag(REVEAL_FLAG, true);
    // The reveal bark starts the cooldown; wait it and the area repeat out.
    after.run((TOBB_TUNING.reEmitWindowSeconds + TOBB_TUNING.barkCooldownSeconds) * 60 + 60);
    after.ctx.events.emit('region.entered', { regionId: 'dragonspine', previous: null });
    after.run(TOBB_TUNING.areaWaitSeconds * 60);
    expect(banter(after).map((b) => b.lineKey).filter((k) => k.includes('.dragonspine'))).toEqual([
      expect.stringMatching(/\.area\.dragonspine\.after\.\d$/),
    ]);
    after.done();
  }, TIMEOUT);
});

describe("companions-act3: Hrolf's talk while he is not in a seat", () => {
  it('an inactive Hrolf waits at the inn post, visible, so his talk (and the book) stays reachable', async () => {
    const posts: GamePlugin = {
      id: 'fake-posts',
      dependsOn: ['core'],
      setup(ctx) {
        const f = ctx.player.feet;
        for (const id of ['tobb', 'hrolf', 'aelfreda']) {
          ctx.anchors.define({ id: partyPost(id), position: { x: f.x + 30, y: heightAt(f.x + 30, f.z + 30), z: f.z + 30 }, yaw: 0 });
        }
      },
    };
    const t = await boot([posts]);
    expect(t.ctx.state.getBool(PARTY_GATE_FLAG)).toBe(false);
    t.ctx.state.setFlag(HROLF.joinFlag, true);
    t.run(30);
    // Tobb joins later and takes the one seat; Hrolf goes to his post.
    t.ctx.state.setFlag(TOBB.joinFlag, true);
    t.run(600);
    expect(t.svc().isActive('hrolf')).toBe(false);
    const h = t.ctrl('hrolf');
    expect(h.joined).toBe(true);
    expect(h.isHidden).toBe(false);
    t.done();
  }, TIMEOUT);
});
