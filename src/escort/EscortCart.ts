// Act 4 L4 (plans/act4-L4.md section 1.2): R24's rain-cask cart. A structure on the ally team with hurtboxes, built
// from primitives (no cart model; no light, unlike the brazier cart). Only hostile hits lower its health; at 0 it stops
// (`down`) and cannot be destroyed. It comes back at REVIVE_FRACTION of its health once the engine says its group is
// cleared. While it stands it is a taunter, so hostiles near it go for it.
import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import { HurtboxSet } from '../combat/HurtboxSet';
import type { HurtboxDef } from '../combat/types';
import type { EscortMemberHost } from './EscortMembers';
import type { EscortPose } from './EscortRun';

export const ESCORT_CART = {
  maxHealth: 600,
  /** Comes back at this share of its health once its group is cleared (invented, Q6; logged). */
  reviveFraction: 0.5,
  /** Hostiles this close go for it (the taunt radius). */
  threatRadius: 4.5,
  kind: 'escort-cart',
  lethalHandlerId: 'escort.cart-floor',
  modifierId: 'escort.cart-hostile-only',
} as const;

/** The health the bar and saves show: 0 once down (the actor itself is held at 1 so it never dies). */
export type CartHealth = { health: number; max: number };

function buildCart(): { root: THREE.Group; hurtboxDefs: HurtboxDef[]; dispose(): void } {
  const root = new THREE.Group();
  root.name = 'escort-cart';
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.95 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.7, metalness: 0.3 });
  const cask = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.9 });
  const geos: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0, name = '') => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    if (name) m.name = name;
    root.add(m);
    return m;
  };
  // the bed along the cart's forward (-Z), wheels at the sides, three casks lying across it, a shaft forward
  add(new THREE.BoxGeometry(1.2, 0.16, 2.0), wood, 0, 0.62, 0, 0, 0, 'escort-cart-bed');
  for (const x of [-0.68, 0.68]) add(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), iron, x, 0.5, 0.15, 0, Math.PI / 2);
  for (const z of [-0.6, 0, 0.6]) add(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10), cask, 0, 1.0, z, 0, Math.PI / 2);
  for (const x of [-0.35, 0.35]) add(new THREE.BoxGeometry(0.07, 0.07, 1.2), wood, x, 0.6, -1.55);
  return {
    root,
    hurtboxDefs: [{ name: 'bed', bone: 'escort-cart-bed', start: { x: 0, y: 0.3, z: -0.8 }, end: { x: 0, y: 0.3, z: 0.8 }, radius: 0.7 }],
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      wood.dispose();
      iron.dispose();
      cask.dispose();
    },
  };
}

export class EscortCart {
  readonly actor: Actor;
  private readonly art = buildCart();
  private readonly hurtboxes: HurtboxSet;
  private readonly removers: Array<() => void> = [];
  private _down = false;
  private untaunt: (() => void) | null = null;

  constructor(
    private readonly host: EscortMemberHost,
    readonly id: string,
    at: EscortPose,
    health: number = ESCORT_CART.maxHealth,
    private readonly onChange: (h: CartHealth) => void = () => {},
  ) {
    const root = this.art.root;
    host.scene.add(root);
    this.place(at);
    root.updateMatrixWorld(true);
    let hurtboxes: HurtboxSet | null = null;
    let actor: Actor | null = null;
    try {
      hurtboxes = new HurtboxSet(root, this.art.hurtboxDefs, root);
      actor = host.actors.spawn({ kind: ESCORT_CART.kind, team: 'ally', maxHealth: ESCORT_CART.maxHealth, maxPoise: 0, root, owner: root, untargetable: true });
      actor.data['audio'] = { material: 'wood' };
      this.removers.push(host.combat.addTarget(hurtboxes, actor.id));
    } catch (err) {
      for (const r of this.removers.splice(0)) r();
      if (actor) host.actors.despawn(actor.id);
      hurtboxes?.dispose();
      this.art.dispose();
      throw err;
    }
    this.hurtboxes = hurtboxes;
    this.actor = actor;
    const h = Math.max(0, Math.min(ESCORT_CART.maxHealth, Number.isFinite(health) ? health : ESCORT_CART.maxHealth));
    if (h <= 0) {
      actor.health = 1;
      this._down = true;
    } else actor.health = h;
    // Only hostiles hurt it (a stray swing of Cael's or an ally's does nothing).
    this.removers.push(
      host.damage.addModifier(ESCORT_CART.modifierId, (req, target, attacker) => {
        if (target.id !== this.actor.id) return;
        if (attacker?.team !== 'hostile' || this._down) req.amount = 0;
      }, 90),
    );
    // Never destroyed: held at 1 (shown as 0) and down.
    this.removers.push(
      host.damage.addLethalHandler(ESCORT_CART.lethalHandlerId, (target) => {
        if (target.id !== this.actor.id) return false;
        target.health = 1;
        this.goDown();
        return true;
      }),
    );
    this.removers.push(
      host.events.on('damage.dealt', (r) => {
        if (r.targetId === this.actor.id && r.dealt > 0) this.onChange(this.health());
      }),
    );
    this.syncTaunt();
  }

  get actorId(): ActorId {
    return this.actor.id;
  }

  get down(): boolean {
    return this._down;
  }

  health(): CartHealth {
    return { health: this._down ? 0 : Math.round(this.actor.health), max: ESCORT_CART.maxHealth };
  }

  get position(): THREE.Vector3 {
    return this.art.root.position;
  }

  place(p: EscortPose): void {
    this.art.root.position.set(p.x, p.y, p.z);
    this.art.root.rotation.set(0, p.yaw, 0);
  }

  /** Its group is cleared: back at REVIVE_FRACTION of its health (no-op while it stands). */
  revive(): void {
    if (!this._down) return;
    this._down = false;
    this.actor.health = Math.round(ESCORT_CART.maxHealth * ESCORT_CART.reviveFraction);
    this.syncTaunt();
    this.onChange(this.health());
  }

  fixedUpdate(): void {
    this.art.root.updateMatrixWorld(true);
    this.syncTaunt();
  }

  dispose(): void {
    this.untaunt?.();
    this.untaunt = null;
    for (const r of this.removers.splice(0)) {
      try {
        r();
      } catch {
        // gone with the actor
      }
    }
    this.host.actors.despawn(this.actor.id);
    this.hurtboxes.dispose();
    this.art.dispose();
  }

  private goDown(): void {
    if (this._down) return;
    this._down = true;
    this.syncTaunt();
    this.onChange(this.health());
  }

  private syncTaunt(): void {
    if (this._down) {
      this.untaunt?.();
      this.untaunt = null;
      return;
    }
    if (this.untaunt) return;
    const taunts = this.host.services.get('enemies')?.taunts;
    if (!taunts) return;
    this.untaunt = taunts.register({
      id: this.actor.id,
      position: () => this.art.root.position,
      alive: () => !this._down,
      radius: ESCORT_CART.threatRadius,
      seconds: Number.POSITIVE_INFINITY,
    });
  }
}
