// Act 3 (K5, plan 2.7): the M27 deserter, Wybert Fenn, as a scripted defender when R14 released him. The M12 militia
// pattern (src/waves/defenders.ts): he stands at one post, swings only at a hostile already fighting Cael or an ally and
// in no mercy state (`allyEngagement.mayEngage`: a staggered, yielding, calming, releasing or leaving foe is never hit),
// never past 1 HP (no kill, no XP, no mercy taken from Cael), and lethal damage knocks him down for 4 s. He is on the ally
// team and in no spawner, so every M27 group clears with him present or absent. K12 drives him (Contract for K12 in
// plans/act3-K5.md): spawn at a fight anchor, despawn when M27 ends, re-derive on `save.loaded`. Nothing here persists.
import { Defenders, type DefenderBodyFactory, type DefenderHost } from '../../waves/defenders';
import type { Vec3 } from '../../physics/PhysicsWorld';
import type { Act3AlliesService, DeserterView } from './types';

export const R14_CHOICE_FLAG = 'story.r14.choice';
export const DESERTER_ALLY = {
  kind: 'deserter',
  lethalHandlerId: 'companions.a3.deserter-floor',
  noKillHandlerId: 'companions.a3.deserter-no-kill',
} as const;

export interface DeserterPorts {
  host: DefenderHost;
  makeBody: DefenderBodyFactory;
  flag(key: string): unknown;
  anchor(id: string): { position: Vec3; yaw: number } | undefined;
  /** Ground height under (x, z) near `y`, or null (the anchor's own height is then used). */
  groundAt(x: number, z: number, y: number): number | null;
  warn(message: string): void;
}

export class DeserterAlly implements Act3AlliesService {
  private set: Defenders | null = null;
  private anchorId: string | null = null;

  constructor(private readonly ports: DeserterPorts) {}

  spawnDeserter(anchorId: string): boolean {
    if (this.ports.flag(R14_CHOICE_FLAG) !== 'released') {
      this.ports.warn(`act3Allies: spawnDeserter("${anchorId}") refused: ${R14_CHOICE_FLAG} is not "released"`);
      return false;
    }
    const a = typeof anchorId === 'string' ? this.ports.anchor(anchorId) : undefined;
    if (!a) {
      this.ports.warn(`act3Allies: spawnDeserter("${String(anchorId)}") refused: no such anchor`);
      return false;
    }
    if (this.set && this.anchorId === anchorId && this.set.count > 0) {
      this.set.reviveAll();
      return true;
    }
    this.despawnDeserter();
    const p = a.position;
    const y = this.ports.groundAt(p.x, p.z, p.y);
    const post = { x: p.x, y: y ?? p.y, z: p.z };
    const set = new Defenders(this.ports.host, this.ports.makeBody, { ...DESERTER_ALLY });
    set.build([post], a.yaw);
    if (set.count === 0) {
      set.despawnAll();
      this.ports.warn(`act3Allies: the deserter could not be built at "${anchorId}"`);
      return false;
    }
    this.set = set;
    this.anchorId = anchorId;
    return true;
  }

  despawnDeserter(): void {
    this.set?.despawnAll();
    this.set = null;
    this.anchorId = null;
  }

  deserter(): DeserterView | null {
    const d = this.set?.all[0];
    if (!d || !this.anchorId) return null;
    return { actorId: d.id, anchorId: this.anchorId, state: d.state };
  }

  fixedUpdate(dt: number): void {
    this.set?.fixedUpdate(dt);
  }

  dispose(): void {
    this.despawnDeserter();
  }
}
