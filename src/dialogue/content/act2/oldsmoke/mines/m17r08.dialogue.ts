// Dialogue of M17 Down the Oldsmoke Shaft and R08 Pickett's Last Shift (A13): trees for the new minor cast and an extension
// of Slagg's tree (A4's `npc-slagg`, built in ../slagg.dialogue.ts). Extension node ids all start `a2-m17-` or `a2-r08-`.
import { buildTree, type BuiltTree, type Line } from '../../build';
import { all, objDone, objOpen, qActive, qDone, qIdle, step } from '../../cond';

const L = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
const C = L('cael');

// Slagg: M17's offer and hand-in. Everything else of his is in the base tree (R09, R10); a Slagg talk mid-quest falls through to it.
const S = L('slagg');
export const SLAGG_M17: BuiltTree = buildTree({
  id: 'npc-slagg',
  start: [
    { when: step('m17', 'thanks', 'report'), seg: 'a2-m17-report' },
    { when: all(qDone('m16'), qIdle('m17')), seg: 'a2-m17-brief' },
  ],
  segments: {
    'a2-m17-brief': {
      lines: [
        S('{name}. Good. I was about to send a boy to find you, and I do not like sending boys down here.'),
        S('The lift. The big cage on the Deepgate shaft that takes a hundred men to the galleries and brings them home. It has hung dead since the strike. The stewards say the winch is under inspection. The inspector has not come in eleven weeks.'),
        C('And the men below?'),
        S('Two of them did not come up before it stopped. Hale and Brig. They went down on the last cage to shore a roof, and the cage did not come back. I have lowered bread on a rope as far as the rope will go.'),
        S('They are alive. I know because the bread comes back with the knot changed. Hale ties a bowline. Brig cannot, so he ties it wrong, and I take comfort from that.'),
        C('What needs doing?'),
        S('Three parts are missing from the winch: a pawl, a brake band and a drive pin. The stewards lifted them, or the thieves did, or the wind did. They are somewhere round the shaft head. Ansel, our winch-wright, knows what they look like.'),
        S('Mend the winch, take the lift down, clear the vents so the air moves, and bring both men to the cage. Mind the roof. Crawlers hang in it down there, thick as bats, and they drop when the draught changes.'),
        S('The vents are the trouble. They are choked with slag, and the first one you clear will wake the roof. Do it where you have room to move.'),
        S('Go and see Ansel. Tell him I sent you, and tell him I said he can stop pretending the inspector is coming.', [{ startQuest: 'm17' }]),
      ],
    },
    'a2-m17-report': {
      lines: [
        S('I heard the cage before I saw it. Eleven weeks of silence, and then that groan from the headframe. I stood up so fast I knocked the stool over.'),
        S('Hale is in the hall with a cup of something hot. Brig is telling everyone the roof was never close to falling, which is how I know it was.'),
        C('The crawlers were thick.'),
        S('Aye. They have been breeding in the dark since the strike. Someone will have to see to the rest of the roof one day. Not today.'),
        S('Here. This was Dunstan\'s, who held the winch for thirty years. It is dented, and it will turn a falling rock better than your head will.'),
        S('The lift runs. The men have a way down again, and a way home. That is more than the stewards gave them in eleven weeks.'),
        S('There is more under Deepgate than a shaft and a winch, {name}. When you are ready, ask Pickett\'s crew about the Old Galleries. Pickett is long dead, and he is not finished.'),
      ],
    },
  },
});

// The winch-wright at the shaft head.
const A = L('winch-wright');
export const WINCH_WRIGHT: BuiltTree = buildTree({
  id: 'npc-winch-wright',
  start: [
    { when: step('m17', 'brief', 'wright'), seg: 'm17-wright' },
    { when: all(qActive('m17'), objOpen('m17', 'winch')), seg: 'm17-wait' },
    { when: qActive('m17'), seg: 'm17-working' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm17-wright': {
      lines: [
        A('Slagg sent you. He would. Inspection, he said? I have heard that word so often I have begun to hear it in my sleep.'),
        A('I am Ansel. I built half this headframe and mended the other half. The winch is sound. Somebody took three parts out of it the night the strike was voted, and I have known who since the second morning.'),
        C('Who?'),
        A('Steward Corvin, with a sack and a cart. He did not do it for love of Grisel. He did it so the cage could not carry a rescue party to the strike\'s heart, and the strike could not carry its dead to the surface.'),
        A('The pawl is behind the coal heap, where the sack was dropped. The brake band is round the wellhead, wound about the post. The drive pin I will not guess; I have not looked.'),
        A('Bring them to the winch and set each home with your own hands. I will talk you through the pawl. Do not force the pin; it is brass and it bends.'),
        A('And read the board by the door and the tally on the post while you are about it. They tell you what the stewards wanted written, and what the men wanted remembered.'),
      ],
    },
    'm17-wait': {
      lines: [
        A('Pawl, brake band, drive pin. Three parts, all of them within a stone\'s throw of this headframe. Then the winch itself.'),
        A('Brass bends, remember. Set it, do not drive it.'),
      ],
    },
    'm17-working': { lines: [A('Mind the roof when you are down there. I will keep the winch warm for the ride up.')] },
    idle: { lines: [A('The cage runs true. Eleven weeks of rust and it runs true. That is good iron, {name}.')] },
  },
});

// The two trapped miners, thanking Cael at the surface once carried up.
const thanks = (id: string, name: string, lines: [string, string, string, string]): BuiltTree => {
  const M = L(id);
  return buildTree({
    id: `npc-${id}`,
    start: [
      { when: all(qActive('m17'), objDone('m17', 'up'), objOpen('m17', 'thanks')), seg: 'm17-thanks' },
      { when: all(), seg: 'idle' },
    ],
    segments: {
      'm17-thanks': { lines: [M(lines[0]), C(lines[1]), M(lines[2]), M(lines[3])] },
      idle: { lines: [M(name === 'Hale' ? 'Slagg says I am to sit and drink the hot thing until I stop shaking. I am trying. It is slow.' : 'The roof was never really coming down, you know. I would have said so to anyone who asked.')] },
    },
  });
};
export const MINER_HALE = thanks('miner-hale', 'Hale', [
  'Sunlight. I had stopped believing in it somewhere around the fifth week. It is brighter than I remember.',
  'You tied the knot on the rope, did you? The bowline.',
  'That was me. I tied it for Slagg, so he would know someone was alive to tie it. I would have gone on tying it until my hands gave out.',
  'Thank you. I do not have anything better to say, so I will say it twice. Thank you.',
]);
export const MINER_BRIG = thanks('miner-brig', 'Brig', [
  'I told Hale you would come. I said it every shift. "A Knight will come, and he will have a name, and he will carry us." Hale said I was soft in the head.',
  'He was right, and so were you. You carried us.',
  'I cannot tie a bowline. Did you know that? I tied every knot wrong on that rope and Slagg still knew it was me.',
  'Whatever you need from the Deepgate crews, ask. I will say yes before you finish the sentence.',
]);

// Pickett, the ghost shift boss of the Old Galleries (R08).
const P = L('pickett');
export const PICKETT: BuiltTree = buildTree({
  id: 'npc-pickett',
  start: [
    { when: step('r08', 'letter', 'report'), seg: 'r08-rest' },
    { when: all(qDone('m17'), qIdle('r08')), seg: 'r08-brief' },
    { when: qActive('r08'), seg: 'r08-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r08-brief': {
      lines: [
        P('You can hear me. Most cannot. The last one who could was a boy with a fever, and he thought I was a draught.'),
        C('You are the shift boss. Pickett.'),
        P('Burel Pickett, boss of the third shift in the Old Galleries, eleven years back. I do not keep count of the years; the crew did, on the wall. Mind the names as you go past.'),
        P('There was a fall. I will not tell it badly. The prop gave on the cart-road and the roof came down on the cage landing, and the bell would not ring because the rope was under the stone. I held the lamp for as long as the oil lasted.'),
        C('And the shift never ended.'),
        P('A shift ends when the boss rings the bell. I could not reach the bell. So the shift goes on, and I walk it, and my crew walk with me, and none of us can lay down the pick.'),
        P('Four tasks end a shift in the Old Galleries. The pump, to clear the sump. The cart, to rail the last of the ore. The prop, to shore the road behind us. And the bell, to call it done. In that order, or the bell will not be rung true.'),
        C('The pump, the cart and the prop in any order. Then the bell.'),
        P('Aye. A tidy mind. You would have made a good boss.'),
        P('There are things of mine scattered through the galleries: my tally, my lamp, my tin. I will not ask you to love them. I ask you to see them, so someone has. The crew\'s register is on the wall.'),
        P('When the bell is rung the old shift will come up from the dark. They do not mean harm. They mean to finish the day, and they will not know you are not a stranger. Fight them off if you must. I will not hold it against you.'),
        P('Begin where you like. The pump is nearest the landing.', [{ startQuest: 'r08' }]),
      ],
    },
    'r08-wait': {
      lines: [
        P('Pump, cart, prop. Then the bell, and not before. I have waited eleven years; I can wait through your supper.'),
        P('The relics are scattered where I dropped them. Read what you find. I would be glad of it.'),
      ],
    },
    'r08-rest': {
      lines: [
        P('The bell is rung. I heard it, {name}. I heard it all the way down in the dark, and I knew whose hand it was.'),
        C('Your crew said you were never lost.'),
        P('They are kinder than I deserved. I should have posted a second man on the rope. I told myself it was one fewer pair of hands on the cart.'),
        P('I read Maren\'s letter as you read it. I could not take it from your hand, and I did not need to. She wrote it for me to hear.'),
        P('Tell her the shift is done. Tell her the bairn was right: the bell rang when da was on the stair. It rang a long time late, but it rang.'),
        P('Take the lantern. It is the one I held. She tied the ribbon on it the morning I went down. It will not go out for you; it never went out for me, not once, not even at the last.'),
        P('Lay the pick down, boys. Lay it down.'),
        P('I can see the stair. There is a light at the top and a kettle on, I think.'),
        C('Go up, Burel. The shift is over.'),
        P('Aye. The shift is over. Thank you, Knight.'),
      ],
    },
    idle: { lines: [P('Not yet. There is more to this shift than I can say. Come back when you have been to Slagg\'s cage and learned to ride it.')] },
  },
});

// The shift crew: two ghost miners who speak as one, after the bell raised the wraith shift.
const K = L('shift-crew');
export const SHIFT_CREW: BuiltTree = buildTree({
  id: 'npc-shift-crew',
  start: [
    { when: step('r08', 'wraiths', 'crew'), seg: 'r08-crew' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r08-crew': {
      lines: [
        K('You fought the old shift. We watched. We could not stop them; they are what is left of us when the fear has had its way.'),
        K('We heard the bell and ran. We have said it on the wall. We said it to each other every night. It is a hard thing to be the ones who ran.'),
        C('You could not have reached him. The roof was down.'),
        K('We know. It does not help. A man who runs carries it. Pickett said so, once, when a boy ran from a small fall. "Run and carry it, or stay and be carried."'),
        K('He stayed, and we ran, and we have been carrying it for eleven years. Read the letter at the landing. Maren wrote it when she thought he lived.'),
        K('If it is a kindness to us, say it back to him when you have read it. He ought to hear his name said by someone who is not dead.'),
      ],
    },
    idle: { lines: [K('The shift goes on. The shift goes on.')] },
  },
});

export const M17R08_TREES: BuiltTree[] = [WINCH_WRIGHT, MINER_HALE, MINER_BRIG, PICKETT, SHIFT_CREW];
export const M17R08_EXTENSIONS: Array<{ baseId: string; ext: BuiltTree }> = [{ baseId: 'npc-slagg', ext: SLAGG_M17 }];
