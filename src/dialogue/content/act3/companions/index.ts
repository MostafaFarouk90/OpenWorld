// K5 (plans/act3-K5.md sections 3 and 7): Hrolf's master-book talk and the companions' scene lines for M27, M32 and M34.
// Hrolf gives the Warden's master book to whoever asks (coordinator ruling 2026-10-30, as for the Harrowmark trainers;
// the brief's "for Wardens" is superseded): from `story.gate.a3`, until the book is given, his talk opens with it, then
// falls through to his usual idle lines. The scene trees carry no effects: K12 and K13 start them and own every flag.
import type { Condition, DialogueDef } from '../../../../quests/types';
import { buildTree, extendTree, type BuiltTree, type Line } from '../../act2/build';

export const HROLF_DIALOGUE_ID = 'npc-hrolf';
export const SCENE_M27_DESERTER = 'scene-m27-deserter';
export const SCENE_M32_COMPANIONS = 'scene-m32-companions';
export const SCENE_M34_COMPANIONS = 'scene-m34-companions';

const H = (t: string, fx?: Line['fx']): Line => ({ s: 'hrolf', t, ...(fx ? { fx } : {}) });
const T = (t: string): Line => ({ s: 'tobb', t });
const A = (t: string): Line => ({ s: 'aelfreda', t });
const W = (t: string): Line => ({ s: 'deserter', t });
const C = (t: string): Line => ({ s: 'cael', t });

export const hrolfBookOpen: Condition = {
  all: [{ flag: 'story.gate.a3', equals: true }, { not: { flag: 'trainer.warden.masterBook', equals: true } }],
};

const HROLF_BOOK = buildTree({
  id: HROLF_DIALOGUE_ID,
  start: [{ when: hrolfBookOpen, seg: 'a3-book' }],
  segments: {
    'a3-book': {
      lines: [
        H('Before we climb further, little knight. My old master in Stonefold gave me something to carry, and it is time I put it down.'),
        H('The Warden\'s book. The high forms, the fourth and the fifth, the ones you learn when the line you hold is a mountain. It is yours now.', [
          { grantMasterBook: 'warden' },
        ]),
        C('It is heavier than it looks.'),
        H('So is every promise. Read it by the fire, and practise it where I can watch. I will bring the bread.'),
      ],
      // Into his usual talk (Act 2's idle segment).
      then: 'idle',
    },
  },
});

/** M27's "ranger ally" branch (K12 starts it when `story.r14.choice` is `released`): six lines. */
const M27 = buildTree({
  id: SCENE_M27_DESERTER,
  start: [{ when: { all: [] }, seg: 'scene' }],
  segments: {
    scene: {
      lines: [
        W('Knight. I heard Vey\'s men were in the reeds. I owed you one, so here I am.'),
        C('You were free to go anywhere, Wybert.'),
        W('I went as far as my conscience would let me. That was about two miles.'),
        C('Then hold the line by the blinds. Keep them off the nets, and do not chase.'),
        W('I will stand. I am better at standing than running, it turns out.'),
        C('Then stand with us.'),
      ],
    },
  },
});

/** M32, after Ysmeryth's account (K13 places all three companions): twelve lines. */
const M32 = buildTree({
  id: SCENE_M32_COMPANIONS,
  start: [{ when: { all: [] }, seg: 'scene' }],
  segments: {
    scene: {
      lines: [
        T('Keepers of the Forge. Not beasts. Keepers. I have three verses to burn.'),
        A('The convent had a book that said so. The prior burned it. I watched him do it.'),
        H('My brother said the wyrms were lonely, not cruel. I laughed at him. I owe him that laugh back.'),
        C('Everything Harrowmark taught us about them was wrong.'),
        A('Not everything. They are dangerous. So is fire. We still cook with it.'),
        T('And the Heartshard? A piece of her duty, she said. So the knight is half a keeper now.'),
        C('A piece I never asked to carry.'),
        H('Nobody asks. My father never asked to be born a Warden. He held the line anyway.'),
        A('Then we help you carry it. That is what a party is for, besides the cooking.'),
        T('I am writing that down. No, I am writing it better. "Besides the cooking" stays.'),
        H('Next time we meet a dragon, I bring cheese as a gift, not a bribe. There is a difference.'),
        C('Then let us find out what a keeper asks of us.'),
      ],
    },
  },
});

/** M34, the oath and the first glide (K13 places all three companions): ten lines. */
const M34 = buildTree({
  id: SCENE_M34_COMPANIONS,
  start: [{ when: { all: [] }, seg: 'scene' }],
  segments: {
    scene: {
      lines: [
        H('The Hearth burns again. In Stonefold we would feast for a week. Here I will settle for a long supper.'),
        A('Her cool breath is on the air. Hathren\'s gift. The Burn will sit lighter on you now, {name}.'),
        T('The dragons have sworn. To us! I need a much bigger lute.'),
        C('They swore to the Forge, not to me.'),
        A('They swore to the one who carries its shard. That is you, whether you like it or not.'),
        H('And the ledges are open. You will jump off a mountain on purpose. I will stay here and pray.'),
        T('I will narrate. From the ground. Bravely.'),
        A('Keep your arms out and your knees soft. Land like a cat, not like a sack of flour.'),
        H('If you fall, fall on something soft. Snow. Or Tobb.'),
        C('Then I will see you all at the bottom.'),
      ],
    },
  },
});

export const ACT3_COMPANION_SCENES: readonly BuiltTree[] = [M27, M32, M34];
export const ACT3_COMPANION_DIALOGUES: DialogueDef[] = ACT3_COMPANION_SCENES.map((t) => t.def);

/** Swaps Hrolf's tree for its Act 3 extended version and appends the scene trees. */
export function withAct3Companions(defs: DialogueDef[]): DialogueDef[] {
  const out = defs.map((d) => (d.id === HROLF_DIALOGUE_ID ? extendTree(d, HROLF_BOOK).def : d));
  return [...out, ...ACT3_COMPANION_DIALOGUES];
}

export const ACT3_COMPANION_STRINGS: Record<string, string> = Object.assign(
  {},
  HROLF_BOOK.strings,
  ...ACT3_COMPANION_SCENES.map((t) => t.strings),
);
