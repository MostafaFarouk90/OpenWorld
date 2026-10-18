import { DEFAULT_CLASS, isClassId, type ClassId, type ClassResult, type ClassesService } from '../actors/classes';
import type { ItemStack } from '../core/events';
import type { EquipResult, EquipSlot, ProgressionService } from '../hud/ports';
import { DEFAULT_DRILL, DEFAULT_KITS, availableFlag, trainerId } from './kits';
import type { DrillRunner } from './DrillRunner';
import type { ChangeQuote, ClassKit, DrillOutcome, DrillState, RegisterKitResult } from './types';

/** The part of the inventory the starter grant equips through (items themselves enter only by `loot.granted`). */
export interface ClassInventory {
  has(id: string): boolean;
  equip(id: string): EquipResult;
  unequip(slot: EquipSlot): boolean;
}

export interface ClassesPorts {
  progression(): ProgressionService | undefined;
  inventory(): ClassInventory | undefined;
  flag(key: string): unknown;
  /** Hostile aggro on the player (the shrine's test). */
  inCombat(): boolean;
  emit(type: 'class.chosen', payload: { classId: ClassId }): void;
  emit(type: 'class.changed', payload: { classId: ClassId; previous: ClassId; free: boolean; cost: number }): void;
  emit(type: 'loot.granted', payload: { sourceId: string; items: ItemStack[] }): void;
  itemExists(id: string): boolean;
  /** Asks the kit swapper to dress the player in this class (it waits for a safe moment). */
  dress(classId: ClassId): void;
  warn(message: string): void;
}

export interface ClassesSave {
  drills: Partial<Record<ClassId, DrillOutcome>>;
  starterGranted: ClassId[];
}

/**
 * The `classes` service (thread 12; contracts game-events-and-flags.md section 6). `progression.classId` is the one class
 * source; this keeps the kits, the drill outcomes and which starter sets were handed out.
 */
export class Classes implements ClassesService {
  static readonly key = 'classes';
  static readonly version = 1;

  private readonly kits = new Map<ClassId, ClassKit>();
  private drills: Partial<Record<ClassId, DrillOutcome>> = {};
  private granted = new Set<ClassId>();

  constructor(
    private readonly ports: ClassesPorts,
    private readonly runner: DrillRunner,
  ) {
    for (const k of Object.values(DEFAULT_KITS)) this.kits.set(k.classId, k);
    runner.onEnd((classId, outcome) => {
      this.drills[classId] = outcome;
    });
  }

  current(): ClassId {
    const id = this.ports.progression()?.classId;
    return isClassId(id) ? id : DEFAULT_CLASS;
  }

  chosen(): boolean {
    const id = this.ports.progression()?.classId;
    return id !== null && id !== undefined;
  }

  available(id: ClassId): boolean {
    return isClassId(id) && this.ports.flag(availableFlag(id)) === true;
  }

  kit(id: ClassId): Readonly<ClassKit> | undefined {
    return this.kits.get(id);
  }

  registerKit(k: ClassKit): RegisterKitResult {
    if (!k || !isClassId(k.classId)) return { ok: false, reason: 'bad-class' };
    const bad =
      typeof k.nameKey !== 'string' ||
      typeof k.model !== 'string' ||
      !k.mainhand ||
      typeof k.mainhand.embedded !== 'string' ||
      !k.trainer ||
      typeof k.trainer.npcId !== 'string' ||
      // The trainer interactables are registered once per class at setup, so a kit keeps its class's trainer.
      k.trainer.npcId !== DEFAULT_KITS[k.classId].trainer.npcId ||
      !k.starter ||
      !Array.isArray(k.starter.items) ||
      (k.drill !== undefined && (!Array.isArray(k.drill) || k.drill.some((s) => !s || !(s.count >= 1) || typeof s.id !== 'string')));
    if (bad) return { ok: false, reason: 'bad-kit' };
    const previous = this.kits.get(k.classId);
    const frozen: ClassKit = { ...k };
    this.kits.set(k.classId, frozen);
    return {
      ok: true,
      dispose: () => {
        if (this.kits.get(k.classId) !== frozen) return;
        this.kits.set(k.classId, previous ?? DEFAULT_KITS[k.classId]);
      },
    };
  }

  choose(id: ClassId): ClassResult {
    const p = this.ports.progression();
    if (!isClassId(id) || !p) return { ok: false, reason: 'unknown' };
    if (this.chosen()) return { ok: false, reason: 'already-chosen' };
    if (!this.available(id)) return { ok: false, reason: 'no-permit' };
    if (this.ports.inCombat()) return { ok: false, reason: 'combat' };
    // The Knight keeps what Brightwater taught him; any other class gets those points back (not a respec).
    if (id !== 'knight') p.refundForClassChoice();
    p.setClass(id);
    this.outfit(id);
    this.ports.emit('class.chosen', { classId: id });
    this.ports.dress(id);
    this.runner.start(id, this.drillSteps(id));
    return { ok: true };
  }

  changeQuote(id: ClassId): ChangeQuote {
    const p = this.ports.progression();
    const refused = this.changeRefusal(id, p);
    if (refused) return refused;
    if (p!.learnedSkills().length === 0) return { ok: true, free: true, gold: 0, canAfford: true };
    const q = p!.respecQuote();
    return { ok: true, free: q.free, gold: q.gold, canAfford: q.canAfford };
  }

  /** The caller holds `progression.allowRespec(source)` (a trainer menu, the lectern). */
  change(id: ClassId): ClassResult {
    const p = this.ports.progression();
    const refused = this.changeRefusal(id, p);
    if (refused) return refused;
    const previous = this.current();
    const r = p!.respec();
    let cost = 0;
    if (r.ok) cost = r.cost;
    // Respec checks the permit first, so `nothing-learned` means a permit was held: a free change.
    else if (r.reason !== 'nothing-learned') return { ok: false, reason: r.reason };
    this.runner.cancel();
    p!.setClass(id);
    this.outfit(id);
    this.ports.emit('class.changed', { classId: id, previous, free: cost === 0, cost });
    this.ports.dress(id);
    return { ok: true };
  }

  drill(): DrillState | null {
    return this.runner.state();
  }

  startDrill(): boolean {
    if (!this.chosen() || this.runner.state()) return false;
    const id = this.current();
    return this.runner.start(id, this.drillSteps(id));
  }

  skipDrill(): boolean {
    return this.runner.skip();
  }

  drillOutcome(id: ClassId): DrillOutcome | null {
    return this.drills[id] ?? null;
  }

  serialize(): ClassesSave {
    return { drills: { ...this.drills }, starterGranted: [...this.granted] };
  }

  /** v1. A save without a `classes` entry (every Phase A save) keeps these defaults: no drills, nothing granted. */
  load(data: unknown): void {
    this.drills = {};
    this.granted.clear();
    this.runner.cancel(true);
    const d = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    const drills = d.drills && typeof d.drills === 'object' ? (d.drills as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(drills)) {
      if (isClassId(k) && (v === 'done' || v === 'skipped')) this.drills[k] = v;
    }
    if (Array.isArray(d.starterGranted)) for (const k of d.starterGranted) if (isClassId(k)) this.granted.add(k);
  }

  private changeRefusal(id: ClassId, p: ProgressionService | undefined): Exclude<ClassResult, { ok: true }> | null {
    if (!isClassId(id) || !p) return { ok: false, reason: 'unknown' };
    if (!this.chosen()) return { ok: false, reason: 'not-chosen' };
    if (id === this.current()) return { ok: false, reason: 'same' };
    if (this.ports.inCombat()) return { ok: false, reason: 'combat' };
    return null;
  }

  private drillSteps(id: ClassId) {
    return this.kits.get(id)?.drill ?? DEFAULT_DRILL;
  }

  /** The starter set once per class, then the class's owned weapon and armour equipped and a stray shield taken off. */
  private outfit(id: ClassId): void {
    const k = this.kits.get(id) ?? DEFAULT_KITS[id];
    if (!this.granted.has(id)) {
      this.granted.add(id);
      const items = k.starter.items.filter((s) => {
        if (this.ports.itemExists(s.itemId)) return true;
        this.ports.warn(`classes: starter item "${s.itemId}" of ${id} is not defined yet, skipped`);
        return false;
      });
      if (items.length) this.ports.emit('loot.granted', { sourceId: trainerId(k), items: items.map((s) => ({ ...s })) });
    }
    const inv = this.ports.inventory();
    if (!inv) return;
    if (!k.offhand) inv.unequip('offhand');
    for (const item of k.starter.equip) if (inv.has(item)) inv.equip(item);
  }
}
