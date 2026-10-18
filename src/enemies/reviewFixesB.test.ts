import type * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { EnemyManager } from './EnemyManager';
import type { PerceptionModifiers } from './perceptionHook';
import { FakeHost, loadKnight } from './testing/fakeHost';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});
afterEach(() => vi.restoreAllMocks());

function rig(pz = -30) {
  const warn = vi.fn();
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: pz } });
  fake.host.warn = warn;
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3, spawners: [] });
  const tick = (s = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(s / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  return { fake, m, tick, warn };
}

const NONE: PerceptionModifiers = { sightRangeScale: 1, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1 };

describe('review fixes B: stun', () => {
  it('a stun holds an enemy still but opens no Release and no Warm Hand', () => {
    const { m, tick } = rig();
    const w = m.spawnLoose('ash-wraith', { x: 0, y: 0, z: 0 }, { leash: false })!;
    const h = m.spawnLoose('ember-hound', { x: 5, y: 0, z: 0 }, { leash: false })!;
    tick(4);
    for (const id of [w, h]) m.get(id)!.actor.data['status'] = { stunned: true, stunRemaining: 1, slow: 0 };
    tick(DT * 3);
    expect(m.get(w)!.state).toBe('stagger');
    expect(m.get(w)!.mercyOpen).toBe(false);
    expect(m.get(h)!.warmHandOpen).toBe(false);
  });

  it('a real stagger still opens Release on a wraith', () => {
    const { fake, m, tick } = rig();
    const w = m.spawnLoose('ash-wraith', { x: 0, y: 0, z: 0 }, { leash: false, aggro: true })!;
    tick(4);
    fake.stagger(w, 'player');
    tick(0.05);
    expect(m.get(w)!.mercyOpen).toBe(true);
  });
});

describe('review fixes B: stealth events', () => {
  it('a hostile soldier emits no ai.spotted or ai.suspicious, but still tracks awareness', () => {
    const { fake, m, tick } = rig(-6);
    const id = m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: false })!;
    tick(3);
    expect(fake.bus.of('ai.spotted')).toHaveLength(0);
    expect(fake.bus.of('ai.suspicious')).toHaveLength(0);
    expect(m.service.perception.state(id)!.awareness).toBeGreaterThan(0);
  });

  it('an enemy a perception provider applies to emits them', () => {
    const { fake, m, tick } = rig(-6);
    m.service.perception.register({ modifiers: () => ({ ...NONE, sightRangeScale: 1 }) });
    m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: false });
    tick(3);
    expect(fake.bus.of('ai.suspicious').length).toBeGreaterThan(0);
    expect(fake.bus.of('ai.spotted').length).toBeGreaterThan(0);
  });

  it('a sight flicker at full awareness fires ai.spotted once, not once per flicker', () => {
    const { fake, m, tick } = rig(-3);
    let n = 0;
    m.service.perception.register({
      // One tick in ten the player is hidden behind a post.
      modifiers: () => ({ ...NONE, blockSight: ++n % 10 === 0 ? [{ x: 0, z: -1.5, r: 1 }] : [] }),
    });
    m.spawnLoose('watch-guard', { x: 0, y: 0, z: 0 }, { leash: false });
    tick(10);
    expect(fake.bus.of('ai.spotted')).toHaveLength(1);
  });

  it('a dormant guard forgets its awareness', () => {
    const { fake, m, tick } = rig(-3);
    const id = m.spawnLoose('watch-guard', { x: 0, y: 0, z: 0 }, { leash: false })!;
    tick(0.5);
    expect(m.service.perception.state(id)!.awareness).toBeGreaterThan(0.3);
    m.get(id)!.sleep();
    expect(m.service.perception.state(id)?.awareness ?? 0).toBe(0);
    expect(fake.bus.of('ai.spotted')).toHaveLength(0);
  });
});

describe('review fixes B: spawn option and providers', () => {
  it('observerOnly on a non-guard kind is neutral and immortal like the guard', () => {
    const { fake, m, tick } = rig(-6);
    const id = m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: false, observerOnly: true })!;
    tick(0.1);
    const a = fake.actorMap.get(id)!;
    expect(a.team).toBe('neutral');
    expect(a.immortal).toBe(true);
  });

  it('a provider returning NaN is ignored with one warning', () => {
    const { m, tick, warn } = rig(-6);
    m.service.perception.register({ modifiers: () => ({ ...NONE, coneScale: Number.NaN }) });
    const id = m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: false })!;
    tick(4);
    expect(m.service.perception.state(id)!.awareness).toBeGreaterThan(0); // a NaN cone would blind and deafen it
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('non-finite'))).toHaveLength(1);
  });
});
