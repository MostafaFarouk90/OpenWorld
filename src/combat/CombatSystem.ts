import { COMBAT } from '../config/constants';
import { isWindowActive } from './AttackWindow';
import { DamageBus } from './DamageBus';
import type { HurtboxSet } from './HurtboxSet';
import type { AttackWindowSource, HitEvent } from './types';
import type { WeaponTracer } from './WeaponTracer';

/**
 * Wires weapon tracers, attack windows and hurtbox targets together. Call `update` once per fixed step,
 * after animation mixers were advanced in that same step and `updateMatrixWorld` has run.
 */
export class CombatSystem {
  readonly bus: DamageBus;
  private readonly targets = new Set<HurtboxSet>();
  private readonly attackers = new Map<WeaponTracer, AttackWindowSource>();
  private readonly refitted = new Map<HurtboxSet, number>();
  private tickId = 0;
  private disposed = false;
  private readonly unsubscribeFlash: () => void;

  constructor(bus = new DamageBus()) {
    this.bus = bus;
    this.unsubscribeFlash = bus.subscribe((e: HitEvent) => {
      for (const set of this.targets) {
        if ((set.owner ?? set) === e.target) set.flash(e.bone, COMBAT.hitFlashSeconds);
      }
    });
  }

  get targetCount(): number {
    return this.targets.size;
  }

  addTarget(set: HurtboxSet): void {
    this.targets.add(set);
  }

  /** Stops tracing against `set` (also mid-swing). The caller keeps ownership; it is not disposed. */
  removeTarget(set: HurtboxSet): void {
    this.targets.delete(set);
    this.refitted.delete(set);
  }

  addAttacker(tracer: WeaponTracer, window: AttackWindowSource): void {
    this.attackers.set(tracer, window);
  }

  removeAttacker(tracer: WeaponTracer): void {
    this.attackers.delete(tracer);
  }

  /** Returns the hits of this step. */
  update(dt: number): HitEvent[] {
    if (this.disposed) return [];
    this.tickId++;
    const all: HitEvent[] = [];
    const prepare = (set: HurtboxSet): void => {
      if (this.refitted.get(set) === this.tickId) return;
      this.refitted.set(set, this.tickId);
      set.update();
    };
    // Snapshot: bus listeners may add or remove targets and attackers while we iterate.
    for (const [tracer, window] of [...this.attackers]) {
      if (!this.attackers.has(tracer)) continue;
      const hits = tracer.tick(isWindowActive(window), [...this.targets], prepare, window.swingId);
      for (const hit of hits) all.push(hit);
    }
    for (const set of this.targets) set.tickFlash(dt);
    return all;
  }

  /** Disposes all registered targets (BVHs, debug meshes) and detaches everything. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeFlash();
    for (const set of this.targets) set.dispose();
    this.targets.clear();
    this.attackers.clear();
    this.refitted.clear();
  }
}
