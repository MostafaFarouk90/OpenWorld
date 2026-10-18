// Quest-offer leads: a map marker over the giver once their offer is available. The condition is not copied
// here; it is the `when` of the giver dialogue's start entry whose node is `offerNode`.
import { dialogueDefs } from '../dialogue/content';
import { evalCondition } from './conditions';
import type { ConditionEnv } from './ports';
import type { DialogueDef } from './types';

export interface QuestLead {
  questId: string;
  npcId: string;
  dialogueId: string;
  /** Start-entry node of the offer; its `when` is the lead's condition. */
  offerNode: string;
  /** Anchor used when the NPC has no live position. */
  postAnchor: string;
}

export const QUEST_LEADS: readonly QuestLead[] = [
  { questId: 'm03', npcId: 'aelfreda', dialogueId: 'npc-aelfreda', offerNode: 'm03-offer', postAnchor: 'npc-post.aelfreda' },
  // The banked entry is the broader of Gaut's two M04 offers (the cold one adds a warmth condition).
  { questId: 'm04', npcId: 'gaut', dialogueId: 'npc-gaut', offerNode: 'm04-offer-banked', postAnchor: 'npc-post.gaut' },
  { questId: 'm05', npcId: 'tobb', dialogueId: 'npc-tobb', offerNode: 'intro', postAnchor: 'npc-post.tobb' },
  { questId: 'd01', npcId: 'aelfreda', dialogueId: 'npc-aelfreda', offerNode: 'd01-offer', postAnchor: 'npc-post.aelfreda' },
  { questId: 'r01', npcId: 'wynn', dialogueId: 'npc-wynn', offerNode: 'offer', postAnchor: 'npc-post.wynn' },
  { questId: 'r02', npcId: 'stane', dialogueId: 'npc-stane', offerNode: 'r02-offer', postAnchor: 'npc-post.stane' },
];

export interface LeadMarker { id: string; x: number; z: number; label: string }

export interface LeadPorts {
  env: () => ConditionEnv;
  npcPosition: (npcId: string) => { x: number; z: number } | undefined;
  anchor: (anchorId: string) => { x: number; z: number } | undefined;
  warn: (msg: string) => void;
  dialogues?: readonly DialogueDef[];
  leads?: readonly QuestLead[];
}

/** Markers of every lead whose offer condition holds; `skipped` is true when the last call skipped a lead for a missing NPC/anchor. */
export function createLeadSource(ports: LeadPorts): { markers(): LeadMarker[]; readonly skipped: boolean } {
  const warned = new Set<string>();
  const warnOnce = (key: string, msg: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    ports.warn(msg);
  };
  const state = { skipped: false };
  return {
    get skipped() { return state.skipped; },
    markers() {
      state.skipped = false;
      const out: LeadMarker[] = [];
      for (const lead of ports.leads ?? QUEST_LEADS) {
        const def = (ports.dialogues ?? dialogueDefs).find((d) => d.id === lead.dialogueId);
        const entry = Array.isArray(def?.start) ? def.start.find((s) => s.node === lead.offerNode) : undefined;
        if (!entry) {
          warnOnce(`entry:${lead.questId}`, `lead ${lead.questId}: no start entry "${lead.offerNode}" in "${lead.dialogueId}"`);
          continue;
        }
        if (!evalCondition(entry.when, ports.env())) continue;
        const pos = ports.npcPosition(lead.npcId) ?? ports.anchor(lead.postAnchor);
        if (!pos) {
          state.skipped = true;
          warnOnce(`pos:${lead.questId}`, `lead ${lead.questId}: giver "${lead.npcId}" and anchor "${lead.postAnchor}" not found, skipped`);
          continue;
        }
        out.push({ id: `lead.${lead.questId}`, x: pos.x, z: pos.z, label: lead.npcId });
      }
      return out;
    },
  };
}
