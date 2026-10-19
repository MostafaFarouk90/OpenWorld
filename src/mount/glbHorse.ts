// The Ashmare as the Quaternius rigged horse (assets/README.md). Same `HorseVisual` contract as the procedural rig: forward is
// -Z, the root sits between the hooves, and the sockets and hurtbox bones carry the names the mount and combat already use.
// The glb faces +Z and is 6.9 units tall, so it hangs from a holder turned half a turn and scaled to a 2.1 m horse; the
// sockets and the hurtbox proxies live in the rig's own (metre) frame and are re-placed from the skeleton every tick,
// so no bone rest rotation or scale ever reaches them.
import * as THREE from "three";
import type { HurtboxDef } from "../combat/types";
import { HorseEffects } from "./horseEffects";
import type { HorseVisual } from "./horseVisual";
import { HORSE, QuadrupedGait, modeOf, type GaitMode } from "./rig";

/** The loaded glb: a fresh skeleton-safe clone per call, and the shared clips. */
export interface HorseAsset {
  instantiate(): THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

/** Raw glb units to metres. */
export const GLB_HORSE_SCALE = 0.3;
const CROSSFADE = 0.25;
/**
 * The Quaternius horse ships Idle, Walk, WalkSlow and Run, no gallop clip. A clip named Gallop is used if the asset ever
 * gains one; until then the gallop is Run at a faster pace plus a procedural lean and stride bob, so Shift reads
 * differently from the canter.
 */
export const GALLOP_CLIP = "Gallop";
const GALLOP_LEAN = -0.05;
const GALLOP_BOB = 0.05;
const GALLOP_RUN_SCALE = { divisor: 7.5, min: 1.4, max: 1.8 };

/** The procedural gallop on top of the clip: body pitch (radians, negative is nose down) and lift (metres), at a gallop weight 0..1 and a stride phase 0..1. */
export function gallopPose(weight: number, phase: number): { pitch: number; lift: number } {
  const w = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
  return { pitch: GALLOP_LEAN * w, lift: GALLOP_BOB * w * Math.abs(Math.sin(phase * Math.PI * 2)) };
}
/** Metres the saddle sits above the torso bone (the back's surface). */
const SADDLE_ABOVE_TORSO = 0.27;
const TINT = new THREE.Color(0x2a211d);
const GLOW = new THREE.Color(0x2a0a00);

/** The skeleton bones the horse reads (names as GLTFLoader sanitises them: no dots). */
const BONES = [
  "Torso",
  "Hips",
  "Shoulders",
  "Neck",
  "Head",
  "Head_end",
  "Tail1",
  "Tail4_end",
] as const;
type BoneName = (typeof BONES)[number];

const LEG_LENGTH = HORSE.legLength;
const BODY_RADIUS = 0.45;
const NECK_RADIUS = 0.25;
const HEAD_RADIUS = 0.2;

const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();

/** Orients `o` so its -Z points from its position toward `to` (all in the frame of o's parent). */
function aimMinusZ(o: THREE.Object3D, to: THREE.Vector3): void {
  if (o.position.distanceToSquared(to) < 1e-8) return;
  _m.lookAt(o.position, to, _up);
  o.quaternion.setFromRotationMatrix(_m);
}

export class GlbHorse implements HorseVisual {
  readonly root = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly saddle = new THREE.Object3D();
  readonly glb = true;
  readonly length: number;
  readonly hurtboxDefs: HurtboxDef[];
  private readonly holder = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly bones = new Map<BoneName, THREE.Object3D>();
  private readonly sockets: Record<
    "mane" | "head" | "tail" | "collar",
    THREE.Object3D
  >;
  private readonly proxies: Record<"spine" | "neck" | "head", THREE.Object3D>;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private readonly gait = new QuadrupedGait(
    LEG_LENGTH,
    QuadrupedGait.tuningFor(HORSE),
  );
  private readonly effects: HorseEffects;
  private readonly owned: THREE.Material[] = [];
  private slope = 0;
  private gallop = 0;
  private disposed = false;

  constructor(asset: HorseAsset) {
    this.root.name = "ashmare";
    this.rig.name = "quadruped";
    this.root.add(this.rig);
    this.holder.rotation.y = Math.PI;
    this.holder.scale.setScalar(GLB_HORSE_SCALE);
    this.rig.add(this.holder);
    this.model = asset.instantiate();
    this.holder.add(this.model);
    this.ashen();
    try {
      for (const name of BONES) {
        const b = this.model.getObjectByName(name);
        if (!b) throw new Error(`GlbHorse: bone "${name}" not found`);
        this.bones.set(name, b);
      }
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of asset.clips)
        this.actions.set(clip.name, this.mixer.clipAction(clip));
      for (const need of ["Idle", "Walk", "WalkSlow", "Run"])
        if (!this.actions.has(need))
          throw new Error(`GlbHorse: clip "${need}" not found`);

      const named = (name: string): THREE.Object3D => {
        const o = new THREE.Object3D();
        o.name = name;
        this.rig.add(o);
        return o;
      };
      this.saddle.name = "socket.saddle";
      this.rig.add(this.saddle);
      this.sockets = {
        mane: named("socket.mane"),
        head: named("socket.head"),
        tail: named("socket.tail"),
        collar: named("socket.collar"),
      };
      // The hurtbox bones: HurtboxSet finds them by these names, and their capsules are bone-local (metres, -Z along the part).
      this.proxies = {
        spine: named("spine"),
        neck: named("neck"),
        head: named("head"),
      };

      this.play("Idle", 1, 0);
      this.mixer.update(0);
      this.holder.updateMatrixWorld(true);
      this.place();
      const at = (n: BoneName): THREE.Vector3 =>
        this.rigPoint(n, new THREE.Vector3());
      // Chest to rump, not the feet: the slope pitch spans the body.
      this.length = Math.abs(at("Tail1").z - at("Neck").z);
      const neckLen = at("Neck").distanceTo(at("Head"));
      const headLen = at("Head").distanceTo(at("Head_end"));
      const half = Math.abs(at("Hips").z - at("Shoulders").z) / 2 + 0.1;
      this.hurtboxDefs = [
        {
          name: "torso",
          bone: "spine",
          start: { x: 0, y: 0, z: -half },
          end: { x: 0, y: 0, z: half },
          radius: BODY_RADIUS,
        },
        {
          name: "abdomen",
          bone: "neck",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 0, y: 0, z: -neckLen },
          radius: NECK_RADIUS,
        },
        {
          name: "hips",
          bone: "head",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 0, y: 0, z: -headLen },
          radius: HEAD_RADIUS,
        },
      ];
      this.effects = new HorseEffects(
        this.sockets.mane,
        this.root,
        neckLen,
        this.length,
      );
      this.reset();
    } catch (err) {
      // A half-built horse frees its private materials; the caller falls back to the procedural one.
      for (const m of this.owned) m.dispose();
      throw err;
    }
  }

  /** The clip playing now and its pace (tests, debugging). */
  get playing(): { clip: string; timeScale: number } | null {
    return this.current ? { clip: this.current.getClip().name, timeScale: this.current.timeScale } : null;
  }

  get mode(): GaitMode {
    return modeOf(this.gait);
  }

  /** The Ashmare's dark hide and ember glow on private copies of the body materials (the cached glb keeps its own). */
  private ashen(): void {
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      // The export wrote alpha 0 with alphaMode MASK, which three discards whole: the horse is opaque.
      mat.alphaTest = 0;
      mat.opacity = 1;
      mat.transparent = false;
      // The hide (the brown material); the mane, tail and hooves are already near black.
      if (mat.color.r > mat.color.b + 0.1) {
        mat.color.copy(TINT);
        mat.emissive.copy(GLOW);
      }
      mesh.material = mat;
      mesh.frustumCulled = false;
      this.owned.push(mat);
    });
  }

  /** A bone's position in the rig's frame. */
  private rigPoint(name: BoneName, out: THREE.Vector3): THREE.Vector3 {
    this.bones.get(name)!.getWorldPosition(out);
    return this.rig.worldToLocal(out);
  }

  /** Re-places the saddle, sockets and hurtbox proxies on the current pose. Needs fresh world matrices. */
  private place(): void {
    const v = (n: BoneName) => this.rigPoint(n, new THREE.Vector3());
    const torso = v("Torso");
    const hips = v("Hips");
    const shoulders = v("Shoulders");
    const neck = v("Neck");
    const head = v("Head");
    const headEnd = v("Head_end");
    const tailRoot = v("Tail1");
    const tailTip = v("Tail4_end");

    this.saddle.position.set(0, torso.y + SADDLE_ABOVE_TORSO, torso.z);
    this.sockets.mane.position.lerpVectors(neck, head, 0.5).y += 0.22;
    aimMinusZ(this.sockets.mane, _p.copy(head).setY(head.y + 0.22));
    this.sockets.head.position.lerpVectors(head, headEnd, 0.5);
    aimMinusZ(this.sockets.head, headEnd);
    this.sockets.tail.position.copy(tailTip);
    aimMinusZ(this.sockets.tail, tailRoot);
    this.sockets.collar.position.lerpVectors(neck, head, 0.85);
    aimMinusZ(this.sockets.collar, head);

    // The torso capsule runs along the body's own -Z; it tilts with the pose (shoulders to hips).
    this.proxies.spine.position.set(0, torso.y, (hips.z + shoulders.z) / 2);
    aimMinusZ(
      this.proxies.spine,
      _p.copy(this.proxies.spine.position).add(shoulders).sub(hips),
    );
    this.proxies.neck.position.copy(neck);
    aimMinusZ(this.proxies.neck, head);
    this.proxies.head.position.copy(head);
    aimMinusZ(this.proxies.head, headEnd);
  }

  private play(name: string, timeScale: number, fade = CROSSFADE): void {
    const next = this.actions.get(name)!;
    next.timeScale = timeScale;
    if (next === this.current) return;
    next.reset().play();
    if (this.current && fade > 0) next.crossFadeFrom(this.current, fade, false);
    else this.current?.stop();
    this.current = next;
  }

  update(speed: number, slope: number, dt: number): void {
    if (this.disposed) return;
    this.gait.step(speed, dt);
    this.slope += (slope - this.slope) * Math.min(1, dt * 8);
    const mode = this.mode;
    this.gallop += ((mode === "gallop" ? 1 : 0) - this.gallop) * Math.min(1, dt * 6);
    const g = gallopPose(this.gallop, this.gait.phase);
    this.rig.rotation.x = this.slope + g.pitch;
    this.rig.position.y = g.lift;
    if (mode === "idle") this.play("Idle", 1);
    else if (mode === "walk")
      this.play(
        speed < 1.4 ? "WalkSlow" : "Walk",
        THREE.MathUtils.clamp(speed / 2.4, 0.6, 1.6),
      );
    else if (mode === "gallop") {
      if (this.actions.has(GALLOP_CLIP)) this.play(GALLOP_CLIP, THREE.MathUtils.clamp(speed / 12, 0.8, 1.4));
      else {
        const r = GALLOP_RUN_SCALE;
        this.play("Run", THREE.MathUtils.clamp(speed / r.divisor, r.min, r.max));
      }
    } else this.play("Run", THREE.MathUtils.clamp(speed / 9, 0.7, 1.5));
    this.mixer.update(dt);
    this.rig.updateMatrixWorld(true);
    this.place();
    this.effects.step(mode, this.gait.phase);
  }

  animate(frameTime: number): void {
    if (this.disposed || !(frameTime > 0)) return;
    this.effects.animate(this.mode, frameTime);
  }

  reset(): void {
    this.gait.reset();
    this.slope = 0;
    this.gallop = 0;
    this.rig.rotation.x = 0;
    this.rig.position.y = 0;
    this.mixer.stopAllAction();
    this.current = null;
    this.play("Idle", 1, 0);
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    this.place();
    this.effects?.reset();
    this.root.updateMatrixWorld(true);
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.effects.dispose();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const m of this.owned) m.dispose();
    this.root.removeFromParent();
  }
}
