import { buildTree, type Line } from '../build';
import { all, flagIs, objDone, objOpen, qActive, qDone, qIdle, step, not } from '../cond';

const Wy = (t: string, when?: Line['when']): Line => ({ s: 'wystan', t, ...(when ? { when } : {}) });
const Me = (t: string, when?: Line['when']): Line => ({ s: 'merrin', t, ...(when ? { when } : {}) });
const Ed = (t: string, when?: Line['when']): Line => ({ s: 'edric', t, ...(when ? { when } : {}) });
const To = (t: string): Line => ({ s: 'tobb', t });
const C = (t: string, when?: Line['when']): Line => ({ s: 'cael', t, ...(when ? { when } : {}) });

/** Q5: the quests M22 waits for (the same twenty as the quest's startWhen). */
const M22_PREREQS = ['m11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20', 'm21', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10', 'r11', 'd03', 'd04'];
const miners = flagIs('story.r10.choice', 'miners');
const confront = flagIs('story.m21.choice', 'confront');
const spared = flagIs('story.d03.outcome', 'spared');

/**
 * The Council in the Keep hall. Forty nodes spoken: Wystan and Merrin hear {name} (14), the Council proper (20 spoken, from 23 written: four pairs of which
 * exactly one is spoken, by what {name} chose in Act 2), and Tobb closes the scene (6). The pledge is a
 * council node (`story.m22.pledge`); Aldous's empty seat is the dressing the steward then explains.
 */
export const SCENE_M22_COUNCIL = buildTree({
  id: 'scene-m22-council',
  start: [{ when: all(), seg: 'wystan' }],
  segments: {
    wystan: {
      lines: [
        Wy('{name}. Come in; the doors are heavy, and so is the day. I have not seen this hall so full since the old King was crowned.'),
        Wy('I have read your reports twice. The Ember Shard is real, the dragons are not what the songs say, and Deepgate has been selling their young. It is a great deal to ask a Council to believe.'),
        C('I did not make it up, my lord.'),
        Wy('I know. Which is why I asked for you to say it yourself. Halvard has stood in this hall and been told there is no such thing as a dragon. I will not hear it said twice.'),
        Wy('Lady Merrin will speak for Oswin. The King presides. House Grisel was summoned, and has sent a steward. We will come to that.'),
        C('I will say it plainly, my lord.'),
        Wy('Plainly is how I prefer my reports. It is also how I prefer my enemies, but we cannot have everything.'),
        Wy('Stand there, by the dais. Whatever the Council says, remember: the Order of the Hearth does not bow. It stands.'),
      ],
      then: 'merrin',
    },
    merrin: {
      lines: [
        Me('{name}. I have spent three nights in the archive with a copy of your account beside me. You will be unsurprised to hear that I believe every line.'),
        Me('The Oswin archives record an Ember that burned for nine hundred years and a dragon who tended it. They record nothing about its ending, and everything about its need.'),
        C('And the Council?'),
        Me('The Council does not read. The Council listens, and decides before it has heard. I have stood here before.'),
        Me('But it can be moved by a witness, and by an oath. If Halvard and Oswin pledge together, the others will weigh it.'),
        Me('I mean to pledge. I hope your account is such that Wystan does too, and not out of obligation.'),
      ],
      then: 'council',
    },
    council: {
      lines: [
        Ed('We are met. Let it be written that on this day the Council of Valdren heard a witness from the Order of the Hearth. Speak, Knight.'),
        C('Your Majesty. The Ember Shard is real. It woke three waystones in my hands, and the Hushed Anvil answered it. The forges can be lit again.'),
        C('The dragons are not the enemy. The hunters who took their young were paid, and they were paid from Deepgate.'),
        Ed('Deepgate, you say. Where is Lord Grisel? His seat is empty.'),
        Wy('It is, Majesty. He was summoned. He has sent word.'),
        Wy('We shall hear it presently. First, Knight: what do you ask of the Council?'),
        C('Two things. That the Houses stand together, and that the cages are broken.'),
        Me('Oswin stands. The archives are open to the Order, and the stipend that paid its scribes will pay its Knights.'),
        Wy('Halvard stands. The wall was built for this. It would be a poor wall that did not stand beside the thing it was built for.'),
        Ed('Two Houses pledge. It is a start. It is more than I thought to see.'),
        Wy('The mines of Deepgate stand with us, Majesty, in the persons of those who dig them. Whatever the Lord thinks.', miners),
        Wy('The mines of Deepgate are divided, Majesty. A strike was settled there by a Knight of the Order, and it did not hold everyone.', not(miners)),
        Me('Lord Aldous Grisel was confronted in his own hall, I am told, and the hall did not fall.', confront),
        Me('Lord Aldous Grisel was heard, I am told, and what he said is in a letter the Knight carries.', not(confront)),
        Ed('Hunters, then. The Hunt-Captain of Scorchhold spoke before he fell?', spared),
        Ed('Hunters, then. The Hunt-Captain of Scorchhold fell without a word?', not(spared)),
        { s: 'edric', t: 'Let it be written. The Houses of Halvard and Oswin pledge to the Council, the Knight is witness, and the Houses divide.', fx: [{ event: 'story.m22.pledge' }] },
        Wy('Let it be so written.'),
        Me('Let it be written, and let the ink dry before anyone argues with it.'),
        Ed('The Council records the pledge.'),
        Wy('{name}. You have been a witness, a courier and a sword. The Council has yet to decide what else you are.'),
        C('A Knight of the Order, my lord. Whatever the Council decides.'),
        Ed('Then stand a Knight, and be recorded as one. The hall is dismissed. Tobb, you may sing, if you must.'),
      ],
      then: 'tobb',
    },
    tobb: {
      lines: [
        To('If you will forgive a bard in a hall of lords, I have written something. It is not finished. It rhymes in two places, which I count as a triumph.'),
        To('"A Knight went down to Deepgate / with a spark in a bag of tin; / the mountain asked him what he was / and he was not afraid to say."'),
        C('Tobb.'),
        To('I know, I know. The metre. It improves with ale.'),
        To('But {name}, truly. When the Houses pledged, I thought: this is a song. Not a good one yet. But a song. I am proud to have walked beside you.'),
        To('Now, if someone will find me a stool, I should like to sit down before my knees give out.'),
      ],
    },
  },
});

export const SCENE_M22_BANNER = buildTree({
  id: 'scene-m22-banner',
  start: [{ when: all(), seg: 'banner' }],
  segments: {
    banner: {
      lines: [
        { s: 'wystan', t: 'Raise it. The grey of Halvard, the quill of Oswin. Let the hall see what it pledged to.' },
        { s: 'edric', t: 'It is a banner, and a banner is only cloth. But the Houses stood beneath it, and they will remember.' },
      ],
    },
  },
});

const G = (t: string): Line => ({ s: 'grisel-steward', t });
export const GRISEL_STEWARD = buildTree({
  id: 'npc-grisel-steward',
  start: [
    { when: step('m22', 'council', 'refusal'), seg: 'm22-refusal' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm22-refusal': {
      lines: [
        G('Steward Orrin of House Grisel, Knight. I am sent to read, and I have read it twice in the stair, so I am as ready as I will be.'),
        G('"Lord Aldous Grisel of Deepgate regrets that he cannot attend the Council. He is not unwilling. He is, he says, unwell."'),
        G('"He will not pledge to a Council that has not yet decided what it is for. He will not refuse it, either. He will wait."'),
        G('That is the whole of the text. I am obliged to say that I do not believe a word of it, and that the signature is genuine.'),
        G('The seat stays empty, Knight. It will be dusted every morning. It is the only way I know to say we did not leave.'),
        G('If you see Lady Wenna, tell her the stairs are as she left them. She will know what I mean.'),
      ],
    },
    idle: { lines: [G('The seat is dusted. I am told that is all that is asked of a steward.')] },
  },
});

const D = (t: string): Line => ({ s: 'edric', t });
/** King Edric after the Council (a2- node ids: an extension of Act 1's tree). */
export const EDRIC_A2 = buildTree({
  id: 'npc-edric',
  start: [{ when: step('m22', 'refusal', 'edric'), seg: 'a2-m22-edric' }],
  segments: {
    'a2-m22-edric': {
      lines: [
        D('A word before you go, Knight. The hall is emptier than I like, and the fountain is drier than I can bear.'),
        D('You have given the Council something it has not had in years: a thing to do.'),
        C('The Houses stood, Majesty. That is their doing.'),
        D('Their doing, your asking. I know the difference, even if I rarely say it.'),
        D('Go back to the Order. Tell them the King remembers who answered when he sent. And, {name}: the Fountain. See it. You will know why.'),
        D('The banner stands in the hall. Raise it when you are ready; I would not have it done without you.'),
      ],
    },
  },
});

const W2 = (t: string): Line => ({ s: 'wystan', t });
export const WYSTAN_A2 = buildTree({
  id: 'npc-wystan',
  start: [
    { when: all(qActive('m22'), objDone('m22', 'raised'), objOpen('m22', 'report')), seg: 'a2-m22-report' },
    { when: all(qIdle('m22'), ...M22_PREREQS.map((q) => qDone(q))), seg: 'a2-m22-offer' },
  ],
  segments: {
    'a2-m22-offer': {
      lines: [
        W2('Every House has seen what you have done, {name}, and the Council will sit when you walk into the Keep hall.'),
        { ...W2('Come to the hall. Say what you saw, and let the Houses answer.'), fx: [{ startQuest: 'm22' }] },
      ],
    },
    'a2-m22-report': {
      lines: [
        W2('The banner is up and the Council is dismissed. Halvard and Oswin stand, and Deepgate waits. It is more than I had hoped, and less than I need.'),
        W2('You have done what the Order was made for, {name}: you found the thing that was dying and you did not let it die. I owe you a better word than "thanks".'),
        C('Thanks will do, my lord.'),
        W2('Then thanks, and the Banner. Let it hang wherever the Order hangs its cloak. The Houses will follow it.'),
        W2('There will be more. There always is. But for tonight: the Fountain will run when the Houses put their seal on it. Go and see it before you sleep.'),
        W2('And, {name}. Take the Lady Wenna to the camp. She asked, and I could not find a reason to say no.'),
        W2('Rest. That is an order, and the only one I give that I expect to be obeyed.'),
        W2('The Houses stand. Remember it.'),
      ],
    },
  },
});
