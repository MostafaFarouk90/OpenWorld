import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFakeCore } from '../region/testing/fakeCore';
import { cityAnchors, flat } from './crowdTestKit';
import { createCrowdsPlugin } from './crowds.plugin';
import type { CrowdSim } from './CrowdSim';
import type { CrowdsService } from './types';

type Svc = CrowdsService & { sim: CrowdSim };
const DT = 1 / 60;

function setup(opts: Parameters<typeof createCrowdsPlugin>[0] = {}) {
  const fc = createFakeCore();
  for (const a of cityAnchors().values()) fc.ctx.anchors.define(a);
  const plugin = createCrowdsPlugin({ heightAt: flat, ...opts });
  const frame = (seconds = DT) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) fc.systems.get('crowds')!.render!(0, DT, fc.ctx);
  };
  const at = (x: number, z: number, y = 20) => Object.assign(fc.playerFeet, { x, y, z });
  return { fc, plugin, frame, at, svc: () => fc.services.get('crowds') as Svc };
}

const group = (fc: ReturnType<typeof createFakeCore>) => fc.scene.getObjectByName('crowds') as THREE.Group;

describe('crowds plugin', () => {
  it('adds no actor, interactable, collider, trigger, target or event: nothing can hit, target or perceive a townsperson', () => {
    const { fc, plugin, frame, at, svc } = setup();
    plugin.setup(fc.ctx);
    at(8490, 2000);
    frame(2);
    expect(svc().stats().walkers).toBeGreaterThan(100);
    expect(fc.actors.size).toBe(0);
    expect(fc.interactables.size).toBe(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
    expect(fc.targets).toHaveLength(0);
    expect(fc.emitted).toHaveLength(0);
    plugin.dispose?.();
  });

  it('runs one render-phase system in the NPC band and draws at most three calls', () => {
    const { fc, plugin, frame, at, svc } = setup();
    plugin.setup(fc.ctx);
    const sys = fc.systems.get('crowds')!;
    expect(sys.renderPhase).toBe('world');
    expect(sys.order).toBeGreaterThanOrEqual(0);
    expect(sys.order).toBeLessThan(100);
    expect(sys.fixedPhase).toBeUndefined();
    at(8490, 2000);
    frame(1);
    const s = svc().stats();
    expect(s.drawCalls).toBeLessThanOrEqual(3);
    expect(s.drawn.lod0 + s.drawn.lod1).toBeGreaterThan(0);
    expect(group(fc).visible).toBe(true);
    plugin.dispose?.();
  });

  it('follows thread 6 M06 flags through ctx.gates: guarded empties the gate ground, the route opens it again', () => {
    const { fc, plugin, frame, at, svc } = setup();
    plugin.setup(fc.ctx);
    at(8490, 2000);
    frame(0.2);
    expect(svc().density().guarded).toBe(false);
    fc.ctx.state.setFlag('story.m06.started', true);
    frame(0.2);
    expect(svc().density().guarded).toBe(true);
    fc.ctx.state.setFlag('story.m06.route', 'bribe');
    frame(0.2);
    expect(svc().density().guarded).toBe(false);
    plugin.dispose?.();
  });

  it('reads a guarded gate from a loaded save without a full-density frame first', () => {
    const { fc, plugin, frame, at, svc } = setup();
    fc.flags.set('story.m06.started', true);
    plugin.setup(fc.ctx);
    at(8490, 2000);
    frame();
    expect(svc().density().guarded).toBe(true);
    for (const w of svc().sim.walkers) if (w.active) expect(w.x > 8325 && w.x < 8675 && w.z > 1190 && w.z < 1360).toBe(false);
    plugin.dispose?.();
  });

  it('polls thread 18 stealth and chase readers each frame and empties the streets for the chase', () => {
    const { fc, plugin, frame, at, svc } = setup();
    let chasing = false;
    fc.services.set('chase', { active: () => chasing });
    fc.services.set('stealth', { active: () => { throw new Error('broken reader'); } });
    plugin.setup(fc.ctx);
    at(8490, 2000);
    frame(1);
    expect(svc().stats().walkers).toBeGreaterThan(100);
    chasing = true;
    frame(3.2);
    expect(svc().stats()).toMatchObject({ walkers: 0, idle: 0 });
    chasing = false;
    frame(3);
    expect(svc().stats().walkers).toBeGreaterThan(0);
    plugin.dispose?.();
  });

  it('sleeps inside an interior (they share x and z, 150 m up) and while a door transition runs', () => {
    const { fc, plugin, frame, at, svc } = setup();
    const interiors = { current: null as string | null, transitioning: false };
    fc.services.set('interiors', interiors);
    plugin.setup(fc.ctx);
    at(8200, 1650);
    frame(0.5);
    expect(svc().stats().asleep).toBe(false);
    interiors.current = 'tilted-anvil';
    at(8200, 1650, 170);
    frame(0.5);
    expect(svc().stats()).toMatchObject({ asleep: true, drawCalls: 0 });
    expect(group(fc).visible).toBe(false);
    interiors.current = null;
    interiors.transitioning = true;
    frame();
    expect(svc().stats().asleep).toBe(true);
    interiors.transitioning = false;
    at(8200, 1650);
    frame();
    expect(svc().stats().asleep).toBe(false);
    plugin.dispose?.();
  });

  it('sleeps far from Harrowmark and costs nothing there', () => {
    const { fc, plugin, frame, at, svc } = setup();
    plugin.setup(fc.ctx);
    at(0, 0, 0);
    frame(1);
    expect(svc().stats()).toMatchObject({ asleep: true, walkers: 0, msFrame: 0 });
    plugin.dispose?.();
  });

  it('re-seeds on save.loaded and keeps 30 m clear around the loaded player', () => {
    const { fc, plugin, frame, at, svc } = setup();
    plugin.setup(fc.ctx);
    at(8490, 1900);
    frame(5);
    at(8490, 2200);
    fc.fire('save.loaded', { slot: 'auto' });
    frame();
    for (const w of svc().sim.walkers) if (w.active) expect(Math.hypot(w.x - 8490, w.z - 2200)).toBeGreaterThan(29);
    plugin.dispose?.();
  });

  it('turns off with the debug switch', () => {
    const { fc, plugin, frame, at, svc } = setup();
    plugin.setup(fc.ctx);
    at(8490, 2000);
    frame();
    svc().setEnabled(false);
    frame();
    expect(svc().stats()).toMatchObject({ asleep: true, enabled: false, drawCalls: 0 });
    plugin.dispose?.();
  });

  it('dispose removes the meshes, the system, the service and the flag watchers', () => {
    const { fc, plugin, frame, at } = setup();
    plugin.setup(fc.ctx);
    at(8490, 2000);
    frame();
    const meshes: THREE.InstancedMesh[] = [];
    group(fc).traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && meshes.push(o as THREE.InstancedMesh));
    const spies = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'));
    plugin.dispose?.();
    expect(group(fc)).toBeUndefined();
    expect(fc.systems.has('crowds')).toBe(false);
    expect(fc.services.has('crowds')).toBe(false);
    for (const s of spies) expect(s).toHaveBeenCalled();
    expect(() => fc.ctx.state.setFlag('story.m06.started', true)).not.toThrow();
  });

  it('fails setup cleanly on a missing lane anchor, leaving nothing behind', () => {
    const fc = createFakeCore();
    for (const a of cityAnchors().values()) if (a.id !== 'harrowmark.lane.forge-row.3') fc.ctx.anchors.define(a);
    const plugin = createCrowdsPlugin({ heightAt: flat });
    expect(() => plugin.setup(fc.ctx)).toThrow(/forge-row\.3/);
    expect(fc.scene.getObjectByName('crowds')).toBeUndefined();
    expect(fc.systems.size).toBe(0);
    expect(fc.services.has('crowds')).toBe(false);
  });
});
