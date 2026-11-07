// The allies at the Rim (N10): extensions of shipped trees, their rules first and live only in Rim states (node ids `a5r-`).
// Wulfhild at the Rimfoot fire (M47) and at the camp (M49); Edric and Rook inside the gate (M47) and at the camp (M49; Edric
// again in M51); Wystan, Merrin, Wenna and Maud at the war council (M49); Hrolf's M49; Merrin's R26; Ansgar's R29. Invented (Q6).
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { R26_CHOICE, R26_FAST } from '../../../../quests/content/act5/rim/r26.quest';
import { C, accept, any, at, flagIs, offer, qActive, voice, when } from './common';
import { M52_COMPANION_RULES, M52_COMPANION_SEGMENTS, M52_WYSTAN_RULES, M52_WYSTAN_SEGMENTS } from './siege.dialogue';

type Rule = Parameters<typeof buildTree>[0]['start'][number];
const ext = (npc: string, start: Rule[], segments: Record<string, { lines: Line[] }>): BuiltTree => buildTree({ id: `npc-${npc}`, start, segments });

const WU = voice('wulfhild');
const ED = voice('edric');
const RO = voice('rook');
const WY = voice('wystan');
const ME = voice('merrin');
const WE = voice('wenna');
const MA = voice('maud');
const HR = voice('hrolf');
const AN = voice('ansgar');

export const WULFHILD_A5R = ext('wulfhild', [
  { when: at('m47', 'wulfhild'), seg: 'a5r-m47' },
  { when: at('m49', 'wulfhild'), seg: 'a5r-m49' },
], {
  'a5r-m47': {
    lines: [
      WU('You slept. Good. Look up: the stairs, all the way to that black notch in the sky. That is the Rim Gate.'),
      WU('The walkers do not climb it. Our grandmothers ran down those stairs and swore never to go back up.'),
      C('Then I go alone.'),
      WU('You go first. That is different. The dead walk the switchbacks; the stokers who never came down. Be gentle with them, if you can.'),
      WU('And if the gate is shut, look for the winch on the west tower. A gate that only opens from inside is a tomb.'),
    ],
  },
  'a5r-m49': {
    lines: [
      WU('Fifty walkers came up those stairs this morning. Fifty. My grandmother would spit.'),
      C('Why did they come?'),
      WU('Because you lit the fire and the fire was seen. Because the Regent burned our shelters on the line. Because I told them to.'),
      WU('We know storms. Put us where the wind is worst and we will hold.'),
      C('The east wall, then. Where the cliff meets the gate.'),
      WU('The east wall. Done. And when this is over, I want to see the Anvil up close. I want to tell my grandmother\'s grave what it looked like.'),
    ],
  },
});

export const EDRIC_A5R = ext('edric', [
  { when: at('m47', 'edric'), seg: 'a5r-m47' },
  { when: at('m49', 'edric'), seg: 'a5r-m49' },
  { when: at('m51', 'edric'), seg: 'a5r-m51' },
], {
  'a5r-m47': {
    lines: [
      ED('You did not think I would let you climb that alone. Rook and I were half an hour behind you.'),
      C('Did you see the dead on the stairs?'),
      ED('We saw where they lay down. You were kind to them. That will be remembered.'),
      ED('The stoker inside is suspicious of everyone, and he is right to be. Let me talk to him about the camp. You go and look.'),
    ],
  },
  'a5r-m49': {
    lines: [
      ED('So this is what a war council looks like at the top of the world. Mostly people shouting about tents.'),
      C('Will they fight?'),
      ED('They will fight. Whether they will fight together is another question. Wystan does not trust Merrin. Merrin does not trust anyone.'),
      ED('But they all trust you. That is the strange thing. A knight from Kettlewick, and three Houses take your word.'),
      C('And you, Edric?'),
      ED('I will stand at the gate. Where else would I stand? Give the Houses the walls. Give me the door.'),
    ],
  },
  'a5r-m51': {
    lines: [
      ED('Look at the plain. There. And there. Fires, where there were none last night.'),
      C('Vey\'s Warhost.'),
      ED('His vanguard. The rest will come behind. He is counting us, and we are counting him, and his number is bigger.'),
      ED('If the dragons come, it changes the sums. Go to the terraces. I will keep watching.'),
      ED('And be careful up there. He will want to know about the dragons before he moves. He will send someone to look.'),
    ],
  },
});

export const ROOK_A5R = ext('rook', [
  { when: at('m47', 'rook'), seg: 'a5r-m47' },
  { when: at('m49', 'rook'), seg: 'a5r-m49' },
], {
  'a5r-m47': {
    lines: [
      RO('What a view. I could sell tickets. "See the Caldera, two silver, refunds if you fall in."'),
      C('You climbed all this way to make jokes.'),
      RO('I climbed all this way because somebody has to watch your back, and Edric watches the front. The old man inside, he is sound?'),
      RO('Good. Light his fires for him. People remember who lit their fires.'),
    ],
  },
  'a5r-m49': {
    lines: [
      RO('I have counted the camp three times. Every count comes out different, because the Houses keep arriving.'),
      C('Is that bad?'),
      RO('It is wonderful. It is also chaos. Wystan\'s pikes are camped on Grisel\'s archery line, and Wenna is making speeches about it.'),
      RO('Leave the camp to me. I will have it in order by dark. Order is just chaos with a good quartermaster.'),
      C('And on the day?'),
      RO('On the day I will be where it is worst, telling jokes. Somebody has to.'),
    ],
  },
});

export const WYSTAN_A5R = ext('wystan', [
  { when: at('m49', 'wystan'), seg: 'a5r-m49' },
  ...M52_WYSTAN_RULES,
], {
  ...M52_WYSTAN_SEGMENTS,
  'a5r-m49': {
    lines: [
      WY('Knight. House Halvard keeps its promises. You asked for pikes at the rim, and here they are.'),
      C('I am glad of every one of them.'),
      WY('So am I. Most of them have never seen a mountain. Half of them think the Caldera is a lake.'),
      WY('The gate is the only way in. If Vey wants the forge, he has to come through there. Pikes in the cut, and he will pay for every step.'),
      C('Will you lead them?'),
      WY('I will stand at the war post and give the orders. Come and find me when the drums start. I would rather you told me where to send them.'),
    ],
  },
});

export const MERRIN_A5R = ext('merrin', [
  { when: at('m49', 'merrin'), seg: 'a5r-m49' },
  { when: at('r26', 'report'), seg: 'a5r-r26-report' },
  { when: offer('r26'), seg: 'a5r-r26-brief' },
  { when: qActive('r26'), seg: 'a5r-r26-wait' },
], {
  'a5r-m49': {
    lines: [
      ME('House Oswin is here, which is to say I am here, and twelve wagons, and a ledger I would kill for.'),
      C('What is in the wagons?'),
      ME('Flasks. Bandages. Oil. Grain. Everything an army forgets until it bleeds. And there should be more.'),
      ME('The last convoy is at the foot of the rim. The master will not bring it up the stairs in the open. He has heard about the dead.'),
      C('I can go down for it.'),
      ME('Not yet. Speak to the others first; they will want to feel consulted. Then come back to me.'),
    ],
  },
  'a5r-r26-brief': {
    lines: [
      ME('The convoy. Forty crates of flasks at the Rimfoot fire, and a master who has decided the mountain wants to eat him.'),
      ME('There are two roads up. The rim stairs: short, steep and haunted. The east flank: long and open, and the storms come over it every hour.'),
      C('Which would you choose?'),
      ME('I would choose the road that brings every crate. The master will choose the road that brings every guard. Talk to him. Talk to his guard. Read the manifest.'),
      ME('Whatever you decide, I will write it down. That is what House Oswin does.'),
      accept('merrin', 'r26', 'Will you bring it up?', 'I will bring the convoy up.'),
    ],
  },
  'a5r-r26-wait': { lines: [ME('The convoy, knight. Every hour it sits at the foot is an hour the Regent might find it.')] },
  'a5r-r26-report': {
    lines: [
      ME('The convoy is in. I have the waybill. I have read it twice.'),
      when(ME('Every crate. And two guards in the aid tent, who will walk again in a week. That was the short road\'s price.'), flagIs(R26_CHOICE, R26_FAST)),
      when(ME('Two crates short. Every guard on his feet. I told the master he chose well. I did not tell him I would have chosen the other way.'), { not: flagIs(R26_CHOICE, R26_FAST) }),
      C('Was it the right choice?'),
      ME('There is no right choice on a mountain. There is the one you made, and the ledger that remembers it.'),
      ME('Take this, for the climb. Oswin pays its debts.'),
    ],
  },
});

export const WENNA_A5R = ext('wenna', [{ when: at('m49', 'wenna'), seg: 'a5r-m49' }], {
  'a5r-m49': {
    lines: [
      WE('Grisel\'s archers, all of them that could climb. We beat Halvard up the stairs by an hour, and I made sure Wystan heard.'),
      C('This is not a race, Wenna.'),
      WE('Everything is a race. That is how you win the ones that matter.'),
      WE('Give me the walls. From up there I can put an arrow anywhere on the stairs. Anything that climbs, I can see.'),
      C('And if they bring dragons of their own?'),
      WE('Then I will need more arrows. Ask Merrin. She counts everything else.'),
    ],
  },
});

export const MAUD_A5R = ext('maud', [{ when: at('m49', 'maud'), seg: 'a5r-m49' }], {
  'a5r-m49': {
    lines: [
      MA('Cinderford sent me up with a pot, a ladle and a mule that hates me. Somebody has to feed this army.'),
      C('You climbed the rim with a cooking pot?'),
      MA('I climbed the rim because you cleansed my town. A woman pays her debts in stew. Come and eat when you are hungry.'),
      MA('And tell that Rook to stop stealing bread. I can see him from here.'),
    ],
  },
});

export const HROLF_A5R = ext('hrolf', [
  ...M52_COMPANION_RULES('hrolf'),
  { when: at('m49', 'report'), seg: 'a5r-m49-report' },
  { when: offer('m49'), seg: 'a5r-m49-brief' },
  { when: qActive('m49'), seg: 'a5r-m49-wait' },
], {
  ...M52_COMPANION_SEGMENTS('hrolf'),
  'a5r-m49-brief': {
    lines: [
      HR('The rim is ours, the stair is walked, and I have eaten nothing but stoker biscuits for two days. I have had worse weeks.'),
      HR('But a gate and an old man are not an army. The Houses said they would come. The walkers said maybe.'),
      C('How will they know we are here?'),
      HR('The signal fire, by the camp. The stokers lit it when they needed help from below. Light it, and everyone with eyes will see.'),
      C('And if nobody comes?'),
      accept('hrolf', 'm49', 'Then nobody comes, and we hold it ourselves. Will you light it?', 'Light it. Let them see.'),
    ],
  },
  'a5r-m49-wait': { lines: [HR('Talk to them all, little knight. Every one. People fight harder for someone who knows their name.')] },
  'a5r-m49-report': {
    lines: [
      HR('Look at it. Banners on the gate, fires all through the camp, and a stoker grumbling about the noise. It is beautiful.'),
      C('Is it enough?'),
      HR('Nothing is ever enough. But it is more than Vey thinks we have, and that is a start.'),
      HR('Rest now. Tomorrow, we get ready. The day after, he comes.'),
    ],
  },
});

export const ANSGAR_A5R = ext('ansgar', [
  { when: at('r29', 'report'), seg: 'a5r-r29-report' },
  { when: offer('r29'), seg: 'a5r-r29-brief' },
  { when: any(qActive('r29')), seg: 'a5r-r29-wait' },
], {
  'a5r-r29-brief': {
    lines: [
      AN('I came by the Rim Beacon. Lit it again on the way. Old habits. Now I find this rim has a beacon of its own, and it is broken.'),
      AN('The stokers\' gong. There, by the hut. It called the shifts, and it called the dead home. It has not rung in nine years.'),
      C('Is that why the dead walk the shelves?'),
      AN('That is why. They are waiting for the shift to end. The gong\'s hammer, its rope and its wedge are scattered at the three old posts.'),
      AN('Bring them back. Lay the dead you find there. Then we hang the gong and strike it, and they can go home.'),
      accept('ansgar', 'r29', 'Will you fetch them?', 'I will bring the parts back.'),
    ],
  },
  'a5r-r29-wait': { lines: [AN('Three posts. The hut, the west shelf, the tunnel path. Speak to whoever waits there. They will tell you what they kept.')] },
  'a5r-r29-report': {
    lines: [
      AN('Hear that? The whole rim is still ringing. I have struck a lot of bells in my life. None like that.'),
      C('The dead on the shelves have gone.'),
      AN('Gone home. Every one. The stokers will not walk again, not on this rim.'),
      AN('And the gong will be here when we need it. When Vey comes, strike it, and the whole camp will hear the call to arms.'),
      C('Will the dead come back to fight?'),
      AN('No. But the living will remember them. That is enough. Here; I made this for you. The gong\'s old pattern, cut small.'),
    ],
  },
});

/** Aelfreda and Tobb at the aid tent after M52 (Hrolf's is in his extension above). */
export const AELFREDA_A5R = ext('aelfreda', M52_COMPANION_RULES('aelfreda'), M52_COMPANION_SEGMENTS('aelfreda'));
export const TOBB_A5R = ext('tobb', M52_COMPANION_RULES('tobb'), M52_COMPANION_SEGMENTS('tobb'));

export const ALLY_EXTENSIONS: readonly BuiltTree[] = [
  WULFHILD_A5R, EDRIC_A5R, ROOK_A5R, WYSTAN_A5R, MERRIN_A5R, WENNA_A5R, MAUD_A5R, HROLF_A5R, ANSGAR_A5R, AELFREDA_A5R, TOBB_A5R,
];
