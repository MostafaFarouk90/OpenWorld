import type { ClassId } from '../actors/classes';
import type { DrillOutcome, DrillState, DrillStepDef } from './types';

export interface DrillPorts {
  prompts(): { count(mechanic: string): number; show(mechanic: string, action: string, textKey: string, opts?: { force?: boolean }): void; hide(mechanic?: string): void } | undefined;
  enemies():
    | {
        spawnGroup(id: string, opts?: { moves?: readonly string[]; aggro?: boolean }): readonly unknown[];
        despawnGroup(id: string): void;
        /** Clears the group's cleared and spent marks (a spared spar would otherwise never come back). */
        reset(id: string): void;
        alive(id: string): readonly unknown[];
      }
    | undefined;
  /** Kill XP is paused for the whole drill (spars cannot be farmed). */
  pauseKillXp(source: string): (() => void) | undefined;
  /** The class of the avatar the player wears now (null before the first one). */
  wornClass(): ClassId | null;
  /** The class has tier skills registered (else the skill and ability steps are skipped). */
  hasSkills(classId: ClassId): boolean;
  /** A skill can be bought now (`progression.nextUnlock().kind === 'skill'`). */
  canBuySkill(): boolean;
  /** Something is on the ability bar. */
  hasBarAbility(): boolean;
  /** Metres from the yard centre, or null when the yard anchor is missing (then walking off never ends the drill). */
  distanceFromYard(): number | null;
  hasString(key: string): boolean;
  emit(payload: { classId: ClassId; outcome: DrillOutcome }): void;
  warn?(message: string): void;
}

/** Walking this far from the yard centre ends the drill as skipped (the yard is about 140 x 100 m). */
export const DRILL_LEAVE_RADIUS = 75;

interface Run {
  classId: ClassId;
  steps: readonly DrillStepDef[];
  index: number;
  base: number;
  /** The spar spawned for the current step (null when it needs none or is not up yet). */
  spar: string | null;
  releaseXp: (() => void) | undefined;
  /** True once the current step's prompt is up and its count baseline taken. */
  begun: boolean;
  /** The kit failed to load: spar steps run with the avatar worn. */
  anyKit: boolean;
}

/**
 * The M07 class drill (design item 87). Each step counts the growth of `prompts.count(mechanic)`; block and dodge steps
 * spawn a sparring partner once the class's kit is worn. Ends `done` after the last step, `skipped` from the menu, a class
 * change or walking off; every end emits `class.drill` once and despawns what it spawned. Not saved mid-way.
 */
export class DrillRunner {
  private run: Run | null = null;
  private readonly ends: ((classId: ClassId, outcome: DrillOutcome) => void)[] = [];

  constructor(private readonly ports: DrillPorts) {}

  onEnd(fn: (classId: ClassId, outcome: DrillOutcome) => void): void {
    this.ends.push(fn);
  }

  get running(): boolean {
    return this.run !== null;
  }

  start(classId: ClassId, steps: readonly DrillStepDef[]): boolean {
    if (this.run || steps.length === 0) return false;
    this.run = { classId, steps, index: 0, base: 0, spar: null, releaseXp: this.ports.pauseKillXp('classes.drill'), begun: false, anyKit: false };
    return true;
  }

  state(): DrillState | null {
    const r = this.run;
    if (!r) return null;
    const step = r.steps[r.index];
    return {
      classId: r.classId,
      step: r.index,
      steps: r.steps.length,
      textKey: this.textKey(r.classId, step),
      progress: r.begun ? Math.min(step.count, this.count(step) - r.base) : 0,
      required: step.count,
    };
  }

  /** The class's kit could not be loaded: stop waiting for it before the spar steps. */
  kitFailed(classId: ClassId): void {
    if (this.run?.classId === classId) this.run.anyKit = true;
  }

  skip(): boolean {
    if (!this.run) return false;
    this.finish('skipped');
    return true;
  }

  /** A class change or a load: a running drill ends `skipped` (silently on a load, which is not the player's doing). */
  cancel(silent = false): void {
    if (!this.run) return;
    this.finish('skipped', silent);
  }

  tick(): void {
    const r = this.run;
    if (!r) return;
    const away = this.ports.distanceFromYard();
    if (away !== null && away > DRILL_LEAVE_RADIUS) {
      this.finish('skipped');
      return;
    }
    // Steps that cannot be done by this class right now are passed over.
    while (r.index < r.steps.length && !r.begun && this.passOver(r.classId, r.steps[r.index])) r.index++;
    if (r.index >= r.steps.length) {
      this.finish('done');
      return;
    }
    const step = r.steps[r.index];
    if (!r.begun) {
      // Spars wait for the class's own kit, so a hostile in aggro cannot hold the kit swap back.
      if (step.spar && !r.anyKit && this.ports.wornClass() !== r.classId) return;
      if (step.spar) {
        if (!this.spawnSpar(step.spar)) {
          this.ports.warn?.(`classes: the drill spar "${step.spar.spawnerId}" did not spawn; step "${step.id}" passed over`);
          r.index++;
          if (r.index >= r.steps.length) this.finish('done');
          return;
        }
        r.spar = step.spar.spawnerId;
      }
      r.base = this.count(step);
      r.begun = true;
      this.ports.prompts()?.show(step.mechanic, step.action, this.textKey(r.classId, step), { force: true });
      return;
    }
    if (this.count(step) - r.base < step.count) {
      // A spar killed, spared or removed before the step is done comes back.
      if (r.spar && step.spar && (this.ports.enemies()?.alive(r.spar).length ?? 1) === 0) this.spawnSpar(step.spar);
      return;
    }
    this.endStep(r, step);
    r.index++;
    r.begun = false;
    if (r.index >= r.steps.length) this.finish('done');
  }

  private spawnSpar(spar: NonNullable<DrillStepDef['spar']>): boolean {
    const enemies = this.ports.enemies();
    if (!enemies) return false;
    enemies.reset(spar.spawnerId);
    return enemies.spawnGroup(spar.spawnerId, { moves: spar.moves, aggro: true }).length > 0;
  }

  private passOver(classId: ClassId, step: DrillStepDef): boolean {
    if (step.mechanic === 'skills') return !this.ports.hasSkills(classId) || !this.ports.canBuySkill();
    if (step.mechanic === 'ability') return !this.ports.hasBarAbility();
    return false;
  }

  private endStep(r: Run, step: DrillStepDef): void {
    this.ports.prompts()?.hide(step.mechanic);
    if (r.spar) {
      this.ports.enemies()?.despawnGroup(r.spar);
      r.spar = null;
    }
  }

  private finish(outcome: DrillOutcome, silent = false): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    const step = r.steps[r.index];
    if (step) this.endStep(r, step);
    else if (r.spar) this.ports.enemies()?.despawnGroup(r.spar);
    r.releaseXp?.();
    if (silent) return;
    for (const fn of this.ends) fn(r.classId, outcome);
    this.ports.emit({ classId: r.classId, outcome });
  }

  private count(step: DrillStepDef): number {
    return this.ports.prompts()?.count(step.mechanic) ?? 0;
  }

  private textKey(classId: ClassId, step: DrillStepDef): string {
    if (step.textKey) return step.textKey;
    const own = `classes.drill.${classId}.${step.id}`;
    return this.ports.hasString(own) ? own : `classes.drill.default.${step.id}`;
  }
}
