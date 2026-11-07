// The march on the real enemies plugin (coordinator ruling 2026-11-07): siege foes reach the gate line on their own,
// with Cael out of their sight, on N1's geometry (lane heads 190 to 313 m down the stairs, past the 120 m dormancy).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorId } from '../actors/Actor';
import enemiesPlugin from '../enemies/enemies.plugin';
import { AI } from '../enemies/tuning';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { WAVE_SETS } from '../waves/defs';
import { M52_GUARD_LINE, RIM_SIEGE_ANCHORS, TUNNEL_INTERIOR } from '../waves/defs/act5';
import { siegeSetId } from './runner';
import { makeSiegeKit, secs, type SiegeKit } from './testKit';
import { GATE, MARCH } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
let physics: PhysicsWorld;
let kit: SiegeKit | null = null;

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  kit?.teardown();
  kit = null;
  vi.restoreAllMocks();
});

/** Every model is the Knight (the enemies plugin's own test does the same). */
const assets = () => ({
  load: async () => gltf,
  instantiate: () => cloneSkinned(gltf.scene),
  animations: () => gltf.animations,
  has: () => true,
});

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** N1's Rim Gate layout relative to the gate's middle (calderaSites.ts SIEGE_POINTS; the stairs run down to -Z here). */
const RIM = {
  gate: [-6, -2, 2, 6].map((x) => ({ x, z: 0 })),
  // Lane heads 193, 313, 57 and 116 m out, the ram's stand (the landing) 37 m out.
  lanes: { '1': { x: 180, z: -70 }, '2': { x: 300, z: -90 }, '3': { x: 30, z: -49 }, '4': { x: 100, z: -59 }, ram: { x: 0, z: -37 } },
};

/**
 * Cael this far behind the gate line: where the siege starts him (N1's `caldera.siege.start`, 110 m behind the gate's
 * site, 85 m behind its line). Out of every foe's sight, and the join 152 m off: past the shipped 120 m dormancy.
 */
const BEHIND = 85;

async function bootRim(behind = BEHIND): Promise<{ k: SiegeKit; gate: { x: number; z: number }[] }> {
  const k = await makeSiegeKit(physics, { anchors: false, realEnemies: { plugin: enemiesPlugin, assets: assets() } });
  kit = k;
  const g0 = { x: k.at.x, z: k.at.z - behind };
  const put = (id: string, x: number, z: number) => k.ctx.anchors.define({ id, position: { x, y: heightAt(x, z), z }, yaw: 0 });
  RIM.gate.forEach((p, i) => put(RIM_SIEGE_ANCHORS.gate[i], g0.x + p.x, g0.z + p.z));
  for (const [key, p] of Object.entries(RIM.lanes)) put(RIM_SIEGE_ANCHORS.lanes[key as keyof typeof RIM.lanes], g0.x + p.x, g0.z + p.z);
  // The posts, the orders and the start round a point 14 m behind the gate (the stand-ins' own layout).
  k.standIns('m52');
  return { k, gate: RIM.gate.map((p) => ({ x: g0.x + p.x, z: g0.z + p.z })) };
}

/** Members never die (the archers would thin them on the way) and the gate is mended each tick (no breach). */
function immortal(k: SiegeKit, members: () => ReadonlySet<ActorId>): void {
  k.ctx.damage.addModifier('test.immortal', (req, target) => {
    if (members().has(target.id)) {
      req.amount = 0;
      req.poise = 0;
    }
  }, -100);
}

/**
 * Runs until every member of the running wave has come within `GATE.tauntRadius` of a gate point (true), or `max`
 * seconds pass (false). Checks Cael never came within sight range of a member before it reached the gate.
 */
function marchWave(k: SiegeKit, gate: { x: number; z: number }[], max: number, seen: Map<ActorId, number>): boolean {
  const reached = new Set<ActorId>();
  const p = new THREE.Vector3();
  for (let i = 0; i < secs(max); i++) {
    k.run(1);
    const b = k.director().barricade;
    if (b) k.director().mendBarricade?.(b.max);
    k.ctx.player.actor.health = k.ctx.player.actor.maxHealth;
    const ids = k.director().members.filter((id) => !k.ctx.actors.get(id)?.dead);
    for (const id of ids) {
      const a = k.ctx.actors.get(id)!;
      a.root!.getWorldPosition(p);
      const toGate = Math.min(...gate.map((g) => flat(g, p)));
      if (!reached.has(id)) seen.set(id, Math.min(seen.get(id) ?? Infinity, flat(p, k.ctx.player.feet)));
      if (toGate <= GATE.tauntRadius) reached.add(id);
    }
    const w = k.director().current;
    const spawned = w ? WAVE_SETS[w.defId].waves[w.index].spawns.reduce((n, s) => n + s.count, 0) : 0;
    if (ids.length > 0 && k.director().members.length >= spawned && ids.every((id) => reached.has(id))) return true;
  }
  return false;
}

describe('the march (real enemies)', () => {
  it('M52: every wave’s foot reach the gate line from N1’s far lane heads with Cael out of sight, and join in reach of the gate', async () => {
    const { k, gate } = await bootRim();
    const members = () => new Set(k.director().members);
    immortal(k, members);
    const spawnOpts: unknown[] = [];
    const enemies = k.ctx.services.require('enemies');
    const spawnGroup = enemies.spawnGroup.bind(enemies);
    enemies.spawnGroup = (id, opts) => (spawnOpts.push(opts), spawnGroup(id, opts));
    expect(k.siege().start('m52')).toBe(true);
    const seen = new Map<ActorId, number>();
    const waves = WAVE_SETS[siegeSetId('m52', k.ctx.state)].waves.length;
    for (let w = 1; w <= waves; w++) {
      expect(k.siege().current?.wave, `wave ${w}`).toBe(w);
      expect(marchWave(k, gate, 120, seen), `wave ${w} reaches the gate`).toBe(true);
      // Clear it and skip the break.
      for (const id of k.director().members) k.ctx.damage.kill(id, 'player');
      for (const c of k.director().parts?.carts.all ?? []) if (c.active) k.ctx.damage.kill(c.actor.id, 'player');
      if (w < waves) {
        for (let i = 0; i < secs(10) && k.siege().current?.phase === 'running'; i++) k.run(1);
        k.siege().order('hold');
        for (let i = 0; i < secs(20) && k.siege().current?.wave === w; i++) k.run(1);
      }
    }
    // No member had Cael within sight range on its way.
    expect(Math.min(...seen.values())).toBeGreaterThan(AI.sightRange);
    // Every far lane joined `joinMetres` below the landing (the ram's stand), not at its anchor.
    const ats = spawnOpts.map((o) => (o as { at?: { x: number; z: number } }).at).filter((a): a is { x: number; z: number } => !!a);
    expect(ats.length).toBeGreaterThan(0);
    const landing = { x: gate[0].x + 6 + RIM.lanes.ram.x, z: gate[0].z + RIM.lanes.ram.z };
    for (const a of ats) expect(Math.abs(flat(a, landing) - MARCH.joinMetres)).toBeLessThan(3);
  }, 240_000);

  it('M52: a foe near Cael is his; once he is clear it marches on', async () => {
    const { k, gate } = await bootRim();
    expect(k.siege().start('m52')).toBe(true);
    // Cael walks down to the stairs, beside the first spawn's join point.
    let first: ActorId | undefined;
    for (let i = 0; i < secs(5) && !first; i++) {
      k.run(1);
      first = k.director().members[0];
    }
    expect(first).toBeDefined();
    const a = k.ctx.actors.get(first!)!;
    const p = a.root!.getWorldPosition(new THREE.Vector3());
    k.ctx.player.teleport({ x: p.x + 4, y: heightAt(p.x + 4, p.z), z: p.z }, 0);
    for (let i = 0; i < secs(2); i++) {
      k.run(1);
      k.ctx.player.actor.health = k.ctx.player.actor.maxHealth;
    }
    const e = k.ctx.services.require('enemies').ground.get(first!)!;
    expect(e.tauntTarget).toBeNull();
    // Back behind the gate: it marches again and reaches the line.
    k.ctx.player.teleport({ x: k.at.x, y: k.at.y, z: k.at.z }, 0);
    let best = Infinity;
    for (let i = 0; i < secs(90) && best > GATE.tauntRadius; i++) {
      k.run(1);
      k.ctx.player.actor.health = k.ctx.player.actor.maxHealth;
      const b = k.director().barricade;
      if (b) k.director().mendBarricade?.(b.max);
      if (a.dead) break;
      a.root!.getWorldPosition(p);
      best = Math.min(best, ...gate.map((g) => flat(g, p)));
    }
    expect(a.dead || best <= GATE.tauntRadius).toBe(true);
  }, 120_000);

  it('M52 with Cael holding the lee: wave 1 reaches the line and strikes the gate; so does wave 4 with the household guard', async () => {
    // The lee ring's centre, 14 m behind the gate line (N1): the join is 67 m from him, each foe out of his sight until the gate.
    const { k, gate } = await bootRim(14);
    expect(k.siege().start('m52')).toBe(true);
    const struck = () => k.director().barricade!.health < k.director().barricade!.max;
    const seen = new Map<ActorId, number>();
    for (let i = 0; i < secs(120) && !struck(); i++) {
      k.run(1);
      k.ctx.player.actor.health = k.ctx.player.actor.maxHealth;
    }
    expect(struck(), 'wave 1 struck the gate').toBe(true);
    expect(k.siege().current?.wave).toBe(1);
    // Foot hits stay small: over the next 10 s the wave takes at most the 2%-a-second cap off the gate.
    const before = k.director().barricade!.health;
    for (let i = 0; i < secs(10); i++) {
      k.run(1);
      k.ctx.player.actor.health = k.ctx.player.actor.maxHealth;
    }
    const lost = before - k.director().barricade!.health;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(k.director().barricade!.max * GATE.footCapPctPerS * 11);
    // On to wave 4: clear 1 to 3 (the rams and carts with them), the order each break.
    const clear = () => {
      for (const id of k.director().members) k.ctx.damage.kill(id, 'player');
      for (const c of k.director().parts?.carts.all ?? []) if (c.active) k.ctx.damage.kill(c.actor.id, 'player');
    };
    for (let w = 1; w <= 3; w++) {
      for (let i = 0; i < secs(60) && k.siege().current?.wave === w && k.siege().current?.phase === 'running'; i++) {
        if (i % 30 === 0) clear();
        k.run(1);
        k.ctx.player.actor.health = k.ctx.player.actor.maxHealth;
      }
      k.siege().order('hold');
      for (let i = 0; i < secs(20) && k.siege().current?.wave === w; i++) k.run(1);
    }
    expect(k.siege().current?.wave).toBe(4);
    // Every wave-4 foot member (the guard included) reaches the gate line.
    immortal(k, () => new Set(k.director().members));
    expect(marchWave(k, gate, 120, seen), 'wave 4 reaches the gate').toBe(true);
    const guards = k.director().members.filter((id) => k.ctx.actors.get(id)?.spawnTag !== undefined && String(k.ctx.services.require('enemies').view(id)?.spawnerId).includes(M52_GUARD_LINE));
    expect(guards.length).toBe(2);
  }, 240_000);

  it('a ranged foe that swings at the landing mark from range counts as climbed it and goes on to the gate', async () => {
    const { k } = await bootRim(14);
    expect(k.siege().start('m52')).toBe(true);
    for (let i = 0; i < secs(3); i++) k.run(1);
    const march = (k.siege().run as unknown as { march: { passed: Set<ActorId> } }).march;
    const id = k.director().members[0]!;
    const e = k.ctx.services.require('enemies').ground.get(id)!;
    expect(march.passed.has(id)).toBe(false);
    // A torch-bearer's throw at the mark: the brain is in its telegraph with the mark as its target.
    vi.spyOn(k.ctx.services.require('enemies'), 'view').mockImplementation((a) => (a === id ? ({ state: 'telegraph' } as never) : undefined));
    expect(e.tauntTarget).toMatch(/^siege-landing/);
    k.run(secs(1.1));
    expect(march.passed.has(id)).toBe(true);
  }, 60_000);

  it('R27: the tunnel foes reach the line with Cael well back from it', async () => {
    const k = await makeSiegeKit(physics, { anchors: false, interior: TUNNEL_INTERIOR, flags: { 'story.r21.choice': 'leaders' }, realEnemies: { plugin: enemiesPlugin, assets: assets() } });
    kit = k;
    // The stand-ins round a point 30 m ahead of Cael: the line 44 m from him, the spawns 92 m and more.
    defineAhead(k, 30);
    const members = () => new Set(k.director().members);
    immortal(k, members);
    expect(k.siege().start('r27')).toBe(true);
    const line = ['caldera.int.tunnel.line.1', 'caldera.int.tunnel.line.2'].map((id) => k.ctx.anchors.find(id)!.position);
    const seen = new Map<ActorId, number>();
    const waves = WAVE_SETS[siegeSetId('r27', k.ctx.state)].waves.length;
    expect(waves).toBe(4);
    for (let w = 1; w <= waves; w++) {
      expect(marchWave(k, line, 120, seen), `R27 wave ${w} reaches the line`).toBe(true);
      for (const id of k.director().members) k.ctx.damage.kill(id, 'player');
      if (w < waves) {
        for (let i = 0; i < secs(10) && k.siege().current?.phase === 'running'; i++) k.run(1);
        k.siege().order('hold');
        for (let i = 0; i < secs(20) && k.siege().current?.wave === w; i++) k.run(1);
      }
    }
    expect(Math.min(...seen.values())).toBeGreaterThan(AI.sightRange);
  }, 240_000);
});

/** `defineSiegeStandIns` round a point `metres` ahead of Cael (it puts the line 14 m ahead of that point, the spawns 62 m on). */
function defineAhead(k: SiegeKit, metres: number): void {
  k.standInsFrom('r27', { x: k.at.x, y: heightAt(k.at.x, k.at.z - metres), z: k.at.z - metres });
}

