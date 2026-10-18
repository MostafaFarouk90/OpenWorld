import {
  consoleLogger,
  type ActorPort,
  type EmitterPort,
  type LearnCheck,
  type Logger,
  type NextUnlock,
  type ProgressionService,
} from '../hud/ports';
import { getSkill, SKILLS, type SkillDef } from './skills';
import {
  BAR_SLOTS,
  LEVEL_CAP,
  MERCY_XP_FRACTION,
  baseMaxHealthForLevel,
  killXp,
  levelForXp,
  levelPoints,
  xpForLevel,
} from './tuning';

export interface ProgressionDeps {
  emit: EmitterPort['emit'];
  logger?: Logger;
  actor: () => ActorPort | null;
}

export interface KillInfo {
  actorId: string;
  kind: string;
  team: string;
  level: number;
  killerId: string | null | undefined;
}

export interface MercyInfo {
  actorId: string;
  kind: string;
  level: number;
}

export interface ProgressionSave {
  xp: number;
  storyPoints: number;
  learned: string[];
  bar: (string | null)[];
}

interface MercyEntry {
  paid: number;
  revoked: boolean;
}

export class Progression implements ProgressionService {
  static readonly key = 'progression';
  static readonly version = 1;

  private totalXp = 0;
  private storyPoints = 0;
  private learnedIds: string[] = [];
  private slots: (string | null)[] = new Array<string | null>(BAR_SLOTS).fill(null);
  private pauses = new Map<string, number>();
  private killed = new Set<string>();
  private mercy = new Map<string, MercyEntry>();
  private modifiers = new Map<string, () => number>();
  private readonly emit: EmitterPort['emit'];
  private readonly logger: Logger;
  private readonly actor: () => ActorPort | null;

  constructor(deps: ProgressionDeps) {
    this.emit = deps.emit;
    this.logger = deps.logger ?? consoleLogger;
    this.actor = deps.actor;
  }

  get xp(): number {
    return this.totalXp;
  }

  get level(): number {
    return levelForXp(this.totalXp);
  }

  get skillPoints(): number {
    return levelPoints(this.level) + this.storyPoints - this.spent(this.learnedIds);
  }

  /** Re-evaluates the max-health modifiers (Burn and Scars change over time). */
  refreshMaxHealth(): void {
    this.applyMaxHealth();
  }

  xpToNext(): number {
    const level = this.level;
    return level >= LEVEL_CAP ? 0 : xpForLevel(level + 1) - this.totalXp;
  }

  /** Returns the xp actually added (0 for ignored amounts or at the cap). */
  grantXp(amount: number, source: string): number {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
    const before = this.level;
    const cap = xpForLevel(LEVEL_CAP);
    const next = Math.min(cap, this.totalXp + amount);
    const added = next - this.totalXp;
    if (added <= 0) return 0;
    this.totalXp = next;
    this.emit('xp.gained', { amount: added, source, total: this.totalXp });
    const after = this.level;
    for (let l = before + 1; l <= after; l++) this.emit('level.up', { level: l, previous: l - 1 });
    if (after > before) {
      this.applyMaxHealth(true);
      this.emit('skillpoints.changed', { points: this.skillPoints });
    }
    return added;
  }

  grantSkillPoint(n: number, reason: string): void {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return;
    this.storyPoints += Math.floor(n);
    void reason;
    this.emit('skillpoints.changed', { points: this.skillPoints });
  }

  pauseKillXp(source: string): () => void {
    this.pauses.set(source, (this.pauses.get(source) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (this.pauses.get(source) ?? 0) - 1;
      if (n > 0) this.pauses.set(source, n);
      else this.pauses.delete(source);
    };
  }

  get killXpPaused(): boolean {
    return this.pauses.size > 0;
  }

  /** Returns the xp paid. */
  onKill(info: KillInfo): number {
    if (info.killerId !== 'player' || info.team !== 'hostile') return 0;
    if (this.killXpPaused || this.killed.has(info.actorId)) return 0;
    this.killed.add(info.actorId);
    const value = killXp(info.kind, info.level, this.level);
    const paid = this.mercy.get(info.actorId)?.paid ?? 0;
    return this.grantXp(Math.max(0, value - paid), `kill.${info.kind}`);
  }

  /** Pays 60% (floor) of the kill value, once per creature. */
  onMercy(info: MercyInfo): number {
    if (this.killXpPaused || this.mercy.has(info.actorId) || this.killed.has(info.actorId)) return 0;
    const value = killXp(info.kind, info.level, this.level);
    const pay = Math.floor(value * MERCY_XP_FRACTION);
    this.mercy.set(info.actorId, { paid: pay, revoked: false });
    return this.grantXp(pay, `mercy.${info.kind}`);
  }

  /** Removes the mercy credit; the xp already paid stays and a later kill pays only the remainder. */
  onMercyRevoked(actorId: string): void {
    const entry = this.mercy.get(actorId);
    if (entry) entry.revoked = true;
  }

  canLearn(id: string): LearnCheck {
    const skill = getSkill(id);
    if (!skill) return { ok: false, reason: 'unknown-skill' };
    if (this.learnedIds.includes(id)) return { ok: false, reason: 'already-learned' };
    if (!skill.available) return { ok: false, reason: 'unavailable' };
    if (skill.requires && !this.learnedIds.includes(skill.requires)) return { ok: false, reason: 'missing-prereq' };
    if (this.excluded(skill)) return { ok: false, reason: 'excluded' };
    if (this.skillPoints < skill.cost) return { ok: false, reason: 'no-points' };
    return { ok: true };
  }

  learn(id: string): LearnCheck {
    const check = this.canLearn(id);
    if (!check.ok) return check;
    const skill = getSkill(id)!;
    this.learnedIds.push(id);
    this.emit('skill.learned', { skillId: id });
    if (skill.kind === 'active') {
      const free = this.slots.indexOf(null);
      if (free >= 0) {
        this.slots[free] = id;
        this.emit('ability.bar.changed', {});
      }
    }
    this.emit('skillpoints.changed', { points: this.skillPoints });
    return { ok: true };
  }

  learned(id: string): boolean {
    return this.learnedIds.includes(id);
  }

  learnedSkills(): readonly string[] {
    return this.learnedIds;
  }

  bar(): readonly (string | null)[] {
    return this.slots.slice();
  }

  assign(slot: number, skillId: string | null): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot >= BAR_SLOTS) return false;
    if (skillId !== null) {
      const skill = getSkill(skillId);
      if (!skill || skill.kind !== 'active' || !this.learnedIds.includes(skillId)) return false;
      const old = this.slots.indexOf(skillId);
      if (old >= 0) this.slots[old] = null;
    }
    this.slots[slot] = skillId;
    this.emit('ability.bar.changed', {});
    return true;
  }

  baseMaxHealth(): number {
    return baseMaxHealthForLevel(this.level);
  }

  addMaxHealthModifier(id: string, fn: () => number): () => void {
    this.modifiers.set(id, fn);
    this.applyMaxHealth();
    return () => {
      if (this.modifiers.get(id) !== fn) return;
      this.modifiers.delete(id);
      this.applyMaxHealth();
    };
  }

  /** Writes actor.maxHealth; health only rises by the same delta on a level-up and is otherwise clamped down. */
  applyMaxHealth(levelUp = false): void {
    const actor = this.actor();
    if (!actor) return;
    let factor = 1;
    for (const [id, fn] of this.modifiers) {
      let v = NaN;
      try {
        v = fn();
      } catch {
        // handled below
      }
      if (!Number.isFinite(v) || v <= 0) {
        this.logger.warn(`progression: max health modifier "${id}" returned an invalid value, ignored`);
        continue;
      }
      factor *= v;
    }
    const before = actor.maxHealth;
    const next = Math.round(this.baseMaxHealth() * factor);
    actor.maxHealth = next;
    actor.level = this.level;
    if (levelUp && next > before) actor.health += next - before;
    if (actor.health > next) actor.health = next;
  }

  nextUnlock(): NextUnlock {
    const points = this.skillPoints;
    let cheapest: SkillDef | null = null;
    for (const s of SKILLS) {
      if (!s.available || this.learnedIds.includes(s.id)) continue;
      if (s.requires && !this.learnedIds.includes(s.requires)) continue;
      if (this.excluded(s)) continue;
      if (!cheapest || s.cost < cheapest.cost) cheapest = s;
    }
    if (cheapest && points >= cheapest.cost) return { kind: 'skill', remaining: 0, skillId: cheapest.id };
    const level = this.level;
    if (level < LEVEL_CAP) return { kind: 'level', remaining: this.xpToNext(), level: level + 1 };
    return { kind: 'none' };
  }

  serialize(): ProgressionSave {
    return {
      xp: this.totalXp,
      storyPoints: this.storyPoints,
      learned: this.learnedIds.slice(),
      bar: this.slots.slice(),
    };
  }

  load(data: unknown): void {
    this.killed.clear();
    this.mercy.clear();
    this.totalXp = 0;
    this.storyPoints = 0;
    this.learnedIds = [];
    this.slots = new Array<string | null>(BAR_SLOTS).fill(null);
    const d = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};

    const xp = d.xp;
    if (typeof xp === 'number' && Number.isFinite(xp) && xp > 0) this.totalXp = Math.min(xp, xpForLevel(LEVEL_CAP));
    const story = d.storyPoints;
    if (typeof story === 'number' && Number.isFinite(story) && story > 0) this.storyPoints = Math.floor(story);

    if (Array.isArray(d.learned)) {
      for (const id of d.learned) {
        if (typeof id !== 'string' || this.learnedIds.includes(id)) continue;
        const skill = getSkill(id);
        if (!skill || !skill.available) continue;
        if (skill.requires && !this.learnedIds.includes(skill.requires)) continue;
        if (this.excluded(skill)) continue;
        this.learnedIds.push(id);
      }
      while (this.learnedIds.length && this.skillPoints < 0) this.dropLast();
    }

    if (Array.isArray(d.bar)) {
      for (let i = 0; i < BAR_SLOTS; i++) {
        const id = d.bar[i];
        if (typeof id !== 'string' || this.slots.includes(id)) continue;
        if (getSkill(id)?.kind === 'active' && this.learnedIds.includes(id)) this.slots[i] = id;
      }
    }
    this.applyMaxHealth();
  }

  private dropLast(): void {
    const dropped = this.learnedIds[this.learnedIds.length - 1];
    // drop dependants first so the tree stays consistent
    this.learnedIds = this.learnedIds.filter((id) => id !== dropped && getSkill(id)?.requires !== dropped);
  }

  private spent(ids: readonly string[]): number {
    let n = 0;
    for (const id of ids) n += getSkill(id)?.cost ?? 0;
    return n;
  }

  private excluded(skill: SkillDef): boolean {
    if (!skill.exclusiveGroup) return false;
    return this.learnedIds.some((id) => id !== skill.id && getSkill(id)?.exclusiveGroup === skill.exclusiveGroup);
  }
}
