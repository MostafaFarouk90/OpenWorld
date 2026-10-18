import * as THREE from 'three';
import type { GraphicsService } from '../core/graphics';
import type { InteriorEnvironment } from './types';

interface Snapshot {
  background: THREE.Scene['background'];
  fog: { color: number; near: number; far: number } | null;
  sun: { light: THREE.DirectionalLight; intensity: number }[];
  hemi: { light: THREE.HemisphereLight; sky: number; ground: number; intensity: number }[];
  terrainVisible: boolean | null;
}

/**
 * Swaps the outdoor look for an interior's and back (contracts/interiors-and-nav.md section 1): background, fog, the sun, the
 * hemisphere light, the terrain group, and a light that follows the player. Lights are found by type among the scene's
 * children, so no core change is needed. Call only while the screen is black: adding or removing the light recompiles shaders.
 */
export class SceneEnvironment {
  private saved: Snapshot | null = null;
  private env: InteriorEnvironment | null = null;
  private readonly light = new THREE.PointLight(0xffffff, 0, 10, 2);
  private readonly black = new THREE.Color(0x000000);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly graphics: () => GraphicsService | undefined,
  ) {
    this.light.name = 'interior-light';
    this.light.castShadow = false;
  }

  get inside(): boolean {
    return this.env !== null;
  }

  get followLight(): THREE.PointLight {
    return this.light;
  }

  apply(env: InteriorEnvironment): void {
    this.saved ??= this.snapshot();
    this.env = env;
    this.scene.background = this.black;
    for (const s of this.saved.sun) {
      s.light.intensity = 0;
      s.light.castShadow = false;
    }
    for (const h of this.saved.hemi) {
      h.light.color.setHex(env.skyColor);
      h.light.groundColor.setHex(env.groundColor);
      h.light.intensity = env.ambientIntensity;
    }
    const terrain = this.scene.getObjectByName('terrain');
    if (terrain) terrain.visible = false;
    this.light.color.setHex(env.lightColor);
    this.light.intensity = env.lightIntensity;
    this.light.distance = env.lightDistance;
    if (!this.light.parent) this.scene.add(this.light);
    this.applyFog();
  }

  restore(): void {
    const s = this.saved;
    this.env = null;
    this.light.removeFromParent();
    if (!s) return;
    this.saved = null;
    this.scene.background = s.background;
    const shadowsOn = (this.graphics()?.shadows ?? 'full') !== 'off';
    for (const sun of s.sun) {
      sun.light.intensity = sun.intensity;
      sun.light.castShadow = shadowsOn;
    }
    for (const h of s.hemi) {
      h.light.color.setHex(h.sky);
      h.light.groundColor.setHex(h.ground);
      h.light.intensity = h.intensity;
    }
    const terrain = this.scene.getObjectByName('terrain');
    if (terrain && s.terrainVisible !== null) terrain.visible = s.terrainVisible;
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog && s.fog) {
      fog.color.setHex(s.fog.color);
      const g = this.graphics();
      // Recompute near and far from the current view distance, so a quality change made inside is kept.
      if (g) g.setViewDistanceOffset(g.viewDistanceOffset);
      else {
        fog.near = s.fog.near;
        fog.far = s.fog.far;
      }
    }
  }

  /** Restores the outdoors and frees the follow light. */
  dispose(): void {
    this.restore();
    this.light.dispose();
  }

  /** Every render frame while inside: the light follows `at`, and the interior fog wins over any graphics change. */
  frame(at: THREE.Vector3Like): void {
    if (!this.env) return;
    this.light.position.set(at.x, at.y + 2.2, at.z);
    // A shadow-quality change made inside turns the sun's shadow back on; keep it off until the exit.
    for (const s of this.saved?.sun ?? []) s.light.castShadow = false;
    this.applyFog();
  }

  private applyFog(): void {
    const env = this.env;
    const fog = this.scene.fog;
    if (!env || !(fog instanceof THREE.Fog)) return;
    fog.color.setHex(env.fogColor);
    fog.near = env.fogNear;
    fog.far = env.fogFar;
  }

  private snapshot(): Snapshot {
    const fog = this.scene.fog;
    const terrain = this.scene.getObjectByName('terrain');
    const sun: Snapshot['sun'] = [];
    const hemi: Snapshot['hemi'] = [];
    for (const child of this.scene.children) {
      if (child instanceof THREE.DirectionalLight) sun.push({ light: child, intensity: child.intensity });
      else if (child instanceof THREE.HemisphereLight) {
        hemi.push({ light: child, sky: child.color.getHex(), ground: child.groundColor.getHex(), intensity: child.intensity });
      }
    }
    return {
      background: this.scene.background,
      fog: fog instanceof THREE.Fog ? { color: fog.color.getHex(), near: fog.near, far: fog.far } : null,
      sun,
      hemi,
      terrainVisible: terrain ? terrain.visible : null,
    };
  }
}
