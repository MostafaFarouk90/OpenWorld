import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TrailDriver, type RibbonLike, type TrailManagerLike } from './TrailDriver';

function fakeManager() {
  const made: Array<RibbonLike & { id: string; pushes: number }> = [];
  const mgr: TrailManagerLike = {
    create(id) {
      const r = {
        id,
        pushes: 0,
        emitting: false,
        alive: true,
        push() {
          r.pushes++;
        },
        setEmitting(on: boolean) {
          r.emitting = on;
        },
        dispose() {
          r.alive = false;
        },
      };
      made.push(r);
      return r;
    },
  };
  return { mgr, made };
}

function sceneWithMarkers() {
  const scene = new THREE.Scene();
  const hilt = new THREE.Object3D();
  const tip = new THREE.Object3D();
  tip.position.set(0, 1, 0);
  scene.add(hilt, tip);
  return { scene, hilt, tip };
}

function avatar(hilt: THREE.Object3D, tip: THREE.Object3D, attack: () => unknown) {
  return { root: hilt, weaponHilt: hilt, weaponTip: tip, shield: hilt, controller: { activeAttack: attack } } as never;
}

const atk = (t: number) => ({ clip: '1H_Melee_Attack_Chop', activeStart: 0.45, activeEnd: 0.62, normalizedTime: t, active: true, swingId: 1 });

describe('TrailDriver', () => {
  it('starts the player ribbon 0.02 before activeStart and stops after activeEnd', () => {
    const { mgr, made } = fakeManager();
    const { hilt, tip } = sceneWithMarkers();
    let a: unknown = null;
    const d = new TrailDriver(mgr);
    d.attachPlayer('player', avatar(hilt, tip, () => a));
    d.tick(0);
    expect(made).toHaveLength(0);
    a = atk(0.42);
    d.tick(0.1);
    expect(made).toHaveLength(0);
    a = atk(0.44);
    d.tick(0.2);
    expect(made[0].emitting).toBe(true);
    expect(made[0].pushes).toBe(1);
    a = atk(0.7);
    d.tick(0.3);
    expect(made[0].emitting).toBe(false);
  });

  it('enemy ribbons follow attack.window open and close', () => {
    const { mgr, made } = fakeManager();
    const { hilt, tip } = sceneWithMarkers();
    const d = new TrailDriver(mgr);
    d.attach('wraith#1', hilt, tip);
    d.onWindow({ actorId: 'wraith#1', attackId: 'Claw', phase: 'open' });
    d.tick(0);
    expect(made[0].emitting).toBe(true);
    d.onWindow({ actorId: 'wraith#1', attackId: 'Claw', phase: 'close' });
    expect(made[0].emitting).toBe(false);
    d.onWindow({ actorId: 'unknown', attackId: 'Claw', phase: 'open' });
  });

  it('stops emitting when the markers leave the scene mid-swing or go non-finite', () => {
    const { mgr, made } = fakeManager();
    const { scene, hilt, tip } = sceneWithMarkers();
    const d = new TrailDriver(mgr);
    d.attach('w', hilt, tip);
    d.setEmitting('w', true);
    d.tick(0);
    expect(made[0].emitting).toBe(true);
    scene.remove(tip);
    d.tick(0.1);
    expect(made[0].emitting).toBe(false);
    scene.add(tip);
    d.setEmitting('w', true);
    tip.position.set(NaN, 0, 0);
    d.tick(0.2);
    expect(made[0].emitting).toBe(false);
  });

  it('releases a drained ribbon after its tail so slots are not hogged', () => {
    const { mgr, made } = fakeManager();
    const { hilt, tip } = sceneWithMarkers();
    const d = new TrailDriver(mgr);
    d.attach('w', hilt, tip);
    d.setEmitting('w', true);
    d.tick(1);
    d.setEmitting('w', false);
    d.tick(1.2);
    expect(made[0].alive).toBe(true);
    d.tick(2);
    expect(made[0].alive).toBe(false);
  });

  it('uses one ribbon per attack ramp for the player', () => {
    const { mgr, made } = fakeManager();
    const { hilt, tip } = sceneWithMarkers();
    let a: unknown = atk(0.5);
    const d = new TrailDriver(mgr);
    d.attachPlayer('player', avatar(hilt, tip, () => a));
    d.tick(0);
    a = { ...(atk(0.3) as object), clip: '1H_Melee_Attack_Stab', activeStart: 0.2, activeEnd: 0.3 };
    d.tick(0.1);
    expect(made.map((m) => m.id)).toEqual(['player:1H_Melee_Attack_Chop', 'player:1H_Melee_Attack_Stab']);
  });

  it('setEmitting on an unknown actor and detach twice are safe; dispose clears everything', () => {
    const { mgr, made } = fakeManager();
    const { hilt, tip } = sceneWithMarkers();
    const d = new TrailDriver(mgr);
    d.setEmitting('nobody', true);
    const h = d.attach('w', hilt, tip);
    h.setEmitting(true);
    h.dispose();
    h.dispose();
    expect(made[0].alive).toBe(false);
    d.attach('x', hilt, tip).setEmitting(true);
    d.dispose();
    expect(made[1].alive).toBe(false);
    vi.restoreAllMocks();
  });
});
