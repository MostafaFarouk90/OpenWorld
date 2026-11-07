// The march (coordinator ruling 2026-11-07): siege foes march on the gate line on their own, whether or not Cael is in
// their sight. The director spawns M52's foot on the rim stairs in reach of the gate (the set's `join` knob); this draws
// them up to the landing (the stairs' top, the rams' target) and then onto the gate line through the shipped taunt
// registry, keeps marching members awake while Cael stands back, and points an idle member at Cael (after a breach, or
// once he let it go). A foe near Cael is his; at the gate
// the gate's own 10 m draw holds as before. Nothing here persists: the director's restart respawns the wave on a load.
import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import type { GameContext } from '../core/Game';
import type { Vec3 } from '../physics/PhysicsWorld';
import { GATE, MARCH } from './tuning';

export type MarchHost = Pick<GameContext, 'actors' | 'services' | 'player'>;

export interface MarchOptions {
  /** The gate line's points and their middle. */
  gate: readonly Vec3[];
  origin: { x: number; z: number };
  /** Every lane anchor the set spawns at (the far draw reaches past the farthest). */
  lanes: Iterable<Vec3>;
  /** The stairs' top the foot climb to before the gate (the `join` knob's `toward` lane); null walks straight to the gate. */
  landing: Vec3 | null;
  isMember(id: ActorId): boolean;
  /** This tick's position of a member, or null (the march then reads the actor's root). */
  memberAt(id: ActorId): { x: number; z: number } | null;
  /** Cael hit it in the assist window: it is his. */
  assisted(id: ActorId): boolean;
  /** False once the gate is breached: the draws stand down and the members go for Cael. */
  standing(): boolean;
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** A member in one of these states with the landing mark as its target is swinging at it. */
const SWING: ReadonlySet<string> = new Set(['telegraph', 'attack', 'recover']);

export class March {
  /** The far draw's radius: past the farthest lane anchor, never under the gate's own draw. */
  readonly reach: number;
  /** Members that climbed the landing (the gate takes them from there). */
  readonly passed = new Set<ActorId>();
  private landingActor: Actor | null = null;
  private off: (() => void) | null = null;
  private offAwake: (() => void) | null = null;
  private alertIn = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly landingToGate: number;

  constructor(
    private readonly host: MarchHost,
    private readonly opts: MarchOptions,
  ) {
    let far = 0;
    for (const p of opts.lanes) far = Math.max(far, flat(p, opts.origin));
    this.reach = Math.max(GATE.tauntRadius, far + MARCH.reachMargin);
    this.landingToGate = opts.landing ? flat(opts.landing, opts.origin) : 0;
    const landing = opts.landing;
    const enemies = host.services.get('enemies');
    // Members stay awake while Cael stands back in the court (the shipped dormancy would sleep the stairs).
    this.offAwake = enemies?.dormancy?.extend((id) => (opts.isMember(id) ? MARCH.awakeMetres : undefined)) ?? null;
    const taunts = enemies?.taunts;
    if (landing && taunts) {
      // A hidden, untargetable mark (no hurtbox): a foe passes it at `landingReach`, before it could swing at it.
      const root = new THREE.Group();
      root.name = 'siege-landing';
      root.position.set(landing.x, landing.y, landing.z);
      this.landingActor = host.actors.spawn({ kind: 'siege-landing', team: 'ally', maxHealth: 1e9, maxPoise: 0, root, owner: root, untargetable: true });
      this.off = taunts.register({
        id: this.landingActor.id,
        position: () => ({ x: landing.x, y: landing.y, z: landing.z }),
        alive: () => opts.standing(),
        radius: this.reach,
        seconds: Number.POSITIVE_INFINITY,
        accepts: (id) => this.toLanding(id),
      });
    }
  }

  private at(id: ActorId): { x: number; z: number } | null {
    const p = this.opts.memberAt(id);
    if (p) return p;
    const a = this.host.actors.get(id);
    if (!a || a.dead || !a.root) return null;
    a.root.getWorldPosition(this.tmp);
    return this.tmp;
  }

  private nearGate(p: { x: number; z: number }): boolean {
    return this.opts.gate.some((g) => flat(g, p) <= GATE.tauntRadius);
  }

  /** Cael is far enough off that the foe keeps marching (inside `releaseMetres` it is his). */
  private clearOfCael(p: { x: number; z: number }): boolean {
    return flat(p, this.host.player.feet) > MARCH.releaseMetres;
  }

  /** The gate's draw: any enemy at the gate (the shipped 10 m rule), and a marching member from anywhere once it climbed. */
  gateAccepts(id: ActorId): boolean {
    if (this.opts.assisted(id)) return false;
    const p = this.at(id);
    if (!p) return false;
    if (this.nearGate(p)) return true;
    return this.opts.isMember(id) && (!this.opts.landing || this.passed.has(id)) && this.clearOfCael(p);
  }

  /** The landing's draw: a marching member that has not climbed it yet. */
  private toLanding(id: ActorId): boolean {
    if (!this.opts.isMember(id) || this.passed.has(id) || this.opts.assisted(id)) return false;
    const p = this.at(id);
    return !!p && !this.nearGate(p) && this.clearOfCael(p);
  }

  /** Marks the members that climbed the landing, and once a second points idle members at Cael. */
  update(dt: number, members: Iterable<{ a: Actor; p: { x: number; z: number } }>): void {
    const landing = this.opts.landing;
    const live = new Set<ActorId>();
    const enemies = this.host.services.get('enemies');
    for (const m of members) {
      live.add(m.a.id);
      // Swinging at the mark (a torch throws from 12 m, a pike thrusts from 3): it has come up far enough.
      if (landing && !this.passed.has(m.a.id) && this.landingActor && enemies?.ground?.get(m.a.id)?.tauntTarget === this.landingActor.id && SWING.has(enemies.view(m.a.id)?.state ?? '')) {
        this.passed.add(m.a.id);
      }
      // Climbed: at the landing, or already nearer the gate than the landing is (a foe that came up another way).
      if (landing && !this.passed.has(m.a.id) && (flat(m.p, landing) <= MARCH.landingReach || flat(m.p, this.opts.origin) < this.landingToGate - 1)) {
        this.passed.add(m.a.id);
      }
    }
    for (const id of this.passed) if (!live.has(id)) this.passed.delete(id);
    this.alertIn -= dt;
    if (this.alertIn > 0) return;
    this.alertIn = MARCH.alertEveryS;
    if (!enemies) return;
    const player = this.host.actors.player.id;
    for (const id of live) {
      const e = enemies.ground?.get(id);
      if (!e || e.tauntTarget !== null || enemies.view(id)?.state !== 'idle') continue;
      e.alert(player);
    }
  }

  dispose(): void {
    this.off?.();
    this.off = null;
    this.offAwake?.();
    this.offAwake = null;
    if (this.landingActor) this.host.actors.despawn(this.landingActor.id);
    this.landingActor = null;
    this.passed.clear();
  }
}
