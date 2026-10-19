import * as THREE from 'three';

export interface BeaconDeps {
  scene: THREE.Scene;
  doc: Document | null;
  mountOverlay?: (w: { id: string; element: HTMLElement }) => () => void;
  heightAt?: (x: number, z: number) => number;
}

const NEAR = 3;
const FAR = 6;
const PILLAR_H = 14;
const EDGE_MARGIN = 36;

/** Pure edge placement of an off-screen target, exported for tests. */
export function edgeArrowPlacement(
  camera: THREE.Camera,
  target: { x: number; y: number; z: number },
  vp: { width: number; height: number },
  margin = EDGE_MARGIN,
): { visible: boolean; x: number; y: number; rotation: number } {
  camera.updateMatrixWorld();
  const view = new THREE.Vector3(target.x, target.y, target.z).applyMatrix4(camera.matrixWorldInverse);
  const behind = view.z >= 0;
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  let dx: number;
  let dy: number;
  if (!behind) {
    const ndc = new THREE.Vector3(target.x, target.y, target.z).project(camera);
    if (Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) return { visible: false, x: cx, y: cy, rotation: 0 };
    dx = ndc.x * cx;
    dy = -ndc.y * cy;
  } else {
    // Behind the camera: mirror, keeping the horizontal side so the arrow says which way to turn.
    dx = view.x;
    dy = -view.y;
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dx = 1;
  }
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const hx = Math.max(1, cx - margin);
  const hy = Math.max(1, cy - margin);
  const s = Math.min(Math.abs(dx) > 1e-6 ? hx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hy / Math.abs(dy) : Infinity);
  return { visible: true, x: cx + dx * s, y: cy + dy * s, rotation: (Math.atan2(dy, dx) * 180) / Math.PI };
}

export class TutorialBeacon {
  private ring: THREE.Mesh | null;
  private pillar: THREE.Mesh | null;
  private ringGeo: THREE.BufferGeometry | null;
  private pillarGeo: THREE.BufferGeometry | null;
  private ringMat: THREE.MeshBasicMaterial | null;
  private pillarMat: THREE.MeshBasicMaterial | null;
  private arrow: HTMLElement | null = null;
  private unmount: (() => void) | null = null;
  private target: { x: number; y: number; z: number } | null = null;
  private readonly reasons = new Set<string>();
  private fade = 1;
  private t = 0;
  private disposed = false;
  private lastArrowShown = false;
  private arrowLeft = '';
  private arrowTop = '';
  private arrowTransform = '';

  constructor(private readonly deps: BeaconDeps) {
    this.ringGeo = new THREE.RingGeometry(1.1, 1.6, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.pillarGeo = new THREE.CylinderGeometry(0.9, 0.9, PILLAR_H, 20, 1, true);
    this.pillarGeo.translate(0, PILLAR_H / 2, 0);
    // Additive black is invisible: fade the pillar out toward its top so it never saturates to a white bar against the sky.
    const pos = this.pillarGeo.getAttribute('position');
    const shade = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) shade.fill(1 - pos.getY(i) / PILLAR_H, i * 3, i * 3 + 3);
    this.pillarGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    const common = { color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide } as const;
    this.ringMat = new THREE.MeshBasicMaterial({ ...common, opacity: 0.8 });
    this.pillarMat = new THREE.MeshBasicMaterial({ ...common, opacity: 0.25, vertexColors: true });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.pillar = new THREE.Mesh(this.pillarGeo, this.pillarMat);
    for (const m of [this.ring, this.pillar]) {
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 5;
      deps.scene.add(m);
    }
    if (deps.doc && deps.mountOverlay) {
      const el = deps.doc.createElement('div');
      el.className = 'owg-tutorial-arrow';
      el.setAttribute?.('aria-hidden', 'true');
      el.textContent = '➤';
      Object.assign(el.style, {
        position: 'absolute', left: '0px', top: '0px', display: 'none', pointerEvents: 'none',
        color: '#ffd24a', fontSize: '28px', textShadow: '0 0 6px #000, 0 0 12px #c89000',
      });
      this.arrow = el;
      this.unmount = deps.mountOverlay({ id: 'tutorial.arrow', element: el });
    }
  }

  setTarget(p: { x: number; y: number; z: number } | null): void {
    if (this.disposed) return;
    this.target = p ? { x: p.x, y: p.y, z: p.z } : null;
    if (this.target) this.place(this.target);
    else this.hideAll();
  }

  setSuppressed(reason: string, on: boolean): void {
    if (this.disposed) return;
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    if (this.reasons.size > 0) this.hideAll();
  }

  update(
    frameTime: number,
    camera: THREE.Camera | null,
    player: { x: number; y: number; z: number } | null,
    viewport: { width: number; height: number },
  ): void {
    if (this.disposed) return;
    const dt = Number.isFinite(frameTime) && frameTime > 0 ? frameTime : 0;
    this.t += dt;
    const tg = this.target;
    if (!tg || this.reasons.size > 0) {
      this.hideAll();
      return;
    }
    this.place(tg);
    let f = 1;
    if (player) {
      const d = Math.hypot(player.x - tg.x, player.z - tg.z);
      f = Math.min(1, Math.max(0, (d - NEAR) / (FAR - NEAR)));
    }
    this.fade = f;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 3);
    this.ringMat!.opacity = 0.8 * f * pulse;
    this.pillarMat!.opacity = 0.25 * f;
    const sc = 1 + 0.06 * Math.sin(this.t * 3);
    this.ring!.scale.set(sc, 1, sc);
    this.ring!.visible = this.pillar!.visible = f > 0.01;

    let show = false;
    // No arrow once the player stands at the target (the ring has faded), e.g. on the T04 kneel spot.
    if (this.arrow && camera && f > 0.01 && viewport.width > 0 && viewport.height > 0) {
      const p = edgeArrowPlacement(camera, tg, viewport);
      if (p.visible) {
        show = true;
        const left = `${Math.round(p.x)}px`;
        const top = `${Math.round(p.y)}px`;
        const transform = `translate(-50%, -50%) rotate(${Math.round(p.rotation)}deg)`;
        // Write the DOM only when the placement changed.
        if (left !== this.arrowLeft) this.arrow.style.left = this.arrowLeft = left;
        if (top !== this.arrowTop) this.arrow.style.top = this.arrowTop = top;
        if (transform !== this.arrowTransform) this.arrow.style.transform = this.arrowTransform = transform;
      }
    }
    this.setArrow(show);
  }

  private place(tg: { x: number; y: number; z: number }): void {
    const y = (this.deps.heightAt ? this.deps.heightAt(tg.x, tg.z) : tg.y) + 0.08;
    this.ring!.position.set(tg.x, y, tg.z);
    this.pillar!.position.set(tg.x, y, tg.z);
  }

  private setArrow(on: boolean): void {
    if (!this.arrow || on === this.lastArrowShown) return;
    this.lastArrowShown = on;
    this.arrow.style.display = on ? 'block' : 'none';
  }

  private hideAll(): void {
    if (this.ring) this.ring.visible = false;
    if (this.pillar) this.pillar.visible = false;
    this.setArrow(false);
  }

  /** Current fade, 0 (hidden) to 1; for tests and callers. */
  get opacityFactor(): number {
    return this.fade;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of [this.ring, this.pillar]) m?.removeFromParent();
    this.ringGeo?.dispose();
    this.pillarGeo?.dispose();
    this.ringMat?.dispose();
    this.pillarMat?.dispose();
    this.unmount?.();
    this.unmount = null;
    this.arrow = null;
    this.ring = this.pillar = null;
    this.ringGeo = this.pillarGeo = null;
    this.ringMat = this.pillarMat = null;
    this.target = null;
  }
}
