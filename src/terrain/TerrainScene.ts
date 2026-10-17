import * as THREE from 'three';
import { TERRAIN } from '../config/constants';
import { TerrainFlyover } from './TerrainFlyover';
import { TerrainManager } from './TerrainManager';

/**
 * Terrain demo scene (`?scene=terrain`): lighting, distance fog and a flyover camera over the
 * streaming LOD terrain. Kept separate from DebugScene, which the physics test level uses.
 */
export class TerrainScene {
  readonly terrain: TerrainManager;
  private readonly flyover: TerrainFlyover;
  private readonly lights: THREE.Light[];
  private readonly previousBackground: THREE.Scene['background'];
  private readonly previousFar: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.previousBackground = scene.background;
    this.previousFar = camera.far;
    scene.background = new THREE.Color(0x9db8d3);
    scene.fog = new THREE.Fog(0x9db8d3, TERRAIN.viewDistance * 0.15, TERRAIN.viewDistance * 0.95);

    const sky = new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.9);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2);
    sun.position.set(0.4, 1, 0.25).multiplyScalar(1000);
    this.lights = [sky, sun];
    for (const light of this.lights) scene.add(light);

    camera.far = Math.max(camera.far, TERRAIN.viewDistance * 1.05);
    camera.updateProjectionMatrix();

    this.terrain = new TerrainManager(scene);
    this.flyover = new TerrainFlyover(camera, (x, z) => this.terrain.heightAt(x, z));
  }

  fixedUpdate(dt: number): void {
    this.flyover.fixedUpdate(dt);
  }

  render(alpha: number): void {
    this.flyover.render(alpha);
    this.terrain.update(this.camera.position);
  }

  dispose(): void {
    this.terrain.dispose();
    for (const light of this.lights) light.removeFromParent();
    this.scene.fog = null;
    this.scene.background = this.previousBackground;
    this.camera.far = this.previousFar;
    this.camera.updateProjectionMatrix();
  }
}
