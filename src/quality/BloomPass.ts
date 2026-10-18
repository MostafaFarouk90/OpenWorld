import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { PostPass } from '../vfx/ports';

export const BLOOM = { strength: 0.35, radius: 0.5, threshold: 0.85 } as const;

export class BloomPostPass implements PostPass {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private enabled = true;
  private baseStrength: number = BLOOM.strength;
  private pulseAmount = 0;
  private pulseSeconds = 0;
  private pulseLeft = 0;
  private disposed = false;
  private warned = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    try {
      const size = new THREE.Vector2(1, 1);
      renderer.getSize?.(size);
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      this.bloom = new UnrealBloomPass(size, BLOOM.strength, BLOOM.radius, BLOOM.threshold);
      composer.addPass(this.bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch (e) {
      this.warn(e);
      this.composer = null;
      this.bloom = null;
    }
  }

  get available(): boolean {
    return this.composer !== null;
  }
  get strength(): number {
    return this.currentStrength();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, frameTime: number): void {
    if (this.pulseLeft > 0 && Number.isFinite(frameTime)) {
      this.pulseLeft = Math.max(0, this.pulseLeft - frameTime / 1000);
    }
    if (this.composer && !this.disposed) {
      try {
        if (this.bloom) {
          this.bloom.enabled = this.enabled;
          this.bloom.strength = this.currentStrength();
        }
        this.composer.render(Math.max(0, frameTime) / 1000);
        return;
      } catch (e) {
        this.warn(e);
        this.composer = null;
      }
    }
    renderer.render(scene, camera);
  }

  setSize(width: number, height: number): void {
    try {
      this.composer?.setSize(width, height);
    } catch (e) {
      this.warn(e);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.bloom) this.bloom.enabled = on;
  }

  setStrength(n: number): void {
    if (Number.isFinite(n)) this.baseStrength = Math.max(0, n);
  }

  /** Adds `amount` to the strength, decaying linearly to zero over `seconds` (frameTime is in ms). */
  pulse(amount: number, seconds: number): void {
    if (!Number.isFinite(amount) || !Number.isFinite(seconds) || seconds <= 0) return;
    this.pulseAmount = amount;
    this.pulseSeconds = seconds;
    this.pulseLeft = seconds;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const c = this.composer;
    this.composer = null;
    this.bloom = null;
    try {
      c?.dispose();
    } catch (e) {
      this.warn(e);
    }
  }

  private currentStrength(): number {
    const pulse = this.pulseSeconds > 0 ? this.pulseAmount * (this.pulseLeft / this.pulseSeconds) : 0;
    return this.baseStrength + pulse;
  }

  private warn(e: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.error('[quality] bloom unavailable, falling back to plain render', e);
  }
}
