// Vey's bolt caches (plan 2.2: "bolt caches"; the Bellows-Engine pattern, coordinator ruling 2026-11-06): a bundle of bolts on
// each of N2's six crate props round the ring. F at a stocked cache tops a Pathfinder's pouch up to its cap; every cache
// restocks at each of Vey's breaks. Only a Pathfinder sees the prompt; the grant goes through `loot.granted`, like every pickup.
import * as THREE from 'three';
import type { GameContext } from '../../../core/Game';
import { PF } from '../../../classes/pathfinder/tuning';
import { BOLT_CACHES, LOOK } from './tuning';

export const VEY_BOLT_CACHE_PREFIX = 'pickup:vey-bolts-';
export const VEY_BOLT_CACHE_NAME_KEY = 'bosses.vey.boltCache';

const BOLTS_GEO = new THREE.BoxGeometry(0.6, 0.08, 0.4);

interface Cache {
  readonly id: string;
  readonly at: THREE.Vector3;
  readonly bolts: THREE.Mesh;
  stocked: boolean;
}

export class VeyBoltCaches {
  private readonly caches: Cache[] = [];
  private readonly offs: (() => void)[] = [];
  private readonly boltMat = new THREE.MeshStandardMaterial({ color: LOOK.gold, metalness: 0.5, roughness: 0.5 });
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

  /** Every cache is full again (each of Vey's breaks). */
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
    for (const c of this.caches) c.bolts.removeFromParent();
    this.caches.length = 0;
    this.boltMat.dispose();
  }

  private mount(at: THREE.Vector3, n: number): void {
    const bolts = new THREE.Mesh(BOLTS_GEO, this.boltMat);
    bolts.name = `vey-bolt-cache-${n}`;
    bolts.position.set(at.x, at.y + BOLT_CACHES.top + 0.04, at.z);
    this.ctx.scene.add(bolts);
    const c: Cache = { id: `${VEY_BOLT_CACHE_PREFIX}${n}`, at, bolts, stocked: true };
    this.caches.push(c);
    const index = this.caches.length - 1;
    this.offs.push(
      this.ctx.interaction.register({
        id: c.id,
        kind: 'pickup',
        position: (out) => out.set(at.x, at.y + BOLT_CACHES.top, at.z),
        radius: BOLT_CACHES.interactRadius,
        promptKey: 'interact.pickup',
        name: this.ctx.strings.t(VEY_BOLT_CACHE_NAME_KEY),
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

  private need(): number {
    const have = this.ctx.services.get('inventory')?.count(PF.ammoItem) ?? 0;
    return Math.max(0, BOLT_CACHES.fillTo - have);
  }
}
