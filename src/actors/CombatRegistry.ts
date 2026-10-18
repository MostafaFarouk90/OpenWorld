import { isWindowActive } from '../combat/AttackWindow';
import type { CombatSystem } from '../combat/CombatSystem';
import type { HurtboxSet } from '../combat/HurtboxSet';
import type { AttackWindowSource } from '../combat/types';
import type { WeaponTracer } from '../combat/WeaponTracer';
import type { GameEvents } from '../core/events';
import type { ActorId } from './Actor';

interface Watched {
  actorId: ActorId;
  window: AttackWindowSource;
  open: boolean;
  attackId: string;
  swingId: number;
  /** Fallback swing counter for windows that do not report swingId. */
  swings: number;
}

/**
 * Adds attackers and targets to the world's CombatSystem on behalf of actors, and publishes every
 * attacker's window as `attack.window` (contracts/actors-and-damage.md section 5).
 */
export class CombatRegistry {
  private readonly watched = new Map<unknown, Watched>();

  constructor(
    private readonly system: CombatSystem,
    private readonly events: GameEvents,
  ) {}

  /** Traces `tracer` while `window` is active; the tracer's `attacker` must be bound to the actor. */
  addAttacker(actorId: ActorId, tracer: WeaponTracer, window: AttackWindowSource): () => void {
    this.system.addAttacker(tracer, window);
    const stop = this.watch(actorId, tracer.attacker, window);
    return () => {
      this.system.removeAttacker(tracer);
      stop();
    };
  }

  addTarget(set: HurtboxSet): () => void {
    this.system.addTarget(set);
    return () => this.system.removeTarget(set);
  }

  /**
   * Publishes the windows of an attacker added to the CombatSystem elsewhere (the player's sword in
   * WorldCombat). `attacker` is the tracer's attacker object, also used to find the window for a hit.
   */
  watch(actorId: ActorId, attacker: unknown, window: AttackWindowSource): () => void {
    if (this.watched.has(attacker)) throw new Error(`CombatRegistry: attacker of "${actorId}" is already watched`);
    const w: Watched = { actorId, window, open: false, attackId: '', swingId: 0, swings: 0 };
    this.watched.set(attacker, w);
    return () => {
      if (this.watched.get(attacker) !== w) return;
      this.watched.delete(attacker);
      if (w.open) this.emit(w, 'close');
    };
  }

  /** The attack the attacker is swinging now (for hits): clip and swing id. */
  attackOf(attacker: unknown): { attackId: string; swingId: number } | null {
    const w = this.watched.get(attacker);
    return w && w.open ? { attackId: w.attackId, swingId: w.swingId } : null;
  }

  /** Called every fixed tick just before the combat trace: emits open and close transitions. */
  pollWindows(): void {
    for (const w of [...this.watched.values()]) {
      const active = isWindowActive(w.window);
      const swing = w.window.swingId;
      if (w.open && (!active || (swing !== undefined && swing !== w.swingId))) {
        this.emit(w, 'close');
        w.open = false;
      }
      if (active && !w.open) {
        w.open = true;
        w.attackId = w.window.clipName;
        w.swingId = swing ?? ++w.swings;
        this.emit(w, 'open');
      }
    }
  }

  private emit(w: Watched, phase: 'open' | 'close'): void {
    this.events.emit('attack.window', { actorId: w.actorId, attackId: w.attackId, swingId: w.swingId, phase });
  }
}
