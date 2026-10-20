// CarrySystem: M01 "carry three villagers to the chapel". Depends only on the narrow ports below;
// the quests plugin adapts the real GameContext to them.
import type { BusPort } from './ports';

export interface Vec3Like { x: number; y: number; z: number }

/** Boolean flag access (backed by WorldState flags). */
export interface FlagPort {
  get(key: string): boolean;
  set(key: string, value: boolean): void;
}

export interface MoveModifierSpec {
  speedScale?: number;
  lockMove?: boolean;
  lockFacing?: boolean;
  lockActions?: string[];
}

/** The player as carrying needs it. addMoveModifier returns an undo function. */
export interface CarryPlayerPort {
  id(): string | undefined;
  feet(): Vec3Like;
  addMoveModifier(source: string, mod: MoveModifierSpec): () => void;
}

export interface PickupInteractable {
  id: string;
  kind: 'pickup';
  position(out: Vec3Like): Vec3Like | void;
  radius?: number;
  promptKey?: string;
  enabled?(): boolean;
  onInteract(): void;
}

export interface InteractablesPort {
  register(i: PickupInteractable): () => void;
}

export interface Carryable {
  /** e.g. 'villager-1' (payload carryId) */
  id: string;
  /** e.g. 'pickup:villager-1' */
  interactableId: string;
  /** home anchor position; undefined when the anchor is missing (carryable is skipped with one warning) */
  home(): Vec3Like | undefined;
  /** visual placeholder control */
  setPosition(p: Vec3Like): void;
  setVisible(on: boolean): void;
  /** e.g. 'quest.m01.villager1.delivered' */
  deliveredFlag: string;
  questId: string;
  objectiveId: string;
  /** trigger id where the villager is delivered */
  destination: string;
  promptKey?: string;
  /** an extra condition for picking it up (R01's buckets wait for a scorched field) */
  requires?(): boolean;
}

export interface CarryPorts {
  bus: BusPort;
  flags: FlagPort;
  player: CarryPlayerPort;
  interactables: InteractablesPort;
  /** true while the quest objective is the current one */
  objectiveCurrent(questId: string, objectiveId: string): boolean;
  carryables: Carryable[];
  isActionHeld(action: 'block'): boolean;
  warn?(msg: string): void;
}

export type CarryDropReason = 'damaged' | 'death' | 'load' | 'voluntary' | 'dispose' | 'objective';

export const CARRY_LOCKED_ACTIONS: readonly string[] = [
  'attack1', 'attack2', 'attack3', 'attack4', 'jump', 'sprint', 'surge',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'dodge', 'surgeLeap', 'mount',
];
export const CARRY_SPEED_SCALE = 0.6;
const MODIFIER_SOURCE = 'carry';
/** Carried visual sits slightly above the feet so it reads as held. */
const CARRY_LIFT = 1.0;

interface Slot {
  c: Carryable;
  pos: Vec3Like;
  unregister: () => void;
}

export class CarrySystem {
  private slots: Slot[] = [];
  private carrying: Slot | null = null;
  private removeModifier: (() => void) | null = null;
  private offs: Array<() => void> = [];
  private disposed = false;
  private warned = new Set<string>();

  constructor(private readonly p: CarryPorts) {
    for (const c of p.carryables) {
      const home = c.home();
      if (!home) {
        this.warnOnce(c.id, `carry: carryable '${c.id}' has no home anchor; skipped`);
        continue;
      }
      const slot: Slot = { c, pos: { ...home }, unregister: () => {} };
      slot.unregister = p.interactables.register({
        id: c.interactableId,
        kind: 'pickup',
        position: (out) => { out.x = slot.pos.x; out.y = slot.pos.y; out.z = slot.pos.z; return out; },
        radius: 2,
        promptKey: c.promptKey ?? 'prompt.carry',
        enabled: () => this.isPickable(slot),
        onInteract: () => this.pickup(slot),
      });
      this.slots.push(slot);
    }
    this.offs.push(
      p.bus.on('damage.dealt', (e) => {
        if (this.carrying && e && e.outcome === 'hit' && this.isPlayer(e.targetId)) this.drop('damaged');
      }),
      p.bus.on('actor.died', (e) => {
        if (this.carrying && e && this.isPlayer(e.actorId)) this.drop('death');
      }),
      p.bus.on('trigger.enter', (e) => {
        if (this.carrying && e && this.isPlayer(e.actorId) && e.triggerId === this.carrying.c.destination) {
          this.deliver(this.carrying, e.triggerId);
        }
      }),
      p.bus.on('save.loaded', () => this.resync()),
    );
    this.resync();
  }

  /** Id of the carried villager, if any. */
  get carryingId(): string | null { return this.carrying?.c.id ?? null; }

  update(_dt: number): void {
    if (this.disposed) return;
    const s = this.carrying;
    if (!s) return;
    if (!this.p.objectiveCurrent(s.c.questId, s.c.objectiveId)) { this.drop('objective'); return; }
    if (this.p.isActionHeld('block')) { this.drop('voluntary'); return; }
    const f = this.p.player.feet();
    s.pos = { x: f.x, y: f.y + CARRY_LIFT, z: f.z };
    s.c.setPosition(s.pos);
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.carrying) this.drop('dispose');
    this.clearModifier();
    this.disposed = true;
    for (const o of this.offs) o();
    this.offs = [];
    for (const s of this.slots) s.unregister();
    this.slots = [];
  }

  private isPlayer(id: unknown): boolean {
    const pid = this.p.player.id();
    return pid !== undefined && id === pid;
  }

  private isDelivered(s: Slot): boolean { return this.p.flags.get(s.c.deliveredFlag) === true; }

  private isPickable(s: Slot): boolean {
    return !this.disposed && !this.carrying && !this.isDelivered(s)
      && this.p.objectiveCurrent(s.c.questId, s.c.objectiveId) && (s.c.requires?.() ?? true);
  }

  private pickup(s: Slot): void {
    if (!this.isPickable(s)) return;
    this.clearModifier(); // defensive: never stack
    this.removeModifier = this.p.player.addMoveModifier(MODIFIER_SOURCE, {
      speedScale: CARRY_SPEED_SCALE,
      lockActions: [...CARRY_LOCKED_ACTIONS],
    });
    this.carrying = s;
    s.c.setVisible(true);
    this.p.bus.emit('carry.picked', { carryId: s.c.id });
    this.update(0);
  }

  private drop(reason: CarryDropReason): void {
    const s = this.carrying;
    if (!s) { this.clearModifier(); return; }
    this.carrying = null;
    this.clearModifier();
    if (reason === 'load') {
      const home = s.c.home();
      if (home) s.pos = { ...home };
    } else {
      const f = this.p.player.feet();
      s.pos = { x: f.x, y: f.y, z: f.z };
    }
    s.c.setPosition(s.pos);
    s.c.setVisible(true);
    this.p.bus.emit('carry.dropped', { carryId: s.c.id, reason });
  }

  private deliver(s: Slot, destinationId: string): void {
    this.carrying = null;
    this.clearModifier();
    this.p.flags.set(s.c.deliveredFlag, true);
    s.c.setVisible(false);
    this.p.bus.emit('carry.delivered', { carryId: s.c.id, destinationId });
  }

  private resync(): void {
    if (this.carrying) this.drop('load');
    this.clearModifier();
    for (const s of this.slots) {
      if (this.isDelivered(s)) { s.c.setVisible(false); continue; }
      const home = s.c.home();
      if (home) s.pos = { ...home };
      s.c.setPosition(s.pos);
      s.c.setVisible(true);
    }
  }

  private clearModifier(): void {
    const r = this.removeModifier;
    this.removeModifier = null;
    if (r) r();
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.p.warn?.(msg);
  }
}
