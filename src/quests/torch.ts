// R01's torch: lit at a field brazier, carried by the player, never a quest item. Surge and Leap are locked while it
// burns (a purifying Surge is the other way to clear a scarecrow); attacks stay free. Thread 5's scarecrows test
// contact against `position()`, exposed on the quests service, so no contact event exists.
import type { BusPort } from './ports';
import type { CarryPlayerPort, Vec3Like } from './carry';

export const TORCH_LOCKED_ACTIONS: readonly string[] = ['surge', 'surgeLeap'];
const MODIFIER_SOURCE = 'torch';
/** The flame sits about hand height. */
const TORCH_LIFT = 1.1;

export interface BrazierSpec {
  /** e.g. 'use:r01-brazier-1' */
  interactableId: string;
  position(): Vec3Like | undefined;
}

export interface TorchPorts {
  bus: BusPort;
  player: CarryPlayerPort;
  braziers: BrazierSpec[];
  registerInteractable(i: {
    id: string; position(out: Vec3Like): Vec3Like; radius: number; promptKey: string; enabled(): boolean; onInteract(): void;
  }): () => void;
  /** true while R01's clearing objective is current */
  active(): boolean;
  setVisual(on: boolean, at?: Vec3Like): void;
  warn?(m: string): void;
}

export class TorchSystem {
  private lit = false;
  private pos: Vec3Like = { x: 0, y: 0, z: 0 };
  private removeModifier: (() => void) | null = null;
  private offs: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly p: TorchPorts) {
    for (const b of p.braziers) {
      const home = b.position();
      if (!home) { p.warn?.(`torch: brazier ${b.interactableId} has no anchor; skipped`); continue; }
      this.offs.push(p.registerInteractable({
        id: b.interactableId,
        position: (out) => { out.x = home.x; out.y = home.y; out.z = home.z; return out; },
        radius: 2.5,
        promptKey: 'quest.prompt.torch',
        enabled: () => !this.disposed && !this.lit && p.active(),
        onInteract: () => this.light(),
      }));
    }
    this.offs.push(
      p.bus.on('actor.died', (e) => { if (this.lit && this.isPlayer(e?.actorId)) this.snuff(); }),
      p.bus.on('save.loaded', () => this.snuff()),
    );
  }

  get carried(): boolean { return this.lit; }

  /** World position of the flame while carried, otherwise null. */
  position(): Vec3Like | null { return this.lit ? { ...this.pos } : null; }

  update(): void {
    if (this.disposed || !this.lit) return;
    if (!this.p.active()) { this.snuff(); return; }
    const f = this.p.player.feet();
    this.pos = { x: f.x, y: f.y + TORCH_LIFT, z: f.z };
    this.p.setVisual(true, this.pos);
  }

  dispose(): void {
    if (this.disposed) return;
    this.snuff();
    this.disposed = true;
    for (const o of this.offs) o();
    this.offs = [];
  }

  private light(): void {
    if (this.disposed || this.lit || !this.p.active()) return;
    this.clearModifier();
    this.removeModifier = this.p.player.addMoveModifier(MODIFIER_SOURCE, { lockActions: [...TORCH_LOCKED_ACTIONS] });
    this.lit = true;
    this.update();
  }

  private snuff(): void {
    if (!this.lit) { this.clearModifier(); return; }
    this.lit = false;
    this.clearModifier();
    this.p.setVisual(false);
  }

  private isPlayer(id: unknown): boolean {
    const pid = this.p.player.id();
    return pid !== undefined && id === pid;
  }

  private clearModifier(): void {
    const r = this.removeModifier;
    this.removeModifier = null;
    r?.();
  }
}
