// R10's duel offer: a fourth choice on each of A13's three persuasion rounds, added to the built dialogue defs without
// editing A13's files. The dialogue plugin passes its defs through `withR10Duels` (the one hook line); a def set without
// A13's R10 rounds (main before A13 merges) comes back unchanged.
import type { DialogueChoice, DialogueDef, DialogueNode } from '../../../types';
import {
  R10_DUEL_BUSY_FLAG,
  R10_DUEL_CHOICE_ID,
  R10_DUEL_START_EVENT,
  R10_ROUNDS,
  R10_TARGETS,
  r10RoundSegment,
  type R10Round,
} from './flags';

/** The choice's line (the same in every round), and the two lines the round's speaker answers with before the bout. */
const DUEL_CHOICE = 'Then let a bout settle it. Name your second, first to yield, and no blood.';
const DUEL_REPLY: Readonly<Record<R10Round, readonly [string, string]>> = {
  1: [
    'A bout. The pit has settled worse with less. My second is the steadiest pair of hands on the second shift.',
    'First to yield, then. If you put him down three times, I sit at the table. If he puts you down, come back and try me with words.',
  ],
  2: [
    'I am a clerk with a key ring, Knight. I do not fight. The office keeps a sparring man for days like this one.',
    'He will stand for me. First to yield. If he yields, I sit. If you do, bring me a better argument.',
  ],
  3: [
    'I have copied out enough duelling rolls to know how this ends. Very well. A steward\'s second will stand for me.',
    'First to yield. If you win, I will sit. If you lose, the ledgers are still on the table.',
  ],
};

const replyNode = (n: R10Round, i: number): string => (i === 0 ? `r10-duel-${n}` : `r10-duel-${n}-${i + 1}`);

/** The choice node of round `n`: in the round's segment, the node that offers A13's `evidence` choice. */
function findRoundChoiceNode(def: DialogueDef, n: R10Round): DialogueNode | undefined {
  const seg = r10RoundSegment(n);
  return def.nodes.find(
    (node) => (node.id === seg || node.id.startsWith(`${seg}-`)) && !!node.choices?.some((c) => c.id === 'evidence'),
  );
}

export interface R10DuelPatch {
  defs: DialogueDef[];
  /** The strings of every node and choice added (register them before validating the defs). */
  strings: Record<string, string>;
  /** The rounds that were given a duel choice. */
  rounds: R10Round[];
}

/**
 * Returns `defs` with a duel choice on each R10 round found. Pure: the input defs are not changed; a def is copied
 * only when it is patched. Idempotent: a round that already offers the duel is left alone.
 */
export function withR10Duels(defs: readonly DialogueDef[]): R10DuelPatch {
  const strings: Record<string, string> = {};
  const rounds: R10Round[] = [];
  const out = defs.map((def) => {
    const ns = R10_ROUNDS.filter((r) => R10_TARGETS[r].dialogueId === def.id);
    let cur = def;
    for (const n of ns) {
      const node = findRoundChoiceNode(cur, n);
      if (!node || node.choices!.some((c) => c.id === R10_DUEL_CHOICE_ID)) continue;
      const speaker = R10_TARGETS[n].npcId;
      const choiceKey = `dialogue.${def.id}.${node.id}.${R10_DUEL_CHOICE_ID}`;
      const choice: DialogueChoice = {
        id: R10_DUEL_CHOICE_ID,
        textKey: choiceKey,
        when: { not: { flag: R10_DUEL_BUSY_FLAG, equals: true } },
        next: replyNode(n, 0),
        effects: [{ event: R10_DUEL_START_EVENT, payload: { n: String(n) } }],
      };
      const own: Record<string, string> = { [choiceKey]: DUEL_CHOICE };
      const reply = DUEL_REPLY[n];
      const added: DialogueNode[] = reply.map((t, i) => {
        const id = replyNode(n, i);
        const key = `dialogue.${def.id}.${id}`;
        own[key] = t;
        return { id, speaker, textKey: key, next: i < reply.length - 1 ? replyNode(n, i + 1) : null };
      });
      if (added.some((a) => cur.nodes.some((x) => x.id === a.id))) continue;
      Object.assign(strings, own);
      cur = {
        ...cur,
        nodes: [...cur.nodes.map((x) => (x.id === node.id ? { ...x, choices: [...x.choices!, choice] } : x)), ...added],
      };
      rounds.push(n);
    }
    return cur;
  });
  return { defs: out, strings, rounds };
}
