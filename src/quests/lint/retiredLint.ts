// Contracts v0.8 item 8: the retirement lint. For each retired NPC (npcs/retire.ts), nothing may still need it after its
// flag: no objective that talks to it (or interacts with `npc:<id>`) in a quest that can still be live, and no class desk
// that still belongs to it at the act's end. A retired vendor's shop must be closed by a VENDOR_OPEN_WHEN row. A quest from an
// earlier act is never live after an Act 4 flag; in Act 4, a main quest numbered at or below the flag's quest is done.
import { DEFAULT_KITS, TRAINER_POSTS, trainerPlacement, type TrainerPostRow } from '../../classes/kits';
import type { RetiredNpc } from '../../npcs/retire';
import type { FlagCondition } from '../../core/flagCondition';
import { VENDOR_OPEN_WHEN, isVendorId, vendorOpenByTable, type VendorId } from '../../economy/stock';
import type { QuestDef } from '../types';
import { ACT4_QUEST_IDS } from './act4Ids';

export interface RetiredLintAllow {
  npcId: string;
  /** `quest:<questId>/<objectiveId>` or `trainer:<classId>`. */
  what: string;
  reason: string;
}

/** Empty today; every entry needs a reason. */
export const RETIRED_LINT_ALLOW: readonly RetiredLintAllow[] = [];

const mainNo = (id: string): number | null => (/^m(\d+)$/.test(id) ? Number(id.slice(1)) : null);

/** Whether quest `questId` can still be live once `flag` (a `story.<quest>.*` flag) holds. */
export function liveAfter(questId: string, flag: string): boolean {
  const m = /^story\.([a-z]\d+)\./.exec(flag);
  const flagQuest = m?.[1];
  if (!flagQuest || !ACT4_QUEST_IDS.includes(flagQuest)) return true;
  if (!ACT4_QUEST_IDS.includes(questId)) return false;
  if (questId === flagQuest) return false;
  const a = mainNo(questId);
  const b = mainNo(flagQuest);
  return !(a !== null && b !== null && a <= b);
}

/** The flags at the act's end: every Act 4 quest complete, both gates. */
function actEndFlags(retiredFlag: string): { getFlag(k: string): unknown } {
  const on = new Set<string>([retiredFlag, 'story.gate.a4', 'story.gate.a5', ...ACT4_QUEST_IDS.map((q) => `story.${q}.complete`)]);
  return { getFlag: (k) => on.has(k) || undefined };
}

export function retiredLint(
  retired: readonly RetiredNpc[],
  quests: readonly QuestDef[],
  rows: readonly TrainerPostRow[] = TRAINER_POSTS,
  allow: readonly RetiredLintAllow[] = RETIRED_LINT_ALLOW,
  vendorTable: Partial<Record<VendorId, FlagCondition>> = VENDOR_OPEN_WHEN,
): string[] {
  const errs: string[] = [];
  const allowed = (npcId: string, what: string) => allow.some((a) => a.npcId === npcId && a.what === what);
  for (const r of retired) {
    for (const q of quests) {
      if (!liveAfter(q.id, r.whenFlag)) continue;
      for (const o of q.objectives) {
        const targets = Array.isArray(o.target) ? o.target : [o.target];
        const hit = (o.type === 'talk' && targets.includes(r.id)) || (o.type === 'interact' && targets.includes(`npc:${r.id}`));
        const what = `quest:${q.id}/${o.id}`;
        if (hit && !allowed(r.id, what)) errs.push(`${r.id} retires at ${r.whenFlag}, but ${what} still needs them`);
      }
    }
    if (isVendorId(r.id) && vendorOpenByTable(r.id, actEndFlags(r.whenFlag), vendorTable) && !allowed(r.id, `vendor:${r.id}`)) {
      errs.push(`${r.id} retires at ${r.whenFlag}, but their shop has no VENDOR_OPEN_WHEN row closing it`);
    }
    for (const kit of Object.values(DEFAULT_KITS)) {
      const p = trainerPlacement(kit, actEndFlags(r.whenFlag), rows);
      const what = `trainer:${kit.classId}`;
      if (p.npcId === r.id && !allowed(r.id, what)) errs.push(`${r.id} retires at ${r.whenFlag}, but the ${kit.classId} desk is still theirs (add a TRAINER_POSTS row with classId)`);
    }
  }
  return errs;
}
