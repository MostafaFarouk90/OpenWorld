import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { citySim } from './crowdTestKit';
import { CROWD_SHADER_CACHE_KEY, CrowdView, buildLod0Geometry, patchWalkShader } from './CrowdView';
import { CROWD_TUNING } from './tuning';

describe('crowd view', () => {
  it('packs figures into LOD0 near the eye, LOD1 farther, and nothing past the draw distance', () => {
    const { sim } = citySim();
    sim.reseed({ x: 0, y: 0, z: 0 });
    const view = new CrowdView(sim.capacity + sim.idle.length);
    const eye = { x: 8490, y: 21.6, z: 2000 };
    view.write(sim, eye, 1);
    const live = [...sim.walkers.filter((w) => w.active), ...sim.idle.filter((m) => m.active)];
    const d = live.map((f) => Math.hypot(f.x - eye.x, f.y - eye.y, f.z - eye.z));
    expect(view.lod0.count).toBe(d.filter((x) => x < CROWD_TUNING.lod0Range).length);
    expect(view.lod1.count).toBe(d.filter((x) => x >= CROWD_TUNING.lod0Range && x < CROWD_TUNING.drawDistance).length);
    expect(view.blobs.count).toBe(view.lod0.count);
    expect(view.lod0.count + view.lod1.count).toBeLessThan(live.length);
    expect(view.drawCalls).toBeLessThanOrEqual(3);
    view.dispose();
  });

  it('shrinks figures to nothing between the fade start and the draw distance', () => {
    const { sim } = citySim();
    sim.reseed({ x: 0, y: 0, z: 0 });
    for (const w of sim.walkers) w.active = false;
    for (const m of sim.idle) m.active = false;
    const w = sim.walkers[0];
    Object.assign(w, { active: true, x: 0, y: 0, z: 0, yaw: 0 });
    const view = new CrowdView(4);
    const scale = (dist: number) => {
      view.write(sim, { x: dist, y: 0, z: 0 }, 0);
      if (!view.lod1.count) return 0;
      const m = new THREE.Matrix4();
      view.lod1.getMatrixAt(0, m);
      return new THREE.Vector3().setFromMatrixScale(m).x;
    };
    expect(scale(100)).toBeCloseTo(1);
    expect(scale(132.5)).toBeCloseTo(0.5);
    expect(scale(139.9)).toBeLessThan(0.01);
    expect(scale(141)).toBe(0);
    view.dispose();
  });

  it('never frustum-culls the instanced meshes, casts no shadows and uses Lambert so fog and light apply', () => {
    const view = new CrowdView(4);
    for (const m of [view.lod0, view.lod1, view.blobs]) {
      expect(m.frustumCulled).toBe(false);
      expect(m.castShadow).toBe(false);
    }
    expect(view.lod0.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(view.lod1.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect((view.lod0.material as THREE.Material).customProgramCacheKey()).toBe(CROWD_SHADER_CACHE_KEY);
    view.dispose();
  });

  it('bakes a limb attribute into the near figure and patches the walk into the vertex shader', () => {
    const g = buildLod0Geometry();
    const limb = g.getAttribute('aLimb');
    const values = new Set(Array.from(limb.array as Float32Array));
    expect([...values].sort()).toEqual([-1, 0, 1]);
    expect(g.getAttribute('position').count / 3).toBeLessThan(400);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.lambert.vertexShader };
    const uTime = { value: 2 };
    patchWalkShader(shader, uTime);
    expect(shader.uniforms.uTime).toBe(uTime);
    expect(shader.vertexShader.match(/attribute vec3 aWalk;/g)).toHaveLength(1);
    expect(shader.vertexShader.match(/#include <common>/g)).toHaveLength(1);
    // The walk follows begin_vertex (where `transformed` exists) and precedes the projection.
    const v = shader.vertexShader;
    expect(v.indexOf('#include <begin_vertex>')).toBeLessThan(v.indexOf('float crowdSw'));
    expect(v.indexOf('float crowdSw')).toBeLessThan(v.indexOf('#include <project_vertex>'));
    g.dispose();
  });

  it('dispose frees geometry and materials and detaches the group', () => {
    const scene = new THREE.Scene();
    const view = new CrowdView(4);
    scene.add(view.group);
    const spies = [view.lod0, view.lod1, view.blobs].flatMap((m) => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')]);
    view.dispose();
    view.dispose();
    expect(view.group.parent).toBeNull();
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
  });
});
