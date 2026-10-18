import {
  consoleLogger,
  type AbilityHandler,
  type AbilitiesService,
  type ActorPort,
  type EmitterPort,
  type Logger,
  type ProgressionService,
  type SpellsPort,
  type UseAbilityResult,
} from '../hud/ports';
import { getSkill } from './skills';
import { BAR_SLOTS } from './tuning';

export interface AbilitiesDeps {
  progression: Pick<ProgressionService, 'bar' | 'learned'>;
  spells: () => SpellsPort | undefined;
  caster: () => ActorPort | null;
  ctx: () => unknown;
  emit: EmitterPort['emit'];
  logger?: Logger;
  fallback?: AbilityHandler;
}

const TICKS_PER_SECOND = 60;

export class Abilities implements AbilitiesService {
  private handlers = new Map<string, AbilityHandler>();
  /** Remaining fixed ticks per skill id. */
  private cooldowns = new Map<string, number>();
  private readonly logger: Logger;

  constructor(private readonly deps: AbilitiesDeps) {
    this.logger = deps.logger ?? consoleLogger;
  }

  registerHandler(skillId: string, handler: AbilityHandler): () => void {
    if (this.handlers.has(skillId)) throw new Error(`ability handler already registered for ${skillId}`);
    this.handlers.set(skillId, handler);
    return () => {
      if (this.handlers.get(skillId) === handler) this.handlers.delete(skillId);
    };
  }

  use(slot: number): UseAbilityResult {
    if (!Number.isInteger(slot) || slot < 0 || slot >= BAR_SLOTS) return { ok: false, reason: 'bad-slot' };
    const skillId = this.deps.progression.bar()[slot];
    const skill = skillId ? getSkill(skillId) : undefined;
    if (!skillId || !skill) return { ok: false, reason: 'empty-slot' };
    if (skill.kind === 'passive') return { ok: false, reason: 'passive' };
    const caster = this.deps.caster();
    if (!caster || caster.dead) return { ok: false, reason: 'dead' };
    if ((this.cooldowns.get(skillId) ?? 0) > 0) return { ok: false, reason: 'cooldown' };
    const spells = this.deps.spells();
    const cost = skill.emberCost ?? 0;
    if (spells && spells.ember < cost) return { ok: false, reason: 'no-ember' };

    const handler = this.handlers.get(skillId) ?? this.deps.fallback;
    if (!handler) return { ok: false, reason: 'handler-failed', detail: 'no-handler' };
    try {
      const result = handler({ skillId, slot, caster: { id: caster.id }, ctx: this.deps.ctx() });
      if (!result.ok) return { ok: false, reason: 'handler-failed', detail: result.reason };
    } catch (err) {
      this.logger.warn(`ability handler for ${skillId} threw: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, reason: 'handler-failed' };
    }

    if (spells && cost > 0) spells.spendEmber(cost);
    if (skill.cooldown && skill.cooldown > 0) {
      this.cooldowns.set(skillId, Math.round(skill.cooldown * TICKS_PER_SECOND));
    }
    this.deps.emit('ability.used', { skillId, slot });
    return { ok: true };
  }

  /** Once per fixed tick. */
  tick(): void {
    for (const [id, ticks] of this.cooldowns) {
      if (ticks <= 1) this.cooldowns.delete(id);
      else this.cooldowns.set(id, ticks - 1);
    }
  }

  cooldown(slot: number): { remaining: number; total: number } {
    const skillId = Number.isInteger(slot) ? this.deps.progression.bar()[slot] : null;
    if (!skillId) return { remaining: 0, total: 0 };
    const total = getSkill(skillId)?.cooldown ?? 0;
    return { remaining: (this.cooldowns.get(skillId) ?? 0) / TICKS_PER_SECOND, total };
  }

  reportTrigger(skillId: string): boolean {
    if (!this.deps.progression.learned(skillId)) return false;
    this.deps.emit('skill.triggered', { skillId });
    return true;
  }
}
