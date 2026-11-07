// The Cinder Road North (L11): Hrolf's M46 brief and report (an extension of the shipped `npc-hrolf`, node ids `a4w-`; its rules
// go first, so they only speak while M46 is live) and the three cairn-keepers.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { M46_KEEPER } from '../../../../quests/content/act4/waste/m46.quest';
import { C, all, at, offer, qActive, voice } from './common';

const H = voice('hrolf');

export const HROLF_A4W = buildTree({
  id: 'npc-hrolf',
  start: [
    { when: at('m46', 'report'), seg: 'a4w-m46-report' },
    { when: offer('m46'), seg: 'a4w-m46-brief' },
    { when: qActive('m46'), seg: 'a4w-m46-wait' },
  ],
  segments: {
    'a4w-m46-brief': {
      lines: [
        H('Little knight. The walkers have a road they do not talk about. The Cinder Road, north, up to the rim.'),
        H('Three cairns on it, and a keeper at each. The keepers light them for those who walk up, and the dead come down the road to put them out.'),
        H('I am coming with you. Do not argue; I have been sitting in this camp eating ash for a week and my axe is bored.'),
        C('The column will be on the road. Wulfhild says it never stops.'),
        H('Then we hold each cairn while the keeper lights it. Stonefold held a pass with fewer.'),
        {
          s: 'hrolf', t: 'Up to the rim?',
          choices: [
            { id: 'accept', t: 'Up to the rim. Together.', go: null, fx: [{ startQuest: 'm46' }] },
            { id: 'later', t: 'Not yet, Hrolf.', go: null },
          ],
        },
      ],
    },
    'a4w-m46-wait': { lines: [H('Keep to the road and keep your back to a cairn when the dead come. I will take the left. I always take the left.')] },
    'a4w-m46-report': {
      lines: [
        H('Rimfoot. Wulfhild\'s fire, and a walker cooking something I will not ask about.'),
        H('Three cairns lit behind us. When the walkers come up this road tomorrow, they will see the way.'),
        C('And tomorrow we go up there.'),
        H('Tomorrow. Tonight I am sitting down, and nothing in the Waste is going to stand me up again until morning.'),
      ],
    },
  },
});

type Rule = Parameters<typeof buildTree>[0]['start'][number];
const tree = (id: string, start: Rule[], segments: Record<string, { lines: Line[] }>, idle: Line[]): BuiltTree =>
  buildTree({ id: `npc-${id}`, start: [...start, { when: all(), seg: 'idle' }], segments: { ...segments, idle: { lines: idle } } });

const K1 = voice(M46_KEEPER(1));
const K2 = voice(M46_KEEPER(2));
const K3 = voice(M46_KEEPER(3));

export const KEEPER_TREES: readonly BuiltTree[] = [
  tree(M46_KEEPER(1), [{ when: at('m46', 'keeper1'), seg: 'm46-keeper1' }], {
    'm46-keeper1': {
      lines: [
        K1('Eadwig, keeper of the first cairn. My father kept it, and his. I can hear the column already.'),
        K1('Hold the road while the dead come. When they break, find my mark on the stones and light the cairn. The fire will hold them a day.'),
        C('And then?'),
        K1('Then the next keeper. Then the next. Then the rim. Go.'),
      ],
    },
  }, [K1('A lit cairn is a promise. Somebody walked here and did not lose the road.')]),
  tree(M46_KEEPER(2), [{ when: at('m46', 'keeper2'), seg: 'm46-keeper2' }], {
    'm46-keeper2': {
      lines: [
        K2('Saewynn. Second cairn. Eadwig\'s fire is up behind you; I saw it and did not believe it.'),
        K2('This one is worse. The column breaks on it every winter. Stand where the stones are high and let them come to you.'),
        C('And your mark?'),
        K2('Under the lintel, where the wind cannot reach it. My mother cut it. Light the cairn when you have read it.'),
      ],
    },
  }, [K2('The road remembers who walked it. So do I.')]),
  tree(M46_KEEPER(3), [{ when: at('m46', 'keeper3'), seg: 'm46-keeper3' }], {
    'm46-keeper3': {
      lines: [
        K3('Cuthwine. The last cairn. Beyond me is Rimfoot and beyond that the fire itself.'),
        K3('You killed their outriders. The column will be angry. Let it be.'),
        K3('This cairn is lit from the rim, not from here. Hold the road; the rim will do the rest. And read the old stones. They are older than the walkers.'),
      ],
    },
  }, [K3('From here you can feel the rim on your face. It never gets cooler.')]),
];
