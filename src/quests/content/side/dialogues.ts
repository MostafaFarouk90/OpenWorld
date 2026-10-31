// Dialogue for the Act 1 side jobs: the new NPCs' own trees, the readable notes, and the start rules and nodes the jobs add to
// existing givers (Hob, Edda, Aldwin, Tobb). `withSideJobs` puts the rules in front of a giver's own, each gated so it matches only
// while its job is on offer or running, and appends the nodes. A giver whose job is not on offer behaves exactly as before.
import type { Condition, DialogueDef, DialogueNode } from '../../types';
import { startingNote } from './boards';

const q = (id: string, state: 'inactive' | 'active' | 'completed'): Condition => ({ quest: id, state });
const done = (quest: string, objective: string): Condition => ({ objective: [quest, objective], done: true });
const notDone = (quest: string, objective: string): Condition => ({ objective: [quest, objective], done: false });

// ---- j03 notes (also the pattern for any job that starts at a stone) ----
export const J03_BLUFF = startingNote({
  id: 'note-j03-bluff', anchorId: 'j03.bluff', quest: 'j03', flag: 'story.j03.bluffRead',
  speakers: ['note', 'note', 'note'], look: 'grave',
});
export const J03_TABLET = startingNote({
  id: 'note-j03-tablet', anchorId: 'j03.barrow-tablet', quest: 'j03', flag: 'story.j03.tabletRead',
  speakers: ['note', 'note', 'cael'], look: 'grave',
});
export const SIDE_STARTING_NOTES = [J03_BLUFF, J03_TABLET];

// ---- new NPCs ----
const orlaP = 'dialogue.npc-orla.';
export const npcOrla: DialogueDef = {
  id: 'npc-orla',
  start: [
    { when: { all: [q('j02', 'active'), done('j02', 'basket'), notDone('j02', 'orla')] }, node: 'j02-visit' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    {
      id: 'j02-visit', speaker: 'orla', textKey: orlaP + 'j02-visit',
      choices: [
        { id: 'leave', textKey: orlaP + 'j02-visit.leave', effects: [{ setFlag: 'story.j02.loaf', value: 'left' }], next: 'j02-left' },
        { id: 'take', textKey: orlaP + 'j02-visit.take', effects: [{ setFlag: 'story.j02.loaf', value: 'kept' }], next: 'j02-kept' },
      ],
    },
    { id: 'j02-left', speaker: 'orla', textKey: orlaP + 'j02-left', next: null },
    { id: 'j02-kept', speaker: 'orla', textKey: orlaP + 'j02-kept', next: null },
    { id: 'idle', speaker: 'orla', textKey: orlaP + 'idle', next: null },
  ],
};

const osmundP = 'dialogue.npc-osmund.';
export const npcOsmund: DialogueDef = {
  id: 'npc-osmund',
  start: [
    { when: { all: [q('j02', 'active'), done('j02', 'aldwin'), notDone('j02', 'osmund')] }, node: 'j02-visit' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'j02-visit', speaker: 'osmund', textKey: osmundP + 'j02-visit', next: null },
    { id: 'idle', speaker: 'osmund', textKey: osmundP + 'idle', next: null },
  ],
};

export const SIDE_DIALOGUES: DialogueDef[] = [npcOrla, npcOsmund, ...SIDE_STARTING_NOTES.map((n) => n.dialogue)];

// ---- additions to existing givers ----
interface Addition { rules: { when: Condition; node: string }[]; nodes: DialogueNode[] }

const hob = 'dialogue.npc-hob.';
const edda = 'dialogue.npc-edda.';
const aldwin = 'dialogue.npc-aldwin.';
const tobb = 'dialogue.npc-tobb.';

const ADDITIONS: Record<string, Addition> = {
  // j01: offered once M02 is done; the report waits for the third lamb
  'npc-hob': {
    rules: [
      { when: { all: [q('j01', 'active'), done('j01', 'lambs'), notDone('j01', 'report')] }, node: 'j01-back' },
      { when: q('j01', 'active'), node: 'j01-remind' },
      { when: { all: [q('m02', 'completed'), q('j01', 'inactive')] }, node: 'j01-offer' },
    ],
    nodes: [
      {
        id: 'j01-offer', speaker: 'hob', textKey: hob + 'j01-offer',
        choices: [
          { id: 'where', textKey: hob + 'j01-offer.where', next: 'j01-where' },
          { id: 'why', textKey: hob + 'j01-offer.why', next: 'j01-why' },
          { id: 'accept', textKey: hob + 'j01-offer.accept', effects: [{ startQuest: 'j01' }], next: 'j01-yes' },
          { id: 'later', textKey: hob + 'j01-offer.later', next: 'j01-later' },
        ],
      },
      { id: 'j01-where', speaker: 'hob', textKey: hob + 'j01-where', next: 'j01-offer' },
      { id: 'j01-why', speaker: 'hob', textKey: hob + 'j01-why', next: 'j01-offer' },
      { id: 'j01-yes', speaker: 'hob', textKey: hob + 'j01-yes', next: null },
      { id: 'j01-later', speaker: 'hob', textKey: hob + 'j01-later', next: null },
      { id: 'j01-remind', speaker: 'hob', textKey: hob + 'j01-remind', next: null },
      { id: 'j01-back', speaker: 'hob', textKey: hob + 'j01-back', next: 'j01-back-2' },
      { id: 'j01-back-2', speaker: 'hob', textKey: hob + 'j01-back-2', next: null },
    ],
  },
  // j02: offered once M02 is done and Edda's farewell has been heard
  'npc-edda': {
    rules: [
      { when: { all: [q('j02', 'active'), done('j02', 'osmund'), notDone('j02', 'edda')] }, node: 'j02-back' },
      { when: q('j02', 'active'), node: 'j02-remind' },
      { when: { all: [q('m02', 'completed'), { flag: 'quest.m02.farewellSeen', equals: true }, q('j02', 'inactive')] }, node: 'j02-offer' },
    ],
    nodes: [
      {
        id: 'j02-offer', speaker: 'edda', textKey: edda + 'j02-offer',
        choices: [
          { id: 'accept', textKey: edda + 'j02-offer.accept', effects: [{ startQuest: 'j02' }], next: 'j02-yes' },
          { id: 'later', textKey: edda + 'j02-offer.later', next: 'j02-later' },
        ],
      },
      { id: 'j02-yes', speaker: 'edda', textKey: edda + 'j02-yes', next: null },
      { id: 'j02-later', speaker: 'edda', textKey: edda + 'j02-later', next: null },
      { id: 'j02-remind', speaker: 'edda', textKey: edda + 'j02-remind', next: null },
      { id: 'j02-back', speaker: 'edda', textKey: edda + 'j02-back', next: 'j02-left' },
      // exactly one remark shows; the other is skipped by its `when` and falls through to the end
      { id: 'j02-left', speaker: 'edda', textKey: edda + 'j02-left', when: { flag: 'story.j02.loaf', equals: 'left' }, next: 'j02-kept' },
      { id: 'j02-kept', speaker: 'edda', textKey: edda + 'j02-kept', when: { flag: 'story.j02.loaf', equals: 'kept' }, next: null },
    ],
  },
  'npc-aldwin': {
    rules: [{ when: { all: [q('j02', 'active'), done('j02', 'orla'), notDone('j02', 'aldwin')] }, node: 'j02-visit' }],
    nodes: [{ id: 'j02-visit', speaker: 'aldwin', textKey: aldwin + 'j02-visit', next: null }],
  },
  // j04: after the bond scene at the Quenchstone; Tobb walks with Cael, so the fire ring can be anywhere he follows
  'npc-tobb': {
    rules: [
      { when: { all: [q('j04', 'active'), done('j04', 'fire'), notDone('j04', 'verse')] }, node: 'j04-verse' },
      { when: q('j04', 'active'), node: 'j04-remind' },
      { when: { all: [q('m05', 'completed'), { flag: 'story.m05.tobbBond', equals: true }, q('j04', 'inactive')] }, node: 'j04-offer' },
    ],
    nodes: [
      { id: 'j04-offer', speaker: 'tobb', textKey: tobb + 'j04-offer', next: 'j04-offer-2' },
      {
        id: 'j04-offer-2', speaker: 'tobb', textKey: tobb + 'j04-offer-2',
        choices: [
          { id: 'accept', textKey: tobb + 'j04-offer-2.accept', effects: [{ startQuest: 'j04' }], next: 'j04-yes' },
          { id: 'later', textKey: tobb + 'j04-offer-2.later', next: 'j04-later' },
        ],
      },
      { id: 'j04-yes', speaker: 'tobb', textKey: tobb + 'j04-yes', next: null },
      { id: 'j04-later', speaker: 'tobb', textKey: tobb + 'j04-later', next: null },
      { id: 'j04-remind', speaker: 'tobb', textKey: tobb + 'j04-remind', next: null },
      {
        id: 'j04-verse', speaker: 'tobb', textKey: tobb + 'j04-verse',
        choices: [
          { id: 'ash', textKey: tobb + 'j04-verse.ash', effects: [{ setFlag: 'story.j04.verse', value: 'ash' }], next: 'j04-ash' },
          { id: 'grain', textKey: tobb + 'j04-verse.grain', effects: [{ setFlag: 'story.j04.verse', value: 'grain' }], next: 'j04-grain' },
          { id: 'bread', textKey: tobb + 'j04-verse.bread', effects: [{ setFlag: 'story.j04.verse', value: 'bread' }], next: 'j04-bread' },
        ],
      },
      { id: 'j04-ash', speaker: 'tobb', textKey: tobb + 'j04-ash', next: 'j04-sung' },
      { id: 'j04-grain', speaker: 'tobb', textKey: tobb + 'j04-grain', next: 'j04-sung' },
      { id: 'j04-bread', speaker: 'tobb', textKey: tobb + 'j04-bread', next: 'j04-sung' },
      { id: 'j04-sung', speaker: 'tobb', textKey: tobb + 'j04-sung', next: null },
    ],
  },
};

/** Adds the side jobs' start rules (in front) and nodes (behind) to the givers' own dialogues. */
export function withSideJobs(defs: DialogueDef[]): DialogueDef[] {
  return defs.map((d) => {
    const add = ADDITIONS[d.id];
    if (!add) return d;
    const start = Array.isArray(d.start) ? [...add.rules, ...d.start] : d.start;
    return { ...d, start, nodes: [...d.nodes, ...add.nodes] };
  });
}
