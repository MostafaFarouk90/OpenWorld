// Act 4 L7 (plan 2.8, plans/act4-L7.md section 5): at the Ashgate refuge from `story.m41.complete`, Captain Rook holds the
// Knight desk Gaut left. Until the Knight master's book is given he opens with Gaut's book (K11's idempotent
// `{ grantMasterBook: 'knight' }`); after it he offers the Knight training. As in Act 3, the book goes to whoever asks:
// it only opens the Knight's tiers 4 and 5. These rules go in front of Rook's tree but step aside (the Act 1 side-job
// guard) while any quest's talk objective for Rook is current, and while one of his own rules that changes the world
// (a hand-in, a flag, a reward) matches, so they never swallow a quest node.
import { changesWorld, guardRules } from '../../../quests/content/side/dialogues';
import type { Condition, DialogueDef, QuestDef } from '../../../quests/types';
import { buildTree, extendTree, type BuiltTree } from '../act2/build';

export const ROOK_REFUGE_FLAG = 'story.m41.complete';
const atRefuge: Condition = { flag: ROOK_REFUGE_FLAG, equals: true };
const noBook: Condition = { not: { flag: 'trainer.knight.masterBook', equals: true } };

const train = { id: 'train', t: 'Teach me.', go: null, fx: [{ event: 'classes.trainer.open', payload: { classId: 'knight' } }] };
const leave = { id: 'leave', t: 'Not now.', go: null };

export const ROOK_REFUGE: BuiltTree = buildTree({
  id: 'npc-rook',
  start: [
    { when: { all: [atRefuge, noBook] }, seg: 'a4-book' },
    { when: atRefuge, seg: 'a4-train' },
  ],
  segments: {
    'a4-book': {
      lines: [
        { s: 'rook', t: 'He gave me this on the stairs, before he went back up. Said I would know who to give it to.' },
        { s: 'rook', t: "Gaut's book. The forms past the third, in his own hand. The watch drills the first three; these are the ones he kept for knights.", fx: [{ grantMasterBook: 'knight' }] },
        { s: 'rook', t: 'I am no Gaut. But I stood beside him thirty years, and I know the drills. If you want them, I will teach them.', choices: [train, leave] },
      ],
    },
    'a4-train': {
      lines: [{ s: 'rook', t: 'The Knight drills, then. Gaut would have shouted more. I will shout less and hit harder.', choices: [train, leave] }],
    },
  },
});

/**
 * Puts Rook's refuge lines in front of his tree (any other tree is left alone), guarded so a current quest talk with Rook
 * or a base rule that changes the world always wins.
 */
export function withAct4Rook(defs: DialogueDef[], quests: readonly QuestDef[] = []): DialogueDef[] {
  return defs.map((d) => {
    if (d.id !== ROOK_REFUGE.def.id) return d;
    const merged = extendTree(d, ROOK_REFUGE).def;
    if (!Array.isArray(merged.start)) return merged;
    const ownCount = (ROOK_REFUGE.def.start as unknown[]).length;
    const mine = merged.start.slice(0, ownCount);
    const base = merged.start.slice(ownCount);
    const main = base.filter((r) => changesWorld(merged, r.node)).map((r) => r.when);
    const guarded = guardRules(d.id, mine, quests).map((r) => (main.length ? { ...r, when: { all: [{ not: { any: main } }, r.when] } as Condition } : r));
    return { ...merged, start: [...guarded, ...base] };
  });
}

export const ACT4_ROOK_STRINGS: Record<string, string> = ROOK_REFUGE.strings;
