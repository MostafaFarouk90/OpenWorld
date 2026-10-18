import * as THREE from 'three';

interface Occupant {
  readonly root: THREE.Object3D | null;
}

const tmp = new THREE.Vector3();

/**
 * Keeps actors that stand inside an interior the player is not in out of sight (an NPC posted in the Keep hall, a watch guard in
 * the Counting-House or Tobb waiting at the Anvil would otherwise stand 150 m up in the sky). Runs every render after the actors'
 * own writers (the companion sets `root.visible` every frame), so it re-asserts the hide each frame. It shows again only actors
 * it hid itself; one hidden by anything else stays hidden.
 */
export class OccupantHider {
  private readonly hidden = new Map<Occupant, number>();
  private frame = 0;

  update(
    actors: Iterable<Occupant>,
    current: string | null,
    interiorAt: (at: { x: number; y: number; z: number }) => string | null,
    skip?: (a: Occupant) => boolean,
  ): void {
    const frame = ++this.frame;
    for (const a of actors) {
      const root = a.root;
      if (!root || skip?.(a)) continue;
      root.getWorldPosition(tmp);
      const id = interiorAt(tmp);
      if (id !== null && id !== current) {
        // Adopt only a visible root: one someone else hid stays theirs to show.
        if (!this.hidden.has(a) && !root.visible) continue;
        root.visible = false;
        this.hidden.set(a, frame);
      } else if (this.hidden.delete(a)) {
        root.visible = true;
      }
    }
    // Despawned actors are forgotten.
    for (const [a, seen] of this.hidden) if (seen !== frame) this.hidden.delete(a);
  }

  /** Shows everything this hider hid (teardown). */
  dispose(): void {
    for (const a of this.hidden.keys()) if (a.root) a.root.visible = true;
    this.hidden.clear();
  }

  get size(): number {
    return this.hidden.size;
  }
}
