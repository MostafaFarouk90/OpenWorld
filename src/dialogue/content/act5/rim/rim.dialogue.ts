// The Rim's own cast (N10): Oswin's convoy master and guards (R26), the stokers' shades (M48, R29), the Cooling Hall's keeper
// (M50), the Warhost scout captain and the dragons Orsk and Hathren (M51, talked to from a spot before their perches), Ysmeryth's
// M51 extension, and two one-way talks opened by props (M49's war table, M51's horn-stone). Invented (Q6), logged.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { M48_GHOST } from '../../../../quests/content/act5/rim/m48.quest';
import { M49_FORECAST, M49_TABLE_DIALOGUE, M49_TABLE_NPC, type M49ForecastKey } from '../../../../quests/content/act5/rim/m49.quest';
import { R26_CHOICE, R26_FAST, R26_GUARD, R26_LONG, R26_MASTER } from '../../../../quests/content/act5/rim/r26.quest';
import { R29_GHOST } from '../../../../quests/content/act5/rim/r29.quest';
import { M50_KEEPER } from '../../../../quests/content/act5/rim/m50.quest';
import { F2_CHOICE, M51_CALL_DIALOGUE, M51_CALL_NPC, M51_CAPTAIN, R11_CHOICE, R16_CHOICE } from '../../../../quests/content/act5/rim/m51.quest';
import { C, accept, any, at, flagIs, offer, qActive, tree, voice, when } from './common';

// ---- R26 -------------------------------------------------------------------------------------------------------------------
const MA = voice(R26_MASTER);
const G1 = voice(R26_GUARD(1));
const G2 = voice(R26_GUARD(2));

export const R26_MASTER_TREE = tree(`npc-${R26_MASTER}`, [{ when: at('r26', 'master'), seg: 'r26-master' }, { when: qActive('r26'), seg: 'r26-wait' }], {
  'r26-master': {
    lines: [
      MA('Leodwin. Master of this convoy, for my sins. Merrin sent you? Of course she did.'),
      MA('Forty crates, six mules, two guards and me. And a mountain that eats people.'),
      C('Sigeric says you will not take the stairs.'),
      MA('The stairs are quick. An hour, if the dead let us. They will not let us. Somebody will be carried up.'),
      MA('The east flank is slow and open, and the storms come over it like a fist. The cart will lose crates in the wind. Nobody gets hurt.'),
      C('Merrin wants every crate.'),
      {
        s: R26_MASTER, t: 'Merrin is not walking. You choose, knight. I will follow.',
        choices: [
          { id: R26_FAST, t: 'The stairs. Every crate gets there.', go: null, fx: [{ setFlag: R26_CHOICE, value: R26_FAST }, { favour: 'oswin', delta: -3 }] },
          { id: R26_LONG, t: 'The east flank. Every guard gets there.', go: null, fx: [{ setFlag: R26_CHOICE, value: R26_LONG }, { favour: 'oswin', delta: 3 }] },
        ],
      },
    ],
  },
  'r26-wait': { lines: [MA('Load the cart, knight, and walk beside it. The mules like company.')] },
}, [MA('Count it twice, my father said. Then count it again, because the first two times you were tired.')]);

export const R26_GUARD_TREES: readonly BuiltTree[] = [
  tree(`npc-${R26_GUARD(1)}`, [{ when: at('r26', 'guard'), seg: 'r26-guard' }], {
    'r26-guard': {
      lines: [
        G1('You are the knight from the rim. They said you would come down. They did not say you would come down alone.'),
        C('What happened to the last convoy?'),
        G1('It reached the foot and stopped. Leodwin looked up those stairs and said no. He has been saying no for three days.'),
        G1('He is not a coward. He lost a cart on the Ash Road last month. Two men.'),
        G1('Read the manifest first. Then talk to him. He listens to people who have read the manifest.'),
      ],
    },
  }, [G1('We came up. I did not think we would.')]),
  tree(`npc-${R26_GUARD(2)}`, [], {}, [G2('Tidhelm. I carry the spare wheel and the bad jokes. Sigeric does the talking.')]),
];

// ---- M48 and R29: the stokers' shades ---------------------------------------------------------------------------------------
const HU = voice(M48_GHOST);
export const M48_GHOST_TREE = tree(`npc-${M48_GHOST}`, [{ when: at('m48', 'ghost'), seg: 'm48-ghost' }], {
  'm48-ghost': {
    lines: [
      HU('Lad. You are late for the shift. Where is your apron? Never mind. Never mind.'),
      C('Hunfrith? Alric told me about you.'),
      HU('Alric! Is he on the stair? Tell him the third vent is sticking again. It has been sticking for... I do not know how long.'),
      HU('Turn it hard. Lean on it with your shoulder. The crust only holds while the steam blows, so do not stand there admiring it.'),
      C('Hunfrith, how long have you been here?'),
      HU('Since the shift started. It is a long shift. The gong has not rung to end it.'),
      HU('The tally is on the slate, by the fourth channel. Read it to me, lad, my eyes are not what they were.'),
      C('I will. And I will tell Alric.'),
      HU('Good lad. Off you go. Mind the gnats on the fifth terrace; they are worse than the fire.'),
    ],
  },
}, [HU('Still on shift. Still waiting for the gong.')]);

const SH = (n: 1 | 2 | 3) => voice(R29_GHOST(n));
const R29_SHADE_LINES: Record<1 | 2 | 3, string[]> = {
  1: [
    'Who comes to the hut? The shift is not over. Nobody leaves until the gong.',
    'The hammer? I hung it by the door, so the last one out could strike the gong. Nobody was left to.',
    'The others are still outside. They do not know they are dead. Be gentle. Or be quick.',
  ],
  2: [
    'The rope. I carried it here to keep it dry. Stokers\' rope does not like the rain.',
    'I tied it to the ring and sat down to wait for the others. They did not come. Or they came, and I did not see them.',
    'Take it. Hang the gong. Let us all go home.',
  ],
  3: [
    'My girl carried the wedge up the path. I told her to hide it, so the Regent\'s men would not take the gong apart.',
    'She did. She was good at hiding. She is somewhere in the tunnels still, I think. I hope.',
    'The dead on the path are mine. My crew. Lay them down kindly; they worked hard.',
  ],
};
export const R29_SHADE_TREES: readonly BuiltTree[] = ([1, 2, 3] as const).map((n) => tree(`npc-${R29_GHOST(n)}`, [
  { when: at('r29', `ghost${n}`), seg: `r29-ghost${n}` },
], {
  [`r29-ghost${n}`]: { lines: [...R29_SHADE_LINES[n].map((t) => SH(n)(t)), C(n === 3 ? 'I will bring the wedge back. And I will look for her.' : 'I will take it back to the gong.')] },
}, [SH(n)('When the gong rings, we go home.')]));

// ---- M50: the Hall's keeper -------------------------------------------------------------------------------------------------
const WY = voice(M50_KEEPER);
export const M50_KEEPER_TREE = tree(`npc-${M50_KEEPER}`, [{ when: at('m50', 'keeper'), seg: 'm50-keeper' }], {
  'm50-keeper': {
    lines: [
      WY('You walked in. Most people run in, or are carried. Alric sent you.'),
      C('Hildeburh?'),
      WY('Keeper of the Hall. For a while longer, anyway. The hall has been running hot since the night they barred the gate. I could not route it alone.'),
      WY('The chart is on the wall. Three channels, three wheels each, and an order for each. The order is not the obvious one. It was never meant to be.'),
      WY('Watch the gauge. When it fills, the steam vents, and you will feel it. The channel resets. The others stay as you left them.'),
      C('And if I cannot remember the order?'),
      WY('Then the hall will remind you. Fail twice and the chart will glow. I made it do that, for Alric. He never could remember.'),
      WY('The golems sleep by the flumes. They wake when the water moves. Break them, or they will break the wheels.'),
      WY('Go on. I will be here. I am always here.'),
    ],
  },
}, [WY('The hall is cooler with you in it. Or I am imagining that.')]);

// ---- M51: the call, the dragons, the captain --------------------------------------------------------------------------------
const YS = voice('ysmeryth');
const OR = voice('orsk');
const HA = voice('hathren');
const CA = voice(M51_CAPTAIN);

export const M51_CALL_TREE = tree(M51_CALL_DIALOGUE, [{ when: any(offer('m51'), at('m51', 'call')), seg: 'm51-call' }], {
  'm51-call': {
    lines: [
      C('The horn-stone is humming. A low note, under the noise of the camp.'),
      YS('Small one. Do you hear me? The old stone carries my voice, as it did when the stokers were young.'),
      YS('The fire on the rim was seen from the peaks. We are coming. Three of us, and maybe one more.'),
      YS('Meet us on the terraces, east of your camp. Come alone, or with friends who do not shout.'),
      C('The voice fades. The stone is warm under my hand.'),
      accept('cael', 'm51', 'Go to the Wyrm Terraces?', 'I will meet them.', 'Later.'),
    ],
  },
}, [C('The horn-stone is silent. Warm, still.')]);

export const YSMERYTH_A5R = buildTree({
  id: 'npc-ysmeryth',
  start: [
    { when: at('m51', 'report'), seg: 'a5r-m51-report' },
    { when: at('m51', 'ysmeryth'), seg: 'a5r-m51' },
  ],
  segments: {
    'a5r-m51': {
      lines: [
        YS('There you are. Smaller than I remembered, and more tired. Good. Tired means you have been working.'),
        when(YS('I carry Eadgyth\'s axe on my ledge. You gave it back. The dragons do not forget a thing like that.'), flagIs(R16_CHOICE, 'give')),
        when(YS('You yielded to me on the summit, and you were not ashamed. I have thought about that often.'), flagIs(F2_CHOICE, 'yielded')),
        when(YS('You beat me on the summit. I have not forgiven you. I have also not stopped telling the story.'), flagIs(F2_CHOICE, 'won')),
        YS('The forge under the Anvil is older than my grandmother. The dragons helped light it. We did not help bury the king beneath it.'),
        C('Vey wants to wake him.'),
        YS('Vey wants a great many things. What he will get is three dragons on his flank and a gate that will not open.'),
        when(YS('And the hill wyrm you spared in the Cinderreach. It followed us here. It will fly when the gate is struck.'), flagIs(R11_CHOICE, 'spared')),
        YS('Speak to Orsk and Hathren. They came because I asked. Whether they stay is their choice.'),
        C('And you?'),
        YS('I came because you called. I stay because I want to see how this ends.'),
        YS('Look. Look down. There is something on the plain you should see.'),
      ],
    },
    'a5r-m51-report': {
      lines: [
        YS('Scouts. He sent scouts, and you sent them back with a story. He will hear it tonight.'),
        C('The captain said the Warhost has engines. Rams.'),
        YS('Then he means to break the gate, not climb the wall. Good. A gate is easier to hold than a wall. Ask your Wystan.'),
        YS('Go back to your camp, small one. We will be here, on the ledges, when the drums start.'),
      ],
    },
  },
});

export const DRAGON_TREES: readonly BuiltTree[] = [
  tree('npc-orsk', [{ when: at('m51', 'orsk'), seg: 'm51-orsk' }], {
    'm51-orsk': {
      lines: [
        OR('You are the one who beat Ysmeryth. Or lost to her. The story changes depending on who tells it.'),
        C('And what does Orsk think?'),
        OR('Orsk thinks the mountain is warm and the plain is cold. Orsk thinks men with black suns on their shields have been rude to dragons before.'),
        OR('I will burn their engines. Not their men. Their men are small and sad and smell of fear.'),
        C('That is more than I hoped.'),
      ],
    },
  }, [OR('The mountain is warm. I approve of the mountain.')]),
  tree('npc-hathren', [{ when: at('m51', 'hathren'), seg: 'm51-hathren' }], {
    'm51-hathren': {
      lines: [
        HA('Hathren. The youngest, as Orsk will tell you, often. I have never seen a war.'),
        C('I hope you never see one like this.'),
        HA('But I will see this one. The air above the gate is good for diving. I will keep the sky clear for you.'),
        HA('And if one of your soldiers falls in the courtyard, I will carry them out. Ysmeryth says that is what good allies do.'),
        C('Ysmeryth is right.'),
      ],
    },
  }, [HA('Is it always this loud, a camp? I like it.')]),
  tree(`npc-${M51_CAPTAIN}`, [{ when: at('m51', 'captain'), seg: 'm51-captain' }], {
    'm51-captain': {
      lines: [
        CA('Harl. Captain of scouts. Do it quick, if you are going to.'),
        C('Nobody is doing anything to you. Who sent you?'),
        CA('The Regent. Count the dragons, he said. Count the banners. Do not engage. We engaged. That was my mistake.'),
        CA('He has rams, knight. Three of them, dragged up from Harrowmark. And men enough to feed them to your gate.'),
        CA('Let my men go home. They have families on the plain. They will not come back up.'),
      ],
    },
  }, [CA('I am counting the dragons. I keep getting three. That is three too many.')]),
];

// ---- M49: the war table ------------------------------------------------------------------------------------------------------
const FORECAST_LINES: Readonly<Record<M49ForecastKey, string>> = {
  halvard: 'Halvard\'s pikes in the cut, a square of them, if Wystan\'s men are as many as they look.',
  grisel: 'Grisel\'s archers on the walls, two ranks deep.',
  ashwalker: 'Walkers on the east wall, where the wind comes over the cliff.',
  watch: 'The Harrowmark watch at the gate, the ones who came up with Edric.',
  named: 'Rook, Edric, Wulfhild and Wenna each at their own post, each with their own idea of where the fight is.',
  dragons: 'Dragons over the stairs. The stokers drew one as a joke. It might not be one now.',
  sally: 'Horse in the court, enough for Wystan to ride out once when the ram comes.',
  engineers: 'Engineers by the gate, with beams to mend it between the waves.',
  storm: 'No storm cover: the walkers would turn the storm back on the stairs.',
  supply: 'Oswin\'s crates stacked by the wall: flasks for every rank.',
};
const T = (t: string): Line => ({ s: 'cael', t });
export const M49_TABLE_TREE = tree(M49_TABLE_DIALOGUE, [{ when: at('m49', 'table'), seg: 'm49-table' }], {
  'm49-table': {
    lines: [
      T('The war table: a slab of the rim\'s own stone, the gate and the stairs cut into it, and a heap of carved markers.'),
      T('Someone has set the markers out. If the gate were struck today, this is who would stand.'),
      ...Object.entries(FORECAST_LINES).map(([k, t]) => when(T(t), flagIs(M49_FORECAST(k as M49ForecastKey)))),
      T('It is a guess, not a promise. The Houses will decide on the day, and favour changes fast.'),
      T('Three things are not on the table yet. Brace beams for the gate. Flask crates by the wall. A mark for the archers on the parapet.'),
      T('Those I can do myself.'),
      T('The markers stay where they are. Somebody will move them again tonight; somebody always does.'),
    ],
  },
}, [T('The markers sit where they were left. Tomorrow they will mean something.')]);

/** New trees of the Rim's cast and its prop talks. */
export const RIM_CAST_TREES: readonly BuiltTree[] = [
  R26_MASTER_TREE, ...R26_GUARD_TREES, M48_GHOST_TREE, ...R29_SHADE_TREES, M50_KEEPER_TREE, M51_CALL_TREE, ...DRAGON_TREES, M49_TABLE_TREE,
];
/** The talk id the table's and the call's props open their trees with (the talk objective's target). */
export const PROP_TALKS = { table: { dialogue: M49_TABLE_DIALOGUE, npc: M49_TABLE_NPC }, call: { dialogue: M51_CALL_DIALOGUE, npc: M51_CALL_NPC } } as const;
