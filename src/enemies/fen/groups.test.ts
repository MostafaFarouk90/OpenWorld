// Group soft-locks (plan 8, brief): a Greyfen group with a member mercied mid-fight reads cleared through the shared
// groupStanding helper once the rest are down, while the mercied member is still walking off or sinking.
import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../EnemyManager';
import { GroupStanding } from '../groupStanding';
import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from '../hunters/def';
import { mercyInteractableId } from '../mercy';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef } from '../types';
import './overlays';
import { shamblerView } from './shambler/peat';
import { FEN_TUNING } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const base = { anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false } as const;

function rig(def: SpawnerDef, player = { x: 0, z: -12 }) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: player.x, y: 0, z: player.z } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.spare', true);
  fake.flags.set('enemies.mercy.calm', true);
  const ui = fake.provideCalmUi();
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 5 });
  const gs = new GroupStanding({
    alive: (g) => m.service.alive(g),
    isDead: (a) => fake.actorMap.get(a)?.dead ?? true,
    on: (t, fn) => fake.bus.on(t as never, fn as never),
  });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const kill = (id: string) => fake.host.damage.kill!(id, 'player');
  const mercy = (id: string) => {
    ui.focus = mercyInteractableId(m.get(id)!.slug);
    tick();
    const i = fake.interactables.get(mercyInteractableId(m.get(id)!.slug))!;
    expect(i.enabled?.() ?? true).toBe(true);
    i.onInteract(fake.player);
  };
  return { fake, m, gs, tick, kill, mercy };
}

describe('Greyfen groups with a member mercied mid-fight', () => {
  it('a hunter camp: one spared, the rest killed, the camp reads cleared while the spared one walks off', () => {
    const def: SpawnerDef = { ...base, id: 'camp', enemy: 'hunter-spearman', memberKinds: HUNTER_PACK_KINDS, leaderSlot: HUNTER_PACK_LEADER_SLOT, count: 4 };
    const t = rig(def);
    const ids = t.m.service.spawnGroup('camp', { aggro: true });
    t.tick(0.2);
    const spared = ids[0]!;
    const a = t.fake.actorMap.get(spared)!;
    a.health = a.maxHealth * 0.3;
    t.fake.stagger(spared, 'player');
    expect(t.m.get(spared)!.state).toBe('yield');
    t.mercy(spared);
    t.tick(0.2);
    expect(t.gs.standing('camp')).not.toContain(spared);
    expect(t.gs.isCleared('camp')).toBe(false);
    for (const id of ids.slice(1)) t.kill(id);
    t.tick(0.2);
    expect(t.m.get(spared)).toBeDefined(); // still walking off
    expect(t.gs.isCleared('camp')).toBe(true);
  });

  it('a mixed bog: two leeches killed and the shambler laid to rest, cleared while it sinks', () => {
    const def: SpawnerDef = { ...base, id: 'bog', enemy: 'peat-shambler', memberKinds: ['fen-leech', 'fen-leech', 'peat-shambler'], count: 3 };
    const t = rig(def, { x: 0, z: 30 });
    const ids = t.m.service.spawnGroup('bog');
    const sham = ids.find((id) => t.fake.actorMap.get(id)!.kind === 'peat-shambler')!;
    const leeches = ids.filter((id) => id !== sham);
    expect(leeches).toHaveLength(2);
    t.tick(0.2);
    // Pull the shambler out the second way: a poise break on firm ground beside its bog.
    const enemy = t.m.get(sham)!;
    (enemy as unknown as { mover: { teleport(p: THREE.Vector3Like): void } }).mover.teleport({ x: FEN_TUNING.wallowRadius + 2, y: 0, z: 0 });
    t.tick();
    t.fake.movePlayer(FEN_TUNING.wallowRadius + 2, 2);
    t.fake.apply({ attackerId: 'player', targetId: sham, amount: 1, poise: 1000, kind: 'melee' });
    t.tick();
    expect(shamblerView(sham)!.slumped).toBe(true);
    t.mercy(sham);
    t.tick(0.2);
    expect(t.gs.isCleared('bog')).toBe(false);
    for (const id of leeches) t.kill(id);
    t.tick(0.2);
    expect(t.m.get(sham)).toBeDefined(); // sinking
    expect(t.gs.isCleared('bog')).toBe(true);
  });
});
