// The keeper's call through K6a's real overlay and brain: the wind-up roar plays on the real `telegraph` event, and the boom
// only when the overlay raises `called` (the stun lands, after the windup), the same hook the trial controller turns into the
// `call` beat. (The trial controller itself is not in this rig; its `called` -> `emit('call')` is covered in K6a's trial.test.)
import type * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { EnemyManager } from '../enemies/EnemyManager';
import { FakeHost, loadKnight } from '../enemies/testing/fakeHost';
import type { SpawnerDef } from '../enemies/types';
import { YSMERYTH_HUB } from '../enemies/wyrm/overlays';
import { YSMERYTH_DEF, YSMERYTH_IDS, YSMERYTH_SPAWNERS } from '../enemies/wyrm/ysmeryth/def';
import '../enemies/wyrm/ysmeryth/events';
import { Act3SfxRouter } from './act3SfxRouter';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});
afterEach(() => {
  for (const k of Object.keys(YSMERYTH_HUB)) delete (YSMERYTH_HUB as Record<string, unknown>)[k];
});

describe('keeper\'s call ordering (real overlay)', () => {
  it('the wind-up roar plays on the telegraph; the boom only after the windup, on the call', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 8 } });
    (fake.host.actors.player as unknown as { immortal: boolean }).immortal = true;
    fake.defineAnchor(YSMERYTH_IDS.landMark, 0, 21, [], 0);
    fake.defineAnchor(YSMERYTH_IDS.arenaCentre, 0, 0, [], 0);
    const log: string[] = [];
    const router = new Act3SfxRouter({
      audio: () => ({ play: (k: string) => void log.push(`flat:${k}`), playAt: (k: string) => void log.push(`at:${k}`) }),
      actor: () => ({ kind: 'ysmeryth', position: { x: 0, y: 0, z: 0 } }),
      object: () => undefined,
      playerObject: () => undefined,
    });
    fake.host.events.on('telegraph', (e) => router.telegraph(e));
    Object.assign(YSMERYTH_HUB, {
      arena: () => ({ centre: { x: 0, z: 0 }, land: { x: 0, z: 21 } }),
      track: () => () => {},
      callAllowed: () => true,
      called: (id: string) => {
        log.push('called');
        router.ysmeryth({ beat: 'call' }, id);
      },
    });
    const spawner: SpawnerDef = { ...YSMERYTH_SPAWNERS[0]!, band: { min: 25, max: 25 }, area: undefined };
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [spawner], seed: 7 });
    m.service.spawnGroup(YSMERYTH_IDS.spawnerId, { aggro: true });
    let t = 0;
    const step = () => {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      t += DT;
    };
    while (!log.includes('at:sfx.ysmeryth.roar') && t < 60) step();
    expect(log).toContain('at:sfx.ysmeryth.roar');
    expect(log).not.toContain('flat:sfx.ysmeryth.call');
    const roarAt = t;
    while (!log.includes('flat:sfx.ysmeryth.call') && t < 60 + 5) step();
    expect(log).toContain('flat:sfx.ysmeryth.call');
    expect(log.indexOf('at:sfx.ysmeryth.roar')).toBeLessThan(log.indexOf('flat:sfx.ysmeryth.call'));
    const windup = YSMERYTH_DEF.moves.find((m) => m.id === 'ysmeryth.call')!.windup;
    expect(Math.abs(t - roarAt - windup)).toBeLessThan(0.25);
  });
});
