import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Enemy } from '../Enemy';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef } from '../types';
import { foeKit, swordHit, type Kit } from './foeTestKit';
import type { Blightbloom } from './Blightbloom';
import { BLOOM } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const PLAYER = { x: 0, z: -10 };

function enterVault(kit: Kit): Blightbloom {
  kit.fake.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'door' });
  const [id] = kit.manager.service.alive('brightwater.vault.bloom');
  return kit.manager.getFoe(id) as Blightbloom;
}

/** Wraiths still in play (not dead, not released). */
const wraiths = (kit: Kit): Enemy[] => kit.manager.all().filter((e) => e.def.kind === 'ash-wraith' && e.state !== 'dead' && e.state !== 'released');
const newest = (kit: Kit): Enemy => wraiths(kit).at(-1)!;
const opens = (kit: Kit) => kit.fake.bus.of('telegraph').filter((t) => t.attackId === 'blightbloom.open');
const atPile = (e: Enemy, x: number, z: number) => Math.hypot(e.feet.x - x, e.feet.z - z) < 0.6;

/** Runs until the bloom has raised `n` wraiths in total (opens counted), returning the elapsed seconds. */
function runUntilRaised(kit: Kit, n: number, limit = 120): number {
  let t = 0;
  while (opens(kit).length < n && t < limit) {
    kit.tick();
    t += 1 / 60;
  }
  kit.tick(BLOOM.openSeconds + 0.05);
  return t;
}

const PILE_POS = { 'vault.pile.1': [3, 0], 'vault.pile.2': [0, 4], 'vault.pile.3': [-5, 0] } as const;

describe('bloom activation and cadence', () => {
  it('appears only on entering the chapel vault, once, as a hostile wooden foe', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    expect(kit.manager.foeCount).toBe(0);
    kit.fake.bus.emit('interior.entered', { interiorId: 'somewhere-else', doorId: 'd' });
    expect(kit.manager.foeCount).toBe(0);
    const bloom = enterVault(kit);
    expect(bloom.actor.kind).toBe('blightbloom');
    expect(bloom.actor.team).toBe('hostile');
    expect(bloom.actor.data['audio']).toEqual({ material: 'wood' });
    expect(bloom.actor.maxPoise).toBe(0);
    expect(bloom.actor.spawnTag).toBe('brightwater.vault.bloom');
    expect(kit.factory).not.toHaveBeenCalled();
    kit.fake.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'door' });
    expect(kit.manager.foeCount).toBe(1);
    // petals: 12
    expect(bloom.root.children.filter((c) => c.children.length === 1 && c.children[0].children.length === 1).length).toBe(12);
    expect(kit.fake.bus.of('ai.aggro')).toHaveLength(0);
  });

  it('opens every 8 s: a 1 s telegraph, then one wraith rises aggroed at the nearest pile', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    kit.tick(7.9);
    expect(opens(kit)).toHaveLength(0);
    kit.tick(0.2);
    expect(opens(kit)).toEqual([expect.objectContaining({ kind: 'dodge', moveId: 'blightbloom.open', leadSeconds: 1 })]);
    expect(wraiths(kit)).toHaveLength(0);
    kit.tick(0.9);
    expect(wraiths(kit)).toHaveLength(0);
    kit.tick(0.2);
    const [w] = wraiths(kit);
    expect(w).toBeDefined();
    expect(atPile(w, ...PILE_POS['vault.pile.1'])).toBe(true);
    expect(w.state).toBe('spawn');
    expect(w.actor.spawnTag).toBe('brightwater.vault.bloom');
    kit.tick(2.5); // the rise ends and it goes for the player
    expect(kit.fake.bus.of('ai.aggro').filter((a) => a.actorId === w.id)).toHaveLength(1);
    // no second one until 8 s after the first opened (t = 16 s)
    kit.tick(4.3);
    expect(opens(kit)).toHaveLength(1);
    kit.tick(0.6);
    expect(opens(kit)).toHaveLength(2);
  });

  it('never has more than 3 live wraiths, and raises again when one is gone', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    runUntilRaised(kit, 3);
    expect(wraiths(kit)).toHaveLength(3);
    kit.tick(40);
    expect(opens(kit)).toHaveLength(3);
    expect(wraiths(kit)).toHaveLength(3);
    // kill one: the next interval raises a replacement from the freed (unspent) pile
    const victim = wraiths(kit)[0];
    swordHit(kit.fake, victim.id, 999, 50);
    kit.tick(0.1);
    expect(wraiths(kit)).toHaveLength(2);
    kit.tick(8.5);
    expect(opens(kit)).toHaveLength(4);
    expect(wraiths(kit)).toHaveLength(3);
  });

  it('does nothing while the player is beyond 25 m, and resumes when he comes back', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -30 } });
    enterVault(kit);
    kit.tick(30);
    expect(opens(kit)).toHaveLength(0);
    kit.fake.movePlayer(0, -24);
    kit.tick(7.8);
    expect(opens(kit)).toHaveLength(0);
    kit.tick(0.4);
    expect(opens(kit)).toHaveLength(1);
  });

  it('raises nothing when no pile is within 10 m, and does not telegraph', () => {
    const far: SpawnerDef = {
      id: 'far.bloom', enemy: 'blightbloom', count: 1, anchor: 'vault.bloom', piles: ['far.pile.1'],
      band: { min: 4, max: 5 }, activation: 'manual', respawn: 'never',
    };
    const kit = foeKit(gltf, { player: PLAYER, spawners: [far] });
    kit.fake.defineAnchor('far.pile.1', 15, 0);
    kit.manager.service.spawnGroup('far.bloom');
    kit.tick(30);
    expect(opens(kit)).toHaveLength(0);
    expect(wraiths(kit)).toHaveLength(0);
  });

  it('a missing pile anchor is skipped with one warning', () => {
    const bad: SpawnerDef = {
      id: 'bad.bloom', enemy: 'blightbloom', count: 1, anchor: 'vault.bloom', piles: ['nope.pile', 'vault.pile.2'],
      band: { min: 4, max: 5 }, activation: 'manual', respawn: 'never',
    };
    const kit = foeKit(gltf, { player: PLAYER, spawners: [bad] });
    kit.manager.service.spawnGroup('bad.bloom');
    runUntilRaised(kit, 1);
    expect(kit.fake.warnings.filter((w) => w.includes('nope.pile'))).toHaveLength(1);
    expect(wraiths(kit)).toHaveLength(1);
    expect(atPile(newest(kit), 0, 4)).toBe(true);
    kit.tick(20);
    expect(opens(kit)).toHaveLength(1); // the only usable pile still holds its wraith
  });
});

describe('bloom piles', () => {
  it('uses unspent piles only: a released wraith spends its pile for good', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    kit.manager.spawners.markPileSpent('vault.pile.1');
    runUntilRaised(kit, 1);
    expect(atPile(newest(kit), ...PILE_POS['vault.pile.2'])).toBe(true);
    // release it: pile 2 is spent once it has gone; the next wraith comes from pile 3
    newest(kit).release();
    kit.tick(2);
    expect(kit.manager.spawners.isPileSpent('vault.pile.2')).toBe(true);
    expect(wraiths(kit)).toHaveLength(0);
    runUntilRaised(kit, 2);
    expect(atPile(newest(kit), ...PILE_POS['vault.pile.3'])).toBe(true);
    newest(kit).release();
    kit.tick(2);
    // all three spent: nothing more rises, however long we wait
    kit.tick(40);
    expect(opens(kit)).toHaveLength(2);
    expect(wraiths(kit)).toHaveLength(0);
    expect(kit.manager.spawners.serialize().spentPiles).toEqual(['vault.pile.1', 'vault.pile.2', 'vault.pile.3']);
  });

  it('a pile with a live wraith is not used twice at once', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    runUntilRaised(kit, 3);
    // wraiths walk off after their rise, so check each raise as it happens
    const kit2 = foeKit(gltf, { player: PLAYER });
    enterVault(kit2);
    const seen: string[] = [];
    for (let n = 1; n <= 3; n++) {
      runUntilRaised(kit2, n);
      const w = newest(kit2);
      const pile = Object.entries(PILE_POS).find(([, [x, z]]) => atPile(w, x, z))?.[0];
      expect(pile).toBeDefined();
      seen.push(pile!);
    }
    expect(new Set(seen).size).toBe(3);
    expect(seen[0]).toBe('vault.pile.1');
  });

  it('a killed wraith does not spend its pile; a despawned one does not either', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    runUntilRaised(kit, 1);
    swordHit(kit.fake, newest(kit).id, 999, 50);
    kit.tick(3);
    expect(wraiths(kit)).toHaveLength(0);
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(false);
    runUntilRaised(kit, 2);
    const w = newest(kit);
    expect(atPile(w, 3, 0)).toBe(true);
    w.despawn();
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(false);
    expect(kit.manager.spawners.serialize().spentPiles).toBeUndefined();
  });
});

describe('destroying the bloom', () => {
  it('survives one regular hit and dies to the second, however small', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    const bloom = enterVault(kit);
    const first = swordHit(kit.fake, bloom.id, 1, 5)!;
    expect(first.outcome).toBe('hit');
    expect(bloom.actor.dead).toBe(false);
    expect(bloom.actor.health).toBeCloseTo(bloom.actor.maxHealth / 2, 5);
    kit.tick(1);
    expect(kit.fake.bus.of('actor.died')).toHaveLength(0);
    swordHit(kit.fake, bloom.id, 1, 5);
    expect(kit.fake.bus.of('actor.died')).toEqual([expect.objectContaining({ actorId: bloom.id, kind: 'blightbloom', killerId: 'player' })]);
    kit.tick(2);
    expect(kit.manager.getFoe(bloom.id)).toBeUndefined();
  });

  it('one fire hit, one Surge hit, or the carried torch destroys it', () => {
    for (const attackId of ['ember-bolt', 'heartshard-surge']) {
      const kit = foeKit(gltf, { player: PLAYER });
      const bloom = enterVault(kit);
      kit.fake.apply({ attackerId: 'player', targetId: bloom.id, amount: 1, poise: 1, kind: 'spell', attackId });
      expect(bloom.actor.dead).toBe(true);
    }
    const kit = foeKit(gltf, { player: PLAYER });
    const bloom = enterVault(kit);
    kit.fake.setTorch(0.5, 1, 0);
    kit.tick(0.1);
    expect(bloom.actor.dead).toBe(true);
    expect(kit.fake.bus.of('actor.died')).toHaveLength(1);
    // an unlit torch does not
    const kit2 = foeKit(gltf, { player: PLAYER });
    const b2 = enterVault(kit2);
    kit2.fake.setTorch(0.5, 1, 0, 0.5, false);
    kit2.tick(1);
    expect(b2.actor.dead).toBe(false);
  });

  it('destruction is persisted through the group-cleared path and it does not return after a reload', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    const bloom = enterVault(kit);
    swordHit(kit.fake, bloom.id, 1);
    swordHit(kit.fake, bloom.id, 1);
    kit.tick(2);
    expect(kit.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'brightwater.vault.bloom' }]);
    const saved = JSON.parse(JSON.stringify(kit.manager.spawners.serialize()));
    expect(saved.cleared).toContain('brightwater.vault.bloom');
    expect(saved.spent.every((k: string) => /#\d+$/.test(k))).toBe(true);
    const kit2 = foeKit(gltf, { player: PLAYER });
    kit2.manager.spawners.load(saved);
    kit2.fake.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'door' });
    expect(kit2.manager.foeCount).toBe(0);
  });

  it('raises nothing after it is destroyed; wraiths already up stay', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    const bloom = enterVault(kit);
    runUntilRaised(kit, 1);
    expect(wraiths(kit)).toHaveLength(1);
    swordHit(kit.fake, bloom.id, 1);
    swordHit(kit.fake, bloom.id, 1);
    kit.tick(40);
    expect(opens(kit)).toHaveLength(1);
    expect(wraiths(kit)).toHaveLength(1);
  });
});

describe('interrupted rises', () => {
  it('a wraith hit while rising leaves its pile available', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    runUntilRaised(kit, 1);
    const w = newest(kit);
    expect(w.state).toBe('spawn');
    swordHit(kit.fake, w.id, 5, 5); // a light hit does not spend anything
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(false);
    swordHit(kit.fake, w.id, 999, 50);
    kit.tick(3);
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(false);
    runUntilRaised(kit, 2);
    expect(atPile(newest(kit), 3, 0)).toBe(true);
  });

  it('a Release while rising spends the pile', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    runUntilRaised(kit, 1);
    const w = newest(kit);
    expect(w.state).toBe('spawn');
    w.release();
    kit.tick(2);
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(true);
    runUntilRaised(kit, 2);
    expect(atPile(newest(kit), 0, 4)).toBe(true);
  });

  it('a despawn while rising frees the pile', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    runUntilRaised(kit, 1);
    newest(kit).despawn();
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(false);
    runUntilRaised(kit, 2);
    expect(atPile(newest(kit), 3, 0)).toBe(true);
  });

  it('the bloom dying mid-opening raises nothing and reserves nothing', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    const bloom = enterVault(kit);
    kit.tick(8.3);
    expect(bloom.isOpening).toBe(true);
    expect(bloom.occupiedPiles()).toEqual(['vault.pile.1']);
    swordHit(kit.fake, bloom.id, 1);
    swordHit(kit.fake, bloom.id, 1);
    kit.tick(3);
    expect(wraiths(kit)).toHaveLength(0);
    expect(bloom.occupiedPiles()).toEqual([]);
    expect(kit.fake.bus.of('telegraph.cancelled')).toHaveLength(1);
    expect(kit.manager.spawners.serialize().spentPiles).toBeUndefined();
  });

  it('a Release after the bloom is destroyed still spends the pile', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    const bloom = enterVault(kit);
    runUntilRaised(kit, 1);
    const w = newest(kit);
    swordHit(kit.fake, bloom.id, 1);
    swordHit(kit.fake, bloom.id, 1);
    kit.tick(2);
    expect(kit.manager.getFoe(bloom.id)).toBeUndefined();
    w.release();
    kit.tick(2);
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(true);
  });

  it('despawning the bloom mid-opening cancels cleanly', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    const bloom = enterVault(kit);
    kit.tick(8.3);
    kit.manager.service.despawnGroup('brightwater.vault.bloom');
    kit.tick(3);
    expect(wraiths(kit)).toHaveLength(0);
    expect(bloom.isGone).toBe(true);
    expect(kit.fake.bus.of('telegraph.cancelled')).toHaveLength(1);
  });
});

describe('spentPiles persistence', () => {
  it('round-trips through save and load, separate from `spent`', () => {
    const kit = foeKit(gltf, { player: PLAYER });
    enterVault(kit);
    runUntilRaised(kit, 1);
    newest(kit).release();
    kit.tick(2);
    const saved = JSON.parse(JSON.stringify(kit.manager.spawners.serialize()));
    expect(saved.spentPiles).toEqual(['vault.pile.1']);
    expect(saved.spent).toEqual([]);

    const kit2 = foeKit(gltf, { player: PLAYER });
    kit2.manager.spawners.load(saved);
    expect(kit2.manager.spawners.isPileSpent('vault.pile.1')).toBe(true);
    enterVault(kit2);
    runUntilRaised(kit2, 1);
    expect(atPile(newest(kit2), 0, 4)).toBe(true);
    expect(kit2.fake.warnings.filter((w) => !w.includes("'brightwater.vault'"))).toEqual([]); // the vault wraith anchors are thread 3a's
  });

  it('an old save without spentPiles loads with no warning and no spent piles; a load clears earlier state', () => {
    const kit = foeKit(gltf);
    kit.manager.spawners.markPileSpent('vault.pile.1');
    kit.manager.spawners.load({ spent: ['t05.churchyard#0'], cleared: [], warmthTier: 1, lockedBlockLevels: {} });
    expect(kit.fake.warnings).toEqual([]);
    expect(kit.manager.spawners.isPileSpent('vault.pile.1')).toBe(false);
    expect(kit.manager.spawners.serialize().spent).toEqual(['t05.churchyard#0']);
  });

  it('drops non-string entries with a warning, and a non-list with a warning', () => {
    const kit = foeKit(gltf);
    kit.manager.spawners.load({ spentPiles: ['vault.pile.2', 7, null, { a: 1 }] });
    expect(kit.fake.warnings.filter((w) => w.includes('spentPiles'))).toHaveLength(3);
    expect(kit.manager.spawners.serialize().spentPiles).toEqual(['vault.pile.2']);
    kit.manager.spawners.load({ spentPiles: 'nope' });
    expect(kit.fake.warnings.some((w) => w.includes('spentPiles is not a list'))).toBe(true);
    expect(kit.manager.spawners.isPileSpent('vault.pile.2')).toBe(false);
  });

  it('a full Brightwater load past maxAwake (24) still raises the bloom wraith and keeps spent piles', () => {
    const crowd: SpawnerDef = {
      id: 'crowd', enemy: 'ash-wraith', count: 30, anchor: 'vault.bloom', band: { min: 1, max: 1 },
      activation: 'manual', respawn: 'never', leash: false,
    };
    const kit = foeKit(gltf, { player: PLAYER, spawners: [crowd, ...[]] });
    // the bloom group is defined alongside the crowd
    const kit2 = foeKit(gltf, {
      player: PLAYER,
      spawners: [
        crowd,
        { id: 'brightwater.vault.bloom', enemy: 'blightbloom', count: 1, anchor: 'vault.bloom', piles: ['vault.pile.1', 'vault.pile.2', 'vault.pile.3'], band: { min: 4, max: 5 }, activation: { interior: 'chapel-vault' }, respawn: 'never' },
      ],
    });
    expect(kit.manager.foeCount).toBe(0);
    kit2.manager.spawners.load({ spent: [], cleared: [], spentPiles: ['vault.pile.1'], warmthTier: 0, lockedBlockLevels: {} });
    kit2.fake.bus.emit('save.loaded', { slot: 'a' });
    expect(kit2.manager.service.spawnGroup('crowd')).toHaveLength(30);
    enterVault(kit2);
    kit2.tick(9.5);
    expect(kit2.manager.all().filter((e) => e.def.kind === 'ash-wraith')).toHaveLength(31);
    const awake = kit2.manager.all().filter((e) => !e.sleeping).length;
    expect(awake).toBeLessThanOrEqual(24);
    expect(kit2.manager.spawners.isPileSpent('vault.pile.1')).toBe(true);
    expect(FakeHost).toBeDefined();
  });
});
