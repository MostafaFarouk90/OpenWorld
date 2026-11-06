// Contracts v0.8 item 8: NPC retirement. A retired NPC is absent (despawned, never spawned again) from its flag on, in
// every layout that places it: NpcManager merges RETIRED_NPCS into each NpcSpec's absent flags. A post rule cannot bring it
// back (NpcManager.place refuses an NPC that is not spawned). The retirement lint (quests/lint/retiredLint.ts) checks
// that no quest, vendor or trainer still needs it after the flag. L10 adds Gaut (story.m39.complete).

export interface RetiredNpc {
  id: string;
  whenFlag: string;
}

export const RETIRED_NPCS: RetiredNpc[] = [];

/** `absentWhen` as a list (v0.8: one flag or any of several). */
export function absentFlags(absentWhen: string | readonly string[] | undefined): string[] {
  if (absentWhen === undefined) return [];
  return typeof absentWhen === 'string' ? [absentWhen] : [...absentWhen];
}

/** Every flag that makes NPC `id` absent: its spec's own plus its retirement. */
export function absentFlagsFor(id: string, absentWhen: string | readonly string[] | undefined, retired: readonly RetiredNpc[] = RETIRED_NPCS): string[] {
  const out = absentFlags(absentWhen);
  for (const r of retired) if (r.id === id && !out.includes(r.whenFlag)) out.push(r.whenFlag);
  return out;
}

export function retiredFlag(id: string, retired: readonly RetiredNpc[] = RETIRED_NPCS): string | undefined {
  return retired.find((r) => r.id === id)?.whenFlag;
}
