import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../core/core.plugin';
import type { GameEventMap } from '../../../core/events';
import { Game } from '../../../core/Game';
import { MoveModifiers } from '../../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../../core/plugins';
import { dragonspineBuild } from '../../../dragonspine/layout';
import { InputManager } from '../../../input/InputManager';
import { PhysicsWorld } from '../../../physics/PhysicsWorld';
import { HATHRENS_MERE } from '../../../terrain/shape/greyfen';
import { TerrainColliders } from '../../../world/TerrainColliders';
import { World } from '../../../world/World';
import { HATHREN_IDS } from '../hathren/director';
import { CALM_BEATS, CALM_SECONDS } from '../hathren/sequence';
import { WYRM_HUB } from '../overlays';
import wyrmPlugin from '../wyrm.plugin';
import type { FlierHandle } from './flightExtras';
import largeDragons from './largeDragons.plugin';
import { LODGE_WYRMS, lodgePerches } from './lodgeWyrms';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});
beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));
const enemiesStub: GamePlugin = { id: 'enemies', dependsOn: ['core'], setup() {} };

async function boot() {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const registered: string[] = [];
  const unlocked: string[] = [];
  const quest = { m26: 'inactive' };
  const extra: GamePlugin = {
    id: 'stubs',
    dependsOn: ['core'],
    setup(ctx) {
      ctx.services.provide('codex', {
        unlock: (id: string) => void unlocked.push(id),
        has: () => false,
        open: () => {},
        register: (entries: { id: string }[]) => {
          registered.push(...entries.map((e) => e.id));
          return () => {};
        },
      } as never);
      ctx.services.provide('quests', { state: (id: string) => (id === 'm26' ? quest.m26 : 'inactive') } as never);
    },
  };
  const statuses = await game.loadPlugins(modules(corePlugin, enemiesStub, extra, wyrmPlugin, largeDragons));
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) game.fixedUpdate();
  };
  return { game, ctx: game.ctx, scene, moveModifiers, of, run, statuses, registered, unlocked, quest };
}

function defineMere(ctx: Awaited<ReturnType<typeof boot>>['ctx']) {
  const shore = { x: HATHRENS_MERE.x, y: 5.4, z: HATHRENS_MERE.z - 380 };
  ctx.anchors.define({ id: HATHREN_IDS.shoreAnchor, position: shore, yaw: 0 });
  for (let n = 1; n <= 4; n++) ctx.anchors.define({ id: HATHREN_IDS.netAnchor(n), position: { ...shore, x: shore.x + n * 10 - 25 }, yaw: 0 });
  ctx.anchors.define({ id: HATHREN_IDS.scaleBedAnchor, position: { ...shore, x: shore.x + 6 }, yaw: 0 });
}

describe('large-dragons plugin (K6a)', () => {
  it('sets up: the hathren and drakes services, the codex entries and strings, the lodge anchors and perches', { timeout: 60_000 }, async () => {
    const h = await boot();
    expect(h.statuses.find((s) => s.id === 'large-dragons')?.state).toBe('ok');
    expect(h.ctx.services.get('hathren')?.state).toBe('absent');
    expect(typeof h.ctx.services.get('drakes')?.strike).toBe('function');
    h.run(0.1); // the codex is bound lazily (its plugin may set up after this one)
    expect(h.registered).toEqual(expect.arrayContaining(['hathren', 'skarl-drake']));
    expect(h.ctx.strings.t('codex.lore.hathren.name')).toBe('Hathren Quench-Tongue');
    expect(h.ctx.strings.t('codex.bestiary.skarl-drake.name')).toBe("Skarl's Drake");
    const ps = lodgePerches(dragonspineBuild().lodge.towers);
    for (const p of ps) expect(h.ctx.anchors.find(p.id)?.position.x).toBeCloseTo(p.x, 6);
    expect(WYRM_HUB.perchFor!(LODGE_WYRMS.spawnerId, 1)).toEqual({ altitude: ps[1]!.altitude, drop: ps[1]!.drop });
    expect(WYRM_HUB.perchFor!('other', 0)).toBeNull();
    h.game.dispose();
    expect(WYRM_HUB.perchFor).toBeUndefined();
  });

  it("Hathren through the service: M26 active puts her in the nets; the calm's beats arrive as wyrm.hathren events, the codex unlocks on quiet; a load restarts from the nets", { timeout: 60_000 }, async () => {
    const h = await boot();
    defineMere(h.ctx);
    const svc = h.ctx.services.get('hathren')!;
    h.quest.m26 = 'active';
    h.run(0.1);
    expect(svc.state).toBe('nets');
    expect(svc.netCut(2)).toBe(true);
    const play = svc.calm()!;
    h.run(1);
    expect(h.moveModifiers.state().freeze).toBe(true);
    expect(h.ctx.input.contexts.top()).toBe('cutscene');
    h.run(CALM_SECONDS);
    await play.done;
    expect(h.of('wyrm.hathren').map((e) => e.beat)).toEqual(['netDropped', ...CALM_BEATS.map((b) => b.beat)]);
    expect(h.unlocked).toContain('hathren');
    expect(h.moveModifiers.state().freeze).toBeFalsy();
    h.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(svc.state).toBe('nets');
    h.game.dispose();
  });

  it('drakes: strike only while chained and landed; release frees once and fires wyrm.drake.freed; touchdown fires landed for drakes only', { timeout: 60_000 }, async () => {
    const h = await boot();
    const drakes = h.ctx.services.get('drakes')!;
    let landed = false;
    let chain: { x: number; y: number; z: number } | null = { x: 1, y: 0, z: 1 };
    let releases = 0;
    const handle: FlierHandle = { spawnerId: 'd', slot: 0, release: () => ++releases === 1, chainLow: () => chain, landed: () => landed };
    WYRM_HUB.trackFlier!('drake-1', handle);
    expect(drakes.strike('drake-1', 'player')).toBe(false); // in the air
    landed = true;
    expect(drakes.strike('drake-1', 'player')).toBe(true);
    expect(drakes.chainLow('drake-1')).toEqual(chain);
    expect(h.of('wyrm.drake.chainStruck')).toEqual([{ actorId: 'drake-1', by: 'player' }]);
    expect(drakes.release('drake-1')).toBe(true);
    expect(drakes.release('drake-1')).toBe(false);
    expect(h.of('wyrm.drake.freed')).toEqual([{ actorId: 'drake-1' }]);
    chain = null;
    expect(drakes.strike('drake-1', null)).toBe(false); // unchained
    expect(drakes.strike('nobody', null)).toBe(false);
    WYRM_HUB.landed!('not-a-drake');
    expect(h.of('wyrm.drake.landed')).toEqual([]);
    // chain() goes through wyrms.tether: the hub sees the chain.
    h.ctx.anchors.define({ id: 'aerie.post', position: { x: 3, y: 0, z: 3 }, yaw: 0 });
    const off = drakes.chain('aerie.drake', 'aerie.post');
    expect(WYRM_HUB.chainFor!('aerie.drake', 0)?.length).toBe(14);
    off();
    expect(WYRM_HUB.chainFor!('aerie.drake', 0)).toBeNull();
    h.game.dispose();
  });
});
