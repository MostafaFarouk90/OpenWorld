// Pure objective event matching: given a bus event, how much (if any) credit does an objective get?
// No state lives here; QuestManager owns progress and the dedupe sets.
import type { ObjectiveDef, ObjectiveType } from './types';
import type { ActorMetaPort } from './ports';

export interface MatchCtx {
  playerId: string | undefined;
  actorMeta?: ActorMetaPort;
}

export interface Credit {
  amount: number;
  /** when set, the credit counts once per distinct key per objective */
  dedupeKey?: string;
}

/** Bus events that can advance objectives. */
export const OBJECTIVE_EVENTS = [
  'trigger.enter', 'interact', 'actor.died', 'mercy', 'loot.granted', 'dialogue.ended', 'carry.delivered',
] as const;

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function spawnTagOk(def: ObjectiveDef, p: Record<string, any>, ctx: MatchCtx): boolean {
  if (def.spawnTag === undefined) return true;
  // the payload carries the tag (the actor may already be gone from the registry); fall back to the lookup
  if (isStr(p.spawnTag)) return p.spawnTag === def.spawnTag;
  if (!isStr(p.actorId)) return false;
  return ctx.actorMeta?.(p.actorId)?.spawnTag === def.spawnTag;
}

/** Credit an objective earns from one event, or null when the event does not concern it. */
export function creditFor(def: ObjectiveDef, type: string, payload: unknown, ctx: MatchCtx): Credit | null {
  if (!isObj(payload)) return null;
  const p = payload;
  switch (def.type as ObjectiveType) {
    case 'goTo':
      if (type !== 'trigger.enter') return null;
      return ctx.playerId !== undefined && p.actorId === ctx.playerId && p.triggerId === def.target ? { amount: 1 } : null;
    case 'interact':
      return type === 'interact' && p.interactableId === def.target && p.action !== 'mercy' ? { amount: 1 } : null;
    case 'kill': {
      if (type === 'actor.died') {
        if (ctx.playerId === undefined || p.killerId !== ctx.playerId || p.kind !== def.target) return null;
      } else if (type === 'mercy') {
        if (p.creature !== def.target) return null;
      } else return null;
      if (!spawnTagOk(def, p, ctx)) return null;
      return isStr(p.actorId) ? { amount: 1, dedupeKey: p.actorId } : { amount: 1 };
    }
    case 'collect': {
      if (type !== 'loot.granted' || !Array.isArray(p.items)) return null;
      let n = 0;
      for (const it of p.items) {
        if (isObj(it) && it.itemId === def.target && typeof it.count === 'number' && Number.isFinite(it.count) && it.count > 0) n += it.count;
      }
      return n > 0 ? { amount: n } : null;
    }
    case 'talk':
      // aborted dialogues end with reason death|load|skip|dispose|script and earn no credit
      if (type !== 'dialogue.ended' || p.npcId !== def.target) return null;
      return p.reason === undefined || p.reason === 'completed' ? { amount: 1 } : null;
    case 'carry':
      if (type !== 'carry.delivered' || p.destinationId !== def.target) return null;
      return isStr(p.carryId) ? { amount: 1, dedupeKey: p.carryId } : null;
    default:
      return null;
  }
}
