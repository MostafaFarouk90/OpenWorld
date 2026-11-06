// The Crucible arena's four steam valves (plans/act4-L6.md section 3). Each one can be shut two ways, so every class can finish
// the fight: F at the wheel (`ValveWheel` and `valveInteractable`), or any player hit on it (a sword, an arrow, a spell). The
// struck wheel is a neutral immortal actor with one hurtbox (the dummy and cart pattern); a damage modifier turns a player hit
// on it into a shut and zeroes the hit. Hostile hits (a coal shot) never count. The bank decides nothing: it reports each shut
// to the encounter, which answers whether it took (the live valve), was a dud (a dark valve: it springs back) or was refused.
import * as THREE from 'three';
import type { Actor } from '../../../actors/Actor';
import type { ModifiableRequest } from '../../../actors/DamageResolver';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import type { GameContext } from '../../../core/Game';
import { ValveWheel, valveInteractable } from '../../../puzzles/ValveWheel';
import { ValvePlume } from './bellowsFx';
import { BELLOWS_VALVE_KIND, LOOK, VALVES } from './tuning';

export type ValveShutResult = 'vented' | 'dud' | 'refused';
export type ValveSource = 'interact' | 'hit';
export type ValveLook = 'dark' | 'live' | 'shut';

export const VALVE_MODIFIER_ID = 'bosses.bellows.valve-hit';
const VALVE_MODIFIER_ORDER = 80;

const POST_GEO = new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6);
const WHEEL_GEO = new THREE.TorusGeometry(0.45, 0.07, 6, 16);
const PIPE_GEO = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6);

interface Valve {
  readonly n: number;
  readonly at: THREE.Vector3;
  readonly wheel: ValveWheel;
  readonly mesh: THREE.Group;
  readonly ring: THREE.Mesh;
  readonly actor: Actor;
  readonly hurtboxes: HurtboxSet;
  look: ValveLook;
  /** Seconds until a dud springs back (0: not springing). */
  dudT: number;
}

export interface ValveBankOptions {
  /** World positions in valve order (1..n). */
  places: readonly THREE.Vector3[];
  /** A shut by F or a hit, 0-based; the encounter answers. */
  onShut(index: number, source: ValveSource): ValveShutResult;
  warn(message: string): void;
}

export class ValveBank {
  private readonly valves: Valve[] = [];
  private readonly offs: (() => void)[] = [];
  private readonly plume = new ValvePlume();
  private readonly darkMat = new THREE.MeshStandardMaterial({ color: LOOK.valveDark, metalness: 0.6, roughness: 0.6 });
  private readonly liveMat = new THREE.MeshStandardMaterial({ color: LOOK.brass, metalness: 0.7, roughness: 0.4, emissive: LOOK.valveLive, emissiveIntensity: 0.8 });
  private readonly byActor = new Map<string, number>();
  private disposed = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly opts: ValveBankOptions,
  ) {
    ctx.scene.add(this.plume.group);
    try {
      opts.places.forEach((at, i) => this.mount(at, i));
    } catch (err) {
      this.dispose();
      throw err;
    }
    this.offs.push(ctx.damage.addModifier(VALVE_MODIFIER_ID, (req, target, attacker) => this.onHit(req, target, attacker), VALVE_MODIFIER_ORDER));
  }

  get count(): number {
    return this.valves.length;
  }

  /** The look of valve `index` (tests). */
  look(index: number): ValveLook | null {
    return this.valves[index]?.look ?? null;
  }

  /** The wheel of valve `index` (tests, the real-game driver). */
  wheel(index: number): ValveWheel | null {
    return this.valves[index]?.wheel ?? null;
  }

  /** The struck actor of valve `index` (tests). */
  actorId(index: number): string | null {
    return this.valves[index]?.actor.id ?? null;
  }

  position(index: number): THREE.Vector3 | null {
    return this.valves[index]?.at ?? null;
  }

  /** Lights valve `index` (or none with -1); every other unshut valve goes dark. */
  setLive(index: number): void {
    for (const [i, v] of this.valves.entries()) {
      if (v.look === 'shut') continue;
      this.setLook(v, i === index ? 'live' : 'dark');
    }
    const live = this.valves[index];
    if (live && live.look === 'live') this.plume.show(live.at);
    else this.plume.hide();
  }

  /** Valve `index` produced its bar: it stays shut for the rest of the fight. */
  markShut(index: number): void {
    const v = this.valves[index];
    if (!v) return;
    this.setLook(v, 'shut');
    v.wheel.locked = true;
    if (!this.valves.some((x) => x.look === 'live')) this.plume.hide();
  }

  /** The valve shut by the player (F or a hit): ask the encounter, then spring a dud or a refusal back. */
  shut(index: number, source: ValveSource): ValveShutResult {
    const v = this.valves[index];
    if (!v || this.disposed || v.look === 'shut' || v.dudT > 0) return 'refused';
    const result = this.opts.onShut(index, source);
    if (result === 'vented') {
      this.markShut(index);
      return result;
    }
    // A dud hisses and springs back; a refusal springs back at once and stays as it was.
    if (result === 'dud') {
      v.dudT = VALVES.dudSeconds;
      v.wheel.locked = true;
      return result;
    }
    this.springBack(v);
    return result;
  }

  tick(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    this.plume.update(dt);
    for (const v of this.valves) {
      if (v.dudT <= 0) continue;
      v.dudT = Math.max(0, v.dudT - dt);
      if (v.dudT === 0) this.springBack(v);
      else v.ring.rotation.z = (v.dudT / VALVES.dudSeconds) * Math.PI;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0).reverse()) off();
    for (const v of this.valves) {
      if (this.ctx.actors.get(v.actor.id)) this.ctx.actors.despawn(v.actor.id);
      v.hurtboxes.dispose();
      v.mesh.removeFromParent();
    }
    this.valves.length = 0;
    this.byActor.clear();
    this.plume.dispose();
    this.darkMat.dispose();
    this.liveMat.dispose();
  }

  // ---- internals ----

  private mount(at: THREE.Vector3, i: number): void {
    const n = i + 1;
    const mesh = new THREE.Group();
    mesh.name = `bellows-valve-${n}`;
    mesh.position.copy(at);
    const post = new THREE.Mesh(POST_GEO, this.darkMat);
    post.position.y = 0.55;
    const pipe = new THREE.Mesh(PIPE_GEO, this.darkMat);
    pipe.position.set(0, 1.9, 0);
    const ring = new THREE.Mesh(WHEEL_GEO, this.darkMat);
    ring.position.y = VALVES.hurtHeight;
    const bone = new THREE.Object3D();
    bone.name = `bellows-valve-bone-${n}`;
    bone.position.y = VALVES.hurtHeight;
    mesh.add(post, pipe, ring, bone);
    this.ctx.scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const hurtboxes = new HurtboxSet(mesh, [{ name: 'wheel', bone: bone.name, start: { x: 0, y: -0.5, z: 0 }, end: { x: 0, y: 0.3, z: 0 }, radius: VALVES.hurtRadius }], mesh);
    const actor = this.ctx.actors.spawn({ kind: BELLOWS_VALVE_KIND, team: 'neutral', immortal: true, maxHealth: 100, maxPoise: 0, root: mesh, owner: mesh });
    actor.data['audio'] = { material: 'metal' };
    this.offs.push(this.ctx.combat.addTarget(hurtboxes, actor.id));
    const wheel = new ValveWheel({
      id: `valve:bellows-${n}`,
      positions: 2,
      onChange: (position) => {
        if (position !== 0) this.shut(i, 'interact');
      },
    });
    const v: Valve = { n, at, wheel, mesh, ring, actor, hurtboxes, look: 'dark', dudT: 0 };
    this.valves.push(v);
    this.byActor.set(actor.id, i);
    this.offs.push(
      this.ctx.interaction.register(
        valveInteractable(wheel, (out: THREE.Vector3) => out.set(at.x, at.y + 1, at.z), {
          radius: VALVES.interactRadius,
          enabled: () => v.look !== 'shut' && v.dudT <= 0,
        }),
      ),
    );
  }

  private onHit(req: ModifiableRequest, target: Actor, attacker: Actor | null): void {
    const i = this.byActor.get(target.id);
    if (i === undefined) return;
    // The wheel never takes damage; only a player's landed hit turns it.
    req.amount = 0;
    req.poise = 0;
    if (attacker?.team !== 'player' || req.outcome !== 'hit' || req.kind === 'status') return;
    try {
      this.shut(i, 'hit');
    } catch (err) {
      this.opts.warn(`valve hit failed (${String(err)})`);
    }
  }

  private springBack(v: Valve): void {
    v.dudT = 0;
    v.ring.rotation.z = 0;
    v.wheel.locked = false;
    v.wheel.set(0);
  }

  private setLook(v: Valve, look: ValveLook): void {
    v.look = look;
    const m = look === 'live' ? this.liveMat : this.darkMat;
    v.ring.material = m;
    if (look === 'shut') v.ring.rotation.z = Math.PI / 2;
  }
}
