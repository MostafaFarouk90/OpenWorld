// The Ashmare's two particle effects, shared by every horse look: `mount-mane` (ember points along the neck, flickering,
// brighter at the gallop) and `mount-dust` (a small pool of puffs at the hooves, in the root's frame).
import * as THREE from 'three';
import type { GaitMode } from './rig';

const MANE_POINTS = 24;
const DUST_POOL = 24;
const DUST_LIFE = 0.6;

export class HorseEffects {
  private readonly mane: THREE.Points;
  private readonly maneBase: Float32Array;
  private readonly dust: THREE.Points;
  private readonly dustAge = new Float32Array(DUST_POOL).fill(Infinity);
  private dustNext = 0;
  private lastPhase = 0;
  private maneTime = 0;

  /**
   * @param maneSocket parent of the mane points; its -Z runs along the neck towards the head
   * @param root the horse's root: the dust hangs from it (forward is -Z, so the hooves behind are at +Z)
   */
  constructor(
    maneSocket: THREE.Object3D,
    root: THREE.Object3D,
    neckLen: number,
    private readonly length: number,
  ) {
    const pos = new Float32Array(MANE_POINTS * 3);
    for (let i = 0; i < MANE_POINTS; i++) {
      const u = i / (MANE_POINTS - 1);
      pos[i * 3] = (Math.random() - 0.5) * 0.06;
      pos[i * 3 + 1] = 0.05 + Math.random() * 0.08;
      pos[i * 3 + 2] = neckLen * (0.5 - u * 1.1);
    }
    this.maneBase = pos.slice();
    const maneGeo = new THREE.BufferGeometry();
    maneGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mane = new THREE.Points(
      maneGeo,
      new THREE.PointsMaterial({ color: 0xff7a2a, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.mane.name = 'mount-mane';
    maneSocket.add(this.mane);

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_POOL * 3).fill(0), 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0x8a7a66, size: 0.35, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.dust.name = 'mount-dust';
    this.dust.frustumCulled = false;
    root.add(this.dust);
    this.reset();
  }

  /** One fixed tick: two puffs per stride at canter and gallop, as the phase wraps and at half phase. */
  step(mode: GaitMode, phase: number): void {
    if (mode === 'canter' || mode === 'gallop') {
      if ((this.lastPhase < 0.5 && phase >= 0.5) || phase < this.lastPhase) this.puff();
    }
    this.lastPhase = phase;
  }

  private puff(): void {
    const i = this.dustNext;
    this.dustNext = (i + 1) % DUST_POOL;
    const a = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    a.setXYZ(i, (Math.random() - 0.5) * 0.6, 0.1, this.length * 0.5 + Math.random() * 0.3);
    a.needsUpdate = true;
    this.dustAge[i] = 0;
  }

  /** Mane flicker and dust, per rendered frame. */
  animate(mode: GaitMode, frameTime: number): void {
    this.maneTime += frameTime;
    const gallop = mode === 'gallop' ? 1 : mode === 'canter' ? 0.6 : 0.25;
    const pa = this.mane.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < MANE_POINTS; i++) {
      const w = Math.sin(this.maneTime * 9 + i * 1.7);
      pa.setY(i, this.maneBase[i * 3 + 1] + 0.04 * gallop * (w + 1));
      pa.setZ(i, this.maneBase[i * 3 + 2] + 0.05 * gallop * Math.max(0, w));
    }
    pa.needsUpdate = true;
    (this.mane.material as THREE.PointsMaterial).opacity = 0.5 + 0.45 * gallop;
    const da = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    let alive = 0;
    for (let i = 0; i < DUST_POOL; i++) {
      if (this.dustAge[i] === Infinity) continue;
      this.dustAge[i] += frameTime;
      if (this.dustAge[i] > DUST_LIFE) {
        this.dustAge[i] = Infinity;
        da.setY(i, -1000);
        continue;
      }
      alive++;
      da.setY(i, da.getY(i) + frameTime * 0.6);
      da.setZ(i, da.getZ(i) + frameTime * 1.5);
    }
    da.needsUpdate = true;
    this.dust.visible = alive > 0;
  }

  reset(): void {
    this.lastPhase = 0;
    this.dustAge.fill(Infinity);
    this.dust.visible = false;
  }

  dispose(): void {
    for (const p of [this.mane, this.dust]) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
  }
}
