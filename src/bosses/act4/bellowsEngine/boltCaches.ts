// Bolt caches in the Crucible arena (coordinator ruling 2026-11-06, a vetoable taste call in design/changes-applied.md "Act 4
// L6"): the Pathfinder's pouch holds 40 bolts and the engine takes about 120, so the arena keeps a few crates of bolts by the
// side valves. F at a stocked cache tops the pouch up to its cap; every cache restocks each time a valve vents the engine, so
// the fight never goes dry between valve runs. Only a Pathfinder sees the prompt (nobody else spends bolts, and a free stack
// of sellable bolts for any class would be a gold tap). The grant goes through `loot.granted`, like every other pickup.
import * as THREE from 'three';
import type { GameContext } from '../../../core/Game';
import { PF } from '../../../classes/pathfinder/tuning';
import { BOLT_CACHES, LOOK } from './tuning';

export const BOLT_CACHE_PREFIX = 'pickup:bellows-bolts-';
export const BOLT_CACHE_NAME_KEY = 'bosses.bellows.boltCache';

const CRATE_GEO = new THREE.BoxGeometry(0.8, 0.5, 0.55);
const BOLTS_GEO = new THREE.BoxGeometry(0.6, 0.08, 0.4);

interface Cache {
  readonly id: string;
  readonly at: THREE.Vector3;
  readonly mesh: THREE.Group;
  readonly bolts: THREE.Mesh;
  stocked: boolean;
}

export class BoltCaches {
  private readonly caches: Cache[] = [];
  private readonly offs: (() => void)[] = [];
  private readonly crateMat = new THREE.MeshStandardMaterial({ color: LOOK.ironDark, roughness: 0.8 });
  private readonly boltMat = new THREE.MeshStandardMaterial({ color: LOOK.brass, metalness: 0.5, roughness: 0.5 });
  private disposed = false;
  /** Bolts handed out (tests, the real-game log). */
  granted = 0;

  constructor(
    private readonly ctx: GameContext,
    places: readonly THREE.Vector3[],
  ) {
    places.forEach((at, i) => this.mount(at, i + 1));
  }

  get count(): number {
    return this.caches.length;
  }

  stocked(index: number): boolean {
    return this.caches[index]?.stocked ?? false;
  }

  position(index: number): THREE.Vector3 | null {
    return this.caches[index]?.at ?? null;
  }

  /** A valve vented the engine: every cache is full again. */
  restock(): void {
    for (const c of this.caches) this.setStocked(c, true);
  }

  /** F at cache `index` (the interactable calls this; tests too). Returns the bolts granted. */
  take(index: number): number {
    const c = this.caches[index];
    if (!c || this.disposed || !c.stocked || !this.isPathfinder()) return 0;
    const need = this.need();
    if (need <= 0) return 0;
    this.setStocked(c, false);
    this.granted += need;
    this.ctx.events.emit('loot.granted', { sourceId: c.id, items: [{ itemId: PF.ammoItem, count: need }] });
    return need;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0).reverse()) off();
    for (const c of this.caches) c.mesh.removeFromParent();
    this.caches.length = 0;
    this.crateMat.dispose();
    this.boltMat.dispose();
  }

  // ---- internals ----

  private mount(at: THREE.Vector3, n: number): void {
    const mesh = new THREE.Group();
    mesh.name = `bellows-bolt-cache-${n}`;
    mesh.position.copy(at);
    const crate = new THREE.Mesh(CRATE_GEO, this.crateMat);
    crate.position.y = 0.25;
    const bolts = new THREE.Mesh(BOLTS_GEO, this.boltMat);
    bolts.position.y = 0.54;
    mesh.add(crate, bolts);
    this.ctx.scene.add(mesh);
    const c: Cache = { id: `${BOLT_CACHE_PREFIX}${n}`, at, mesh, bolts, stocked: true };
    this.caches.push(c);
    const index = this.caches.length - 1;
    this.offs.push(
      this.ctx.interaction.register({
        id: c.id,
        kind: 'pickup',
        position: (out) => out.set(at.x, at.y + 0.5, at.z),
        radius: BOLT_CACHES.interactRadius,
        promptKey: 'interact.pickup',
        name: this.ctx.strings.t(BOLT_CACHE_NAME_KEY),
        enabled: () => c.stocked && !this.disposed && this.isPathfinder() && this.need() > 0,
        onInteract: () => void this.take(index),
      }),
    );
  }

  private setStocked(c: Cache, stocked: boolean): void {
    c.stocked = stocked;
    c.bolts.visible = stocked;
  }

  private isPathfinder(): boolean {
    return this.ctx.services.get('progression')?.classId === PF.classId;
  }

  /** Bolts that top the pouch up to the cap (the whole cap without an inventory service). */
  private need(): number {
    const have = this.ctx.services.get('inventory')?.count(PF.ammoItem) ?? 0;
    return Math.max(0, BOLT_CACHES.fillTo - have);
  }
}
