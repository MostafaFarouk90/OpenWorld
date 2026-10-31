import { buildTree } from '../../act2/build';
import { all, flagIs, not } from '../../act2/cond';
import { M33_WITNESSES } from '../../../../quests/content/act3/summit/m33.quest';
import { D06_SKARL_OUTCOME } from '../../../../quests/content/act3/summit/d06.quest';
import { C, at, offer, qActive, voice, witnessesAre } from './common';

const T = voice('thorgar');
const WORDS = ['no one', 'one hunter', 'two hunters', 'three hunters', 'four hunters', 'five hunters', 'six hunters', 'seven hunters', 'eight hunters'];

/** M33's hand-in: Thorgar names how many spared hunters spoke of it (the count is `story.m33.witnesses`, 0 to 8). */
const handIn = (n: number): { lines: ReturnType<typeof T>[] } => ({
  lines: [
    T('You cut every anchor. I watched the net from the rim. It fell like a sail.'),
    T(n === 0
      ? 'No one watched you spare a hunter, and no one will speak for you. That is the way of a hard day.'
      : `${WORDS[n]![0]!.toUpperCase()}${WORDS[n]!.slice(1)} went off the spur alive, and told the others what you did. That will carry further than a spear.`),
    C('The handler is free. The wyrmlings are over the ridge.'),
    T('Then Skyhold is ours again. Take these crampons. They are Skyhold\'s, and they have not been on a boot since my father\'s time.'),
    T('The Aerie next, when the Hearth burns. Go and speak with the Coal-Mother. She will have words, and I would like to be there for them.'),
    T('You have done more than the lodge in forty winters. I will not say it twice.'),
  ],
});

/**
 * Thorgar Skyhold's summit segments, in front of his lower-slope tree (extendTree; node ids all start `s3` or `d06`): M33 at Skyhold (brief 10, hand-in
 * 6), M34 at the Hearth (8) and D06 at the chasm ledge (brief 8) and the Aerie landing (report 6). The hand-in names the spared hunters.
 */
export const THORGAR_SUMMIT = buildTree({
  id: 'npc-thorgar',
  start: [
    { when: all(at('d06', 'report'), flagIs(D06_SKARL_OUTCOME, 'spared')), seg: 'd06-report-spared' },
    { when: at('d06', 'report'), seg: 'd06-report-defeated' },
    { when: at('m34', 'thorgar'), seg: 's34-talk' },
    ...Array.from({ length: 9 }, (_, n) => ({
      when: all(at('m33', 'report'), n === 0 ? not(witnessesAre(M33_WITNESSES, 1, 8)) : witnessesAre(M33_WITNESSES, n, n)), seg: `s33-report-${n}`,
    })),
    { when: offer('d06'), seg: 'd06-brief' },
    { when: qActive('d06'), seg: 'd06-wait' },
    { when: offer('m33'), seg: 's33-brief' },
    { when: qActive('m33'), seg: 's33-wait' },
  ],
  segments: {
    's33-brief': {
      lines: [
        T('So you are the knight Ysmeryth chose to speak to. Come in out of the wind. Skyhold is the loneliest watch in the Dragonspine and the only one I would not give up.'),
        T('Look across the spur. The net is Vey\'s, stretched on six anchors and guarded by two packs of his hunters. They take wyrmlings in it, and they sell them by the pound.'),
        C('Wyrmlings. Young dragons.'),
        T('Hatched from the clutches the hunters did not find in time. Some are no bigger than a hound.'),
        T('The anchors are on the near edge of the spur. Cut them in any order, but the hunters will not like it. They have a rigger who keeps the knots, and he is no soldier.'),
        T('Speak to him first. He is quiet, and I think he is sorry. A man who is sorry will often talk.'),
        C('And the handler?'),
        T('There was a keeper of wyrmlings under the net, a man the lodge sent to tend the young. They cut him from the rope. He is alive, I believe, under the fifth anchor.'),
        T('The hunters will fight. Kill them or spare them, as your conscience says. I will not tell you which.'),
        {
          s: 'thorgar', t: 'Will you cut the net, {name}?',
          choices: [
            { id: 'accept', t: 'I will cut it.', go: null, fx: [{ startQuest: 'm33' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    's33-wait': { lines: [T('The rigger, the camp, the six anchors, the hunters and the handler. Then come and tell me how it looked from the net.')] },
    ...Object.fromEntries(Array.from({ length: 9 }, (_, n) => [`s33-report-${n}`, handIn(n)])),
    's34-talk': {
      lines: [
        T('So this is the Hearth. I have seen it from the lodge for forty years as a glow behind the cloud.'),
        T('I did not think I would stand beside it. I did not think the dragons would let me.'),
        C('They are not as the lodge tells it.'),
        T('No. I see that. Eadgyth tried to tell me, and I called her a coward.'),
        T('The lodge hunts for the winter, to feed the families that have no field. It does not hunt for gold. But the hunters on the Aerie do, and my men will be ashamed of the difference.'),
        T('When the fire is lit, the lodge fire will be lit too. I have promised it. The hunters will turn out, and face the slope, and watch it as they should.'),
        T('I will go home when you have lit the Hearth. Go on. Light it. I have waited long enough to see a thing like that.'),
        T('And mind the Aerie. It is Skarl\'s, and he is no fool.'),
      ],
    },
    'd06-brief': {
      lines: [
        T('This is the chasm ledge. Across it is the Aerie, the Frostfang, and the man who holds it. Corvin Skarl, Hunt-Marshal, Vey\'s own.'),
        T('He keeps a drake in iron in the courtyard. It is a young one, I am told, and he beats it to keep it docile.'),
        C('You have been watching him.'),
        T('Twenty years. I had no road to him until the Hearth burned. Now the wind is yours, and the ledge is open.'),
        T('The Aerie has a keep. A hunter is held in its cell, one of his own, who spoke against him. Find him first. He will tell you what he can.'),
        T('Then the gate. There is a winch on the courtyard side, and a gate behind it that Skarl closes when he is afraid. He is afraid now.'),
        T('Twelve are in the yard, on the ground and on the walls. Spare them or put them down. The Marshal will come out when they are gone.'),
        {
          s: 'thorgar', t: 'Will you glide, {name}?',
          choices: [
            { id: 'accept', t: 'I will glide.', go: null, fx: [{ startQuest: 'd06' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'd06-wait': { lines: [T('The ledge, the keep, the winch, the yard, the Marshal. In that order, or as the wind allows.')] },
    'd06-report-defeated': {
      lines: [
        T('The horn has stopped. I heard it fail, from the lip, and I did not know what to feel.'),
        T('The banner is burning on the yard wall. I can see the smoke from here, and it is the first smoke from that tower that has not meant a hunt.'),
        C('The drake is free. It went north.'),
        T('To the cold, then. To Hathren, maybe. I hope so. A young one should not be alone.'),
        T('Take the crossbow. It was his. The bolts were meant for wyrms, but they will do for whatever you have to hunt.'),
        T('The Hearth burns, the net is cut and the Aerie is empty. I do not know what the lodge is for now. I think I shall find out.'),
        T('Come back to me when the Council has sat. I have a long list of things I never said.'),
      ],
    },
    'd06-report-spared': {
      lines: [
        T('I saw two of mine lead him down. He went without a word. That is more than I expected of Skarl.'),
        T('I will name him a witness. When the Council sits to hear what Vey has done, Corvin Skarl will say it with his own mouth. He has more to tell than a ledger.'),
        C('And the drake?'),
        T('Free. It circled the Aerie twice and went north, toward the cold. I think it will find Hathren.'),
        T('Take the crossbow. It was his. The bolts were meant for wyrms, but they will do for whatever you have to hunt.'),
        T('The Hearth burns, the net is cut and the Aerie is empty. I do not know what the lodge is for now. I think I shall find out.'),
        T('Come back to me when the Council has sat. I have a long list of things I never said.'),
      ],
    },
  },
});
