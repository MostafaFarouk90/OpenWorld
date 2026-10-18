import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { ActorRegistry } from '../actors/ActorRegistry';
import type { CombatRegistry } from '../actors/CombatRegistry';
import type { DamageResolver, ModifiableRequest } from '../actors/DamageResolver';
import { DUMMY_INIT, PLAYER_ID } from '../actors/teams';
import { HurtboxSet } from '../combat/HurtboxSet';
import { isHeavyBlow } from '../combat/heavyBlow';
import type { GameEvents } from '../core/events';
import type { Vec3 } from '../physics/PhysicsWorld';
import './dummies.events';

export interface DummySpotLike {
  feet: Vec3;
  /** Radians about +Y; the dummy faces +Z at yaw 0. */
  yaw: number;
}

/** Tuning of the blocking dummies (seconds and metres). */
export const BLOCKING = {
  guardUpSeconds: 1.2,
  guardDownSeconds: 1.0,
  staggerSeconds: 1.2,
  /** Mean seconds between scripted swings; each interval varies by +-10% from the rng. */
  swingEverySeconds: 4,
  swingTelegraphSeconds: 0.5,
  swingRange: 4,
  /** cos of the half-angle of the dummy's front arc in which the player draws a swing. */
  frontCos: 0.5,
  swingDamage: 1,
  swingPoise: 1,
  swingAttackId: 'blocking-dummy-swing',
  swingMoveId: 'blocking-dummy-swing',
  modifierOrder: -50,
} as const;

export type BlockingGuardState = 'up' | 'down' | 'broken';

export interface BlockingDummyCounts {
  hitOpen: number;
  blocked: number;
  guardBroken: number;
  parried: number;
}

export interface BlockingDummyHandle {
  /** The dummy's actor id (the `dummyId` of its events). */
  readonly id: string;
  readonly counts: Readonly<BlockingDummyCounts>;
  readonly state: BlockingGuardState;
  readonly guardUp: boolean;
  readonly root: THREE.Object3D;
  /** Removes this dummy (its listeners and modifier go with the last one). */
  dispose(): void;
}

/** What the blocking dummies need from the game; `Game.ctx` provides all of it. */
export interface BlockingHost {
  scene: THREE.Object3D;
  actors: ActorRegistry;
  damage: DamageResolver;
  events: GameEvents;
  combat: CombatRegistry;
  /** The player's feet right now. */
  playerFeet(): Vec3;
  /** Injectable for tests; mulberry32 with a fixed seed by default. */
  rng?: () => number;
  warn?: (message: string) => void;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Decision = 'blocked' | 'guardBroken';

interface Swing {
  swingId: number;
  left: number;
}

class BlockingDummy implements BlockingDummyHandle {
  readonly counts: BlockingDummyCounts = { hitOpen: 0, blocked: 0, guardBroken: 0, parried: 0 };
  readonly root = new THREE.Group();
  readonly actor: Actor;
  state: BlockingGuardState = 'up';
  stateLeft: number = BLOCKING.guardUpSeconds;
  swingLeft: number;
  swing: Swing | null = null;
  decision: Decision | null = null;
  swingCounter = 0;
  private readonly plate = new THREE.Group();
  private raise = 1;
  private readonly hurtboxes: HurtboxSet;
  private readonly offTarget: () => void;
  private disposed = false;

  constructor(
    private readonly host: BlockingHost,
    spot: DummySpotLike,
    swingFirst: number,
    private readonly onDispose: (d: BlockingDummy) => void,
  ) {
    this.yaw = spot.yaw;
    this.swingLeft = swingFirst;
    this.root.position.set(spot.feet.x, spot.feet.y, spot.feet.z);
    this.root.rotation.y = spot.yaw;
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a });
    const iron = new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.5, roughness: 0.5 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.6, 10), wood);
    post.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), wood);
    head.position.y = 1.8;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.12), wood);
    arm.position.y = 1.35;
    const body = new THREE.Object3D();
    body.name = 'BlockDummyBody';
    // The shield plate stands in front (+Z) when raised and tips down towards the ground when lowered.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.08), iron);
    this.plate.add(shield);
    this.plate.name = 'BlockDummyShield';
    this.root.add(post, head, arm, body, this.plate);
    this.applyPlate();
    host.scene.add(this.root);
    this.root.updateMatrixWorld(true);

    this.actor = host.actors.spawn({ ...DUMMY_INIT, kind: 'blocking-dummy', owner: this.root, root: this.root });
    this.hurtboxes = new HurtboxSet(
      this.root,
      [{ name: 'BlockDummyBody', bone: 'BlockDummyBody', start: { x: 0, y: 0.25, z: 0 }, end: { x: 0, y: 1.7, z: 0 }, radius: 0.4 }],
      this.root,
    );
    this.offTarget = host.combat.addTarget(this.hurtboxes, this.actor.id);
  }

  private readonly yaw: number;

  get id(): string {
    return this.actor.id;
  }

  get guardUp(): boolean {
    return this.state === 'up';
  }

  /** Front vector in the world (the dummy faces +Z at yaw 0). */
  get forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  setState(state: BlockingGuardState, seconds: number): void {
    this.state = state;
    this.stateLeft = seconds;
  }

  animate(dt: number): void {
    const target = this.state === 'up' ? 1 : 0;
    const step = 6 * dt;
    this.raise = this.raise < target ? Math.min(target, this.raise + step) : Math.max(target, this.raise - step);
    this.applyPlate();
    this.root.rotation.x = this.state === 'broken' ? -0.25 : 0; // a broken guard tips the body back
    this.root.updateMatrixWorld(true);
  }

  private applyPlate(): void {
    this.plate.position.set(0, 0.35 + 0.75 * this.raise, 0.45);
    this.plate.rotation.x = (1 - this.raise) * -1.2;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offTarget();
    this.hurtboxes.dispose();
    this.host.actors.despawn(this.actor.id);
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.onDispose(this);
  }
}

/**
 * Blocking dummies for quest R02: immortal neutral actors with a raised-and-lowered guard and a
 * scripted telegraphed swing so the player has something to parry. Drive it with `update(dt)`.
 */
export class BlockingDummies {
  private dummies: BlockingDummy[] = [];
  private offs: Array<() => void> = [];
  private readonly rng: () => number;
  private readonly warn: (message: string) => void;
  private disposed = false;

  constructor(private readonly host: BlockingHost) {
    this.rng = host.rng ?? mulberry32(0x5eed);
    this.warn = host.warn ?? ((m) => console.warn(m));
    const { events, damage } = host;
    this.offs.push(damage.addModifier('blocking-dummies.guard', (req, target) => this.guard(req, target), BLOCKING.modifierOrder));
    this.offs.push(events.on('damage.dealt', (r) => this.onDealt(r)));
    this.offs.push(events.on('player.parried', (e) => this.onParried(e.attackerId)));
  }

  get handles(): readonly BlockingDummyHandle[] {
    return this.dummies;
  }

  /** Replaces any previous dummies. Non-finite spots warn and are skipped. */
  place(spots: readonly DummySpotLike[]): BlockingDummyHandle[] {
    for (const d of [...this.dummies]) d.dispose();
    const out: BlockingDummyHandle[] = [];
    for (const s of spots) {
      const ok = [s?.feet?.x, s?.feet?.y, s?.feet?.z, s?.yaw].every((v) => typeof v === 'number' && Number.isFinite(v));
      if (!ok) {
        this.warn(`BlockingDummies: invalid spot ${JSON.stringify(s)}`);
        continue;
      }
      const d = new BlockingDummy(this.host, s, this.nextSwingDelay(), (x) => {
        this.dummies = this.dummies.filter((o) => o !== x);
      });
      this.dummies.push(d);
      out.push(d);
    }
    return out;
  }

  private nextSwingDelay(): number {
    return BLOCKING.swingEverySeconds * (0.9 + 0.2 * this.rng());
  }

  update(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    const feet = this.host.playerFeet();
    for (const d of [...this.dummies]) {
      this.cycle(d, dt);
      this.swing(d, dt, feet);
      d.animate(dt);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of [...this.dummies]) d.dispose();
    for (const off of this.offs.splice(0)) off();
  }

  // ---- guard cycle ----

  private cycle(d: BlockingDummy, dt: number): void {
    d.stateLeft -= dt;
    // A big dt may cross several boundaries; the loop keeps the phase exact.
    while (d.stateLeft <= 1e-9) {
      const over = -d.stateLeft;
      if (d.state === 'up') d.setState('down', BLOCKING.guardDownSeconds - over);
      else d.setState('up', BLOCKING.guardUpSeconds - over); // 'down', and the end of a stagger, raise the guard
    }
  }

  // ---- scripted swing ----

  private inFront(d: BlockingDummy, feet: Vec3): boolean {
    const dx = feet.x - d.root.position.x;
    const dz = feet.z - d.root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BLOCKING.swingRange) return false;
    if (dist < 1e-6) return true;
    const f = d.forward;
    return (dx * f.x + dz * f.z) / dist >= BLOCKING.frontCos;
  }

  private swing(d: BlockingDummy, dt: number, feet: Vec3): void {
    const { events } = this.host;
    if (d.swing) {
      if (d.state === 'broken') {
        events.emit('telegraph.cancelled', { actorId: d.id, swingId: d.swing.swingId });
        d.swing = null;
        d.swingLeft = this.nextSwingDelay();
        return;
      }
      d.swing.left -= dt;
      if (d.swing.left <= 1e-9) {
        const s = d.swing;
        d.swing = null;
        this.land(d, s.swingId, feet);
      }
      return;
    }
    if (d.state === 'broken') return;
    d.swingLeft = Math.max(0, d.swingLeft - dt);
    if (d.swingLeft > 0 || !this.inFront(d, feet)) return; // stays ready until the player is in front
    const swingId = ++d.swingCounter;
    d.swingLeft = Math.max(0, this.nextSwingDelay() - BLOCKING.swingTelegraphSeconds); // swing starts are ~4 s apart
    d.swing = { swingId, left: BLOCKING.swingTelegraphSeconds };
    events.emit('telegraph', {
      actorId: d.id,
      kind: 'block',
      attackId: BLOCKING.swingAttackId,
      moveId: BLOCKING.swingMoveId,
      swingId,
      leadSeconds: BLOCKING.swingTelegraphSeconds,
    });
  }

  private land(d: BlockingDummy, swingId: number, feet: Vec3): void {
    const { events, damage, actors } = this.host;
    const player = actors.get(PLAYER_ID);
    if (!player || player.dead) {
      events.emit('telegraph.cancelled', { actorId: d.id, swingId });
      return;
    }
    const dx = feet.x - d.root.position.x;
    const dz = feet.z - d.root.position.z;
    const len = Math.hypot(dx, dz);
    const direction = len > 1e-6 ? new THREE.Vector3(dx / len, 0, dz / len) : new THREE.Vector3(0, 0, 1);
    events.emit('attack.window', { actorId: d.id, attackId: BLOCKING.swingAttackId, swingId, phase: 'open' });
    // A neutral actor cannot damage anyone (teams.ts); the dummy is hostile only for this one synchronous hit.
    const team = d.actor.team;
    d.actor.team = 'hostile';
    try {
      damage.apply({
        attackerId: d.id,
        targetId: PLAYER_ID,
        amount: BLOCKING.swingDamage,
        poise: BLOCKING.swingPoise,
        kind: 'melee',
        attackId: BLOCKING.swingAttackId,
        swingId,
        direction,
      });
    } finally {
      d.actor.team = team;
      events.emit('attack.window', { actorId: d.id, attackId: BLOCKING.swingAttackId, swingId, phase: 'close' });
    }
  }

  // ---- damage ----

  private byActor(id: string): BlockingDummy | undefined {
    return this.dummies.find((d) => d.id === id);
  }

  /** Defender modifier (band -100..-1): decides the outcome of the player's hits on a dummy. */
  private guard(req: ModifiableRequest, target: Actor): void {
    const d = this.byActor(target.id);
    if (!d || req.attackerId !== PLAYER_ID || req.outcome === 'immune') return;
    d.decision = null;
    if (d.state !== 'up') return;
    if (isHeavyBlow(req)) {
      d.decision = 'guardBroken';
      d.setState('broken', BLOCKING.staggerSeconds);
      return;
    }
    d.decision = 'blocked';
    req.outcome = 'blocked';
    req.amount = 0;
    req.poise = 0;
  }

  private onDealt(r: { targetId: string; attackerId: string | null; outcome: string }): void {
    const d = this.byActor(r.targetId);
    if (!d || r.attackerId !== PLAYER_ID) return;
    const decision = d.decision;
    d.decision = null;
    if (r.outcome === 'immune') return;
    const payload = { dummyId: d.id, byId: PLAYER_ID };
    const { events } = this.host;
    if (decision === 'guardBroken') {
      d.counts.guardBroken++;
      events.emit('dummy.guardBroken', payload);
    } else if (decision === 'blocked' && r.outcome === 'blocked') {
      d.counts.blocked++;
      events.emit('dummy.blocked', payload);
    } else if (r.outcome === 'hit') {
      d.counts.hitOpen++;
      events.emit('dummy.hitOpen', payload);
    }
  }

  private onParried(attackerId: string | null): void {
    if (!attackerId) return;
    const d = this.byActor(attackerId);
    if (!d) return;
    d.counts.parried++;
    this.host.events.emit('dummy.parried', { dummyId: d.id, byId: PLAYER_ID });
  }
}
