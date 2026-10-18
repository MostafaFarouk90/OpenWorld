import * as THREE from 'three';
import { COMBAT } from '../config/constants';

export interface FloatingNumber {
  text: string;
  x: number;
  y: number;
  z: number;
  /** Seconds since spawn. */
  age: number;
}

/**
 * Pure state of the floating damage numbers: spawn, rise and expire. Rendering lives in
 * DamageNumberSprites so this part runs in plain Node.
 */
export class DamageNumbers {
  readonly live: FloatingNumber[] = [];

  constructor(
    private readonly lifetime: number = COMBAT.damageNumberSeconds,
    private readonly rise: number = COMBAT.damageNumberRise,
    private readonly max: number = COMBAT.maxDamageNumbers,
  ) {}

  spawn(damage: number, at: { x: number; y: number; z: number }): FloatingNumber {
    return this.spawnText(formatDamage(damage), at);
  }

  /** A floating word instead of a number ("Blocked", "Parried"). */
  spawnText(text: string, at: { x: number; y: number; z: number }): FloatingNumber {
    const n = { text, x: at.x, y: at.y, z: at.z, age: 0 };
    this.live.push(n);
    return n;
  }

  /** Ages every number; returns the ones that expired or were pushed out by the cap. */
  update(dt: number): FloatingNumber[] {
    const gone: FloatingNumber[] = [];
    for (const n of this.live) n.age += dt;
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].age >= this.lifetime) gone.push(...this.live.splice(i, 1));
    }
    while (this.live.length > this.max) gone.push(this.live.shift()!);
    return gone;
  }

  /** 0 at spawn to 1 at expiry. */
  progress(n: FloatingNumber): number {
    return Math.min(1, Math.max(0, n.age / this.lifetime));
  }

  /** Height above the spawn point. */
  offsetY(n: FloatingNumber): number {
    return this.rise * this.progress(n);
  }

  /** Opaque for the first half, then fading out. */
  opacity(n: FloatingNumber): number {
    const p = this.progress(n);
    return p < 0.5 ? 1 : 1 - (p - 0.5) * 2;
  }
}

export function formatDamage(damage: number): string {
  if (!Number.isFinite(damage)) return '?';
  return String(Math.round(damage * 10) / 10);
}

/** Draws the numbers as camera-facing sprites. */
export class DamageNumberSprites {
  readonly state: DamageNumbers;
  private readonly sprites = new Map<FloatingNumber, THREE.Sprite>();

  constructor(
    private readonly parent: THREE.Object3D,
    state = new DamageNumbers(),
  ) {
    this.state = state;
  }

  get spriteCount(): number {
    return this.sprites.size;
  }

  /** `scale` 1.4 for heavy or killing hits (contracts/vfx-and-feedback.md section 2). */
  spawn(damage: number, at: { x: number; y: number; z: number }, scale = 1): void {
    this.spawnText(formatDamage(damage), at, scale);
  }

  spawnText(text: string, at: { x: number; y: number; z: number }, scale = 1): void {
    const n = this.state.spawnText(text, at);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeTexture(n.text), transparent: true, depthTest: false }),
    );
    sprite.scale.set(0.9 * scale, 0.45 * scale, 1);
    sprite.renderOrder = 1000;
    this.sprites.set(n, sprite);
    this.parent.add(sprite);
    this.place(n, sprite);
    this.releaseGone(this.state.update(0));
  }

  update(dt: number): void {
    this.releaseGone(this.state.update(dt));
    for (const [n, sprite] of this.sprites) this.place(n, sprite);
  }

  dispose(): void {
    this.releaseGone([...this.sprites.keys()]);
    this.state.live.length = 0;
  }

  private place(n: FloatingNumber, sprite: THREE.Sprite): void {
    sprite.position.set(n.x, n.y + this.state.offsetY(n), n.z);
    sprite.material.opacity = this.state.opacity(n);
  }

  private releaseGone(gone: FloatingNumber[]): void {
    for (const n of gone) {
      const sprite = this.sprites.get(n);
      if (!sprite) continue;
      this.sprites.delete(n);
      sprite.removeFromParent();
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
  }
}

function makeTexture(text: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, 64, 34);
  ctx.fillStyle = '#ffd34d';
  ctx.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
