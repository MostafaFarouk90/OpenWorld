import * as THREE from 'three';
import type { ModifiableRequest } from '../actors/DamageResolver';
import type { ActorLike, EventsLike, ServicesLike, Vec3 } from '../vfx/ports';
import { BANNER, RALLY_FX } from './tuning';

/** Banner Plant (Knight Standard 2): one banner at a time; -10% damage taken by the player's side within 8 m. */
export class BannerState {
  private pos: Vec3 | null = null;
  private expiresAt = 0;
  private _radius: number = BANNER.radius;

  get active(): boolean {
    return this.pos !== null;
  }
  get position(): Vec3 | null {
    return this.pos ? { ...this.pos } : null;
  }

  /** The planted banner's aura radius (BANNER.radius unless planted with another). */
  get radius(): number {
    return this._radius;
  }

  /** Re-planting replaces the old banner. `radius` (K11, Banner of the Sunforge) is for this banner only; a bad one falls back to BANNER.radius. */
  plant(at: Vec3, now: number, radius: number = BANNER.radius): void {
    if (![at.x, at.y, at.z, now].every(Number.isFinite)) return;
    this._radius = Number.isFinite(radius) && radius > 0 ? radius : BANNER.radius;
    this.pos = { x: at.x, y: at.y, z: at.z };
    this.expiresAt = now + BANNER.lifetimeSeconds;
  }

  remove(): void {
    this.pos = null;
  }

  /** Returns true when the banner has just expired. */
  update(now: number): boolean {
    if (this.pos && now >= this.expiresAt) {
      this.pos = null;
      return true;
    }
    return false;
  }

  remaining(now: number): number {
    return this.pos ? Math.max(0, this.expiresAt - now) : 0;
  }

  /** Damage scale for a target at `at`: inside the radius (inclusive) only. Horizontal distance. */
  scaleFor(at: Vec3): number {
    const p = this.pos;
    if (!p) return 1;
    return Math.hypot(at.x - p.x, at.z - p.z) <= this._radius ? BANNER.damageScale : 1;
  }
}

export interface BannerHost {
  events: EventsLike;
  scene: THREE.Object3D;
  services: ServicesLike;
  player: { readonly feet: THREE.Vector3; readonly facingYaw: number };
  /** K11 (Hearthfire Ward): called on each 3 s pulse of a planted banner with its position and radius. */
  onPulse?(position: Vec3, radius: number): void;
}

/** The placeholder banner: a pole and a cloth strip (the wave shader and the real mesh come with the art swap). */
export function buildBannerMesh(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x5a4632 }));
  pole.position.y = 1.1;
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 1.1),
    new THREE.MeshStandardMaterial({ color: RALLY_FX.color, side: THREE.DoubleSide, emissive: 0x402000 }),
  );
  cloth.position.set(0.38, 1.65, 0);
  g.add(pole, cloth);
  g.name = 'banner-plant';
  return g;
}

export interface BannerRegistration {
  state: BannerState;
  /** Plants a banner in front of the player. `opts.radius` (K11) sizes this banner only; omitted, it is BANNER.radius (8 m). */
  plant(now: number, opts?: { radius?: number }): void;
  /** Removes the banner (a loaded save). */
  clear(): void;
  /** Once per fixed tick with the sim time; `learned` false removes the banner (respec). */
  update(now: number, learned: boolean): void;
  /** The damage modifier body (buffs band). */
  modify(req: ModifiableRequest, target: ActorLike): void;
  dispose(): void;
}

/** Wiring that does not depend on the ability service; the plugin binds the handler and the modifier. */
export function createBanner(host: BannerHost): BannerRegistration {
  const state = new BannerState();
  let mesh: THREE.Group | null = null;
  let lastPulse = 0;
  const tmp = new THREE.Vector3();

  const endBuff = (): void => {
    host.events.emit('buff.removed', { id: BANNER.skillId });
  };
  const dropMesh = (): void => {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    mesh = null;
  };

  return {
    state,
    plant(now, opts) {
      const radius = opts?.radius !== undefined && Number.isFinite(opts.radius) && opts.radius > 0 ? opts.radius : BANNER.radius;
      const f = host.player.feet;
      const yaw = host.player.facingYaw;
      const at = { x: f.x - Math.sin(yaw) * BANNER.placeDistance, y: f.y, z: f.z - Math.cos(yaw) * BANNER.placeDistance };
      dropMesh();
      state.plant(at, now, radius);
      mesh = buildBannerMesh();
      mesh.position.set(at.x, at.y, at.z);
      host.scene.add(mesh);
      lastPulse = now;
      host.events.emit('buff.applied', { id: BANNER.skillId, nameKey: 'skill.knight.bannerPlant.name', seconds: BANNER.lifetimeSeconds });
      host.services.get('vfx')?.spawnEffect('skill-q', { position: at, scale: 1 }, { radius, color: RALLY_FX.color });
    },
    clear() {
      if (state.active) endBuff();
      state.remove();
      dropMesh();
    },
    update(now, learned) {
      const was = state.active;
      if (!learned) state.remove();
      else state.update(now);
      if (!state.active) {
        if (was) endBuff();
        dropMesh();
        return;
      }
      if (now - lastPulse >= 3) {
        lastPulse = now;
        const p = state.position!;
        host.services.get('vfx')?.spawnEffect('skill-q', { position: p, scale: 1 }, { radius: state.radius, color: RALLY_FX.color });
        host.onPulse?.({ x: p.x, y: p.y, z: p.z }, state.radius);
      }
    },
    modify(req, target) {
      if (!state.active || (target.team !== 'player' && target.team !== 'ally')) return;
      target.worldPosition(tmp);
      const scale = state.scaleFor({ x: tmp.x, y: tmp.y, z: tmp.z });
      if (scale < 1) req.amount *= scale;
    },
    dispose() {
      if (state.active) endBuff();
      state.remove();
      dropMesh();
    },
  };
}
