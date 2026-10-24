// Objective lint (contracts v0.7 item 21, the root cause of Act 2's three high-severity soft locks, review-a.md): an
// `event` objective can be fired by the world before it is current, and the credit is then lost. Every such objective
// carries a `doneWhen` (a flag or `{ objective }` condition, which is persisted quest state, so R04 `o2` counts), or
// one of three data exemptions holds, or it sits on OBJECTIVE_LINT_ALLOW with a reason and an owner:
//   (a) an `interact` event whose every interactable is a quest prop bound to this exact [quest, objective]
//       (QuestProps enables a prop only while its objective is current);
//   (b) a `dialogue.ended` read whose npc ids are all registered notes (a note stays readable, so an early read is
//       recoverable by reading it again);
//   (c) a `carry.delivered` whose destination is that of a CarryItemSpec bound to this objective.
import type { ObjectiveDef, QuestDef } from '../types';
import type { QuestPropSpec } from '../props';
import type { CarryItemSpec } from '../content/carry';
import { questDefs } from '../content';
import { QUEST_PROPS } from '../content/props';
import { CARRY_ITEMS } from '../content/carry';
import { QUEST_NOTES } from '../content/notes';
import { ACT2_PROPS, ACT2_CARRY, ACT2_QUEST_NOTES } from '../content/act2';

export interface ObjectiveLintAllow {
  quest: string;
  objective: string;
  reason: string;
  /** The thread that can clear the entry. */
  owner: string;
}

const SHIPPED = 'K0 (shipped Act 1 and 2)';
const row = (reason: string, owner: string, ...ids: string[]): ObjectiveLintAllow[] =>
  ids.map((id) => {
    const [quest, objective] = id.split('/');
    return { quest, objective, reason, owner };
  });

export const OBJECTIVE_LINT_ALLOW: readonly ObjectiveLintAllow[] = [
  ...row('section live window: the stealth section is live only while its objective is current', SHIPPED, 'm06/o2', 'm09/o4', 'm15/scout', 'm19/stealth'),
  ...row('chase live window: the chase is live only while its objective is current', SHIPPED, 'm10/o2', 'm10/o3'),
  ...row('director-gated: started only when the objective is current', SHIPPED, 'm12/raid', 'm13/duel'),
  ...row('scene gated by objCurrent: the scene dialogue starts only when the objective is current', SHIPPED, 'r11/den', 'm18/breathe', 'm19/reveal', 'm22/council', 'm22/raised'),
  ...row('dialogue step-gated: the event comes from a dialogue segment or director keyed on an earlier objective', SHIPPED, 'r05/choice', 'r07/choice', 'm14/sings', 'm15/flight', 'm16/silence', 'r09/report'),
  ...row('director raises it only on a quest-bound prop (cannot be lit early)', SHIPPED, 'm16/brazier'),
  ...row('spawner activation gated on the previous objective flag (story.r01.shawlRead)', SHIPPED, 'r01/o2'),
  ...row('bridge sets the flag only while the objective is current', SHIPPED, 'm09/o3'),
  ...row('repeatable: the player can simply do it again', SHIPPED,
    'm04/carters', 'm06/queue', 'm07/ask', 'm08/wait', 'm17/thanks', 'd01/o1', 'm09/o2', 'd02/o2', 'r02/o2', 'r02/o3', 'r02/o4', 'm10/ride', 'm14/murals'),
];

export interface ObjectiveHit { quest: string; objective: string; why: string }

export interface ObjectiveLintInput {
  quests: readonly QuestDef[];
  props: readonly Pick<QuestPropSpec, 'interactableId' | 'objective'>[];
  carry: readonly Pick<CarryItemSpec, 'questId' | 'objectiveId' | 'destination'>[];
  /** registered note ids (no `use:` prefix) */
  notes: ReadonlySet<string>;
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);
const names = (t: string | string[]): string[] => (Array.isArray(t) ? t : [t]);

/** Which exemption, if any, covers this `event` objective without a `doneWhen`. */
export function exemption(q: QuestDef, o: ObjectiveDef, input: ObjectiveLintInput): 'prop' | 'note' | 'carry' | null {
  const ev = names(o.target);
  if (ev.length !== 1) return null;
  const match = o.match ?? {};
  if (ev[0] === 'interact') {
    const ids = asList(match.interactableId);
    const ok = ids.length > 0 && ids.every((id) => input.props.some((p) => p.interactableId === id && p.objective[0] === q.id && p.objective[1] === o.id));
    return ok ? 'prop' : null;
  }
  if (ev[0] === 'dialogue.ended') {
    const ids = asList(match.npcId);
    return ids.length > 0 && ids.every((id) => input.notes.has(id)) ? 'note' : null;
  }
  if (ev[0] === 'carry.delivered') {
    const dest = match.destinationId;
    const ok = typeof dest === 'string' && input.carry.some((c) => c.questId === q.id && c.objectiveId === o.id && c.destination === dest);
    return ok ? 'carry' : null;
  }
  return null;
}

/** Every `event` objective with no `doneWhen` and no data exemption (the allow list is applied by the caller). */
export function findObjectiveHits(input: ObjectiveLintInput): ObjectiveHit[] {
  const hits: ObjectiveHit[] = [];
  for (const q of input.quests) {
    for (const o of q.objectives) {
      if (o.type !== 'event' || o.doneWhen) continue;
      if (exemption(q, o, input)) continue;
      hits.push({ quest: q.id, objective: o.id, why: `event ${names(o.target).join('|')} can fire before it is current` });
    }
  }
  return hits;
}

export function unlistedObjectiveHits(hits: readonly ObjectiveHit[], allow: readonly ObjectiveLintAllow[] = OBJECTIVE_LINT_ALLOW): ObjectiveHit[] {
  return hits.filter((h) => !allow.some((a) => a.quest === h.quest && a.objective === h.objective));
}

export function shippedObjectiveInput(): ObjectiveLintInput {
  return {
    quests: questDefs,
    props: [...QUEST_PROPS, ...ACT2_PROPS],
    carry: [...CARRY_ITEMS, ...ACT2_CARRY],
    notes: new Set([...QUEST_NOTES, ...ACT2_QUEST_NOTES].map((n) => n.interactableId.replace(/^use:/, ''))),
  };
}
