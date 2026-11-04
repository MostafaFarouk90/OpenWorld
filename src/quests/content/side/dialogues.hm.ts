// Dialogue for the Harrowmark side jobs (j05 to j10) and the Underways job (j11): Rook's board notices, the new NPCs' trees
// (Rook's sergeant, Godric's dog, the chandler, the Forge Row smith, who had no tree before) and the rules and nodes the jobs add
// to existing givers (Godric, the sexton, Aldith, Stane, Tobb, Rook). Merged into the Brightwater pieces by `withSideJobs`
// (src/quests/content/side/dialogues.ts).
import type { Condition, DialogueDef, DialogueNode, Effect } from '../../types';
import { boardNotice, startingNote } from './boards';

const q = (id: string, state: 'inactive' | 'active' | 'completed'): Condition => ({ quest: id, state });
const done = (quest: string, objective: string): Condition => ({ objective: [quest, objective], done: true });
const notDone = (quest: string, objective: string): Condition => ({ objective: [quest, objective], done: false });

/** The three notices on Rook's board are readable while their job is on offer (its start condition and not yet started) or running. */
export const J05_OFFER: Condition = { all: [q('m06', 'completed'), q('j05', 'inactive')] };
export const J06_OFFER: Condition = { all: [q('m06', 'completed'), q('j06', 'inactive')] };
export const J07_OFFER: Condition = { all: [q('m07', 'completed'), q('j07', 'inactive')] };

export const J05_NOTICE = boardNotice({ id: 'note-j05-notice', anchorId: 'j05.notice', quest: 'j05', flag: 'story.j05.noticeRead', offerWhen: J05_OFFER, lines: 2 });
export const J06_NOTICE = boardNotice({ id: 'note-j06-notice', anchorId: 'j06.notice', quest: 'j06', flag: 'story.j06.noticeRead', offerWhen: J06_OFFER, lines: 2 });
export const J07_NOTICE = boardNotice({ id: 'note-j07-notice', anchorId: 'j07.notice', quest: 'j07', flag: 'story.j07.noticeRead', offerWhen: J07_OFFER, lines: 2 });

/** j11's waybill: nailed to the last post of the cart tracks; read after the hounds. It says where the carts went, not what they carried. */
export const J11_WAYBILL = startingNote({
  id: 'note-j11-waybill', anchorId: 'j11.waybill', quest: 'j11', flag: 'story.j11.waybillRead',
  speakers: ['note', 'note', 'cael'], look: 'page',
});

export const HM_STARTING_NOTES = [J05_NOTICE, J06_NOTICE, J07_NOTICE, J11_WAYBILL];

// ---------------------------------------------------------------- new NPCs
const say = (P: string, speaker: string) => (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker, textKey: P + id, next, ...extra });

const SG = 'dialogue.npc-sergeant.';
const sg = say(SG, 'sergeant');
export const npcSergeant: DialogueDef = {
  id: 'npc-sergeant',
  start: [
    { when: { all: [q('j08', 'active'), done('j08', 'cutpurses'), notDone('j08', 'report')] }, node: 'j08-back' },
    { when: q('j08', 'active'), node: 'j08-remind' },
    { when: { all: [q('m06', 'completed'), q('j08', 'inactive')] }, node: 'j08-offer' },
    { when: q('j08', 'completed'), node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    {
      id: 'j08-offer', speaker: 'sergeant', textKey: SG + 'j08-offer',
      choices: [
        { id: 'accept', textKey: SG + 'j08-offer.accept', effects: [{ startQuest: 'j08' }, { completeObjective: ['j08', 'orders'] }], next: 'j08-yes' },
        { id: 'later', textKey: SG + 'j08-offer.later', next: 'j08-later' },
      ],
    },
    sg('j08-yes'),
    sg('j08-later'),
    sg('j08-remind'),
    sg('j08-back'),
    sg('after'),
    sg('idle'),
  ],
};

const CR = 'dialogue.npc-crumb.';
export const npcCrumb: DialogueDef = {
  id: 'npc-crumb',
  start: [
    { when: { all: [q('j05', 'active'), done('j05', 'search3'), notDone('j05', 'find')] }, node: 'found' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    say(CR, 'crumb')('found', 'found-2'),
    say(CR, 'cael')('found-2'),
    say(CR, 'crumb')('idle'),
  ],
};

const CH = 'dialogue.npc-chandler.';
const ch = say(CH, 'chandler');
export const npcChandler: DialogueDef = {
  id: 'npc-chandler',
  start: [
    { when: { all: [q('j07', 'active'), done('j07', 'notice'), notDone('j07', 'candles')] }, node: 'j07-sell' },
    { when: q('j07', 'active'), node: 'j07-after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [ch('j07-sell', 'j07-sell-2'), ch('j07-sell-2'), ch('j07-after'), ch('idle')],
};

const DU = 'dialogue.npc-dunstan.';
const du = say(DU, 'dunstan');
export const npcDunstan: DialogueDef = {
  id: 'npc-dunstan',
  start: [
    { when: { all: [q('j06', 'active'), done('j06', 'crate'), notDone('j06', 'report')] }, node: 'j06-back' },
    { when: { all: [q('j06', 'active'), done('j06', 'smith')] }, node: 'j06-remind' },
    { when: { all: [q('j06', 'active'), done('j06', 'notice')] }, node: 'j06-brief' },
    { when: { all: [q('j08', 'active'), done('j08', 'lane2'), notDone('j08', 'bark1')] }, node: 'j08-bark' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    du('j06-brief', 'j06-brief-2'), du('j06-brief-2'), du('j06-remind'),
    du('j06-back', 'j06-back-2'), du('j06-back-2'),
    du('j08-bark', null, { effects: [{ setFlag: 'story.j08.bark1', value: true }, { completeObjective: ['j08', 'bark1'] }] }),
    du('idle'),
  ],
};

/** The new NPCs' trees (the notes' dialogues come with SIDE_STARTING_NOTES). */
export const HM_DIALOGUES: DialogueDef[] = [npcSergeant, npcCrumb, npcChandler, npcDunstan];

// ---------------------------------------------------------------- additions to existing givers
export interface Addition { rules: { when: Condition; node: string }[]; nodes: DialogueNode[] }

const GO = 'dialogue.npc-stallholder-1.';
const go = say(GO, 'stallholder-1');
const SX = 'dialogue.npc-sexton.';
const sx = say(SX, 'sexton');
const AL = 'dialogue.npc-aldith.';
const ST = 'dialogue.npc-stane.';
const stn = say(ST, 'stane');
const RK = 'dialogue.npc-rook.';
const rk = say(RK, 'rook');
const TB = 'dialogue.npc-tobb.';
const tb = say(TB, 'tobb');

const classOpen: Condition = { flag: 'story.m07.classOpen', equals: true };
const callBout = (n: 1 | 2 | 3): Effect => ({ setFlag: `story.j09.b${n}`, value: true });
const trainChoice = { id: 'train', textKey: ST + 'trainer-open-2.train', when: classOpen, next: 'trainer-open-2' };

/** Stane's job nodes sit above the class trainer in his start list, so each keeps the trainer one choice away. */
const withTrain = (n: DialogueNode): DialogueNode => ({
  ...n, next: undefined, choices: [{ id: 'ok', textKey: ST + 'j09-ok', next: null }, trainChoice],
});

export const HM_ADDITIONS: Record<string, Addition> = {
  // j05: Godric's brief and his thanks; the notice (above) is the offer
  'npc-stallholder-1': {
    rules: [
      { when: { all: [q('j05', 'active'), done('j05', 'find'), notDone('j05', 'report')] }, node: 'j05-back' },
      { when: { all: [q('j05', 'active'), done('j05', 'owner')] }, node: 'j05-remind' },
      { when: { all: [q('j05', 'active'), done('j05', 'notice')] }, node: 'j05-brief' },
    ],
    nodes: [
      go('j05-brief', 'j05-brief-2'), go('j05-brief-2'), go('j05-remind'),
      go('j05-back', 'j05-back-2'), go('j05-back-2'),
    ],
  },
  'npc-sexton': {
    rules: [
      { when: { all: [q('j07', 'active'), done('j07', 'niche3'), notDone('j07', 'report')] }, node: 'j07-back' },
      { when: q('j07', 'active'), node: 'j07-remind' },
    ],
    nodes: [
      sx('j07-remind'),
      sx('j07-back', 'j07-back-2'), sx('j07-back-2'),
    ],
  },
  'npc-aldith': {
    rules: [{ when: { all: [q('j08', 'active'), done('j08', 'lane3'), notDone('j08', 'bark2')] }, node: 'j08-bark' }],
    nodes: [{ id: 'j08-bark', speaker: 'aldith', textKey: AL + 'j08-bark', next: null, effects: [{ completeObjective: ['j08', 'bark2'] }] }],
  },
  // j09: offered by Stane in the Bastion yard once R02 is done; the trainer stays reachable from the offer
  'npc-stane': {
    rules: [
      { when: { all: [q('j09', 'active'), done('j09', 'bout3'), notDone('j09', 'close')] }, node: 'j09-close' },
      { when: { all: [q('j09', 'active'), done('j09', 'bout2'), notDone('j09', 'word2')] }, node: 'j09-word2' },
      { when: { all: [q('j09', 'active'), done('j09', 'bout1'), notDone('j09', 'word1')] }, node: 'j09-word1' },
      { when: q('j09', 'active'), node: 'j09-remind' },
      { when: { all: [q('r02', 'completed'), { not: q('m06', 'inactive') }, q('j09', 'inactive')] }, node: 'j09-offer' },
      { when: { all: [q('j09', 'completed'), { not: { flag: 'story.j09.repeat', equals: true } }] }, node: 'j09-again' },
    ],
    nodes: [
      {
        id: 'j09-offer', speaker: 'stane', textKey: ST + 'j09-offer',
        choices: [
          { id: 'accept', textKey: ST + 'j09-offer.accept', effects: [{ startQuest: 'j09' }, callBout(1)], next: 'j09-yes' },
          { id: 'later', textKey: ST + 'j09-offer.later', next: 'j09-later' },
          trainChoice,
        ],
      },
      stn('j09-yes'), stn('j09-later'),
      withTrain(stn('j09-remind', null, { effects: [{ if: { all: [q('j09', 'active'), notDone('j09', 'bout1')] }, then: [callBout(1)] }] })),
      withTrain(stn('j09-word1', null, { effects: [callBout(2)] })),
      withTrain(stn('j09-word2', null, { effects: [callBout(3)] })),
      withTrain(stn('j09-close')),
      {
        id: 'j09-again', speaker: 'stane', textKey: ST + 'j09-again',
        choices: [
          { id: 'again', textKey: ST + 'j09-again.again', effects: [{ setFlag: 'story.j09.repeat', value: true }], next: 'j09-again-yes' },
          { id: 'later', textKey: ST + 'j09-again.later', next: 'j09-again-later' },
          trainChoice,
        ],
      },
      stn('j09-again-yes'), stn('j09-again-later'),
    ],
  },
  // j11: Rook asks once D02 is done (the Sewer Master Key is D02's reward)
  'npc-rook': {
    rules: [
      { when: { all: [q('j11', 'active'), done('j11', 'waybill'), notDone('j11', 'report')] }, node: 'j11-back' },
      { when: q('j11', 'active'), node: 'j11-remind' },
      { when: { all: [q('d02', 'completed'), q('j11', 'inactive')] }, node: 'j11-offer' },
    ],
    nodes: [
      rk('j11-offer', 'j11-offer-2'),
      {
        id: 'j11-offer-2', speaker: 'rook', textKey: RK + 'j11-offer-2',
        choices: [
          { id: 'accept', textKey: RK + 'j11-offer-2.accept', effects: [{ startQuest: 'j11' }, { completeObjective: ['j11', 'listen'] }], next: 'j11-yes' },
          { id: 'later', textKey: RK + 'j11-offer-2.later', next: 'j11-later' },
        ],
      },
      rk('j11-yes'), rk('j11-later'), rk('j11-remind'),
      rk('j11-back', 'j11-back-2'), rk('j11-back-2'),
    ],
  },
  // j10: Tobb's second verse, after M07 and j04 (without j04 there is no offer, and the quest refuses to start)
  'npc-tobb': {
    rules: [
      { when: { all: [q('j10', 'active'), done('j10', 'fire'), notDone('j10', 'verse')] }, node: 'j10-verse' },
      { when: q('j10', 'active'), node: 'j10-remind' },
      { when: { all: [q('m07', 'completed'), q('j04', 'completed'), q('j10', 'inactive')] }, node: 'j10-offer' },
    ],
    nodes: [
      {
        id: 'j10-offer', speaker: 'tobb', textKey: TB + 'j10-offer',
        choices: [
          { id: 'accept', textKey: TB + 'j10-offer.accept', effects: [{ startQuest: 'j10' }], next: 'j10-yes' },
          { id: 'later', textKey: TB + 'j10-offer.later', next: 'j10-later' },
        ],
      },
      tb('j10-yes'), tb('j10-later'), tb('j10-remind'),
      {
        id: 'j10-verse', speaker: 'tobb', textKey: TB + 'j10-verse',
        choices: [
          { id: 'forge', textKey: TB + 'j10-verse.forge', effects: [{ setFlag: 'story.j10.verse', value: 'forge' }], next: 'j10-forge' },
          { id: 'gate', textKey: TB + 'j10-verse.gate', effects: [{ setFlag: 'story.j10.verse', value: 'gate' }], next: 'j10-gate' },
          { id: 'window', textKey: TB + 'j10-verse.window', effects: [{ setFlag: 'story.j10.verse', value: 'window' }], next: 'j10-window' },
        ],
      },
      tb('j10-forge', 'j10-sing-a'), tb('j10-gate', 'j10-sing-a'), tb('j10-window', 'j10-sing-a'),
      // Tobb sings the two lines side by side: the knighting verse of j04 (it is set, j04 being done), then this one
      tb('j10-sing-a', 'j10-sing-b', { when: { flag: 'story.j04.verse', equals: 'ash' } }),
      tb('j10-sing-b', 'j10-sing-c', { when: { flag: 'story.j04.verse', equals: 'grain' } }),
      tb('j10-sing-c', 'j10-sing-d', { when: { flag: 'story.j04.verse', equals: 'bread' } }),
      tb('j10-sing-d', 'j10-sing-e', { when: { flag: 'story.j10.verse', equals: 'forge' } }),
      tb('j10-sing-e', 'j10-sing-f', { when: { flag: 'story.j10.verse', equals: 'gate' } }),
      tb('j10-sing-f', 'j10-sung', { when: { flag: 'story.j10.verse', equals: 'window' } }),
      tb('j10-sung'),
    ],
  },
};
