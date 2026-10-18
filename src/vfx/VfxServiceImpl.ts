import * as THREE from 'three';
import { ActorMaterials } from './ActorMaterials';
import { CameraFx } from './CameraFx';
import { DecalPool } from './DecalPool';
import { Dissolver } from './Dissolver';
import { EFFECTS, type EffectInstance, type FxContext } from './effects';
import { LightFlashPool } from './LightFlashPool';
import { ParticleBudget } from './ParticleBudget';
import { PointsPool } from './PointsPool';
import { ScreenFx } from './ScreenFx';
import { SparkPool } from './SparkPool';
import { TelegraphFx } from './Telegraph';
import { TrailDriver } from './TrailDriver';
import { TrailManager } from './TrailManager';
import { VisualClock } from './VisualClock';
import { CAPS, QUALITY, type QualityStep } from './tuning';
import { createWeaponMarkers } from './weaponMarkers';
import { EFFECT_IDS, type EffectHandle, type EffectId, type EffectParams, type EffectTransform, type TrailHandle, type VfxService } from './types';
import type { ActorId } from './ports';

export interface VfxHost {
  scene: THREE.Scene;
  heightAt?: (x: number, z: number) => number;
  actorRoot(id: ActorId): THREE.Object3D | null;
}

const DEAD: EffectHandle = { stop: () => {}, alive: false };

/**
 * The VFX service: effect registry, pools, trails, camera and screen effects. Pure Three.js, no
 * renderer needed, so it runs headless in tests. `update` is called once per render frame.
 */
export class VfxServiceImpl implements VfxService {
  readonly clock = new VisualClock();
  readonly camera = new CameraFx();
  readonly screen: ScreenFx;
  /** Sparks and points have separate budgets (600 + 3,400 = the 4,000 cap) so one cannot starve the other. */
  readonly sparkBudget = new ParticleBudget(CAPS.sparkInstances);
  readonly pointsBudget = new ParticleBudget(CAPS.pointSlots);
  readonly sparks: SparkPool;
  readonly points: PointsPool;
  readonly decals: DecalPool;
  readonly lights: LightFlashPool;
  readonly materials = new ActorMaterials();
  readonly telegraphs = new TelegraphFx(this.materials);
  readonly dissolver = new Dissolver(this.materials);
  readonly trails: TrailManager;
  readonly trailDriver: TrailDriver;
  private readonly running = new Set<{ inst: EffectInstance; handle: { alive: boolean } }>();
  private readonly warned = new Set<string>();
  private step: QualityStep = 'medium';
  private readonly fx: FxContext;

  constructor(
    private readonly host: VfxHost,
    doc: Document | null = typeof document === 'undefined' ? null : document,
    private readonly warn: (m: string) => void = (m) => console.warn(m),
  ) {
    const s = host.scene;
    this.sparks = new SparkPool(s, this.sparkBudget);
    this.points = new PointsPool(s, this.pointsBudget);
    this.decals = new DecalPool(s, host.heightAt, QUALITY.medium.decals);
    this.lights = new LightFlashPool(s);
    this.trails = new TrailManager(s);
    this.trailDriver = new TrailDriver(this.trails);
    this.screen = new ScreenFx(doc);
    this.fx = {
      scene: s,
      sparks: this.sparks,
      points: this.points,
      decals: this.decals,
      lights: this.lights,
      dissolver: this.dissolver,
      now: () => this.clock.now,
    };
  }

  get quality(): QualityStep {
    return this.step;
  }

  /** Routes `setQuality` to the quality manager (persist, graphics, bloom) when one is attached. */
  qualityDelegate: ((q: QualityStep) => void) | null = null;

  setQuality(q: QualityStep): void {
    if (!(q in QUALITY)) return;
    if (this.qualityDelegate) this.qualityDelegate(q);
    else this.applyQuality(q);
  }

  /** Applies a step to the pools. Live particles above the new limit drain naturally; decals drop at once. */
  applyQuality(q: QualityStep): void {
    if (!(q in QUALITY) || q === this.step) return;
    this.step = q;
    const cfg = QUALITY[q];
    this.sparkBudget.scale = cfg.particleScale;
    this.pointsBudget.scale = cfg.particleScale;
    this.decals.setMax(cfg.decals);
  }

  private readonly rootsById = new Map<ActorId, THREE.Object3D>();
  /** Roots whose materials we cloned; any that leave the scene are restored (the despawn event comes after removal). */
  private readonly touched = new Set<THREE.Object3D>();
  private sweepIn = 0;

  private sweep(): void {
    for (const r of [...this.touched]) {
      let p: THREE.Object3D | null = r;
      let inScene = false;
      while (p) {
        if ((p as THREE.Scene).isScene) {
          inScene = true;
          break;
        }
        p = p.parent;
      }
      if (!inScene) {
        this.telegraphs.cancel(r);
        this.materials.restore(r);
        this.touched.delete(r);
      }
    }
  }

  /** Drops everything tied to an actor that went away: trail, telegraph and the cloned materials. */
  forgetActor(actorId: ActorId, root?: THREE.Object3D | null): void {
    this.trailDriver.detach(actorId);
    const r = root ?? this.rootsById.get(actorId) ?? null;
    this.rootsById.delete(actorId);
    if (r) {
      this.telegraphs.cancel(r);
      this.materials.restore(r);
      this.touched.delete(r);
    }
    this.sweep();
  }

  cancelTelegraph(actorId: ActorId): void {
    const r = this.host.actorRoot(actorId) ?? this.rootsById.get(actorId);
    if (r) this.telegraphs.cancel(r);
  }

  spawnEffect(id: EffectId | string, transform: EffectTransform, params: EffectParams = {}): EffectHandle {
    const factory = (EFFECT_IDS as readonly string[]).includes(id) ? EFFECTS[id as EffectId] : undefined;
    if (!factory) {
      if (!this.warned.has(id)) {
        this.warned.add(id);
        this.warn(`vfx: unknown effect id '${String(id)}'`);
      }
      return DEAD;
    }
    if (!transform || !transform.position || !Number.isFinite(transform.position.x + transform.position.y + transform.position.z)) {
      return DEAD;
    }
    let inst: EffectInstance;
    try {
      inst = factory(this.fx, transform, params);
    } catch (err) {
      this.warn(`vfx: effect '${id}' failed: ${err instanceof Error ? err.message : String(err)}`);
      return DEAD;
    }
    const entry = { inst, handle: { alive: true } };
    this.running.add(entry);
    const handle: EffectHandle = {
      stop: () => {
        if (!entry.handle.alive) return;
        entry.handle.alive = false;
        this.running.delete(entry);
        inst.stop();
      },
      get alive() {
        return entry.handle.alive;
      },
    };
    return handle;
  }

  attachTrail(id: string, hilt: THREE.Object3D, tip: THREE.Object3D, opts?: { color?: number }): TrailHandle {
    return this.trailDriver.attach(id, hilt, tip, opts);
  }

  telegraph(actorId: ActorId, kind: 'block' | 'dodge', leadSeconds: number, opts?: { parts?: string[] }): void {
    const root = this.host.actorRoot(actorId);
    if (root) {
      this.rootsById.set(actorId, root);
      this.touched.add(root);
    }
    this.telegraphs.flash(root, kind, leadSeconds, this.clock.now, opts);
  }

  shake(amplitude: number, seconds: number): void {
    this.camera.shake(amplitude, seconds);
  }
  fovPunch(degrees: number, seconds?: number): void {
    this.camera.fovPunch(degrees, seconds);
  }
  pulseScreen(strength: number, seconds: number, color?: number): void {
    this.screen.pulse(strength, seconds, color);
  }

  dissolve(root: THREE.Object3D, seconds: number, opts?: { tint?: number }): Promise<void> {
    this.touched.add(root);
    return this.dissolver.start(root, seconds, this.clock.now, opts).done;
  }

  createWeaponMarkers(weapon: THREE.Object3D): { hilt: THREE.Object3D; tip: THREE.Object3D } {
    return createWeaponMarkers(weapon);
  }

  /** Render `world` phase, band 100: advance the visual clock and every pool. `frozen` = hit-stop or pause. */
  update(frameTime: number, frozen: boolean): void {
    this.clock.advance(frameTime, frozen);
    const now = this.clock.now;
    for (const entry of [...this.running]) {
      let alive = false;
      try {
        alive = entry.inst.update(now);
      } catch {
        alive = false;
      }
      if (!alive) {
        entry.handle.alive = false;
        this.running.delete(entry);
      }
    }
    this.sparks.update(now);
    this.points.update(now);
    this.decals.update(now);
    this.lights.update(now);
    this.trails.update(now);
    this.telegraphs.update(now);
    this.dissolver.update(now);
    if (++this.sweepIn >= 120) {
      this.sweepIn = 0;
      this.sweep();
    }
  }

  dispose(): void {
    for (const e of this.running) e.inst.stop();
    this.running.clear();
    this.trailDriver.dispose();
    this.trails.dispose();
    this.sparks.dispose();
    this.points.dispose();
    this.decals.dispose();
    this.lights.dispose();
    this.telegraphs.dispose();
    this.dissolver.dispose();
    this.screen.dispose();
    this.camera.clear(null);
    this.rootsById.clear();
    this.touched.clear();
  }
}
