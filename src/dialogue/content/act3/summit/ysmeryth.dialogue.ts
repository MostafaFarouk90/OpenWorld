import { buildTree } from '../../act2/build';
import { all, any, qActive } from '../../act2/cond';
import { C, at, offer, voice } from './common';

const Y = voice('ysmeryth');

/**
 * Ysmeryth the Coal-Mother at the Wyrm's Hearth: M32's account (30 lines in three movements: the Keepers, the hunters, the shard), M34's
 * oath (20) and report (6). She is not an NPC figure: the summit director starts this tree from her talk prop, once M31 is done.
 * After M34 and for the rest of the act she trades (K10's stock opens with `story.m32.complete`).
 */
export const YSMERYTH = buildTree({
  id: 'npc-ysmeryth',
  start: [
    { when: at('m34', 'report'), seg: 'm34-report' },
    { when: any(at('m34', 'oath'), offer('m34')), seg: 'm34-oath' },
    { when: any(at('m32', 'speak'), offer('m32')), seg: 'm32-account' },
    { when: qActive('m34'), seg: 'm34-wait' },
    { when: qActive('m32'), seg: 'm32-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm32-account': {
      lines: [
        // the first movement: the Keepers
        Y('Sit, knight, if you can bear to sit near me. The stone is warm, and my voice is slow, and the story is old.'),
        Y('You were told, in your cities, that wyrms came out of the mountain to eat the world. That is what the hunters sell, and the Council buys.'),
        C('I was told you were a plague.'),
        Y('I was a smith\'s apprentice. Not I, exactly. The first of my kind was. The crown-smith struck a spark from the Forge, a spark that did not die, and it woke and looked around.'),
        Y('We were the Forge\'s first coals. We were made to keep the world warm: to carry fire to the hearths of the north when the winters came too early.'),
        Y('The smiths called us Keepers. The word means one who tends what was lit by another. It is not a grand word. We never wanted a grand one.'),
        C('And you kept the world warm.'),
        Y('For a thousand winters. Then the smiths grew rich, and the Forge grew proud, and the kings learned there was gold in a dragon\'s hide.'),
        Y('That was the second thing the hunters forgot to tell you: we did not turn on them. They turned on us.'),
        Y('The third thing is that we are not hungry. We eat very little. A keeper can sleep a century on one meal. Our fear is not hunger. It is the quiet.'),
        // the second movement: the hunters
        Y('The hunters came with chains and nets. They took my sisters from the high roosts. Some they killed for the scale. Some they did not kill, and I am not certain which was kinder.'),
        C('I have seen the nets at Skyhold.'),
        Y('Then you have seen the edge of it. The Aerie across the chasm holds a drake in iron, and the Marshal who holds it has never had to look it in the eye.'),
        Y('I do not hate them. I wish that were not true, for it would be simpler. I am tired of hatred. It is a fire that burns the one who holds it.'),
        Y('My sister Hathren has taken to the north, to the cold, because she cannot bear the smoke. My other sister Ashka was taken in a net. I was too old to fly to her.'),
        C('I am sorry.'),
        Y('Do not be sorry. Be useful. That is the whole of what the Keepers ever asked of anyone.'),
        Y('The hunters have a name for me in their lodges. They call me the Coal-Mother, as though I were a story to frighten children. I have decided to let them.'),
        Y('A story keeps them away from my slope. A story is a fine wall.'),
        Y('But walls do not stop nets, and nets do not stop for stories. That is why you are here, and why I have lowered myself to speak.'),
        // the third movement: the shard
        Y('The shard in your chest is a spark of the first Forge, hardened and carried. It was meant to be carried by a smith, or a Keeper, or a friend of both.'),
        Y('It chose you. I do not say it chose well. I say it chose.'),
        C('The Council said it was a weapon.'),
        Y('The Council say many things. It is a duty. Fire is always a duty, to someone. The shard asks you to tend what you did not light.'),
        Y('It burns you, because it was never meant to be carried alone. Each time it flares, it takes a little of you to keep the fire going. That is its price.'),
        Y('I can teach you to carry it, as I carry my own spark: not by gripping it, but by letting it warm what is near you.'),
        Y('Walk the ring with me, the carvings, the stone. When the Hearth burns, the burn in your chest will be a little lighter. That is the oath I have taken: to teach you.'),
        C('And in return?'),
        Y('In return you will carry what I tell you, at the right time, to the right ear. The mountain is not mine to defend alone.'),
        Y('Come to the keeper-stone. I will show you what the Forge meant, and you will lay the shard where its first fire was lit.', [{ startQuest: 'm32' }]),
      ],
    },
    'm32-wait': { lines: [Y('Come to the keeper-stone when you are ready, knight. The vision, the stone, the hoard. I will wait. I am very good at it.')] },
    'm34-oath': {
      lines: [
        Y('Come into the light, knight. I have a thing to say, and I would like all of you to hear it, shard and all.'),
        Y('You have done what the Keepers could not do in ten generations. You climbed to me, you were measured, and you did not draw the blade.'),
        C('You told me not to.'),
        Y('I tell many things to many people. You are the first who listened to the reason behind them.'),
        Y('I have spoken to my sisters along the ridges. Hathren in the cold north. The wyrms of the Aerie, the ones the hunters have not caged. They have heard me.'),
        Y('We are going to swear. All of us. A keeper\'s oath is not made lightly, for we do not break what we have said. We last too long to be foresworn.'),
        C('What are you swearing to?'),
        Y('To the Forge, which made us. And to the one who carries its shard, which is you. We swear to tend the fire, and to turn the hunters\' nets from the slopes, and to help you carry what you carry.'),
        Y('It is not a servitude. We are not your dragons. We are your allies, and your teachers, and when you are wrong we shall say so, loudly.'),
        C('I would not have it any other way.'),
        Y('Good. The Hearth has been dark since my mother\'s mother\'s time. The oath is not complete until it burns.'),
        Y('You will rekindle it. It is a thing for the shard to do, and for you. I can only tell you how.'),
        Y('The carvings round the ring say what a keeper should be. Read two, and the old words will teach you what to ask of the stone.'),
        Y('The markers on the far rim show the way to the first glide. The wind off the Hearth is yours when the fire burns.'),
        Y('Thorgar Skyhold is coming. He has asked to see the fire, and I have said he may, which is the first time I have let a hunter near it in three hundred years.'),
        Y('He is not like the others. He hunts so that no one else will. I did not understand that before I met him.'),
        C('He does not trust you.'),
        Y('He should not. Trust is built, not given. But he comes, and that is a beginning.'),
        Y('Stand by the stone. Hold out the hand that does not hold a weapon. The others will come, and we shall swear.', [{ startQuest: 'm34' }]),
      ],
    },
    'm34-wait': { lines: [Y('The oath is made. The Hearth waits for your hand, knight. Read the carvings, find the markers, and light the fire.')] },
    'm34-report': {
      lines: [
        Y('The fire burns. I can feel it from here, in the stone and in my belly. It has been a long, cold time.'),
        C('The ledge is open. I stood on it. The wind pulls at me as though it wants to carry me off.'),
        Y('It does. It is a good wind. The updraft of the Hearth has lifted every keeper that ever flew. Lean into it and it will not drop you.'),
        Y('Go to the lodge, to Thorgar, to the Aerie across the chasm. There is a drake there in chains, and a man who keeps them. They are the last of the hunters\' work on this ridge.'),
        C('I will go.'),
        Y('I know. Go well, knight, and glide. I will watch from the rim until you are too small to see.'),
      ],
    },
    idle: {
      lines: [
        {
          s: 'ysmeryth', t: 'The fire is lit, knight. Do you need something of the Hearth?',
          choices: [
            { id: 'trade', t: 'Show me what the dragons can spare.', go: null, fx: [{ event: 'npc.vendor.open', payload: { vendorId: 'ysmeryth' } }] },
            { id: 'bye', t: 'Only your company.', go: null },
          ],
        },
      ],
    },
  },
});
