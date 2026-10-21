import { buildTree } from './build';
import { all, flagIs, not, objDone, objOpen, qActive, qDone, qIdle } from './cond';

const A = (t: string, fx?: import('../../../quests/types').Effect[]) => ({ s: 'aelfreda', t, ...(fx ? { fx } : {}) });
const C = (t: string) => ({ s: 'cael', t });

/** Act 2 extension of Sister Aelfreda's tree (Act 1 rules follow these). */
export const AELFREDA_A2 = buildTree({
  id: 'npc-aelfreda',
  start: [
    { when: all(qActive('m14'), objDone('m14', 'sings'), objOpen('m14', 'rite')), seg: 'a2-rite' },
    { when: qActive('m14'), seg: 'a2-wait' },
    { when: all(qDone('m13'), qIdle('m14')), seg: 'a2-brief' },
  ],
  segments: {
    'a2-brief': {
      lines: [
        A('There you are. I said the ridge would find you eventually, and it has the manners of a cat: it waits until you stop looking.'),
        C('Sister Aelfreda. I did not expect to find you at the Hushed Anvil.'),
        A('Nobody does, which is rather the point. The Anvil is a very old forge on the ridge, and for a very long time it rang. You could hear it in the valley on a still night.'),
        C('And now?'),
        A('Now it is silent. It went quiet some years ago, around the time the waystones began to dim. I do not think that is coincidence, and I do not think the smiths did either.'),
        C('Why did it fall silent?'),
        A('The old accounts say the Anvil needs tempering: a slow, patient bringing of the forge back into tune with the hearth below. When the hearthkeepers stopped, the Anvil stopped. When the Anvil stopped, the stones stopped listening.'),
        C('And tempering is?'),
        A('Part craft, part courtesy. You climb the ledges, you clear what has made a nest of the place, and you read what the old smiths left on the walls. Then the lantern-keeper lets you set the rhythm.'),
        C('You make it sound as if I am going to do all this alone.'),
        A('I will be at the end of it, with a rite that only a hearthkeeper can finish. I am not being idle. A rite wants someone to receive it, and someone to give, and I am better at the giving.'),
        A('The rite itself is the Hearth Rite: old words, a lit coal, and a promise made over the Anvil. It binds the forge and the one who tempers it. It is not a thing to do twice.'),
        C('Binds me how?'),
        A('To the hearth, and to the work. You would be a friend to the fire, not its master. I cannot think of a better thing to be, though some would call it a leash.'),
        A('So. Climb the three ledges, clear the golems and the hounds, read the three murals, speak to the keeper, and set the Anvil\'s rhythm. Then come back to me.'),
        A('I will keep the fire. It is a poor kind of heroism, but I am good at it.', [{ startQuest: 'm14' }]),
      ],
    },
    'a2-wait': { lines: [A('The ledges, the golems, the hounds, the murals, the keeper, the rhythm. You do not need me to say it twice. But I enjoy saying it.')] },
    'a2-rite': {
      lines: [
        A('You have done what I asked, and the Anvil sings again. Can you hear it? The valley can, I promise you.'),
        A('Now the rite. Kneel, if your knees allow it, and set your hand on the coal. It will not burn you unless you lie to it.'),
        C('And if I am not sure what I believe?'),
        A('Then you are in good company. The coal does not ask for belief, only for honesty.'),
        { s: 'aelfreda', t: 'I see the Scars on you, the old marks of the fire. They will answer to the rite. Hold still, and let them speak. They have been waiting for someone to listen.', when: flagIs('story.f10.scars') },
        { s: 'aelfreda', t: 'You bear no Scars, which is a rare thing in these parts, and I am glad of it. The rite will be gentler on you, though it will ask for more of your attention. Hold still, and listen.', when: not(flagIs('story.f10.scars')) },
        A('There. The coal is warm, the words are said, and the Anvil knows your name. It will not forget it.'),
        C('It feels like the whole ridge exhaled.'),
        A('It did. That is what a rite is for. Now, I think the rest of the hearth has been standing in the doorway wondering whether it is invited.'),
        A('I am done with sitting on a ridge. The valley needs a hearthkeeper who is willing to walk, and you need someone to tell you when you are being a fool.'),
        C('You would come with me?'),
        A('I would. Not as a servant and not as a saint, but as a friend with a good deal of practice at binding wounds. Ask me anything, and I will tell you the truth with a smile.'),
        A('Lead on, {name}. The fire goes where we go.', [
          { setFlag: 'story.m14.aelfredaJoined', value: true },
          { event: 'story.companion.rank', payload: { companionId: 'aelfreda', rank: 1 } },
          { event: 'npc.aelfreda.hearthRite' },
          { setFlag: 'story.m14.complete', value: true },
        ]),
      ],
    },
  },
});
