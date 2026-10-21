// Kill objectives that must not dead-end (QA round 3): "drive off the wraiths" with none left to find. A wraith that
// despawned or died to something other than the player earns no credit, so the objective can need more kills than
// live enemies exist. This watches the current Act 1 wraith/hound objectives, refills short groups, and points the map
// at the nearest living one.
import type { ObjectiveDef } from './types';

/** spawnTag of a plain Act 1 group to the spawner that makes it. Scripted fights (bouts, thieves, ambushes) are not here. */
export const KILL_FAILSAFE_SPAWNERS: Readonly<Record<string, string>> = {
  'm01': 'm01.lanes',
  'm01.mill': 'density.m01.mill',
  'm02.oven-yard': 'density.m02.oven-yard',
  'm05.shrine': 'density.m05.shrine',
  'd01.antechamber': 'density.d01.antechamber',
  'r01.root': 'density.r01.root',
};

/** Quests that own those groups. */
export const KILL_FAILSAFE_QUESTS: readonly string[] = ['m01', 'm02', 'm05', 'd01', 'r01'];

export interface KillTarget { questId: string; objectiveId: string; spawnTag: string; remaining: number }

export interface KillQuestPort {
  state(id: string): string;
  objectives(id: string): Array<{ def: ObjectiveDef; progress: number; done: boolean; current: boolean }>;
}

/** The unfinished, currently open kill objectives of the failsafe's groups. */
export function currentKillTargets(quests: KillQuestPort, questIds: readonly string[]): KillTarget[] {
  const out: KillTarget[] = [];
  for (const questId of questIds) {
    if (quests.state(questId) !== 'active') continue;
    for (const o of quests.objectives(questId)) {
      const tag = o.def.spawnTag;
      if (o.def.type !== 'kill' || o.done || !o.current || !tag || !KILL_FAILSAFE_SPAWNERS[tag]) continue;
      const remaining = (o.def.required ?? 1) - o.progress;
      if (remaining > 0) out.push({ questId, objectiveId: o.def.id, spawnTag: tag, remaining });
    }
  }
  return out;
}

export interface KillFailsafePorts {
  targets(): KillTarget[];
  /** Living enemies carrying the tag. */
  live(tag: string): number;
  spawnGroup(spawnerId: string, opts?: { count?: number }): unknown;
  reset(spawnerId: string): void;
  warn?(msg: string): void;
}

export const KILL_FAILSAFE_TUNING = {
  /** Seconds between checks. */
  period: 3,
  /** Seconds a group may stay short before it is rebuilt from scratch. */
  rebuildAfter: 8,
} as const;

export class KillFailsafe {
  private acc = 0;
  private shortFor = new Map<string, number>();

  constructor(private readonly p: KillFailsafePorts) {}

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < KILL_FAILSAFE_TUNING.period) return;
    const elapsed = this.acc;
    this.acc = 0;
    const seen = new Set<string>();
    for (const t of this.p.targets()) {
      seen.add(t.spawnTag);
      if (this.p.live(t.spawnTag) >= t.remaining) { this.shortFor.delete(t.spawnTag); continue; }
      const spawner = KILL_FAILSAFE_SPAWNERS[t.spawnTag];
      // first the free slots (despawned or escaped members), then a rebuild of exactly what the objective still needs
      this.p.spawnGroup(spawner);
      if (this.p.live(t.spawnTag) >= t.remaining) { this.shortFor.delete(t.spawnTag); continue; }
      const short = (this.shortFor.get(t.spawnTag) ?? 0) + elapsed;
      this.shortFor.set(t.spawnTag, short);
      if (short < KILL_FAILSAFE_TUNING.rebuildAfter) continue;
      this.shortFor.delete(t.spawnTag);
      this.p.warn?.(`quests: ${t.questId}.${t.objectiveId} was short of ${t.spawnTag} enemies; rebuilding ${spawner}`);
      this.p.reset(spawner);
      this.p.spawnGroup(spawner, { count: t.remaining });
    }
    for (const tag of [...this.shortFor.keys()]) if (!seen.has(tag)) this.shortFor.delete(tag);
  }
}
