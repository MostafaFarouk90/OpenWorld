import { buildTree } from '../../act2/build';
import { all, flagIs, not } from '../../act2/cond';
import { C, voice } from './common';
import { M28_CLIMB_SCENE } from '../../../../quests/content/act3/dragonspine/m28.quest';
import { R15_CHOICE, R15_SCENE } from '../../../../quests/content/act3/dragonspine/r15.quest';
import { M29_CONFESSION_SCENE } from '../../../../quests/content/act3/dragonspine/m29.quest';
import { R16_CAVE_SCENE } from '../../../../quests/content/act3/dragonspine/r16.quest';

/** The set pieces as one-way scene trees: the director starts each, the talk objective is credited at its end. */
const scene = (id: string, lines: ReturnType<ReturnType<typeof voice>>[], extra: Record<string, { lines: ReturnType<ReturnType<typeof voice>>[] }> = {}) =>
  buildTree({ id, start: [{ when: all(), seg: 'scene' }], segments: { scene: { lines }, ...extra } });

const E = voice('eadgyth');
const S1 = voice('sled-hand-1');
const S2 = voice('sled-hand-2');

export const SCENE_M28_CLIMB = scene(M28_CLIMB_SCENE, [
  C('The second ledge is wider than the first. Wind spills off the rim and the lodge shrinks to a toy below.'),
  C('Above, the crag stands up out of the snow like a broken tooth. The hawks circle its crown.'),
  C('A horn sounds from somewhere high, one long note. It is not a hunter\'s horn.'),
  C('Another answers it from the summit. Then the glow above the clouds flickers, once.'),
  C('Whatever lives up there knows I am on the slope.'),
  C('No sense waiting for it to come down. The crag first.'),
]);

export const SCENE_R15_CACHE = buildTree({
  id: R15_SCENE,
  start: [{ when: all(), seg: 'scene' }],
  segments: {
    scene: {
      lines: [
        S1('That is the last of it. The cache is full, and there is a surplus above what the heights asked for.'),
        S2('Thorgar said you decide where it goes. The lodge or Eadgyth\'s hut.'),
        S1('The lodge is hungry, and Thorgar sells cold gear cheaper to anyone who has hauled.'),
        S2('The hut has a poor hearth. The old woman is too proud to ask, and the knife she keeps in the corner could be made keen.'),
        {
          s: 'sled-hand-1', t: 'Well, {name}? The lodge or the hut?',
          choices: [
            { id: 'lodge', t: 'The lodge.', go: 'lodge', when: not(flagIs(R15_CHOICE, 'hut')), fx: [{ setFlag: R15_CHOICE, value: 'lodge' }] },
            { id: 'hut', t: 'Eadgyth\'s hut.', go: 'hut', when: not(flagIs(R15_CHOICE, 'lodge')), fx: [{ setFlag: R15_CHOICE, value: 'hut' }] },
          ],
        },
      ],
    },
    lodge: { lines: [S1('The lodge, then. Thorgar will be glad of it.')] },
    hut: { lines: [S2('The hut, then. She will pretend she did not want it.')] },
  },
});

export const SCENE_M29_CONFESSION = scene(M29_CONFESSION_SCENE, [
  E('Forty winters ago the lodge hunted a red dragon off the high roost. I led it. I carried the axe you will hear me ask for.'),
  E('We cornered her in a cave on the western spur. I struck once, and she did not fight back.'),
  C('She did not fight.'),
  E('She was nesting. There were eggs under her. I saw them when the torch swung.'),
  E('I struck again, because the hunters behind me were shouting, and because a hunter\'s second blow is the one that finishes the work.'),
  C('You killed her.'),
  E('I killed a mother in front of her clutch. The eggs hatched in the cold. I have not forgotten the sound.'),
  E('The cave came down on us when she died. I left the axe in the dark. The others carried me out.'),
  C('And you came here.'),
  E('I came here, and I stopped. That is all there is. Now you know what the lodge\'s best hunter did.'),
]);

export const SCENE_R16_CAVE = scene(R16_CAVE_SCENE, [
  C('The chamber is bigger than the passage. The air is still, and very old.'),
  C('There is the dig. Under the stones, the haft of an axe, black ash and silver.'),
  C('She said she left it in the dark. She did. It has been waiting.'),
  C('I will carry it out. What becomes of it after is hers to say.'),
]);

export const SCENE_TREES = [SCENE_M28_CLIMB, SCENE_R15_CACHE, SCENE_M29_CONFESSION, SCENE_R16_CAVE];

/** Names the dialogue speakers fall back to (the NPC defs' names are K4's). */
export const SPEAKER_NAMES: Record<string, string> = {};
