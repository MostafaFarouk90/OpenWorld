import type { Vec3 } from '../physics/PhysicsWorld';

export interface Anchor {
  id: string;
  position: Vec3;
  yaw: number;
  tags?: string[];
}

const ANCHOR_ID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const finite = (v: Vec3) => Number.isFinite(v?.x) && Number.isFinite(v?.y) && Number.isFinite(v?.z);

/** Named world locations, ids `<area>.<thing>` (contracts/world-layout-and-npcs.md section 2). */
export class AnchorRegistry {
  private readonly anchors = new Map<string, Anchor>();

  define(anchor: Anchor): () => void {
    if (typeof anchor.id !== 'string' || !ANCHOR_ID.test(anchor.id)) throw new Error(`AnchorRegistry: invalid anchor id "${String(anchor.id)}"`);
    if (this.anchors.has(anchor.id)) throw new Error(`AnchorRegistry: duplicate anchor "${anchor.id}"`);
    if (!finite(anchor.position) || !Number.isFinite(anchor.yaw)) throw new Error(`AnchorRegistry: anchor "${anchor.id}" has non-finite coordinates`);
    const stored: Anchor = {
      id: anchor.id,
      position: { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z },
      yaw: anchor.yaw,
      ...(anchor.tags ? { tags: [...anchor.tags] } : {}),
    };
    this.anchors.set(stored.id, stored);
    return () => {
      if (this.anchors.get(stored.id) === stored) this.anchors.delete(stored.id);
    };
  }

  get(id: string): Anchor {
    const a = this.anchors.get(id);
    if (!a) throw new Error(`Anchor "${id}" not found`);
    return a;
  }

  find(id: string): Anchor | undefined {
    return this.anchors.get(id);
  }

  withTag(tag: string): Anchor[] {
    return [...this.anchors.values()].filter((a) => a.tags?.includes(tag));
  }

  all(): Anchor[] {
    return [...this.anchors.values()];
  }
}
