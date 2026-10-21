// Hrolf's light tank AI (plans/act2-A5.md sections 1.5 and 8; Q3; actors-and-damage.md section 11). Pure: the
// controller feeds it a view each tick and applies what it returns. He only joins a fight Cael is already in, never
// touches an unstruck beast or a foe in a mercy state (`allyEngagement.mayEngage`), never fights during a trial,
// never swings at a foe on 1 HP, and rechecks all of it at the hit frame.
import type { ActorId } from '../actors/Actor';
import { HROLF_TUNING } from './tuning';

export interface Foe {
  id: ActorId;
  x: number;
  z: number;
  health: number;
  /** An enemy whose mercy verb is Calm: Hrolf waits until Cael has struck it. */
  beast: boolean;
}

export interface BrainView {
  self: { x: number; z: number };
  player: { x: number; z: number };
  /** Active, following, standing, not hidden and Cael alive. */
  canAct: boolean;
  /** The shipped CombatPresence: Cael has a foe aggroed on him. */
  playerInCombat: boolean;
  trialRunning: boolean;
  foes(): readonly Foe[];
  mayEngage(id: ActorId): boolean;
  /** Cael has landed a hit on it (player attacker, outcome hit, not a script). */
  struckByPlayer(id: ActorId): boolean;
}

export interface BrainStep {
  /** Where to walk instead of the follow slot; null follows Cael. */
  goal: { x: number; z: number } | null;
  /** Face this point (the target) while standing at the goal. */
  face: { x: number; z: number } | null;
  /** True on the tick a swing starts (the figure plays the chop). */
  swing: boolean;
  /** The foe to hit this tick (the hit frame), already rechecked. */
  hit: ActorId | null;
}

export type BrainTuning = Record<
  'range' | 'cooldown' | 'aggroRadius' | 'leash' | 'hitFrame' | 'swingSeconds' | 'closeIn',
  number
>;

const d2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export class HrolfBrain {
  private target: ActorId | null = null;
  private cooldown = 0;
  /** Seconds into the current swing; null when not swinging. */
  private swingT: number | null = null;
  private swingTarget: ActorId | null = null;

  constructor(private readonly t: BrainTuning = HROLF_TUNING) {}

  get currentTarget(): ActorId | null {
    return this.target;
  }

  get swinging(): boolean {
    return this.swingT !== null;
  }

  /** Drops the fight (waiting, hidden, downed, a load). */
  reset(): void {
    this.target = null;
    this.swingT = null;
    this.swingTarget = null;
  }

  /** Every condition for touching `foe`; rechecked each tick and at the hit frame. */
  eligible(foe: Foe, v: BrainView): boolean {
    if (!v.canAct || !v.playerInCombat || v.trialRunning) return false;
    if (!(foe.health > 1)) return false;
    if (d2(foe, v.player) > this.t.aggroRadius) return false;
    if (!v.mayEngage(foe.id)) return false;
    return !foe.beast || v.struckByPlayer(foe.id);
  }

  tick(dt: number, v: BrainView): BrainStep {
    this.cooldown = Math.max(0, this.cooldown - (dt > 0 ? dt : 0));
    const idle: BrainStep = { goal: null, face: null, swing: false, hit: null };
    if (!v.canAct || d2(v.self, v.player) > this.t.leash) {
      this.reset();
      return idle;
    }
    const foes = v.foes();
    const byId = (id: ActorId | null) => (id ? foes.find((f) => f.id === id) : undefined);

    // A swing in progress lands at the hit frame only if the foe still qualifies and is still in reach.
    let hit: ActorId | null = null;
    if (this.swingT !== null) {
      const before = this.swingT;
      this.swingT += dt;
      if (before < this.t.hitFrame && this.swingT >= this.t.hitFrame) {
        const f = byId(this.swingTarget);
        if (f && this.eligible(f, v) && d2(v.self, f) <= this.t.range + 0.5) hit = f.id;
      }
      if (this.swingT >= this.t.swingSeconds) {
        this.swingT = null;
        this.swingTarget = null;
      }
    }

    let cur = byId(this.target);
    if (!cur || !this.eligible(cur, v)) {
      this.target = null;
      cur = this.pick(foes, v);
      this.target = cur?.id ?? null;
    }
    if (!cur) return { ...idle, hit };

    const dist = d2(v.self, cur);
    const reach = Math.max(0.5, this.t.range - this.t.closeIn);
    let goal: { x: number; z: number };
    if (dist <= this.t.range) goal = { x: v.self.x, z: v.self.z };
    else {
      const k = dist > 1e-4 ? reach / dist : 0;
      goal = { x: cur.x + (v.self.x - cur.x) * k, z: cur.z + (v.self.z - cur.z) * k };
    }
    let swing = false;
    if (this.swingT === null && this.cooldown <= 0 && dist <= this.t.range) {
      this.swingT = 0;
      this.swingTarget = cur.id;
      this.cooldown = this.t.cooldown;
      swing = true;
    }
    return { goal, face: { x: cur.x, z: cur.z }, swing, hit };
  }

  /** A foe aggroed on Cael nearest to Cael, ties to the one nearest Hrolf. */
  private pick(foes: readonly Foe[], v: BrainView): Foe | undefined {
    let best: Foe | undefined;
    let bestP = Infinity;
    let bestS = Infinity;
    for (const f of foes) {
      if (!this.eligible(f, v)) continue;
      const p = d2(f, v.player);
      const s = d2(f, v.self);
      if (p < bestP - 0.25 || (Math.abs(p - bestP) <= 0.25 && s < bestS)) {
        best = f;
        bestP = p;
        bestS = s;
      }
    }
    return best;
  }
}
