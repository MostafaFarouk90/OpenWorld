import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import type { DamageModifier } from '../actors/DamageResolver';
import { HurtboxSet } from '../combat/HurtboxSet';
import { HEAVY_CHOP_CLIPS } from '../combat/heavyBlow';
import type { GameContext } from '../core/Game';
import type { Vec3 } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { SURGE } from '../vfx/tuning';
import { buildCartVisual, type CartVisual } from './cartArt';
import { CART, CART_HIT_VALUE, CART_MODIFIER } from './tuning';

export type StructureHost = Pick<GameContext, 'scene' | 'actors' | 'combat' | 'damage' | 'events'>;

/** What a hit does to a cart, in health: the hit-value table (tuning.ts). 0 for anything that is not a heavy chop or the Surge. */
export function cartHitValue(req: { kind: string; attackId?: string }): number {
  if (req.attackId === undefined) return 0;
  if (req.kind === 'melee' && HEAVY_CHOP_CLIPS.has(req.attackId)) return CART_HIT_VALUE.chop;
  if (req.kind === 'spell' && req.attackId === SURGE.spellId) return CART_HIT_VALUE.surge;
  return 0;
}

// ---- barricade ---------------------------------------------------------------------------------------------

/**
 * The barricade is a plain health value on the structure A3 builds: no actor, so nothing but a cart can hurt it and it
 * emits no `actor.died` or damage numbers. Events: `structure.damaged` on every change, `structure.destroyed` once.
 */
export class BarricadeState {
  private _health: number;
  private _destroyed = false;

  constructor(
    readonly id: string,
    readonly maxHealth: number,
    private readonly events: StructureHost['events'],
  ) {
    this._health = maxHealth;
  }

  get health(): number {
    return this._health;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  /** Emits the current value (full health on spawn). */
  announce(): void {
    this.events.emit('structure.damaged', { id: this.id, health: this._health });
  }

  damage(n: number): void {
    if (!(n > 0) || !Number.isFinite(n) || this._destroyed) return;
    this._health = Math.max(0, this._health - n);
    this.announce();
    if (this._health <= 0) {
      this._destroyed = true;
      this.events.emit('structure.destroyed', { id: this.id });
    }
  }

  /** Back to `health` (clamped to 1..max) after a failure; emits `structure.damaged` and re-arms the destroyed event. */
  restore(health: number): void {
    this._health = Math.min(this.maxHealth, Math.max(1, Number.isFinite(health) ? health : this.maxHealth));
    this._destroyed = false;
    this.announce();
  }
}

/**
 * The barricade's look, drawn by A7 (A3 builds none): a palisade of posts and two rails along the line through the
 * barricade anchors, crack marks that appear as it weakens, and the posts lying down where it fell. Geometry and
 * materials are shared by every piece and plain colours (nothing samples world position).
 */
export class BarricadeFx {
  private readonly post = new THREE.BoxGeometry(0.28, 2.2, 0.28);
  private readonly rail = new THREE.BoxGeometry(1, 0.14, 0.12);
  private readonly crack = new THREE.BoxGeometry(0.9, 0.06, 0.12);
  private readonly wood = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.95 });
  private readonly dark = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 });
  private readonly marks: THREE.Mesh[] = [];
  private readonly posts: Array<{ mesh: THREE.Mesh; y: number; yaw: number }> = [];
  private readonly rails: THREE.Mesh[] = [];
  private fallen = false;

  constructor(scene: THREE.Object3D, anchors: readonly Vec3[], private readonly maxHealth: number) {
    const spacing = 1.1;
    for (let i = 0; i + 1 < anchors.length; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      const n = Math.max(1, Math.round(len / spacing));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const m = new THREE.Mesh(this.post, this.wood);
        m.name = 'barricade-post';
        m.castShadow = true;
        const y = a.y + (b.y - a.y) * t;
        m.position.set(a.x + (b.x - a.x) * t, y + 1.1, a.z + (b.z - a.z) * t);
        scene.add(m);
        this.posts.push({ mesh: m, y: y + 1.1, yaw });
      }
      for (const h of [0.7, 1.5]) {
        const r = new THREE.Mesh(this.rail, this.wood);
        r.name = 'barricade-rail';
        r.scale.x = len;
        r.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + h, (a.z + b.z) / 2);
        r.rotation.y = yaw;
        scene.add(r);
        this.rails.push(r);
      }
    }
    // Three crack marks per anchor, revealed at 75%, 50% and 25% health.
    anchors.forEach((a) => {
      [0.5, -0.4, 0.9].forEach((tilt, i) => {
        const m = new THREE.Mesh(this.crack, this.dark);
        m.name = 'barricade-crack';
        m.position.set(a.x + (i - 1) * 0.7, a.y + 1.1 + i * 0.25, a.z + 0.2);
        m.rotation.z = tilt;
        m.visible = false;
        m.userData['rank'] = i;
        scene.add(m);
        this.marks.push(m);
      });
    });
  }

  show(health: number): void {
    const f = health / this.maxHealth;
    for (const m of this.marks) m.visible = f <= 0.75 - (m.userData['rank'] as number) * 0.25;
  }

  /** The line gives way: posts topple, rails drop, the marks hide. */
  collapse(): void {
    if (this.fallen) return;
    this.fallen = true;
    this.posts.forEach((p, i) => {
      p.mesh.rotation.set(Math.PI / 2 - 0.1, p.yaw + (i % 3) * 0.4, 0);
      p.mesh.position.y = p.y - 0.95;
    });
    for (const r of this.rails) r.position.y -= 1.2;
    for (const m of this.marks) m.visible = false;
  }

  reset(health: number): void {
    if (this.fallen) {
      this.fallen = false;
      for (const p of this.posts) {
        p.mesh.rotation.set(0, 0, 0);
        p.mesh.position.y = p.y;
      }
      for (const r of this.rails) r.position.y += 1.2;
    }
    this.show(health);
  }

  /** Posts standing (tests). */
  get standing(): number {
    return this.fallen ? 0 : this.posts.length;
  }

  dispose(): void {
    for (const o of [...this.marks, ...this.rails, ...this.posts.map((p) => p.mesh)]) o.removeFromParent();
    this.marks.length = this.rails.length = this.posts.length = 0;
    for (const g of [this.post, this.rail, this.crack]) g.dispose();
    this.wood.dispose();
    this.dark.dispose();
  }
}

// ---- brazier cart ------------------------------------------------------------------------------------------

export type CartPhase = 'rolling' | 'windup' | 'collapse' | 'vanish' | 'gone';
export type CartOutcome = 'arrived' | 'destroyed';

export interface CartSpec {
  id: string;
  /** World start (the lane anchor) and the point it rams (the nearest barricade anchor). */
  start: Vec3;
  end: Vec3;
  /** The set's origin: positions are kept as offsets from it, so far coordinates cost no precision. */
  origin: { x: number; z: number };
  onResolve(cart: Cart, how: CartOutcome): void;
}

const GRAVITY_FREE_TILT = 0.7;

/** One brazier cart: an actor with hurtboxes (hostile, no poise), rolling down a straight lane at `CART.speed`. */
export class Cart {
  readonly id: string;
  readonly actor: Actor;
  readonly visual: CartVisual;
  private readonly hurtboxes: HurtboxSet;
  private readonly removers: Array<() => void> = [];
  private _phase: CartPhase = 'rolling';
  private _outcome: CartOutcome | null = null;
  /** Local (offset from the set origin) start and the unit direction; `s` is the distance rolled. */
  private readonly lx: number;
  private readonly lz: number;
  private readonly dx: number;
  private readonly dz: number;
  private readonly yaw: number;
  readonly length: number;
  private readonly stopAt: number;
  private s = 0;
  private t = 0;
  private clock = 0;
  private spill: THREE.Mesh | null = null;
  private disposed = false;

  constructor(
    private readonly host: StructureHost,
    private readonly spec: CartSpec,
  ) {
    this.id = spec.id;
    const ex = spec.end.x - spec.start.x;
    const ez = spec.end.z - spec.start.z;
    const len = Math.hypot(ex, ez);
    if (!(len > 0)) throw new Error(`cart ${spec.id}: lane start and barricade coincide`);
    this.length = len;
    this.dx = ex / len;
    this.dz = ez / len;
    this.lx = spec.start.x - spec.origin.x;
    this.lz = spec.start.z - spec.origin.z;
    this.stopAt = Math.max(0, len - CART.strikeGap);
    this.yaw = Math.atan2(-this.dx, -this.dz);
    this.visual = buildCartVisual(spec.id);
    const root = this.visual.root;
    host.scene.add(root);
    this.place(0);
    let hurtboxes: HurtboxSet | null = null;
    let actor: Actor | null = null;
    try {
      hurtboxes = new HurtboxSet(root, this.visual.hurtboxDefs, root);
      // No `spawnTag`: the cart is not one of the wave's kills (A12's kill objective matches the enemies' tag).
      actor = host.actors.spawn({ kind: CART.kind, team: 'hostile', maxHealth: CART.maxHealth, maxPoise: 0, root, owner: root });
      actor.data['audio'] = { material: 'wood' };
      this.removers.push(host.combat.addTarget(hurtboxes, actor.id));
    } catch (err) {
      for (const r of this.removers.splice(0)) r();
      if (actor) host.actors.despawn(actor.id);
      hurtboxes?.dispose();
      this.visual.release();
      throw err;
    }
    this.hurtboxes = hurtboxes;
    this.actor = actor;
  }

  get phase(): CartPhase {
    return this._phase;
  }

  /** Null while the cart is still a threat. */
  get outcome(): CartOutcome | null {
    return this._outcome;
  }

  get active(): boolean {
    return this._outcome === null;
  }

  get gone(): boolean {
    return this._phase === 'gone';
  }

  /** Distance rolled along the lane, metres. */
  get rolled(): number {
    return this.s;
  }

  /** Where the cart is, as an offset from the set origin (exact at any world position). */
  localPosition(): { x: number; z: number } {
    return { x: this.lx + this.dx * this.s, z: this.lz + this.dz * this.s };
  }

  fixedUpdate(dt: number): void {
    if (this._phase === 'gone') return;
    this.clock += dt;
    switch (this._phase) {
      case 'rolling': {
        this.s = Math.min(this.stopAt, this.s + CART.speed * dt);
        this.spinWheels(CART.speed * dt);
        this.place(0);
        if (this.s >= this.stopAt) {
          this._phase = 'windup';
          this.t = 0;
        }
        break;
      }
      case 'windup': {
        // The tell: the cart rocks back for the whole windup, then lunges.
        this.t += dt;
        const k = Math.min(1, this.t / CART.windupSeconds);
        this.place(-CART.windupBackMetres * Math.sin(k * Math.PI * 0.5));
        this.visual.body.rotation.z = -0.06 * Math.sin(k * Math.PI);
        if (this.t >= CART.windupSeconds) this.strike();
        break;
      }
      case 'collapse': {
        this.t += dt;
        const k = Math.min(1, this.t / CART.collapseSeconds);
        this.visual.body.rotation.z = GRAVITY_FREE_TILT * k * k;
        this.visual.bowl.rotation.z = -1.2 * k;
        this.visual.bowl.position.y = 0.9 - 0.3 * k;
        this.visual.light.intensity = 6 * (1 - k);
        this.fadeSpill(this.t);
        if (this.t >= CART.collapseSeconds) {
          this._phase = 'vanish';
          this.t = 0;
        }
        break;
      }
      case 'vanish': {
        this.t += dt;
        const k = Math.min(1, this.t / CART.vanishSeconds);
        this.visual.root.scale.setScalar(Math.max(0.0001, 1 - k));
        this.fadeSpill(CART.collapseSeconds + this.t);
        if (this.t >= CART.vanishSeconds) this.dispose();
        break;
      }
    }
    if (!this.disposed) {
      if (this._outcome === null) this.visual.light.intensity = 5.4 + Math.sin(this.clock * 13) * 0.7 + Math.sin(this.clock * 5.3) * 0.4;
      this.visual.flame.scale.set(1, 0.9 + 0.2 * Math.sin(this.clock * 11), 1);
      this.visual.root.updateMatrixWorld(true);
    }
  }

  /** `actor.died` on the cart: destroyed by the player. A cart that has already struck is not destroyed again. */
  died(): void {
    if (this._outcome !== null) return;
    this.resolve('destroyed');
  }

  /** Removes the cart at once (restart or stop): no events, no collapse. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._phase = 'gone';
    this.disarm();
    this.host.actors.despawn(this.actor.id);
    this.hurtboxes.dispose();
    this.spill?.removeFromParent();
    this.spill = null;
    this.visual.release();
  }

  private strike(): void {
    this.place(0.3);
    this.resolve('arrived');
  }

  private resolve(how: CartOutcome): void {
    this._outcome = how;
    this.disarm();
    this._phase = 'collapse';
    this.t = 0;
    this.visual.flame.visible = false;
    // The brazier spills: a flat fire patch that shrinks away and hurts nobody.
    const spill = this.visual.makeSpill();
    spill.position.set(this.visual.root.position.x, this.visual.root.position.y + 0.06, this.visual.root.position.z);
    spill.scale.setScalar(1.6);
    this.host.scene.add(spill);
    this.spill = spill;
    this.spec.onResolve(this, how);
  }

  private fadeSpill(elapsed: number): void {
    if (!this.spill) return;
    const k = Math.min(1, elapsed / (CART.collapseSeconds + CART.vanishSeconds));
    this.spill.scale.setScalar(Math.max(0.0001, 1.6 * (1 - k)));
  }

  /** Out of the fight: not a target, not hittable. */
  private disarm(): void {
    for (const r of this.removers.splice(0)) {
      try {
        r();
      } catch {
        // already removed with the actor
      }
    }
    this.actor.hittable = false;
  }

  private place(offset: number): void {
    const d = this.s + offset;
    const x = this.spec.origin.x + this.lx + this.dx * d;
    const z = this.spec.origin.z + this.lz + this.dz * d;
    const root = this.visual.root;
    root.position.set(x, heightAt(x, z), z);
    root.rotation.set(0, this.yaw, 0);
  }

  private spinWheels(metres: number): void {
    const a = metres / this.visual.wheelRadius;
    for (const w of this.visual.wheels) w.rotation.z -= a;
  }
}

// ---- the carts in play -------------------------------------------------------------------------------------

/**
 * Owns the live carts: their ticks, the `structure.*` events for them and the damage modifier. The modifier exists only
 * while a cart does, so with no wave running the damage pipeline is exactly Act 1's.
 */
export class Carts {
  private readonly carts = new Map<ActorId, Cart>();
  private readonly listeners: Array<() => void> = [];
  private unmodify: (() => void) | null = null;

  constructor(private readonly host: StructureHost) {}

  get all(): readonly Cart[] {
    return [...this.carts.values()];
  }

  /** Carts that can still hurt the barricade. */
  get threats(): number {
    let n = 0;
    for (const c of this.carts.values()) if (c.active) n++;
    return n;
  }

  get hooked(): boolean {
    return this.unmodify !== null;
  }

  spawn(spec: CartSpec): Cart | null {
    let cart: Cart;
    try {
      cart = new Cart(this.host, spec);
    } catch (err) {
      console.warn(`[waves] could not build cart ${spec.id}: ${String(err)}`);
      return null;
    }
    this.carts.set(cart.actor.id, cart);
    this.hook();
    this.host.events.emit('structure.damaged', { id: cart.id, health: cart.actor.maxHealth });
    return cart;
  }

  fixedUpdate(dt: number): void {
    for (const c of [...this.carts.values()]) {
      c.fixedUpdate(dt);
      if (c.gone) this.carts.delete(c.actor.id);
    }
    if (this.carts.size === 0) this.unhook();
  }

  /** Removes every cart at once (restart or stop). Emits nothing. */
  despawnAll(): void {
    for (const c of this.carts.values()) c.dispose();
    this.carts.clear();
    this.unhook();
  }

  dispose(): void {
    this.despawnAll();
  }

  private hook(): void {
    if (this.unmodify) return;
    const modifier: DamageModifier = (req, target) => {
      if (target.kind !== CART.kind) return; // every other target is untouched
      const cart = this.carts.get(target.id);
      if (!cart || req.outcome !== 'hit') return;
      req.amount = cartHitValue(req);
      req.poise = 0;
    };
    this.unmodify = this.host.damage.addModifier(CART_MODIFIER.id, modifier, CART_MODIFIER.order);
    const events = this.host.events;
    this.listeners.push(
      events.on('damage.dealt', (r) => {
        const cart = this.carts.get(r.targetId);
        if (cart && r.dealt > 0) events.emit('structure.damaged', { id: cart.id, health: r.healthAfter });
      }),
      events.on('actor.died', (p) => {
        const cart = this.carts.get(p.actorId);
        if (!cart || !cart.active) return;
        cart.died();
        events.emit('structure.destroyed', { id: cart.id });
      }),
    );
  }

  private unhook(): void {
    this.unmodify?.();
    this.unmodify = null;
    for (const off of this.listeners.splice(0)) off();
  }
}
