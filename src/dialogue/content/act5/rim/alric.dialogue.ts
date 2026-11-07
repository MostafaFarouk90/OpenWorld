// Alric, last of the stokers (N10): M47's meeting inside the Rim Gate and its report, M48's brief and report, M50's brief and
// report, and his word in M51. A new tree (`npc-alric`); invented (Q6), logged under "Act 5 N10".
import { ALRIC } from '../../../../quests/content/act5/rim/m47.quest';
import { C, accept, at, offer, qActive, qDone, tree, voice } from './common';

const A = voice(ALRIC);

export const ALRIC_TREE = tree(`npc-${ALRIC}`, [
  { when: at('m47', 'alric'), seg: 'm47-alric' },
  { when: at('m47', 'report'), seg: 'm47-report' },
  { when: qActive('m47'), seg: 'm47-wait' },
  { when: offer('m48'), seg: 'm48-brief' },
  { when: at('m48', 'report'), seg: 'm48-report' },
  { when: qActive('m48'), seg: 'm48-wait' },
  // M51's step goes before M50's offer and wait: the two quests run side by side from the camp
  { when: at('m51', 'alric'), seg: 'm51-alric' },
  { when: offer('m50'), seg: 'm50-brief' },
  { when: at('m50', 'report'), seg: 'm50-report' },
  { when: qActive('m50'), seg: 'm50-wait' },
  // after the siege: the rim anvil and how to pay for the forge set (the coordinator's gold ruling, N12's Phase I report)
  { when: qDone('m52'), seg: 'm52-anvil' },
], {
  // ---- M47 -----------------------------------------------------------------------------------------------------------------
  'm47-alric': {
    lines: [
      A('Stop there. Who wound that winch? Nobody has opened the face of this gate in nine years.'),
      C('A knight of the Council of Ash. The Regent is coming for the forge.'),
      A('The Regent. Vey. He sent men here before, all smiles, asking to see the fire. I barred the gate and they went away.'),
      A('Alric. The last stoker who still answers to the name. There were nine of us when the ash came. Now there is me and a lot of empty posts.'),
      // the coordinator's ruling 1: Alric names the camp's empty posts
      A('That one was Ceadda\'s, by the brazier. That one Wigmund\'s, on the lamp. The bell was Godgifu\'s. I keep them lit because nobody else will.'),
      A('If you mean to hold this rim against Vey, you will need every post filled. Not with stokers. With anyone who will stand.'),
      C('I have friends below. And more coming.'),
      A('Then bring them. But look first. You should see what you are fighting for before you decide to fight for it.'),
      A('Go to the edge, there. Then light the brazier and the lamp for me. Old knees, and it has been a long night.'),
    ],
  },
  'm47-wait': { lines: [A('The brazier, the lamp, the bell. Then the waystone by the camp. Then come back to me.')] },
  'm47-report': {
    lines: [
      A('The brazier is lit. The lamp. And the stone by the camp is warm again. I had forgotten what that looks like.'),
      A('You have seen the Caldera. The Anvil in the middle. What you did not see is the road down to it.'),
      C('The Lava Stair.'),
      A('The Lava Stair. Six channels of fire across one narrow road. The stokers tamed it with wheels and levers. Some of them still turn.'),
      A('Sleep first. Then find me at the head of the stair, and I will show you how we used to walk it.'),
      A('And knight. Thank you. Nobody has lit Ceadda\'s brazier but me in nine years.'),
    ],
  },
  // ---- M48 -----------------------------------------------------------------------------------------------------------------
  'm48-brief': {
    lines: [
      A('There it is. The Lava Stair. Five hundred paces of road, and six places where the mountain bleeds across it.'),
      A('Four of the channels have vents. Turn a vent\'s wheel and the steam blows the channel cold for a few breaths. The crust will hold you.'),
      A('The other two have gantries. Pull the lever and the gantry swings out. Or jump, if you are as quick as they say.'),
      C('And if I fall in?'),
      A('You will not die. The fire spits back whatever it does not want, and it does not want knights. But it will hurt, and you will start that channel again.'),
      A('There are golems on the terraces. Old guards, from when the stokers were many. They do not remember who they serve.'),
      A('And there may be a stoker on the middle landing. Hunfrith. He died there. He does not always know it.'),
      C('A ghost.'),
      A('A friend. Be kind to him. Then meet me at the foot, if you get there.'),
      accept(ALRIC, 'm48', 'Will you walk it?', 'Show me the first wheel.'),
    ],
  },
  'm48-wait': { lines: [A('Wheel or lever, then cross. Then the next. The stair does not care how brave you are, only how quick.')] },
  'm48-report': {
    lines: [
      A('You made it. All six. I came round by the old tunnel; my legs are not what they were, and the stair knows it.'),
      C('I met Hunfrith on the landing.'),
      A('Did he know you? He used to call everyone "lad". Even the Regent\'s men. Even me.'),
      C('He told me the tally on the slate. And that the vents were never meant to roar all at once.'),
      A('No. But you did it, and the mountain did not mind. Maybe it was glad of the company.'),
      A('That shard in the cache. Do you know what it is? A piece of the forge\'s heart. The stokers kept them for the day the fire went out.'),
      A('Keep it. Bring me more if you find them, and my anvil will make something worthy of them.'),
      A('Now go back up. Your friends will be at the camp soon, if they are coming at all. Hrolf has been pacing since dawn.'),
      C('They are coming.'),
    ],
  },
  // ---- M50 -----------------------------------------------------------------------------------------------------------------
  'm50-brief': {
    lines: [
      A('Your friends have come, and the rim has banners again. Good. Now I need you underground.'),
      A('The Cooling Hall, below the stair\'s foot. It is where we sent the fire when the forge ran too hot. It has been running too hot for nine years.'),
      A('Three channels, each with three sluice wheels. The order is painted on the walls. Turn them out of order and the heat climbs.'),
      C('And when it climbs too far?'),
      A('Steam. It will throw you across the room and scald you, and the channel resets. It will not kill you. It will make you wish it had.'),
      A('Route all three and the hall cools, and the forge at the back opens. My anvil up here will burn hot enough for real work.'),
      A('The hall\'s keeper may still be there. Hildeburh. She never left. She will know you are coming before you do.'),
      A('I will meet you at the door. My knees can manage a hall. A stair, no.'),
      accept(ALRIC, 'm50', 'Will you go down?', 'Down into the hall.'),
    ],
  },
  'm52-anvil': {
    lines: [
      A('You held the gate. Now let me hold the hammer. The rim anvil is hot, and what you carry was not made for what is under the Caldera.'),
      C('What would it cost?'),
      A('More than a knight keeps in his purse. But you have Oswin\'s bounty note from the convoy, sealed in Lady Merrin\'s hand. Any trader in camp will pay for it.'),
      A('Sell the note, bring me the coin, and I will temper your steel at the anvil beside my stall.'),
    ],
  },
  'm50-wait': { lines: [A('The chart, then the wheels in its order. Watch the gauge. When it is red, step back and breathe.')] },
  'm50-report': {
    lines: [
      A('Listen. Hear that? Nothing. No hiss, no roar. The hall is cold for the first time since I was young.'),
      C('Hildeburh showed me the way.'),
      A('She would. She trained me. I was the worst stoker she ever had, she said, and the only one who stayed.'),
      A('The forge\'s mark. You read the names? Mine is the last. I always thought someone would cross it out for me.'),
      C('Nobody is crossing it out.'),
      A('No. Not today. My anvil is hot enough now for the old metal. Bring me what you have and I will temper it.'),
      A('Take this too. The stokers\' share. There is no one else to give it to.'),
      A('Now go up. Something is calling from the camp, and it does not sound like Hrolf.'),
    ],
  },
  // ---- M51 -----------------------------------------------------------------------------------------------------------------
  'm51-alric': {
    lines: [
      A('You heard it too. The horn-stone. The stokers cut it for the dragons, before the forge was built. It has not spoken in my lifetime.'),
      A('If they are coming, they will land on the Wyrm Terraces, east of here. The old ledges.'),
      C('Will they fight with us?'),
      A('Dragons do not fight with anyone. They fight beside you, if they choose. Ask, and be honest. They can smell a lie.'),
      A('Light the waystone on the terraces while you are there. It will save your legs later.'),
      A('And speak to Edric before you go. He has been watching the plain all morning and he will not tell me why.'),
    ],
  },
}, [
  A('The fire is kept. Those who keep it are kept by it. That is what the gate says. Some days I believe it.'),
]);
