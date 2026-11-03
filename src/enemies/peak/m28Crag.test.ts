// The M28 crag balance (coordinator ruling 2026-10-31): six hawks and an ogre in one group with M28_CRAG_OPTIONS. At most three
// fight at once, the ogre blusters through two hits, and no hawk stoops while the engaged ogre stands beside the target.
import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { M28_CRAG_OPTIONS } from '../act3Spawners';
import { EnemyManager } from '../EnemyManager';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { EnemyKind, SpawnerDef, SpawnOptions } from '../types';
import './overlays';
import { OGRE } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const HAWK = 'rime-hawk' as EnemyKind;
const OGRE_KIND = 'crag-ogre' as EnemyKind;

function rig(options: Partial<SpawnOptions> | undefined, kinds: EnemyKind[] = [HAWK, HAWK, HAWK, HAWK, HAWK, HAWK, OGRE_KIND], playerZ = -6) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: playerZ } });
  const anchors = kinds.map((_, i) => {
    const id = `m${i}`;
    const a = (i / kinds.length) * Math.PI * 2;
    fake.defineAnchor(id, Math.cos(a) * 6, Math.sin(a) * 6);
    return id;
  });
  const def: SpawnerDef = {
    id: 'crag', enemy: HAWK, count: kinds.length, anchor: anchors[0]!, memberAnchors: anchors, memberKinds: kinds,
    band: { min: 20, max: 20 }, activation: 'manual', respawn: 'never', leash: false, options,
  };
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 5 });
  const p = fake.player as unknown as { health: number; maxHealth: number };
  const tick = (seconds = DT, each?: () => void, until?: () => boolean): boolean => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      p.maxHealth = p.health = 1e6; // the fight is measured, not survived
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      each?.();
      if (until?.()) return true;
    }
    return false;
  };
  const ids = m.service.spawnGroup('crag', { aggro: true });
  const enemy = (id: string) => m.get(id);
  const fighting = () => ids.filter((id) => {
    const e = enemy(id);
    return !!e && e.brain.target !== null && !['return', 'dead', 'calmed', 'released', 'spared'].includes(e.state);
  });
  const ogreId = ids.find((id) => enemy(id)?.def.kind === OGRE_KIND)!;
  const stoops = () => fake.bus.of('telegraph').filter((t) => (t as { moveId?: string }).moveId === 'hawk.stoop');
  const kill = (id: string) => fake.apply({ attackerId: 'player', targetId: id, amount: 1e7, poise: 0, kind: 'script' });
  return { fake, m, tick, ids, enemy, fighting, ogreId, stoops, kill };
}

describe('M28 crag: the first wave', () => {
  it('the options are the rulings\': two at once, 0.4 health, 0.6 damage, the ogre through two hits, no stoop beside the ogre', () => {
    expect(M28_CRAG_OPTIONS).toEqual({ waveSize: 2, healthScale: 0.4, damageScale: 0.6, blusterHits: 2, blusterSeconds: 5, stoopClearOfOgre: 5 });
  });

  it('the crag members carry the scales: 0.4 of the health of the same members without the options', () => {
    const a = rig(M28_CRAG_OPTIONS);
    const b = rig(undefined);
    for (let i = 0; i < a.ids.length; i++) {
      const ha = a.fake.actorMap.get(a.ids[i]!)!.maxHealth;
      const hb = b.fake.actorMap.get(b.ids[i]!)!.maxHealth;
      expect(ha).toBeCloseTo(hb * 0.4, -1);
    }
  });

  it('at most two of the seven fight at once', () => {
    const t = rig(M28_CRAG_OPTIONS);
    let most = 0;
    t.tick(20, () => {
      most = Math.max(most, t.fighting().length);
    });
    expect(most).toBe(2);
  });

  it('a fighter down, a reserve takes up the fight', () => {
    const t = rig(M28_CRAG_OPTIONS);
    t.tick(3);
    const first = t.fighting();
    expect(first).toHaveLength(2);
    t.kill(first[0]!);
    expect(t.tick(10, undefined, () => t.fighting().length === 2 && !t.fighting().includes(first[0]!))).toBe(true);
  });

  it('reserves struck into the fight (a companion\'s or Cael\'s hits) keep their target but never swing while two fight', () => {
    const t = rig(M28_CRAG_OPTIONS);
    t.tick(3);
    const first = new Set(t.fighting());
    const reserves = t.ids.filter((id) => !first.has(id));
    const swings = () => t.fake.bus.of('telegraph').filter((x) => reserves.includes((x as { actorId: string }).actorId)).length;
    const n = swings();
    let swingers = 0;
    t.tick(15, () => {
      for (const id of reserves) if (t.enemy(id)) t.fake.apply({ attackerId: 'player', targetId: id, amount: 0.01, poise: 0, kind: 'melee' });
      swingers = Math.max(swingers, t.ids.filter((id) => ['telegraph', 'attack'].includes(t.enemy(id)?.state ?? '')).length);
    });
    expect(swings()).toBe(n);
    expect(swingers).toBeLessThanOrEqual(2);
  });

  it('without the options the whole group comes at once (the ambient packs are unchanged)', () => {
    const t = rig(undefined);
    let most = 0;
    t.tick(6, () => {
      most = Math.max(most, t.fighting().length);
    });
    expect(most).toBe(7);
  });
});

describe('M28 crag: the ogre\'s bluster', () => {
  const ogreOnly = () => rig(M28_CRAG_OPTIONS, [OGRE_KIND], -2);
  const swing = (t: ReturnType<typeof rig>) => t.enemy(t.ogreId)!.state === 'telegraph';
  const hit = (t: ReturnType<typeof rig>) => t.fake.apply({ attackerId: 'player', targetId: t.ogreId, amount: 1, poise: 1, kind: 'melee' });

  it('two hits land free: after the first it still holds its swing', () => {
    const t = ogreOnly();
    t.tick(0.5);
    hit(t);
    expect(t.tick(1.5, undefined, () => swing(t))).toBe(false);
    hit(t);
    expect(t.tick(2, undefined, () => swing(t))).toBe(true);
  });

  it('unanswered, it glares for five seconds in reach before it swings', () => {
    const t = ogreOnly();
    expect(t.tick(M28_CRAG_OPTIONS.blusterSeconds! - 0.4, undefined, () => swing(t))).toBe(false);
    expect(t.tick(2, undefined, () => swing(t))).toBe(true);
  });

  it('the default ogre still swings after one hit and three seconds', () => {
    const t = rig(undefined, [OGRE_KIND], -2);
    expect(t.tick(OGRE.blusterSeconds - 0.4, undefined, () => swing(t))).toBe(false);
    expect(t.tick(2, undefined, () => swing(t))).toBe(true);
  });
});

describe('M28 crag: no stoop beside the ogre', () => {
  it('while the engaged ogre stands within 5 m of the target no hawk stoops; once it is down they do', () => {
    const t = rig(M28_CRAG_OPTIONS, [OGRE_KIND, HAWK, HAWK], -3);
    let stoopsNear = 0;
    t.tick(15, () => {
      const o = t.enemy(t.ogreId);
      const f = t.fake.host.player.feet;
      if (!o) return;
      const d = Math.hypot(o.feet.x - f.x, o.feet.z - f.z);
      if (d <= 5 && o.brain.target !== null) stoopsNear = t.stoops().length;
    });
    expect(t.enemy(t.ogreId)!.brain.target).not.toBeNull();
    expect(stoopsNear).toBe(0);
    t.kill(t.ogreId);
    const n = t.stoops().length;
    expect(t.tick(15, undefined, () => t.stoops().length > n)).toBe(true);
  });

  it('without the option a hawk stoops with the ogre beside the target', () => {
    const t = rig({ waveSize: 3 }, [OGRE_KIND, HAWK, HAWK], -3);
    expect(t.tick(15, undefined, () => t.stoops().length > 0)).toBe(true);
  });
});
