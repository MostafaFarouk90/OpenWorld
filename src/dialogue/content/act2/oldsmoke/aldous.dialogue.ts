import { buildTree, type Line } from '../build';
import { all, any, flagIs, not, objDone, objOpen, qActive, qDone, step } from '../cond';

const A = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'aldous', t, fx } : { s: 'aldous', t });
const C = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'cael', t, fx } : { s: 'cael', t });

const evidence2 = any(
  all(flagIs('story.m21.ev.1'), flagIs('story.m21.ev.2')),
  all(flagIs('story.m21.ev.1'), flagIs('story.m21.ev.3')),
  all(flagIs('story.m21.ev.2'), flagIs('story.m21.ev.3')),
);
const wellKnown = { favour: 'grisel', atLeast: 15 } as const;
const canCase = any(evidence2, wellKnown);
// The aftermath is spoken only once the whole middle is done: the letters AND the stealth section of the spy branch (the confront
// branch has both done by `doneWhen`), never between the letters and the stealth.
const afterAudience = all(qActive('m21'), objDone('m21', 'letters'), objDone('m21', 'stealth'), objOpen('m21', 'aftermath'));
// The audience pays its favour (and gold) once per road: an aborted talk or a re-talk after the fight must not pay it again.
const paidFlag = (road: string) => `story.m21.paid.${road}`;
const payOnce = (road: string, pay: NonNullable<Line['fx']>): NonNullable<Line['fx']> => [
  { if: { not: flagIs(paidFlag(road)) }, then: [...pay, { setFlag: paidFlag(road), value: true }] },
];

/** Lord Aldous Grisel of Deepgate: M16 in the forecourt, then the hall for M21. */
export const ALDOUS = buildTree({
  id: 'npc-aldous',
  start: [
    { when: all(afterAudience, flagIs('story.m21.branch', 'spy')), seg: 'm21-aftermath-spy' },
    { when: afterAudience, seg: 'm21-aftermath-confront' },
    { when: step('m21', 'evidence', 'audience'), seg: 'm21-audience' },
    { when: qActive('m21'), seg: 'm21-wait' },
    { when: all(qActive('m16'), objDone('m16', 'wenna'), objOpen('m16', 'report')), seg: 'm16-report' },
    { when: all(qActive('m16'), objDone('m16', 'brazier'), objOpen('m16', 'silence')), seg: 'm16-proof' },
    { when: all(qActive('m16'), objDone('m16', 'court'), objOpen('m16', 'brazier')), seg: 'm16-wait-brazier' },
    { when: all(qActive('m16'), objDone('m16', 'gate'), objOpen('m16', 'court')), seg: 'm16-court' },
    { when: qActive('m16'), seg: 'm16-wait' },
    { when: qDone('m16'), seg: 'idle-after' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm16-court': {
      lines: [
        A('So this is the Knight who walked out of a burning Ember and into my pass. You are shorter than the songs say, and the songs have not been written yet.'),
        C('You asked for me, my lord. I came.'),
        A('I asked for proof. A letter from Harrowmark says the Ember Shard is real, that it can wake the forges and heal the land. I have had letters before.'),
        A('Deepgate has fed Valdren for four hundred years. When the Ember went quiet, the first thing the Houses did was forget who had been stoking it.'),
        C('You want a reason to remember.'),
        A('I want a reason to risk my House on a story. Halvard talks of oaths and Oswin of archives. I ask what will it cost the miners, and what will it pay them.'),
        A('You will have heard the strike talk in my market. I have heard it too. I cannot settle with Halvard while my own gate is a powder keg.'),
        C('The shard is real. I have carried it through three waystones.'),
        A('Carried, you say. Then carry it a little further. There is a brazier in my forecourt that has been dead since the Ember went quiet. My grandfather lit it every dawn.'),
        A('If you can wake it, here, with my court looking on, I will hear you out. If you cannot, you will have wasted a ride and I will have wasted a morning.'),
        C('And if I wake it?'),
        A('Then my steward will find you a bed, and I will find you an answer. Not before.'),
        A('My daughter will want a word with you in any case. She has opinions about the shard, none of them mine.'),
        C('I will light it.'),
        A('See that you do. The brazier stands before the hall door, left of the dais. Be quick: the court does not wait on strangers, and neither do I.'),
      ],
    },
    'm16-wait-brazier': { lines: [A('The brazier, Knight. Before the hall door. My court has been watching you stand there for some time.')] },
    'm16-proof': {
      lines: [
        A('The flame takes, and the whole forecourt goes quiet around it. Not a cough, not a boot on stone.', [{ event: 'story.m16.silent' }]),
        A('It burns. Four hundred years of Deepgate cold, and it burns at a stranger\'s hand.'),
        A('You will forgive a lord a moment of silence. My grandfather lit that flame every dawn. I thought I would be the last to see it.'),
        A('Speak to my daughter. She will say what I will not say in front of the court.'),
      ],
    },
    'm16-report': {
      lines: [
        A('Wenna has told me what she thinks. She generally does, and she is generally right, which is the most tiresome thing about her.'),
        A('You have lit the brazier and read my pass, and you did not once reach for the sword. That is a rarer thing than the shard.'),
        C('Will House Grisel stand with Halvard?'),
        A('House Grisel will think about it, which is more than it has done in a year. Take the Writ. It opens my hall, and my steward\'s ledger.'),
        A('I mean to hear you out in full, and I mean to hear what my own people say first. See my foreman. The mines are where this will be decided, not here.'),
        A('Go. Come back when you have seen what Deepgate is, and not merely what it says it is.'),
      ],
    },
    'm16-wait': { lines: [A('My steward at the gate will take you through. I am in the forecourt, if you can bear to come all this way.')] },
    'm21-audience': {
      lines: [
        A('You wished to speak with me in private, and you have chosen my hall for it. Bold. I approve of bold, as a rule.'),
        C('I know about the sale, my lord.'),
        A('The sale. You will need to be more exact. I sell ore, grain, timber, and I sold a dozen opinions to Vey before breakfast.'),
        C('I mean the wyrmlings. I mean the black anvil seal.'),
        A('Ah. There it is. You have been to the galleries. Wenna took you, I suppose. My daughter has her mother\'s feet: they go where they are told not to.'),
        A('And what have you found? A cage, a ledger, a lot of frightened young beasts that would have been dragon-fire in a year? I do not apologise for the heart trade, Knight. I explain it.'),
        C('You sold them to hunters. Hunters sold them on. Orsk burned a roof off because of it.'),
        A('Orsk burned a roof off because someone chained him, and someone else cut the chain. I did neither.'),
        A('The Houses are dying, Knight. Halvard guards a wall nobody threatens, Oswin writes about a past that cannot be restored, and the Regent cannot hold his own gate. Someone must pay for the mines.'),
        A('Dragon scale pays for the mines. It has for three years. I do not see the cost; I see the wages.'),
        C('The cost is in the cages.'),
        A('Is it? You have the look of a man who has already decided. Tell me what you mean to do, and I shall tell you what I think.'),
        A('You may denounce me before my court. You may bring me before Halvard. Or you may say nothing, and hope that I mend. Choose the road you can live with.'),
        A('But be warned: I am not unprotected, nor am I stupid, and the hall has doors.'),
        C('Let me think on it.'),
        {
          s: 'aldous', t: 'Take your time. I shall wait. I have waited for the Houses to see sense for ten years.',
          choices: [
            { id: 'confront', t: 'I will say it to your face. Here, now.', go: 'm21-confront', fx: [{ setFlag: 'story.m21.branch', value: 'confront' }] },
            { id: 'spy', t: 'I will think on it. And wait in your hall.', go: 'm21-spy', fx: [{ setFlag: 'story.m21.branch', value: 'spy' }, ...payOnce('spy', [{ favour: 'grisel', delta: 2 }, { favour: 'oswin', delta: 3 }]), { setFlag: 'story.m21.choice', value: 'spy' }] },
          ],
        },
      ],
    },
    'm21-confront': {
      lines: [
        A('Say it, then. All of it. And make it good: I have had my steward put the doors on the latch.'),
        {
          s: 'aldous', t: 'I am listening, Knight.',
          choices: [
            { id: 'proof', t: 'I have the orders, the chain, the tally. Your own hand signed them.', go: 'm21-pass', when: canCase, fx: [{ setFlag: 'story.m21.persuaded', value: true }, { setFlag: 'story.m21.choice', value: 'confront' }, ...payOnce('confront', [{ favour: 'halvard', delta: 3 }, { favour: 'grisel', delta: -5 }]), { event: 'story.m21.resolved' }] },
            { id: 'tip', t: '(Press a purse of gold into a steward\'s hand and ask him to speak for you.) Forty gold.', go: 'm21-pass', when: all({ gold: { atLeast: 40 } }, not(flagIs('story.m21.tipPaid'))), fx: [{ spendGold: { amount: 40, reason: 'persuasion' } }, { setFlag: 'story.m21.tipPaid', value: true }, { setFlag: 'story.m21.persuaded', value: true }, { setFlag: 'story.m21.choice', value: 'confront' }, ...payOnce('confront', [{ favour: 'halvard', delta: 3 }, { favour: 'grisel', delta: -5 }]), { event: 'story.m21.resolved' }] },
            { id: 'press', t: 'I do not need proof. I know what I saw.', go: 'm21-fail', fx: [{ clearFlag: 'story.m21.persuaded' }, { setFlag: 'story.m21.choice', value: 'confront' }, ...payOnce('confront', [{ favour: 'halvard', delta: 3 }, { favour: 'grisel', delta: -5 }]), { event: 'story.m21.resolved' }] },
          ],
        },
      ],
    },
    'm21-pass': {
      lines: [
        A('Orders, chain, tally. You have been thorough. More thorough than my own steward, who should have seen it.'),
        A('Very well. You have given me what I did not expect: something I cannot argue with. I shall not call the hall.'),
        A('I will hear what Halvard asks, and I will not strike at you in my own house. That is all you will get from me today.'),
        A('Go. Before I think better of it.'),
      ],
    },
    'm21-fail': {
      lines: [
        A('You did not trouble to find proof, then. A pity: I would have been glad to see it, and glad to deny it.'),
        A('Stewards! This Knight has decided the matter without us. Let him show his reasons at the door.'),
      ],
    },
    'm21-spy': {
      lines: [
        A('Think on it, then. My hall is yours for the afternoon. The study door is open, should you need to rest. Do not touch my desk; I keep it tidy.'),
        C('I will not.'),
        A('Of course you will not. Nobody ever does.'),
      ],
    },
    'm21-aftermath-confront': {
      lines: [
        A('The hall is quiet again. My guards will remember their orders in the morning, I suppose.'),
        A('You have made yourself an enemy of my House today, Knight, and I have made you a worse one of my own conscience. I do not know which of us has the better of it.'),
        C('Will you answer to Halvard?'),
        A('I shall answer to my daughter. She is the harder judge.'),
        A('Go to her. Tell her what you saw, and what you did. I do not think I will be permitted to.'),
        A('Whatever else you do: the pass is open and the mines are yours. Burchard has his orders.'),
      ],
    },
    'm21-aftermath-spy': {
      lines: [
        A('You have been a quiet guest, Knight. I confess I expected more questions.', [
          { if: { not: flagIs('story.m21.letterTaken') }, then: [{ give: [{ itemId: 'grisel-spy-letter', count: 1 }] }, { setFlag: 'story.m21.letterTaken', value: true }] },
        ]),
        C('I am still deciding what to ask.'),
        A('A prudent answer. Take your time, and take Wenna\'s counsel with it. She has been counselling the whole of Deepgate since she was ten.'),
        A('I mean to make my choice plain to Halvard when the time comes. You may rely on that.'),
        A('You may rely on it as far as you can rely on any lord.'),
        A('Go. The mines will want you, and so will the Council.'),
      ],
    },
    'm21-wait': { lines: [A('You have business in my hall, I think. Finish it.')] },
    'idle-after': { lines: [A('The brazier still burns, and the court still talks about it. A lord could hardly ask for more.')] },
    idle: { lines: [A('Deepgate does not wait on strangers. Speak to my steward if you need the gate.')] },
  },
});
