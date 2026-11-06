// The Cinder Chapel and the cathedral door (L11): Little Ebba (M44 and R25), Sister Aedre (M44) and Leofric, dying at the
// Cathedral of Husks (D08). Each tree is `npc-<id>`; quest segments first, an idle line last.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { flagIs, qDone } from '../../act2/cond';
import { CHAPEL_KEEPER, EBBA } from '../../../../quests/content/act4/waste/m44.quest';
import { R25_NO_CANDLE, R25_SPARE_ASKED } from '../../../../quests/content/act4/waste/r25.quest';
import { D08_DYING } from '../../../../quests/content/act4/waste/d08.quest';
import { C, all, at, offer, qActive, voice } from './common';

type Rule = Parameters<typeof buildTree>[0]['start'][number];
const tree = (id: string, start: Rule[], segments: Record<string, { lines: Line[]; then?: string | null }>, idle: Line[]): BuiltTree =>
  buildTree({ id: `npc-${id}`, start: [...start, { when: all(), seg: 'idle' }], segments: { ...segments, idle: { lines: idle } } });

// ---- Little Ebba ----------------------------------------------------------------------------------------------------------
const EB = voice(EBBA);
export const EBBA_TREE = tree(EBBA, [
  { when: at('m44', 'report'), seg: 'm44-report' },
  { when: offer('m44'), seg: 'm44-brief' },
  { when: qActive('m44'), seg: 'm44-wait' },
  { when: at('r25', 'report'), seg: 'r25-report' },
  { when: offer('r25'), seg: 'r25-brief' },
  { when: all(qActive('r25'), flagIs(R25_NO_CANDLE)), seg: 'r25-candle' },
  { when: qActive('r25'), seg: 'r25-wait' },
  { when: qDone('r25'), seg: 'after' },
], {
  'm44-brief': {
    lines: [
      EB('Are you a knight? A real one? Sister says knights are made up, like dragons.'),
      C('Dragons are real too. I have met two.'),
      EB('Then can you find something for me? Mama had a box that played a song. I know how it starts but I forget the end.'),
      EB('Our house is in the village. The third one, with the blue door. Sister will not let me go there. She says there are things in the houses now.'),
      {
        s: EBBA, t: 'Will you find it?',
        choices: [
          { id: 'accept', t: 'I will find it, and I will bring it back.', go: null, fx: [{ startQuest: 'm44' }] },
          { id: 'later', t: 'Not today, Ebba.', go: null },
        ],
      },
    ],
  },
  'm44-wait': { lines: [EB('The blue door. Sister Aedre knows which houses are which. She knows everybody, even the ones who went away.')] },
  'm44-report': {
    lines: [
      EB('You found it! Wind it, wind it.'),
      EB('That is it. That is the end. I knew it went down at the end, like going to sleep.'),
      C('It is yours. Keep it safe.'),
      EB('No. You keep it. You go to the places Mama went. She would like the song to go too.'),
      EB('Sister says I must sleep now. Will you hum it when you sleep? Then we will both be humming.'),
    ],
  },
  'r25-brief': {
    lines: [
      EB('Sister says three families in the village never came back to the chapel. Nobody lit their hearths.'),
      EB('You light a candle on the hearth, so they can find the way home. I made these. They are a bit crooked.'),
      EB('I cannot go out there. Would you take them?'),
      {
        s: EBBA, t: 'One for each house.',
        choices: [
          { id: 'accept', t: 'Three candles, three hearths. I will light them all.', go: null, fx: [{ startQuest: 'r25' }] },
          { id: 'later', t: 'Keep them for now.', go: null },
        ],
      },
    ],
  },
  'r25-candle': {
    lines: [
      EB('You lost one? That is all right. The wind takes candles. I made spares. Here.', [{ event: R25_SPARE_ASKED }]),
    ],
  },
  'r25-wait': { lines: [EB('Read the names first, Sister says, so the candle knows who it is for.')] },
  'r25-report': {
    lines: [
      EB('Did they all light? Even the far one?'),
      C('All three. And I read their names in the register.'),
      EB('Then they can come home. I will keep the last one here, for Mama, if that is all right.'),
      EB('You can have a crooked one to keep. For when you are somewhere dark.'),
    ],
  },
  after: { lines: [EB('Hum it with me? Only the end. I always forget the end.')] },
}, [EB('Sister says I am not to go past the door. I am not past the door. I am on it.')]);

// ---- Sister Aedre ---------------------------------------------------------------------------------------------------------
const AD = voice(CHAPEL_KEEPER);
export const AEDRE = tree(CHAPEL_KEEPER, [{ when: at('m44', 'keeper'), seg: 'm44-keeper' }], {
  'm44-keeper': {
    lines: [
      AD('Ebba sent you. Of course she did. She has asked every walker who comes through that door.'),
      AD('Her mother was Godgifu, the weaver. The third house, the blue door. Her father went first, to the storm; Godgifu went looking for him.'),
      AD('The first house was the Wrights\'. The second has a nest in it now; we hear them at night through the wall.'),
      C('Then I will clear it.'),
      AD('Burn what you must, but bring the child something better than smoke. And read what they left. Somebody ought to.'),
    ],
  },
}, [AD('The chapel keeps the names. The Waste keeps everything else.')]);

// ---- Leofric --------------------------------------------------------------------------------------------------------------
const LE = voice(D08_DYING);
export const LEOFRIC = tree(D08_DYING, [{ when: at('d08', 'dying'), seg: 'd08-dying' }], {
  'd08-dying': {
    lines: [
      LE('Walker? No. Knight. Wulfhild sent a knight. She always did have a sense of humour.'),
      LE('I rang the gong. Once. It woke him. The archbishop, Eormen. He sits on the old throne in the nave, with the crown on, and the dead stand up round him.'),
      C('Lie still. I will get you back to the camp.'),
      LE('No. The husks hit hard, and I am all out of blood. Listen.'),
      LE('He was a good man. You can still see it. Lay him down if you can. If you cannot, break him, and do not be sorry.'),
      LE('Tell Hild I am sorry about the rope.'),
    ],
  },
}, [LE('The gong. Do not ring it twice.')]);

export const CHAPEL_TREES: readonly BuiltTree[] = [EBBA_TREE, AEDRE, LEOFRIC];
