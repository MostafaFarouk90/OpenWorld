// Act 4 L14: the Hunters' camp pack is held off while M15's scout is open, and comes back after (kills stay).
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP as DT } from '../config/constants';
import { ACT2_SPAWNERS } from './act2Spawners';
import { EnemyManager } from './EnemyManager';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { M15_SCOUT_HOLD, installM15ScoutHold, m15ScoutHeld } from '../quests/content/act2/director/m15ScoutHold';
import type { Kit } from '../quests/content/act2/director/kit';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const CAMP = 'cinderreach.hunters.camp';
const def = ACT2_SPAWNERS.find((d) => d.id === CAMP)!;

function setup(preset?: Record<string, boolean>) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -400 } });
  (def.memberAnchors ?? []).forEach((a, i) => fake.defineAnchor(a, i * 10, 0));
  fake.defineAnchor(def.anchor, 0, 0);
  for (const [k, v] of Object.entries(preset ?? {})) fake.flags.set(k, v);
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 3 });
  manager.spawners.startAuto();
  return { fake, manager, alive: () => manager.service.alive(CAMP).length };
}

describe('hunter camp hold during the M15 scout (L14)', () => {
  it('the pack stands when no hold is set', () => {
    expect(setup().alive()).toBe(4);
  });

  it('a hold set before the start keeps the pack away', () => {
    expect(setup({ [M15_SCOUT_HOLD]: true }).alive()).toBe(0);
  });

  it('the pack leaves when the hold is set and returns when it clears', () => {
    const s = setup();
    s.fake.setFlag(M15_SCOUT_HOLD, true);
    expect(s.alive()).toBe(0);
    s.fake.setFlag(M15_SCOUT_HOLD, false);
    expect(s.alive()).toBe(4);
  });

  it('a hunter killed before the hold stays dead when the pack returns', () => {
    const s = setup();
    const [first] = s.manager.service.alive(CAMP);
    s.fake.apply({ attackerId: 'player', targetId: first!, amount: 9999, poise: 0, kind: 'script' });
    for (let i = 0; i < 60 * 5; i++) {
      s.manager.think(DT);
      s.manager.animate(DT);
      s.manager.react(DT);
    }
    expect(s.alive()).toBe(3);
    s.fake.setFlag(M15_SCOUT_HOLD, true);
    s.fake.setFlag(M15_SCOUT_HOLD, false);
    expect(s.alive()).toBe(3);
  });

  it('a load re-derives the gate', () => {
    const s = setup();
    s.fake.loadFlags({ [M15_SCOUT_HOLD]: true });
    expect(s.alive()).toBe(0);
    s.fake.loadFlags({});
    expect(s.alive()).toBe(4);
  });
});

describe('m15ScoutHeld', () => {
  const kit = (state: string, scoutDone: boolean) => {
    const flags = new Map<string, unknown>();
    const handlers: Array<() => void> = [];
    const k = {
      active: (id: string) => id === 'm15' && state === 'active',
      objDone: (q: string, o: string) => q === 'm15' && o === 'scout' && scoutDone,
      flag: (key: string) => !!flags.get(key),
      set: (key: string, v: unknown = true) => void flags.set(key, v),
      clear: (key: string) => void flags.delete(key),
      every: (_n: number, fn: () => void) => (handlers.push(fn), () => {}),
      on: (_t: string, fn: () => void) => (handlers.push(fn), () => {}),
    };
    return { k: k as unknown as Kit, flags, fire: () => handlers.forEach((h) => h()) };
  };

  it('holds only while M15 is active and the scout is not done', () => {
    expect(m15ScoutHeld(kit('active', false).k)).toBe(true);
    expect(m15ScoutHeld(kit('active', true).k)).toBe(false);
    expect(m15ScoutHeld(kit('inactive', false).k)).toBe(false);
    expect(m15ScoutHeld(kit('completed', false).k)).toBe(false);
  });

  it('writes the flag on install and clears it once the scout is done', () => {
    const t = kit('active', false);
    installM15ScoutHold(t.k);
    expect(t.flags.get(M15_SCOUT_HOLD)).toBe(true);
    const done = kit('active', true);
    done.flags.set(M15_SCOUT_HOLD, true);
    installM15ScoutHold(done.k);
    expect(done.flags.has(M15_SCOUT_HOLD)).toBe(false);
  });
});
